import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SearchInput } from "@/components/SearchInput";
import { ProgressEdit } from "@/components/ProgressEdit";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageLayout } from "@/components/layout/PageLayout";
import { SubjectRow } from "@/components/SubjectRow";
import { BangumiLink } from "@/components/BangumiLink";
import { WatchlistToolbar } from "@/components/WatchlistToolbar";
import { usePatchCollection } from "@/lib/queries";
import {
  COLLECTION_LABELS,
  COLLECTION_ORDER,
  CollectionType,
  SubjectType,
} from "@/types/bgm";
import type { UserCollection } from "@/types/bgm";
import { cn, smoothScrollTo } from "@/lib/utils";
import { type WatchSortKey } from "@/App";

/* ---- 追番列表展示组件（纯展示，与 WatchlistToolbar 分开） ---- */

/** 本地关键词匹配：条目原名/中文名/标签 任一命中即匹配（大小写不敏感） */
function matchesKeyword(item: UserCollection, q: string): boolean {
  const s = item.subject;
  const hay = `${s?.name ?? ""} ${s?.name_cn ?? ""} ${(s?.tags ?? [])
    .map((t) => t.name ?? "")
    .join(" ")}`.toLowerCase();
  return hay.includes(q);
}

interface WatchlistProps {
  groups: Record<number, UserCollection[]>;
  openMap: Record<number, boolean>;
  setOpenMap: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
}

