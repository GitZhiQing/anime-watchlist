// Bangumi HTTP 客户端。
// 使用 @tauri-apps/plugin-http 的 fetch（走 Rust，可设 User-Agent 且绕过 CORS）。
// 统一注入 UA + Bearer token，处理 401 自动刷新（刷新加锁、失败清登录态）。
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { emit } from "@tauri-apps/api/event";
import { StoreKeys, clearAuth, getStore, setStore } from "@/lib/store";
import { getProxy } from "@/lib/proxy";
import { SubjectType, SUBJECT_TYPES } from "@/types/bgm";
import type {
  BgmUser,
  CalendarDay,
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
  "GitZhiQing/anime-watchlist/1.4.0 (https://github.com/GitZhiQing/anime-watchlist)";

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
  // 刷新时传的 redirect_uri 必须与当初换 token 时一致（动态端口下尤其关键）。
  // 老用户首次升级时该键不存在，回退固定 REDIRECT_URI（与老版本行为一致）。
  const redirectUri =
    (await getStore<string>(StoreKeys.redirectUri)) ?? REDIRECT_URI;
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
      redirect_uri: redirectUri,
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
  // 401 → 尝试刷新一次再重试一次。封顶单周期：刷新后重试若仍 401，
  // 视为令牌被服务端持续拒绝，直接清登录态引导重新认证，避免与上层
  // query retry 叠加触发二次刷新（refresh_token 轮换下会互相作废）。
  if (res.status === 401 && auth) {
    try {
      await refreshAccessToken();
      headers["Authorization"] = `Bearer ${(await getAccessToken())!}`;
      res = await doFetch();
    } catch (e) {
      // 刷新本身抛错：
      // - AuthExpiredError（刷新被拒）：已清登录态，直接透传。
      // - 400/401（明确拒绝）：清登录态、广播、抛 AuthExpiredError。
      // - 网络/超时：原样抛出，保留登录态，避免断网误踢下线。
      if (e instanceof AuthExpiredError) throw e;
      if (isTokenDefinitivelyRejected(e)) {
        await clearAuth();
        await emit("auth-expired");
        throw new AuthExpiredError();
      }
      throw e;
    }
    // 刷新成功但重试仍 401：令牌确实无效，封顶——清登录态引导重登。
    if (res.status === 401) {
      await clearAuth();
      await emit("auth-expired");
      throw new AuthExpiredError("刷新后令牌仍被拒绝，请重新认证");
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
  subjectType?: SubjectType,
  limit = 20,
  offset = 0,
): Promise<SearchResponse> {
  return bgmRequest<SearchResponse>("/v0/search/subjects", {
    method: "POST",
    query: { limit, offset },
    body: {
      keyword,
      sort: "match",
      // subjectType 省略（全部）→ 5 种类型；否则单类型精确搜索
      filter: { type: subjectType ? [subjectType] : SUBJECT_TYPES },
    },
  });
}

export function getSubject(subjectId: number): Promise<Subject> {
  return bgmRequest<Subject>(`/v0/subjects/${subjectId}`);
}

export function getMe(): Promise<BgmUser> {
  return bgmRequest<BgmUser>("/v0/me");
}

/** 获取每日放送日历。公开接口，无需认证。 */
export function getCalendar(): Promise<CalendarDay[]> {
  return bgmRequest<CalendarDay[]>("/calendar", { auth: false });
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

/** 单类型内分页并发数；5 类型并行时峰值并发 ≈ 5 + 5×cap，cap 取 2 兼顾速度与限流 */
const PAGE_CONCURRENCY = 2;
/** 单类型最大页数上限，与旧顺序循环的 100 次上限一致（5000 条/类型） */
const MAX_PAGES = 100;

/** 有界并发 map：最多 concurrency 个任务并行，结果按输入顺序返回。
 *  任一任务失败 → 停止派发新任务，等在途任务落定后整体 reject（无悬挂/未捕获）。 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let error: unknown;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length || error) return;
        try {
          results[i] = await fn(items[i]);
        } catch (e) {
          error ??= e;
          next = items.length; // 停止派发新任务
          return;
        }
      }
    },
  );
  await Promise.all(workers);
  if (error) throw error;
  return results;
}

/**
 * 翻页拉取某类型的全部收藏，直到累计达到 total。
 * 先取第 0 页获知 total，再按 offset 有界并发抓取剩余页，缩短总等待时间。
 * 结果按 offset 升序拼接，与旧顺序循环的返回顺序一致。
 */
export async function getAllUserCollections(
  username: string,
  subjectType: number,
  pageSize = 50,
): Promise<UserCollection[]> {
  const first = await getUserCollections(username, subjectType, pageSize, 0);
  // 只有服务器实际把响应 limit 压到 pageSize 以下时才信任 first.limit（防止跳过条目）
  const step = first.limit > 0 && first.limit < pageSize ? first.limit : pageSize;
  const pageCount = Math.min(Math.ceil(first.total / step), MAX_PAGES);
  if (pageCount <= 1) return first.data;
  const offsets = Array.from({ length: pageCount - 1 }, (_, i) => (i + 1) * step);
  const rest = await mapWithConcurrency(
    offsets,
    (offset) => getUserCollections(username, subjectType, pageSize, offset),
    PAGE_CONCURRENCY,
  );
  return [...first.data, ...rest.flatMap((p) => p.data)];
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

/** 收藏可修改字段（PATCH body 子集）。服务端要求改非 type 字段时也要带 private。 */
export interface CollectionPatch {
  type?: number;
  ep_status?: number;
  vol_status?: number;
  rate?: number;
  comment?: string;
  private?: boolean;
}

/** 修改收藏（改收藏夹/进度/评分等）。默认私密。 */
export function patchCollection(
  subjectId: number,
  patch: CollectionPatch,
): Promise<void> {
  return bgmRequest<void>(`/v0/users/-/collections/${subjectId}`, {
    method: "PATCH",
    body: { ...patch, private: true },
  });
}

/** 取消收藏（DELETE）。 */
export function deleteCollection(subjectId: number): Promise<void> {
  return bgmRequest<void>(`/v0/users/-/collections/${subjectId}`, {
    method: "DELETE",
  });
}

/** 剧集（主篇 type=0）。id 为全局剧集 id，ep 为条目内序号。 */
export interface Episode {
  id: number;
  type: number;
  ep: number;
  name: string;
  name_cn: string;
  /** 首播日期，如 2026-07-21 */
  airdate?: string;
  /** 时长，如 00:23:40 */
  duration?: string;
  /** 单集简介 */
  desc?: string;
}

interface PagedEpisodes {
  data: Episode[];
  total: number;
  limit: number;
  offset: number;
}

/** 拉取条目全部主篇剧集（/v0/episodes，自动翻页）。 */
export async function getEpisodes(subjectId: number): Promise<Episode[]> {
  const first = await bgmRequest<PagedEpisodes>("/v0/episodes", {
    query: { subject_id: subjectId, type: 0, limit: 100, offset: 0 },
  });
  const pages = Math.ceil(first.total / (first.limit || 100));
  if (pages <= 1) return first.data;
  const rest = await mapWithConcurrency(
    Array.from({ length: pages - 1 }, (_, i) => (i + 1) * (first.limit || 100)),
    (offset) =>
      bgmRequest<PagedEpisodes>("/v0/episodes", {
        query: { subject_id: subjectId, type: 0, limit: 100, offset },
      }),
    PAGE_CONCURRENCY,
  );
  return [...first.data, ...rest.flatMap((p) => p.data)];
}

/**
 * 标记某话的收藏状态：type 2=看过、0=未收藏。
 * 单集接口为 PUT /v0/users/-/collections/-/episodes/{episode_id}（注意路径中
 * 没有 subject_id），走 PUT+type 而非 POST/DELETE。
 */
export function setEpisodeWatched(
  subjectId: number,
  episodeId: number,
  watched: boolean,
): Promise<void> {
  void subjectId; // 单集接口按 episode_id 定位，无需 subject_id
  return bgmRequest<void>(`/v0/users/-/collections/-/episodes/${episodeId}`, {
    method: "PUT",
    body: { type: watched ? 2 : 0 },
  });
}
