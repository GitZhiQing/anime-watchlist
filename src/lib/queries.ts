// TanStack Query 查询/变更封装。
// 复用 lib/bgm.ts 的既有函数（401 自动刷新等逻辑保持不变），仅负责缓存与失效。
//
// 缓存策略要点：
// - 收藏列表 key：["collections", username, subjectType]；单条 key：["collection", username, subjectId]
// - mutation 采用乐观直写（patchCachedCollections）+ 失败回滚；成功后仅失效单条，
//   列表只标记 stale 不自动重拉（refetchType:"none"），避免改一条触发 5 类全量分页重拉。
import { useCallback, useMemo } from "react";
import {
  QueryCache,
  QueryClient,
  useQuery,
  useInfiniteQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import {
  AuthExpiredError,
  getSubject,
  getAllUserCollections,
  getUserCollection,
  searchSubjects,
  setCollection,
  patchCollection,
  getCalendar,
  getEpisodes,
  getSeasonSubjects,
  type CollectionPatch,
  type SearchSubjectFilter,
} from "@/lib/bgm";
import { getTrendingSubjects, deriveCalendarTrending } from "@/lib/trending";
import {
  getCharacterDetail,
  getPersonDetail,
  getSubjectCharacters,
  getSubjectRelations,
  getSubjectRecs,
  type P1ListResult,
} from "@/lib/p1";
import { SubjectType, SUBJECT_TYPES } from "@/types/bgm";
import type {
  CalendarDay,
  CollectionType,
  P1Character,
  P1PersonDetail,
  P1RecItem,
  P1Relation,
  SearchResponse,
  SeasonSelection,
  SeasonSubjectItem,
  SlimSubject,
  TrendingItem,
  UserCollection,
} from "@/types/bgm";

/**
 * 构建 QueryClient：
 * - retry 用函数形式：AuthExpiredError（登录态已清）不重试，其余最多重试 1 次。
 * - gcTime 30min（默认 5min）：observer 卸载后缓存多保留一会儿，
 *   避免重开弹窗/切换视图/搜索后返回热度榜时在 staleTime 内仍被回收重拉。
 * - refetchOnWindowFocus/Reconnect 关闭：桌面端焦点切换与网络恢复
 *   不应触发后台重拉（收藏列表 staleTime 仅 1min，一被触发就是全量分页重拉）。
 * - QueryCache.onError：认证失效时清掉所有用户相关缓存，
 *   避免展示上一个（已失效）会话拉到的数据。
 */
export function buildQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(error instanceof AuthExpiredError) && failureCount < 1,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof AuthExpiredError) {
          queryClient.removeQueries({ queryKey: ["collections"] });
          queryClient.removeQueries({ queryKey: ["collection"] });
        }
      },
    }),
  });
  return queryClient;
}

const STALE = {
  subjectDetail: 30 * 60_000, // 条目信息极稳定：30 分钟
  collectionsList: 60_000, // 收藏列表：1 分钟
  collectionOne: 2 * 60_000, // 单条收藏状态：2 分钟（mutation 乐观直写缓存，无需频繁确认）
  calendar: 10 * 60_000, // 每日放送：10 分钟，放送计划短期不变
  trending: 10 * 60_000, // 热度榜：10 分钟，新增热度短期变化不快
  search: 5 * 60_000, // 搜索结果：5 分钟，避免重复搜索同词把已翻页全部重拉
  p1Extend: 60 * 60_000, // p1 扩展信息（角色/关联/推荐）：1 小时，私有接口尽量少拉
} as const;

/** p1 扩展信息的缓存保留时长：staleTime 的 2 倍，重开详情弹窗 2 小时内零请求 */
const GC_P1 = 2 * 60 * 60_000;

// ===== 条目详情 =====

/** 条目完整详情查询定义（useSubjectDetail 与 hover 预取共用同一份）。 */
export function subjectQueryOptions(subjectId: number) {
  return {
    queryKey: ["subject", subjectId] as const,
    queryFn: () => getSubject(subjectId),
    staleTime: STALE.subjectDetail,
  };
}

/** 条目完整详情（展开时懒加载）。重复展开同一项命中缓存秒开。
 *  enabled 可进一步门控（如新番列表行进入视口才拉取）。 */
export function useSubjectDetail(subjectId: number, enabled = true) {
  return useQuery({
    ...subjectQueryOptions(subjectId),
    enabled: !!subjectId && enabled,
  });
}

