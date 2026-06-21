// TanStack Query 查询/变更封装。
// 复用 lib/bgm.ts 的既有函数（401 自动刷新等逻辑保持不变），仅负责缓存与失效。
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getSubject,
  getAllUserCollections,
  getUserCollection,
  searchSubjects,
  setCollection,
  patchCollection,
} from "@/lib/bgm";
import type { SearchResponse, UserCollection } from "@/types/bgm";

const STALE = {
  subjectDetail: 30 * 60_000, // 条目信息极稳定：30 分钟
  collectionsList: 60_000, // 收藏列表：1 分钟
  collectionOne: 30_000, // 单条收藏状态：30 秒
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

/** 搜索（一次性，仅去重，不过度缓存）。 */
export function useSearchSubjects(
  keyword: string,
  enabled: boolean,
) {
  return useQuery<SearchResponse>({
    queryKey: ["search", keyword],
    queryFn: () => searchSubjects(keyword),
    staleTime: 0,
    enabled: enabled && !!keyword.trim(),
  });
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

/** 修改收藏夹。成功后失效收藏缓存。 */
export function usePatchCollection() {
  const invalidate = useInvalidateCollections();
  return useMutation({
    mutationFn: ({ subjectId, type }: { subjectId: number; type: number }) =>
      patchCollection(subjectId, type),
    onSuccess: invalidate,
  });
}