function Watchlist({
  groups,
  openMap,
  setOpenMap,
}: WatchlistProps) {
  const patchMut = usePatchCollection();

  function handleMove(item: UserCollection, type: CollectionType) {
    if (type === item.type || patchMut.isPending) return;
    patchMut.mutate(
      { subjectId: item.subject_id, type },
      {
        onSuccess: () =>
          toast.success(
            `已移入「${COLLECTION_LABELS[type]}」`,
          ),
        onError: (e) =>
          toast.error("移动失败", {
            description: e instanceof Error ? e.message : String(e),
          }),
      },
    );
  }

  /** 列表态行内进度（与评分/话数等元信息同一行）：看到第 N 话 + 我的评分 */
  function ProgressInfo({ item }: { item: UserCollection }) {
    const eps = item.subject.eps ?? 0;
    if (item.ep_status <= 0 && item.rate <= 0) return null;
    return (
      <>
        {item.ep_status > 0 && (
          <span>
            看到 {item.ep_status}
            {eps > 0 ? ` / ${eps}` : ""} 话
          </span>
        )}
        {item.rate > 0 && <span>我评 {item.rate} 分</span>}
      </>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {COLLECTION_ORDER.map((type) => {
          const items = groups[type] ?? [];
          const open = openMap[type];
          return (
            <Collapsible
              key={type}
              id={`collection-${type}`}
              open={open}
              onOpenChange={(o) =>
                setOpenMap((m) => ({ ...m, [type]: o }))
              }
              className="rounded-lg border border-border"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50">
                <span>
                  {COLLECTION_LABELS[type as CollectionType]}
                  <span className="ml-2 text-muted-foreground">
                    ({items.length})
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    open && "rotate-180",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                {items.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-muted-foreground">
                    暂无
                  </div>
                ) : (
                  <div className="border-t border-border p-1">
                    {items.map((c) => (
                      <SubjectRow
                        key={c.subject_id}
                        subject={c.subject}
                        extraInfo={<ProgressInfo item={c} />}
                        expandedAction={
                          <>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={patchMut.isPending}
                                  className="gap-1"
                                >
                                  {patchMut.isPending &&
                                  patchMut.variables?.subjectId ===
                                    c.subject_id ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    COLLECTION_LABELS[c.type as CollectionType]
                                  )}
                                  <ChevronDown className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {COLLECTION_ORDER.map((t) => (
                                  <DropdownMenuItem
                                    key={t}
                                    onClick={() =>
                                      handleMove(c, t as CollectionType)
                                    }
                                  >
                                    <Check
                                      className={cn(
                                        "size-3.5",
                                        c.type === t
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {COLLECTION_LABELS[t as CollectionType]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <BangumiLink subjectId={c.subject_id} />
                            <div className="w-full">
                              <ProgressEdit
                                subjectId={c.subject_id}
                                subjectType={c.subject.type}
                                epStatus={c.ep_status}
                                rate={c.rate}
                                totalEps={c.subject.eps ?? 0}
                              />
                            </div>
                          </>
                        }
                      />
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

/* ---- 追番页面（含标题栏 + 工具栏 + 追番列表） ---- */

interface WatchlistPageProps {
  loading: boolean;
  /** 首次加载门控：全部相关查询就绪前为 true，期间显示 spinner 而非部分列表 */
  initialLoading: boolean;
  error: Error | null;
  totalCount: number;
  groups: Record<number, UserCollection[]>;
  openMap: Record<number, boolean>;
  setOpenMap: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  counts: Record<number, number>;
  subjectCounts: Record<number, number>;
  subjectType: SubjectType | undefined;
  onSubjectTypeChange: (t: SubjectType | undefined) => void;
  sortKey: WatchSortKey;
  onSortChange: (k: WatchSortKey) => void;
}

export function WatchlistPage({
  loading,
  initialLoading,
  error,
  totalCount,
  groups,
  openMap,
  setOpenMap,
  counts,
  subjectCounts,
  subjectType,
  onSubjectTypeChange,
  sortKey,
  onSortChange,
}: WatchlistPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const [keyword, setKeyword] = useState("");

  const filteredGroups = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return groups; // 空关键词恒等快路径
    const out: Record<number, UserCollection[]> = {};
    for (const type of COLLECTION_ORDER) {
      out[type] = (groups[type] ?? []).filter((c) => matchesKeyword(c, q));
    }
    return out;
  }, [groups, keyword]);

  const hasMatches = useMemo(
    () => COLLECTION_ORDER.some((t) => (filteredGroups[t] ?? []).length > 0),
    [filteredGroups],
  );

  function refresh() {
    qc.refetchQueries({ queryKey: ["collections"] });
  }

  function jumpTo(type: CollectionType) {
    setOpenMap((m) => ({ ...m, [type]: true }));
    const container = scrollRef.current;
    if (!container) return;
    setTimeout(() => {
      const el = document.getElementById(`collection-${type}`);
      if (!el) return;
      smoothScrollTo(container, el.offsetTop - container.offsetTop);
    }, 200);
  }

  function jumpToTop() {
    scrollRef.current && smoothScrollTo(scrollRef.current, 0);
  }

  return (
    <PageLayout
      title={
        <>
          追番
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {initialLoading ? "加载中..." : `共 ${totalCount} 部`}
          </span>
        </>
      }
      scrollRef={scrollRef}
      toolbar={
        <>
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder="条目名称/标签"
            className="w-44"
          />
          <WatchlistToolbar
            loading={loading}
            totalCount={totalCount}
            counts={counts}
            subjectCounts={subjectCounts}
            subjectType={subjectType}
            onSubjectTypeChange={onSubjectTypeChange}
            sortKey={sortKey}
            onSortChange={onSortChange}
            onRefresh={refresh}
            onJumpTo={jumpTo}
            onJumpToTop={jumpToTop}
          />
        </>
      }
    >
      {initialLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" />
          加载数据中...
        </div>
      ) : (
        <>
          {error && (
            <p className="mb-2 text-sm text-destructive">
              {error instanceof Error ? error.message : "加载失败"}
            </p>
          )}
          {hasMatches || keyword.trim() === "" ? (
            <Watchlist
              groups={filteredGroups}
              openMap={openMap}
              setOpenMap={setOpenMap}
            />
          ) : (
            <p className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              未找到匹配的条目
            </p>
          )}
        </>
      )}
    </PageLayout>
  );
}