/** hover/聚焦意图预取详情：staleTime 内重复预取零请求。 */
export function usePrefetchSubject() {
  const qc = useQueryClient();
  return useCallback(
    (subjectId: number) => {
      if (!subjectId) return;
      void qc.prefetchQuery(subjectQueryOptions(subjectId));
    },
    [qc],
  );
}

// ===== 收藏列表 / 单条收藏 =====

/** 收藏列表查询定义（App 的 useQueries 与缓存直写共用同一份 key/fn）。 */
export function collectionsQueryOptions(username: string, subjectType: number) {
  return {
    queryKey: ["collections", username, subjectType] as const,
    queryFn: () => getAllUserCollections(username, subjectType),
    staleTime: STALE.collectionsList,
  };
}

/**
 * 单条收藏状态（智能缓存版）：
 * 优先从已加载的收藏列表缓存（["collections", username, *]）中同步查找，命中即返回、零请求；
 * 仅当所有列表缓存都不含该条目（或列表尚未加载）时，才回退单条 GET（404→null）。
 * 依赖 useQueries 的 disabled 观察者获得缓存响应性：列表缓存更新时自动重渲。
 */
export function useUserCollectionSmart(
  username: string | undefined,
  subjectId: number,
) {
  // 只读缓存、从不发起请求的观察者（enabled: false）；queryFn 永不执行，仅满足类型
  const listQueries = useQueries({
    queries: SUBJECT_TYPES.map((subjectType) => ({
      queryKey: ["collections", username, subjectType] as const,
      queryFn: (): UserCollection[] => [],
      enabled: false,
    })),
  });

  const cached = useMemo(() => {
    let hit: UserCollection | undefined;
    let loaded = false;
    for (const q of listQueries) {
      if (!q.data) continue;
      loaded = true;
      const found = (q.data as UserCollection[]).find(
        (c) => c.subject_id === subjectId,
      );
      if (found) hit = found;
    }
    // undefined = 缓存不足以判断（列表都没加载），需回退单条请求；null = 已确认未收藏
    return loaded ? (hit ?? null) : undefined;
  }, [listQueries, subjectId]);

  // 列表正在拉取（首次加载/手动刷新）时挂起单条 fallback：该条目大概率就在
  // 加载中的列表里，立即单条 GET 是一次可避免的多余请求；列表落地后 cached
  // 自然给出答案（命中→零请求，未含→null 无需请求，出错→fallback 照常启用）。
  const anyListFetching = listQueries.some((q) => q.fetchStatus === "fetching");

  const fallback = useQuery<UserCollection | null>({
    queryKey: ["collection", username, subjectId],
    queryFn: () => getUserCollection(username!, subjectId),
    staleTime: STALE.collectionOne,
    enabled: !!username && cached === undefined && !anyListFetching,
  });

  if (cached !== undefined) {
    return {
      data: cached,
      isLoading: false,
      error: null as Error | null,
      // 缓存命中时无错误用不到；回退单条请求失败时供 CollectAction 重试
      refetch: fallback.refetch,
    };
  }
  return {
    data: fallback.data,
    // 挂起等待列表落地期间保持加载语义（disabled 的 fallback 不会自带 isFetching）
    isLoading: fallback.isLoading || anyListFetching,
    error: fallback.error,
    refetch: fallback.refetch,
  };
}

/**
 * 直写缓存：把 patch 合并进所有收藏列表缓存中的该条目与单条缓存。
 * mutation 乐观更新与逐集标记进度共用，保证列表/单条/各页展示同步。
 */
export function patchCachedCollections(
  qc: QueryClient,
  username: string,
  subjectId: number,
  patch: Partial<UserCollection>,
) {
  const now = new Date().toISOString();
  for (const t of SUBJECT_TYPES) {
    const key = ["collections", username, t] as const;
    const data = qc.getQueryData<UserCollection[]>(key);
    if (!data) continue;
    const idx = data.findIndex((c) => c.subject_id === subjectId);
    if (idx === -1) continue;
    const next = [...data];
    next[idx] = { ...next[idx], ...patch, updated_at: now };
    qc.setQueryData(key, next);
  }
  const singleKey = ["collection", username, subjectId] as const;
  const single = qc.getQueryData<UserCollection | null>(singleKey);
  if (single) qc.setQueryData(singleKey, { ...single, ...patch });
}

