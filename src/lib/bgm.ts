// Bangumi HTTP 客户端。
// 使用 @tauri-apps/plugin-http 的 fetch（走 Rust，可设 User-Agent 且绕过 CORS）。
// 统一注入 UA + Bearer token，处理 401 自动刷新（刷新加锁、失败清登录态）。
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { emit } from "@tauri-apps/api/event";
import { StoreKeys, clearAuth, getStore, setStore } from "@/lib/store";
import { getProxy } from "@/lib/proxy";
import type {
  BgmUser,
  OAuthTokenResponse,
  PagedUserCollections,
  SearchResponse,
  Subject,
  UserCollection,
} from "@/types/bgm";

export const API_BASE = "https://api.bgm.tv";
export const OAUTH_BASE = "https://bgm.tv";
// 用 localhost（符合 RFC 8252 loopback OAuth 推荐）；Rust 侧监听 IPv6 ::1，
// 因为现代系统 localhost 多优先解析到 ::1，监听 ::1 可让浏览器首次尝试即命中，
// 避免 IPv6→IPv4 回退延迟。bgm.tv 后台回调地址需登记此字面量。
export const REDIRECT_URI = "http://localhost:7359/callback";
export const USER_AGENT =
  "GitZhiQing/anime-watchlist/0.3.2 (https://github.com/GitZhiQing/anime-watchlist)";

export class BgmError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "BgmError";
  }
}

/**
 * 认证已失效：刷新令牌也失败（Bangumi 明确拒绝），登录态已被清理。
 * 与普通 BgmError(401) 区分，用于全局拦截（不重试、清缓存、提示重新认证）。
 */
export class AuthExpiredError extends BgmError {
  constructor(message = "认证已失效，请重新认证") {
    super(401, message);
    this.name = "AuthExpiredError";
  }
}

async function getAccessToken(): Promise<string | undefined> {
  return getStore<string>(StoreKeys.accessToken);
}

/** 判断 token 是否已过期（提前 60s 视为过期）。 */
export async function isTokenExpired(): Promise<boolean> {
  const token = await getStore<string>(StoreKeys.accessToken);
  if (!token) return true;
  const expiresAt = await getStore<number>(StoreKeys.expiresAt);
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - 60_000;
}

/**
 * 判断给定错误是否表示令牌已被服务端明确拒绝（应清登录态）。
 * 网络/超时类错误（fetch reject，非 BgmError）或服务端 5xx 不算令牌失效，
 * 此时保留缓存登录态，避免断网时把用户无端踢下线。
 */
export function isTokenDefinitivelyRejected(e: unknown): boolean {
  return e instanceof BgmError && (e.status === 400 || e.status === 401);
}

// 并发刷新去重：多个请求同时 401 / 启动期刷新与运行期 401 相撞时，
// 共享同一个 in-flight 刷新。Bangumi 每次刷新都会轮换 refresh_token，
// 并发刷新会互相使对方的 refresh_token 失效，故必须串行化。
let refreshPromise: Promise<void> | null = null;

/** 实际执行刷新（读凭据、POST、落库三键）。失败抛 BgmError。 */
async function doRefresh(): Promise<void> {
  const clientId = await getStore<string>(StoreKeys.clientId);
  const clientSecret = await getStore<string>(StoreKeys.clientSecret);
  const refreshToken = await getStore<string>(StoreKeys.refreshToken);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new BgmError(401, "缺少刷新令牌所需凭据，请重新认证");
  }
  const proxy = await getProxy();
  const res = await tauriFetch(`${OAUTH_BASE}/oauth/access_token`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      redirect_uri: REDIRECT_URI,
    }),
    connectTimeout: 10_000,
    ...(proxy ? { proxy } : {}),
  });
  if (!res.ok) {
    throw new BgmError(res.status, "刷新令牌失败，请重新认证");
  }
  const token = (await res.json()) as OAuthTokenResponse;
  await setStore(StoreKeys.accessToken, token.access_token);
  await setStore(StoreKeys.refreshToken, token.refresh_token);
  await setStore(
    StoreKeys.expiresAt,
    Date.now() + token.expires_in * 1000,
  );
}

/**
 * 用 refresh_token 刷新 access_token（并发安全）。
 * 已有刷新在进行时，直接复用其 promise；.finally 保证无论成败都复位锁。
 */
export async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

interface BgmRequestOpts {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** 查询参数 */
  query?: Record<string, string | number | undefined>;
  /** 是否需要认证（默认 true） */
  auth?: boolean;
}

