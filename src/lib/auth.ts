// OAuth 授权流程编排：
// 1. 读取已存的 client_id/secret
// 2. 启动 Rust 端本地回环服务器（阻塞等待 code）
// 3. 打开浏览器到 Bangumi 授权页
// 4. 拿到 code 后换 access/refresh token 并存 Store
// 5. 获取用户资料存 Store
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
import type { BgmUser, OAuthTokenResponse } from "@/types/bgm";
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
 */
async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  proxy: Proxy | undefined,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: REDIRECT_URI,
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

export interface StartOAuthOpts {
  /**
   * 换 token 成功后立即触发（此时 user 资料尚未拉取）。
   * 调用方可据此提前解除"等待授权"转圈，不必等 /v0/me 完成。
   * 拉资料失败不致命——token 已有效，下次启动 initAuth 会自动重试补全。
   */
  onTokenReady?: () => void;
}

/**
 * 发起完整 OAuth 授权码流程。
 * 换 token 成功即触发 onTokenReady；随后拉取 /v0/me 写入 user，再 resolve。
 */
export async function startOAuthLogin(opts: StartOAuthOpts = {}): Promise<void> {
  const clientId = await getStore<string>(StoreKeys.clientId);
  const clientSecret = await getStore<string>(StoreKeys.clientSecret);
  if (!clientId || !clientSecret) {
    throw new Error("请先填写 client_id 和 client_secret");
  }

  // 先清掉上次崩溃/残留的监听，避免端口仍被占用。
  await invoke("stop_oauth_server").catch(() => {});

  // 用 try/finally 保证监听在任何退出路径（成功/失败/取消）都及时释放，
  // 不必等到 120s 超时（成功时 stop 已是 no-op）。
  const codePromise = invoke<string>("start_oauth_server");
  try {
    // 打开浏览器授权页（在监听就绪后再开，避免回调先到）
    const authUrl = new URL(`${OAUTH_BASE}/oauth/authorize`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    await openUrl(authUrl.toString());

    // 等待回调 code（超时/取消会 reject，finally 仍执行）
    const code = await codePromise;

    // 用 code 换 token（带重试 + 超时）——认证主体完成
    const proxy = await getProxy();
    const token = await exchangeCodeForToken(code, clientId, clientSecret, proxy);
    await setStore(StoreKeys.accessToken, token.access_token);
    await setStore(StoreKeys.refreshToken, token.refresh_token);
    await setStore(StoreKeys.expiresAt, Date.now() + token.expires_in * 1000);

    // token 就绪：通知调用方提前解锁 UI（按钮从"等待授权"切到"获取资料"）。
    opts.onTokenReady?.();

    // 拉取用户资料（头像/昵称/username）。
    // 失败时抛出：token 已存，不影响认证结果；调用方应在 catch 中检查 token
    // 是否已存在来决定错误级别（token 有效 → 友好提示；token 不存在 → 硬错误）。
    const user = await getMe();
    await setStore(StoreKeys.user, user);
    // 广播登录事件，让 App.tsx 等所有 useAuthUser 实例同步读取新用户。
    await emit("auth-login");
  } finally {
    await invoke("stop_oauth_server").catch(() => {});
  }
}