/**
 * 回滚：恢复快照（列表 + 单条）。prevSingle 为 undefined 表示快照时无缓存。
 * written 为本次乐观写入触碰过的缓存值引用（key → 写入后的引用）：
 * 回滚前比对当前引用——若已被其他写入（并发 mutation 的乐观更新/回滚/列表
 * refetch 落地）替换，说明有更新的数据存在，跳过该 key，避免互抹。
 */
function rollbackCollections(
  qc: QueryClient,
  lists: Array<[QueryKey, UserCollection[] | undefined]>,
  singleKey: QueryKey,
  prevSingle: UserCollection | null | undefined,
  written: Map<QueryKey, unknown>,
) {
  for (const [key, data] of lists) {
    if (written.has(key) && qc.getQueryData(key) !== written.get(key)) continue;
    // 快照时无数据的 key 不能回填空数组（会被误判为"已加载且为空"），只能移除
    if (data === undefined) qc.removeQueries({ queryKey: key });
    else qc.setQueryData(key, data);
  }
  const singleTouched =
    written.has(singleKey) && qc.getQueryData(singleKey) !== written.get(singleKey);
  if (singleTouched) return;
  if (prevSingle === undefined) qc.removeQueries({ queryKey: singleKey });
  else qc.setQueryData(singleKey, prevSingle);
}

interface CollectionMutateVars {
  subjectId: number;
  username: string | undefined;
  /** 当前私密态。PATCH 非 private 字段时服务端要求带 private，缺省回退 true
   *  （历史行为）；调用方应传 col.private，避免把网页端设为公开的收藏重置回私密 */
  currentPrivate?: boolean;
}

/** mutation 成功后的统一收尾：失效单条（有观察者才后台重拉），列表只置 stale。 */
function useSettleCollections() {
  const qc = useQueryClient();
  return useCallback(
    (username: string | undefined, subjectId: number) => {
      qc.invalidateQueries({ queryKey: ["collection", username, subjectId] });
      qc.invalidateQueries({
        queryKey: ["collections", username],
        refetchType: "none",
      });
    },
    [qc],
  );
}

/** 新增收藏。乐观插入列表/单条缓存（有 subject 时），失败回滚。 */
export function useSetCollection() {
  const qc = useQueryClient();
  const settle = useSettleCollections();
  return useMutation({
    mutationFn: ({
      subjectId,
      type,
    }: CollectionMutateVars & { type: number; subject?: SlimSubject }) =>
      setCollection(subjectId, type),
    onMutate: async ({ subjectId, username, type, subject }) => {
      // 同时取消单条与列表的 in-flight 请求：列表 refetch 若在 mutation 后落地，
      // 会以服务端旧数据覆盖乐观插入
      await qc.cancelQueries({ queryKey: ["collection", username, subjectId] });
      await qc.cancelQueries({ queryKey: ["collections", username] });
      const lists = qc.getQueriesData<UserCollection[]>({
        queryKey: ["collections", username],
      });
      const singleKey = ["collection", username, subjectId] as const;
      const prevSingle = qc.getQueryData<UserCollection | null>(singleKey);
      const written = new Map<QueryKey, unknown>();
      if (username && subject) {
        const stub: UserCollection = {
          subject_id: subjectId,
          subject_type: subject.type,
          type: type as CollectionType,
          rate: 0,
          tags: [],
          comment: null,
          ep_status: 0,
          vol_status: 0,
          updated_at: new Date().toISOString(),
          private: true,
          subject,
        };
        // 服务端条目只归入其 subjectType 对应的一个列表，仅插该缓存；
        // 插进全部类型会让「全部」视图 flatMap 后渲染出重复卡片
        for (const [key, data] of lists) {
          if (key[2] !== subject.type) continue;
          if (
            Array.isArray(data) &&
            !data.some((c) => c.subject_id === subjectId)
          ) {
            qc.setQueryData(key, [...data, stub]);
          }
        }
        qc.setQueryData(singleKey, stub);
        // 记录乐观写入后的引用，供回滚守卫比对
        for (const [key] of lists) {
          const cur = qc.getQueryData(key);
          if (cur !== undefined) written.set(key, cur);
        }
        written.set(singleKey, stub);
      }
      return { lists, prevSingle, singleKey, written };
    },
    onSuccess: (_d, { username, subjectId }) => settle(username, subjectId),
    onError: (_e, _vars, ctx) => {
      if (ctx)
        rollbackCollections(
          qc,
          ctx.lists,
          ctx.singleKey,
          ctx.prevSingle,
          ctx.written,
        );
    },
  });
}