/** 统一请求 v0 API。401 时自动尝试刷新一次。 */
export async function bgmRequest<T>(
  path: string,
  opts: BgmRequestOpts = {},
): Promise<T> {
  const { method = "GET", body, query, auth = true } = opts;
  let url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = await getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const proxy = await getProxy();
  const doFetch = () =>
    tauriFetch(url, {
      method,
      headers,
      body:
        body !== undefined && method !== "GET"
          ? JSON.stringify(body)
          : undefined,
      connectTimeout: 15_000,
      ...(proxy ? { proxy } : {}),
    });

  let res = await doFetch();
  // 401 → 尝试刷新一次
  if (res.status === 401 && auth) {
    try {
      await refreshAccessToken();
      headers["Authorization"] = `Bearer ${(await getAccessToken())!}`;
      res = await doFetch();
    } catch (e) {
      // 仅当 Bangumi 明确拒绝令牌（400/401）才视为登录态失效：
      // 清掉本地登录态、广播事件、抛 AuthExpiredError 让 UI 引导重新认证。
      // 网络/超时错误则原样抛出，避免断网时误清登录态。
      if (isTokenDefinitivelyRejected(e)) {
        await clearAuth();
        await emit("auth-expired");
        throw new AuthExpiredError();
      }
      throw e;
    }
  }
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const text = await res.text();
      if (text) msg = JSON.parse(text)?.description ?? msg;
    } catch {
      /* ignore */
    }
    throw new BgmError(res.status, msg);
  }
  // 204 或空 body（如收藏 POST 返回无内容）：先读 text，空则返回 undefined
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

// ===== 高层 API 封装 =====

export function searchSubjects(
  keyword: string,
  limit = 20,
  offset = 0,
): Promise<SearchResponse> {
  return bgmRequest<SearchResponse>("/v0/search/subjects", {
    method: "POST",
    query: { limit, offset },
    body: {
      keyword,
      sort: "match",
      filter: { type: [1, 2] }, // 书籍(漫画) + 动画
    },
  });
}

export function getSubject(subjectId: number): Promise<Subject> {
  return bgmRequest<Subject>(`/v0/subjects/${subjectId}`);
}

export function getMe(): Promise<BgmUser> {
  return bgmRequest<BgmUser>("/v0/me");
}

export function getUserCollections(
  username: string,
  subjectType?: number,
  limit = 50,
  offset = 0,
): Promise<PagedUserCollections> {
  return bgmRequest<PagedUserCollections>(
    `/v0/users/${encodeURIComponent(username)}/collections`,
    { query: { subject_type: subjectType, limit, offset } },
  );
}

/**
 * 翻页拉取某类型的全部收藏，直到累计达到 total。
 * 解决单页 limit 截断导致数据不全的问题。
 */
export async function getAllUserCollections(
  username: string,
  subjectType: number,
  pageSize = 50,
): Promise<UserCollection[]> {
  const all: UserCollection[] = [];
  let offset = 0;
  // 上限保护，避免异常情况下死循环
  for (let i = 0; i < 100; i++) {
    const page = await getUserCollections(
      username,
      subjectType,
      pageSize,
      offset,
    );
    all.push(...page.data);
    if (all.length >= page.total || page.data.length === 0) break;
    offset += page.data.length;
  }
  return all;
}

/**
 * 获取用户单个条目收藏状态。返回 UserCollection；未收藏时 API 返回 404，
 * 此时捕获并返回 null（便于调用方区分"未收藏"）。
 */
export async function getUserCollection(
  username: string,
  subjectId: number,
): Promise<UserCollection | null> {
  try {
    return await bgmRequest<UserCollection>(
      `/v0/users/${encodeURIComponent(username)}/collections/${subjectId}`,
    );
  } catch (e) {
    if (e instanceof BgmError && e.status === 404) return null;
    throw e;
  }
}

/** 新增收藏（或覆盖性修改）。默认私密。 */
export function setCollection(
  subjectId: number,
  type: number,
): Promise<void> {
  return bgmRequest<void>(`/v0/users/-/collections/${subjectId}`, {
    method: "POST",
    body: { type, private: true },
  });
}

/** 修改收藏夹（仅改 type，安全）。默认私密。 */
export function patchCollection(
  subjectId: number,
  type: number,
): Promise<void> {
  return bgmRequest<void>(`/v0/users/-/collections/${subjectId}`, {
    method: "PATCH",
    body: { type, private: true },
  });
}
