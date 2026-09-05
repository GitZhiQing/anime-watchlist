import { useState } from "react";
import { Check, ChevronDown, Filter, Flame, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageLayout } from "@/components/layout/PageLayout";
import { SubjectRow } from "@/components/SubjectRow";
import { EnrichedSubjectRow } from "@/components/EnrichedSubjectRow";
import { useSearchSubjects, useTrendingFeed } from "@/lib/queries";
import { SUBJECT_LABELS, SUBJECT_TYPES, SubjectType } from "@/types/bgm";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";

/** 行骨架（搜索中/热度榜加载中） */
function RowSkeletons({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-md p-2">
          <Skeleton className="aspect-[5/7] w-16 shrink-0" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 收藏页空态：热度榜。优先 p1 新增热度，接口失败自动兜底本周追番热度。 */
function TrendingList({ enabled }: { enabled: boolean }) {
  const { data, isLoading, isFallback } = useTrendingFeed(
    SubjectType.Anime,
    20,
    enabled,
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Flame className="size-4 text-orange-500" />
            热门条目
          </h2>
        </div>
        <RowSkeletons rows={5} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无热门条目</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Flame className="size-4 text-orange-500" />
          {isFallback ? "本周追番热度" : "热门条目"}
        </h2>
        {isFallback && (
          <span className="text-xs text-muted-foreground">
            热度接口暂不可用，已按追番人数展示
          </span>
        )}
      </div>
      <div className="space-y-1">
        {data.map((it) => (
          <EnrichedSubjectRow
            key={it.subject.id}
            subject={it.subject}
            extraInfo={
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                <Flame className="size-3 text-orange-500/80" />
                {isFallback ? "追番中" : "热度"} {it.heat}
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
}

interface CollectionProps {
  /** 首次进入本页才启用热度榜查询（App 冷启动门控，keep-alive 首帧即渲染） */
  visited?: boolean;
}

export function Collection({ visited = true }: CollectionProps) {
  const { user } = useAuthUser();
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  // 条目类型过滤，默认动画
  const [subjectType, setSubjectType] = useState<SubjectType | undefined>(
    SubjectType.Anime,
  );

  const { data, isFetching, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSearchSubjects(submitted ?? "", subjectType, !!submitted);
  const results = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <PageLayout title="找番">
      <div className="space-y-4">
        {!user && (
          <p className="text-sm text-muted-foreground">
            收藏需要先到「配置」页完成认证。
          </p>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(keyword.trim() || null);
          }}
        >
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入条目名称搜索"
            data-search-input
            className="flex-1"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" type="button" className="gap-1">
                <Filter className="size-3.5" />
                {subjectType ? SUBJECT_LABELS[subjectType] : "全部"}
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSubjectType(undefined)}>
                <Check
                  className={cn(
                    "size-3.5",
                    subjectType === undefined ? "opacity-100" : "opacity-0",
                  )}
                />
                全部
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {SUBJECT_TYPES.map((t) => (
                <DropdownMenuItem key={t} onClick={() => setSubjectType(t)}>
                  <Check
                    className={cn(
                      "size-3.5",
                      subjectType === t ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {SUBJECT_LABELS[t]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="submit" disabled={isFetching || !keyword.trim()}>
            {isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "查找"
            )}
          </Button>
        </form>

        {submitted ? (
          <>
            {!isFetching && !error && results.length === 0 && (
              <p className="text-sm text-muted-foreground">未找到结果，试试其他关键词</p>
            )}
            {error && (
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "搜索失败"}
              </p>
            )}
            {isFetching && results.length === 0 && <RowSkeletons rows={5} />}
            {total > 0 && (
              <p className="text-xs text-muted-foreground">
                已加载 {results.length} / 共 {total} 条
              </p>
            )}
            <div className="space-y-1">
              {results.map((s) => (
                <SubjectRow key={s.id} subject={s} />
              ))}
            </div>
            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> 加载中...
                    </>
                  ) : (
                    "加载更多"
                  )}
                </Button>
              </div>
            )}
          </>
        ) : (
          <TrendingList enabled={visited} />
        )}
      </div>
    </PageLayout>
  );
}