/** 修改收藏（收藏夹/进度/评分/备注/私密）。乐观直写全部缓存，失败回滚。
 *  private 解析顺序：显式 patch.private > vars.currentPrivate > true——
 *  非 private 字段的 PATCH 必须携带 private（服务端要求），透传当前值保持原状。 */
export function usePatchCollection() {
  const qc = useQueryClient();
  const settle = useSettleCollections();
  return useMutation({
    mutationFn: ({
      subjectId,
      username,
      currentPrivate,
      ...patch
    }: CollectionMutateVars & CollectionPatch) =>
      patchCollection(subjectId, {
        ...patch,
        private: patch.private ?? (currentPrivate ?? true),
      }),
    onMutate: async ({ subjectId, username, currentPrivate, ...patch }) => {
      void currentPrivate; // 仅参与请求体组装，不写入缓存
      // 同时取消单条与列表的 in-flight 请求，防止 refetch 落地覆盖乐观写入
      await qc.cancelQueries({ queryKey: ["collection", username, subjectId] });
      await qc.cancelQueries({ queryKey: ["collections", username] });
      const lists = qc.getQueriesData<UserCollection[]>({
        queryKey: ["collections", username],
      });
      const singleKey = ["collection", username, subjectId] as const;
      const prevSingle = qc.getQueryData<UserCollection | null>(singleKey);
      const written = new Map<QueryKey, unknown>();
      if (username) {
        // CollectionPatch.type 是 number，UserCollection.type 是 CollectionType，直写缓存需收窄
        patchCachedCollections(
          qc,
          username,
          subjectId,
          patch as Partial<UserCollection>,
        );
        // 记录乐观写入后的引用，供回滚守卫比对（未命中的 key 引用未变，回滚等价无操作）
        for (const [key] of lists) {
          const cur = qc.getQueryData(key);
          if (cur !== undefined) written.set(key, cur);
        }
        const curSingle = qc.getQueryData(singleKey);
        if (curSingle !== undefined) written.set(singleKey, curSingle);
      }
      return { lists, prevSingle, singleKey, written };
    },
    onSuccess: (_d, { username, subjectId }) => settle(username, subjectId),
    onError: (_e, _vars, ctx) => {
      if (ctx)
        rollbackCollections(
          qc,
          ctx.lists,
          ctx.singleKey,
          ctx.prevSingle,
          ctx.written,
        );
    },
  });
}

// ===== 搜索 / 日历 / 热度 =====

/**
 * 搜索（翻页）。subjectType 与高级筛选入 cache key，切换即自动重搜。
 * useInfiniteQuery：pageParam 为 offset，每页 limit 20。
 */
export function useSearchSubjects(
  keyword: string,
  subjectType: SubjectType | undefined,
  adv: SearchSubjectFilter | undefined,
  enabled: boolean,
) {
  return useInfiniteQuery<SearchResponse>({
    queryKey: ["search", keyword, subjectType, adv ?? null],
    queryFn: ({ pageParam }) =>
      searchSubjects(keyword, subjectType, 20, pageParam as number, adv),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.data.length;
      // 空页防御：服务端返回空页且未达 total 时，next 会与当前 offset 相同，
      // 不拦截会反复拉同一空页
      if (next <= last.offset) return undefined;
      return next < last.total ? next : undefined;
    },
    staleTime: STALE.search,
    enabled: enabled && !!keyword.trim(),
  });
}

/** p1 新增热度榜（公开接口，无需登录）。enabled 供找番页首次访问门控。 */
export function useTrendingSubjects(
  type: SubjectType = SubjectType.Anime,
  limit = 20,
  enabled = true,
) {
  return useQuery<TrendingItem[]>({
    queryKey: ["trending", "subjects", type, limit],
    queryFn: () => getTrendingSubjects(type, limit),
    staleTime: STALE.trending,
    enabled,
  });
}

/**
 * 找番页空态热度榜：优先 p1 新增热度；接口失败时兜底每日放送按追番人数排。
 * 兜底 query 与日历页共用 ["calendar"] 缓存（已缓存直接复用），且仅在 p1
 * 失败后才启用，避免冷启动多拉一份 /calendar。enabled 供首次访问门控。
 */
