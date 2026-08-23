// TanStack Query 查询/变更封装。
// 复用 lib/bgm.ts 的既有函数（401 自动刷新等逻辑保持不变），仅负责缓存与失效。
import { useMemo } from "react";
import {
  QueryCache,
  QueryClient,
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AuthExpiredError,
  getSubject,
  getAllUserCollections,
  getUserCollection,
  searchSubjects,
  setCollection,
  patchCollection,
  deleteCollection,
  getCalendar,
  getEpisodes,
  type CollectionPatch,
} from "@/lib/bgm";
import { getTrendingSubjects, deriveCalendarTrending } from "@/lib/trending";
import { SubjectType } from "@/types/bgm";
import type {
  CalendarDay,
  SearchResponse,
  TrendingItem,
  UserCollection,
} from "@/types/bgm";

/**
 * 构建 QueryClient：
 * - retry 用函数形式：AuthExpiredError（登录态已清）不重试，其余最多重试 1 次。
 * - QueryCache.onError：认证失效时清掉所有用户相关缓存，
 *   避免展示上一个（已失效）会话拉到的数据。
 */
export function buildQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(error instanceof AuthExpiredError) && failureCount < 1,
        refetchOnWindowFocus: false,
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
  collectionOne: 30_000, // 单条收藏状态：30 秒
  calendar: 10 * 60_000, // 每日放送：10 分钟，放送计划短期不变
  trending: 10 * 60_000, // 热度榜：10 分钟，新增热度短期变化不快
} as const;

/** 条目完整详情（展开时懒加载）。重复展开同一项命中缓存秒开。 */
export function useSubjectDetail(subjectId: number) {
  return useQuery({
    queryKey: ["subject", subjectId],
    queryFn: () => getSubject(subjectId),
    staleTime: STALE.subjectDetail,
    enabled: !!subjectId,
  });
}

/** 某类型的全部收藏（自动翻页）。queryKey 含 username + type。 */
export function useUserCollectionsAll(
  username: string | undefined,
  subjectType: number,
) {
  return useQuery({
    queryKey: ["collections", username, subjectType],
    queryFn: () => getAllUserCollections(username!, subjectType),
    staleTime: STALE.collectionsList,
    enabled: !!username,
  });
}

/** 单条收藏状态。未收藏返回 null。 */
export function useUserCollection(
  username: string | undefined,
  subjectId: number,
) {
  return useQuery<UserCollection | null>({
    queryKey: ["collection", username, subjectId],
    queryFn: () => getUserCollection(username!, subjectId),
    staleTime: STALE.collectionOne,
    enabled: !!username,
  });
}

/**
 * 搜索（翻页）。subjectType 入 cache key，切换类型自动重搜。
 * useInfiniteQuery：pageParam 为 offset，每页 limit 20。
 */
export function useSearchSubjects(
  keyword: string,
  subjectType: SubjectType | undefined,
  enabled: boolean,
) {
  return useInfiniteQuery<SearchResponse>({
    queryKey: ["search", keyword, subjectType],
    queryFn: ({ pageParam }) =>
      searchSubjects(keyword, subjectType, 20, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.data.length < last.total
        ? last.offset + last.data.length
        : undefined,
    staleTime: 0,
    enabled: enabled && !!keyword.trim(),
  });
}

/** p1 新增热度榜（公开接口，无需登录）。 */
export function useTrendingSubjects(
  type: SubjectType = SubjectType.Anime,
  limit = 20,
) {
  return useQuery<TrendingItem[]>({
    queryKey: ["trending", "subjects", type, limit],
    queryFn: () => getTrendingSubjects(type, limit),
    staleTime: STALE.trending,
  });
}

/**
 * 收藏页空态热度榜：优先 p1 新增热度；接口失败时兜底每日放送按追番人数排。
 * 兜底 query 与日历页共用 ["calendar"] 缓存（已缓存直接复用），且仅在 p1
 * 失败后才启用，避免冷启动多拉一份 /calendar。
 */
export function useTrendingFeed(
  type: SubjectType = SubjectType.Anime,
  limit = 20,
) {
  const trending = useTrendingSubjects(type, limit);
  const calendar = useQuery<CalendarDay[]>({
    queryKey: ["calendar"],
    queryFn: getCalendar,
    staleTime: STALE.calendar,
    enabled: trending.isError,
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
  };
}

/** 失效所有收藏相关缓存（列表 + 单条），供 mutation 成功后调用。 */
function useInvalidateCollections() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["collections"] });
    qc.invalidateQueries({ queryKey: ["collection"] });
  };
}

/** 新增收藏。成功后失效收藏缓存。 */
export function useSetCollection() {
  const invalidate = useInvalidateCollections();
  return useMutation({
    mutationFn: ({ subjectId, type }: { subjectId: number; type: number }) =>
      setCollection(subjectId, type),
    onSuccess: invalidate,
  });
}

/** 修改收藏（收藏夹/进度/评分）。成功后失效收藏缓存。 */
export function usePatchCollection() {
  const invalidate = useInvalidateCollections();
  return useMutation({
    mutationFn: ({
      subjectId,
      ...patch
    }: { subjectId: number } & CollectionPatch) =>
      patchCollection(subjectId, patch),
    onSuccess: invalidate,
  });
}

/** 取消收藏。成功后失效收藏缓存。 */
export function useDeleteCollection() {
  const invalidate = useInvalidateCollections();
  return useMutation({
    mutationFn: (subjectId: number) => deleteCollection(subjectId),
    onSuccess: invalidate,
  });
}

/** 条目主篇剧集列表（动画类改进度用，按需 fetchQuery）。 */
export function episodesQueryOptions(subjectId: number) {
  return {
    queryKey: ["episodes", subjectId] as const,
    queryFn: () => getEpisodes(subjectId),
    staleTime: STALE.subjectDetail,
  };
}

/** 每日放送日历（公开接口，无需登录）。 */
export function useCalendar() {
  return useQuery<CalendarDay[]>({
    queryKey: ["calendar"],
    queryFn: getCalendar,
    staleTime: STALE.calendar,
  });
}
