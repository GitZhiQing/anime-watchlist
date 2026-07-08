// OAuth 授权流程编排（可组合原语）：
// 1. 读取已存的 client_id/secret
// 2. 启动 Rust 端本地回环服务器（动态端口，阻塞等待 code+state）
// 3. 打开浏览器到 Bangumi 授权页（带动态 redirect_uri 与 state）
// 4. 拿到 code 后换 access/refresh token 并存 Store（同时持久化 redirect_uri 供刷新用）
// 5. 获取用户资料存 Store
//
// 注意：这里不再有单体阻塞的 startOAuthLogin——交互编排交给 useOAuthFlow 状态机，
// 它能在等待 code 期间提供倒计时与取消（调用 stop_oauth_server）。
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  OAUTH_BASE,
  REDIRECT_URI,
  USER_AGENT,
  getMe,
  isTokenDefinitivelyRejected,
  isTokenExpired,
  refreshAccessToken,
} from "@/lib/bgm";
import { StoreKeys, clearAuth, getStore, setStore } from "@/lib/store";
import type { BgmUser, CallbackResult, OAuthTokenResponse } from "@/types/bgm";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { Proxy } from "@tauri-apps/plugin-http";
import { getProxy } from "@/lib/proxy";

export interface AuthInitResult {
  /** 当前已登录用户（缓存或刷新后重取）；null 表示未登录或会话失效。 */
  user: BgmUser | null;
  /** 会话刚刚失效（刷新被服务端明确拒绝），需提示用户重新认证。 */
  needsReLogin: boolean;
}

/**
 * 应用启动时的认证状态单一真相源。
 * - 无缓存用户 → 未登录。
 * - token 仍有效 → 直接返回缓存用户（无网络请求）。
 * - token 临近/已过期 → 用 refresh_token 主动刷新（受并发锁保护）：
 *   - 成功：重取 /v0/me 更新缓存。
 *   - 失败且服务端明确拒绝（400/401）→ 清登录态，标记 needsReLogin。
 *   - 失败但为网络/超时 → 保留缓存用户，便于离线查看（不清退）。
 * - store 损坏（有 user 无 token）→ 清登录态。
 */
export async function initAuth(): Promise<AuthInitResult> {
  const user = await getStore<BgmUser>(StoreKeys.user);
  if (!user) return { user: null, needsReLogin: false };

  const accessToken = await getStore<string>(StoreKeys.accessToken);
  if (!accessToken) {
    await clearAuth();
    return { user: null, needsReLogin: false };
  }

  if (!(await isTokenExpired())) {
    return { user, needsReLogin: false };
  }

  // token 临近过期：主动刷新（复用 bgm.ts 的并发锁）。
  try {
    await refreshAccessToken();
    const fresh = await getMe();
    await setStore(StoreKeys.user, fresh);
    // 广播登录事件，让所有 useAuthUser 实例同步到最新用户。
    await emit("auth-login");
    return { user: fresh, needsReLogin: false };
  } catch (e) {
    if (isTokenDefinitivelyRejected(e)) {
      await clearAuth();
      return { user: null, needsReLogin: true };
    }
    // 网络/超时：保留缓存登录态，返回原 user，离线仍可看缓存数据。
    return { user, needsReLogin: false };
  }
}

/**
 * 确定性失败：服务端 4xx（invalid_grant、redirect_uri_mismatch 等）。
 * 与可重试的 5xx/网络错误区分，避免对真实失败无意义重试。
 */
class DefinitiveTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitiveTokenError";
  }
}

/**
 * 用授权码换 access_token，带超时与重试。
 * - 仅对 5xx / 网络层错误（fetch reject 或 status>=500）重试，最多 3 次（首次 + 2 次重试），退避 500ms / 1s。
 * - 4xx（凭据无效 / redirect_uri 不匹配等）视为真实失败，抛 DefinitiveTokenError 不重试。
 * - connectTimeout 限制单次连接挂起时间，避免网络/代理慢时长时阻塞。
 *
 * 关键：redirectUri 必须等于授权时用的动态值（动态端口下为
 * http://localhost:{P}/callback），否则 Bangumi 会以 redirect_uri_mismatch 拒绝。
 */