export function useTrendingFeed(
  type: SubjectType = SubjectType.Anime,
  limit = 20,
  enabled = true,
) {
  const trending = useTrendingSubjects(type, limit, enabled);
  const calendar = useQuery<CalendarDay[]>({
    queryKey: ["calendar"],
    queryFn: getCalendar,
    staleTime: STALE.calendar,
    enabled: enabled && trending.isError,
  });

  const data = useMemo<TrendingItem[] | undefined>(() => {
    if (!trending.isError) return trending.data;
    return calendar.data ? deriveCalendarTrending(calendar.data, limit) : undefined;
  }, [trending.isError, trending.data, calendar.data, limit]);

  const isLoading =
    trending.isPending || (trending.isError && calendar.isPending);

  return {
    data,
    isLoading,
    /** 是否走了日历兜底（UI 据此调整「热度/追番中」文案） */
    isFallback: !!trending.isError && !!calendar.data,
    /** 重试 p1 热度榜（仍失败则继续日历兜底），供热度榜刷新按钮 */
    refetch: trending.refetch,
    isRefetching: trending.isRefetching,
  };
}

/** 条目主篇剧集列表（动画类改进度用，按需 fetchQuery）。 */
export function episodesQueryOptions(subjectId: number) {
  return {
    queryKey: ["episodes", subjectId] as const,
    queryFn: () => getEpisodes(subjectId),
    staleTime: STALE.subjectDetail,
  };
}

/** 每日放送日历（公开接口，无需登录）。enabled 供新番页首次访问门控。 */
export function useCalendar(enabled = true) {
  return useQuery<CalendarDay[]>({
    queryKey: ["calendar"],
    queryFn: getCalendar,
    staleTime: STALE.calendar,
    enabled,
  });
}

/**
 * 季度新番列表（公开接口，无需登录）。sel 为 null（本季每周放送模式）时禁用。
 * 季度并入 key：切换季度自动拉取、来回切换命中缓存。历史季度数据近乎不变，
 * staleTime 对齐条目详情的 30min。未来季度同样可查（下季条目已公布）。
 */
export function useSeasonSubjects(sel: SeasonSelection | null, enabled = true) {
  return useQuery<SeasonSubjectItem[]>({
    queryKey: ["season", sel?.year, sel?.season],
    queryFn: () => getSeasonSubjects(sel as SeasonSelection),
    staleTime: STALE.subjectDetail,
    enabled: enabled && sel !== null,
  });
}

// ===== p1 条目扩展信息（角色/关联/推荐） =====
// 私有接口、可能下线：失败时由 UI 静默隐藏对应区块（isError 不提示），缓存 1 小时。
// gcTime 2 小时：重开同一详情弹窗不重拉；enabled 供区块滚动可见门控。

export function useSubjectCharacters(subjectId: number, enabled = true) {
  return useQuery<P1ListResult<P1Character>>({
    queryKey: ["p1", "characters", subjectId],
    queryFn: () => getSubjectCharacters(subjectId),
    staleTime: STALE.p1Extend,
    gcTime: GC_P1,
    enabled: !!subjectId && enabled,
  });
}

export function useSubjectRelations(subjectId: number, enabled = true) {
  return useQuery<P1ListResult<P1Relation>>({
    queryKey: ["p1", "relations", subjectId],
    queryFn: () => getSubjectRelations(subjectId),
    staleTime: STALE.p1Extend,
    gcTime: GC_P1,
    enabled: !!subjectId && enabled,
  });
}

export function useSubjectRecs(subjectId: number, enabled = true) {
  return useQuery<P1ListResult<P1RecItem>>({
    queryKey: ["p1", "recs", subjectId],
    queryFn: () => getSubjectRecs(subjectId),
    staleTime: STALE.p1Extend,
    gcTime: GC_P1,
    enabled: !!subjectId && enabled,
  });
}

/** 角色详情（p1 私有端点，形状宽松）。id 为 null 时禁用（目标未选定时零请求） */
export function useCharacterDetail(characterId: number | null) {
  return useQuery<P1PersonDetail>({
    queryKey: ["p1", "character", characterId],
    queryFn: () => getCharacterDetail(characterId!),
    staleTime: STALE.p1Extend,
    gcTime: GC_P1,
    enabled: characterId !== null,
  });
}

/** 声优（人物）详情（p1 私有端点，形状宽松） */
export function usePersonDetail(personId: number | null) {
  return useQuery<P1PersonDetail>({
    queryKey: ["p1", "person", personId],
    queryFn: () => getPersonDetail(personId!),
    staleTime: STALE.p1Extend,
    gcTime: GC_P1,
    enabled: personId !== null,
  });
}
