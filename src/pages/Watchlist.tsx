import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { SearchInput } from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/layout/PageLayout";
import { SubjectRow } from "@/components/SubjectRow";
import { SubjectGridCard } from "@/components/SubjectGridCard";
import { SubjectGroup } from "@/components/SubjectGroup";
import { ViewTabs, type ViewMode } from "@/components/ViewTabs";
import { WatchlistToolbar } from "@/components/WatchlistToolbar";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  COLLECTION_LABELS,
  COLLECTION_ORDER,
  CollectionType,
  SubjectType,
} from "@/types/bgm";
import type { UserCollection } from "@/types/bgm";
import { smoothScrollTo } from "@/lib/utils";
import { type PageKey, type WatchSortDir, type WatchSortKey } from "@/App";

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
  /** 本地搜索关键词，行内标题/简介高亮 */
  highlight?: string;
  /** 视图模式：列表 / 网格 */
  viewMode: ViewMode;
  /** 跨页导航（空组引导「去找番搜索」用） */
  onNavigate: (page: PageKey) => void;
}

function Watchlist({
  groups,
  openMap,
  setOpenMap,
  highlight,
  viewMode,
  onNavigate,
}: WatchlistProps) {
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

  /** 分组空态：在看/想看给「去找番搜索」引导，其余仅文案 */
  function EmptyGroup({ type }: { type: CollectionType }) {
    const guide = type === CollectionType.Doing || type === CollectionType.Wish;
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-xs text-muted-foreground">
        <span>暂无{COLLECTION_LABELS[type]}条目</span>
        {guide && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => onNavigate("collection")}
          >
            <Search className="size-3.5" />
            去找番搜索
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {COLLECTION_ORDER.map((type) => {
        const items = groups[type] ?? [];
        const open = openMap[type];
        return (
          <SubjectGroup
            key={type}
            id={`collection-${type}`}
            title={COLLECTION_LABELS[type as CollectionType]}
            count={items.length}
            open={open}
            onOpenChange={(o) => setOpenMap((m) => ({ ...m, [type]: o }))}
          >
            {items.length === 0 ? (
              <EmptyGroup type={type as CollectionType} />
            ) : viewMode === "grid" ? (
              <div className="border-t border-border p-2">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
                  {items.map((c) => (
                    <SubjectGridCard
                      key={c.subject_id}
                      subject={c.subject}
                      caption={
                        c.ep_status > 0
                          ? `看到 ${c.ep_status}${
                              (c.subject.eps ?? 0) > 0 ? `/${c.subject.eps}` : ""
                            }`
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-t border-border p-1">
                {items.map((c) => (
                  <SubjectRow
                    key={c.subject_id}
                    subject={c.subject}
                    extraInfo={<ProgressInfo item={c} />}
                    highlight={highlight}
                  />
                ))}
              </div>
            )}
          </SubjectGroup>
        );
      })}
    </div>
  );
}

/* ---- 追番页面（含标题栏 + 工具栏 + 追番列表） ---- */

interface WatchlistPageProps {
  loading: boolean;
  /** 首次加载门控：全部相关查询就绪前为 true，期间显示骨架屏而非部分列表 */
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
  /** 当前排序方向（升/降序） */
  sortDir: WatchSortDir;
  onToggleSortDir: () => void;
  /** 跨页导航（空组引导用） */
  onNavigate: (page: PageKey) => void;
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
  sortDir,
  onToggleSortDir,
  onNavigate,
}: WatchlistPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const [keyword, setKeyword] = useState("");
  // 列表/网格视图（持久化）
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(
    "prefs.watchlist.viewMode",
    "list",
  );

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
          {/* 视图切换（与追番页/新番页共用样式） */}
          <ViewTabs value={viewMode} onChange={setViewMode} />
          <WatchlistToolbar
            loading={loading}
            totalCount={totalCount}
            counts={counts}
            subjectCounts={subjectCounts}
            subjectType={subjectType}
            onSubjectTypeChange={onSubjectTypeChange}
            sortKey={sortKey}
            onSortChange={onSortChange}
            sortDir={sortDir}
            onToggleSortDir={onToggleSortDir}
            onRefresh={refresh}
            onJumpTo={jumpTo}
            onJumpToTop={jumpToTop}
          />
        </>
      }
    >
      {initialLoading ? (
        <WatchlistSkeleton />
      ) : (
        <>
          {error && (
            <div className="mb-2 flex items-center gap-2 text-sm text-destructive">
              <span>{error instanceof Error ? error.message : "加载失败"}</span>
              <button
                type="button"
                onClick={refresh}
                className="text-xs underline underline-offset-2 hover:text-foreground"
              >
                重试
              </button>
            </div>
          )}
          {hasMatches || keyword.trim() === "" ? (
            <Watchlist
              groups={filteredGroups}
              openMap={openMap}
              setOpenMap={setOpenMap}
              highlight={keyword}
              viewMode={viewMode}
              onNavigate={onNavigate}
            />
          ) : (
            <p className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              未找到匹配的条目，试试其他关键词或清空筛选
            </p>
          )}
        </>
      )}
    </PageLayout>
  );
}

/** 追番页首屏骨架：五个分组头 + 每组两行占位 */
function WatchlistSkeleton() {
  return (
    <div className="space-y-2">
      {COLLECTION_ORDER.map((type) => (
        <div key={type} className="rounded-lg border border-border">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2 border-t border-border p-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex animate-pulse gap-3 rounded-md p-2">
                <div className="aspect-[5/7] w-16 shrink-0 rounded bg-muted" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <div className="h-3.5 w-2/5 rounded bg-muted" />
                  <div className="h-3 w-4/5 rounded bg-muted" />
                  <div className="h-3 w-3/5 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