async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  proxy: Proxy | undefined,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const delays = [500, 1000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await tauriFetch(`${OAUTH_BASE}/oauth/access_token`, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        connectTimeout: 10_000, // tauri-plugin-http 选项（ms）
        ...(proxy ? { proxy } : {}),
      });
      if (res.ok) {
        return (await res.json()) as OAuthTokenResponse;
      }
      if (res.status >= 400 && res.status < 500) {
        // 4xx：确定性失败，不重试。透传 Bangumi 的 error_description。
        let msg = `换取令牌失败 (${res.status})`;
        try {
          const err = await res.json();
          msg = err?.error_description || err?.error || msg;
        } catch {
          /* ignore */
        }
        throw new DefinitiveTokenError(msg);
      }
      // 5xx：可重试的网关错误。
      lastErr = new Error(`网关错误 (${res.status})`);
    } catch (e) {
      if (e instanceof DefinitiveTokenError) throw e;
      // fetch 层网络/超时 reject：可重试。
      lastErr = e;
    }
    if (attempt < delays.length) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw new Error(
    `网络/网关错误，多次重试后仍失败：${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

/**
 * 落库 token 三键 + 持久化本次 redirect_uri。
 * redirect_uri 供后续 doRefresh 读取——刷新时传的 redirect_uri 必须与换 token 时一致。
 */
async function storeTokens(
  token: OAuthTokenResponse,
  redirectUri: string,
): Promise<void> {
  await setStore(StoreKeys.accessToken, token.access_token);
  await setStore(StoreKeys.refreshToken, token.refresh_token);
  await setStore(StoreKeys.expiresAt, Date.now() + token.expires_in * 1000);
  await setStore(StoreKeys.redirectUri, redirectUri);
}

/** 拉取用户资料并落库，广播 auth-login 让 useAuthUser 同步。 */
async function fetchAndStoreUser(): Promise<BgmUser> {
  const user = await getMe();
  await setStore(StoreKeys.user, user);
  await emit("auth-login");
  return user;
}

/** 生成 16 字节随机 hex，作为 OAuth state（CSRF 防护）。 */
export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 用端口构造动态 redirect_uri（http://localhost:{port}/callback）。 */
export function buildRedirectUri(port: number): string {
  return `http://localhost:${port}/callback`;
}

/** 组装 Bangumi 授权页 URL（client_id / response_type=code / redirect_uri / state）。 */
export function buildAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const authUrl = new URL(`${OAUTH_BASE}/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  return authUrl.toString();
}

/**
 * 启动 Rust 端本地回环服务器并等待回调。
 * fixedPort=true 仅试固定 7359；false 动态选端口（7359–7369）。
 * 返回 {code, state, port}；端口被占满 / 超时 / 取消时 reject。
 */
export function startCallbackServer(
  fixedPort: boolean,
): Promise<CallbackResult> {
  return invoke<CallbackResult>("start_oauth_server", { fixedPort });
}

/** 主动停止当前 OAuth 监听（取消/卸载时调用），及时释放端口。 */
export async function cancelCallbackServer(): Promise<void> {
  await invoke("stop_oauth_server").catch(() => {});
}

/** 打开浏览器到授权页。 */
export function openAuthorizeUrl(url: string): Promise<void> {
  return openUrl(url);
}

/** 读取代理配置（供换 token 使用）。 */
export function getOAuthProxy(): Promise<Proxy | undefined> {
  return getProxy();
}

// 供 useOAuthFlow 复用的内部换 token 入口（不导出，避免与原 REDIRECT_URI 常量混用）。
export async function exchangeAndStore(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<void> {
  const proxy = await getOAuthProxy();
  const token: OAuthTokenResponse = await exchangeCodeForToken(
    code,
    clientId,
    clientSecret,
    redirectUri,
    proxy,
  );
  await storeTokens(token, redirectUri);
}

export { fetchAndStoreUser, REDIRECT_URI };
