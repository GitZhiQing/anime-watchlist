import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDownWideNarrow, ChevronDown, Filter, Flame, Loader2, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageLayout } from "@/components/layout/PageLayout";
import { EnrichedSubjectRow } from "@/components/EnrichedSubjectRow";
import { SearchInput } from "@/components/SearchInput";
import { SubjectGridCard } from "@/components/SubjectGridCard";
import { ViewTabs, type ViewMode } from "@/components/ViewTabs";
import { useSearchSubjects, useTrendingFeed } from "@/lib/queries";
import { SUBJECT_LABELS, SUBJECT_TYPES, SubjectType } from "@/types/bgm";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { usePersistentState } from "@/hooks/usePersistentState";
import type { SearchSubjectFilter } from "@/lib/bgm";
import type { PageKey } from "@/App";

const MAX_HISTORY = 10;

/** 搜索结果排序（客户端，作用于已加载条目）：match=接口相关度原序 */
type ResultSortKey = "match" | "score" | "name";
const RESULT_SORT_LABELS: Record<ResultSortKey, string> = {
  match: "默认",
  score: "评分",
  name: "名称",
};

/** 搜索结果/热度榜网格容器（与追番/新番网格同规格） */
function GridView({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
      {children}
    </div>
  );
}

/** 行骨架（搜索中/热度榜加载中） */
function RowSkeletons({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="加载中">
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
function TrendingList({ enabled, viewMode }: { enabled: boolean; viewMode: ViewMode }) {
  const { data, isLoading, isFallback, refetch, isRefetching } = useTrendingFeed(
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
        <Button
          variant="outline"
          size="icon-sm"
          className="ml-auto"
          title="刷新"
          disabled={isRefetching}
          onClick={() => void refetch()}
        >
          <RefreshCw className={cn("size-4", isRefetching && "animate-spin")} />
        </Button>
      </div>
      {viewMode === "grid" ? (
        <GridView>
          {data.map((it) => (
            <SubjectGridCard
              key={it.subject.id}
              subject={it.subject}
              caption={`${isFallback ? "追番中" : "热度"} ${it.heat}`}
            />
          ))}
        </GridView>
      ) : (
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
      )}
    </div>
  );
}

interface CollectionProps {
  /** 首次进入本页才启用热度榜查询（App 冷启动门控，keep-alive 首帧即渲染） */
  visited?: boolean;
  /** 未登录横幅「去认证」跳转（App 注入 navigate） */
  onNavigate?: (page: PageKey) => void;
}

export function Collection({ visited = true, onNavigate }: CollectionProps) {
  const { user } = useAuthUser();
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  // 搜索历史：最新在前去重，持久化到 store；badge 点击填入、X 单删、「清空」全删
  const [history, setHistory] = usePersistentState<string[]>(
    "prefs.collection.searchHistory",
    [],
  );
  const [historyOpen, setHistoryOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  // 条目类型过滤，默认动画，持久化。store 无法区分「存过 undefined」与「未存」
  //（setStore(undefined) 即删键，删键又回默认值动画），故用哨兵值 0 表示「全部」
  const [storedType, setStoredType] = usePersistentState<number>(
    "prefs.collection.subjectType",
    SubjectType.Anime,
  );
  const subjectType: SubjectType | undefined = SUBJECT_TYPES.includes(
    storedType as SubjectType,
  )
    ? (storedType as SubjectType)
    : undefined;

  // 高级筛选（会话内不持久化）：改动即重搜（filter 入 query key）
  const [advFilter, setAdvFilter] = useState<SearchSubjectFilter | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [yearFromText, setYearFromText] = useState("");
  const [yearToText, setYearToText] = useState("");
  const activeFilterCount = [
    advFilter?.yearFrom,
    advFilter?.yearTo,
    advFilter?.minRating,
  ].filter((v) => v !== undefined).length;

  /** 应用年份区间（失焦/回车触发；非法输入按未填处理） */
  function applyYear(from: string, to: string) {
    const parse = (s: string) => {
      const n = parseInt(s, 10);
      return !isNaN(n) && n >= 1900 && n <= 2100 ? n : undefined;
    };
    const f = parse(from);
    const t = parse(to);
    setYearFromText(f ? String(f) : "");
    setYearToText(t ? String(t) : "");
    setAdvFilter((prev) => {
      const next = { ...prev, yearFrom: f, yearTo: t };
      return normalizeAdv(next);
    });
  }

  /** 无任何生效字段的筛选对象归一为 undefined（保持 query key 干净） */
  function normalizeAdv(f: SearchSubjectFilter | undefined): SearchSubjectFilter | undefined {
    if (!f) return f;
    if (f.yearFrom === undefined && f.yearTo === undefined && f.minRating === undefined)
      return undefined;
    return f;
  }

  function clearFilter() {
    setAdvFilter(undefined);
    setYearFromText("");
    setYearToText("");
  }

  const { data, isFetching, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSearchSubjects(submitted ?? "", subjectType, advFilter, !!submitted);
  // useMemo 稳定引用：下游 sortedResults 的 useMemo 依赖 results，
  // 每渲染新建数组会让其形同虚设（非默认排序时逐字符全量重排）
  const results = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;

  // 视图切换（与追番/新番共用 ViewTabs），持久化；旧/非法存值归一化为列表
  const [rawViewMode, setViewMode] = usePersistentState<ViewMode>(
    "prefs.collection.viewMode",
    "list",
  );
  const view: ViewMode = rawViewMode === "grid" ? "grid" : "list";

  // 搜索结果排序（会话内状态，不持久化）：客户端对已加载条目排序
  const [resultSort, setResultSort] = useState<ResultSortKey>("match");
  const sortedResults = useMemo(() => {
    if (resultSort === "match") return results;
    const arr = [...results];
    arr.sort((a, b) =>
      resultSort === "score"
        ? (b.score ?? 0) - (a.score ?? 0)
        : (a.name_cn || a.name).localeCompare(b.name_cn || b.name, "zh-Hans-CN"),
    );
    return arr;
  }, [results, resultSort]);

  return (
    <PageLayout
      title="找番"
      toolbar={
        <>
          {/* 结果排序（仅搜索态显示）：客户端对已加载条目排序，tooltip 说明 */}
          {submitted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1" title="对已加载条目排序">
                  <ArrowDownWideNarrow className="size-3.5" />
                  {RESULT_SORT_LABELS[resultSort]}
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(RESULT_SORT_LABELS) as ResultSortKey[]).map((k) => (
                  <DropdownMenuCheckboxItem
                    key={k}
                    checked={resultSort === k}
                    onSelect={() => setResultSort(k)}
                  >
                    {RESULT_SORT_LABELS[k]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <ViewTabs value={view} onChange={setViewMode} />
        </>
      }
    >
      <div className="space-y-4">
        {!user && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>收藏需要先完成 Bangumi 认证。</span>
            {onNavigate && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onNavigate("config")}
              >
                去认证
              </Button>
            )}
          </div>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const kw = keyword.trim();
            setSubmitted(kw || null);
            if (kw)
              setHistory((prev) =>
                [kw, ...prev.filter((h) => h !== kw)].slice(0, MAX_HISTORY),
              );
          }}
        >
          <SearchInput
            inputRef={inputRef}
            value={keyword}
            onChange={(v) => {
              setKeyword(v);
              // 清空搜索框后回到初始态（热度榜）
              if (!v.trim()) setSubmitted(null);
            }}
            placeholder="输入条目名称搜索…"
            className="flex-1"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" type="button" className="gap-1">
                <Filter className="size-3.5" aria-hidden="true" />
                {subjectType ? SUBJECT_LABELS[subjectType] : "全部"}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem
                checked={subjectType === undefined}
                onSelect={() => setStoredType(0)}
              >
                全部
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {SUBJECT_TYPES.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t}
                  checked={subjectType === t}
                  onSelect={() => setStoredType(t)}
                >
                  {SUBJECT_LABELS[t]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="submit" size="sm" disabled={isFetching || !keyword.trim()}>
            {isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "查找"
            )}
          </Button>
          {/* 高级筛选开关：与查找按钮同排（类似网站的高级筛选入口），切换下方筛选行 */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "gap-1",
              activeFilterCount > 0 && "border-primary/50 text-primary",
            )}
            title="高级筛选（年份 / 评分 / R18）"
            onClick={() => setFilterOpen((o) => !o)}
          >
            <SlidersHorizontal className="size-3.5" />
            筛选
            {activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="h-4 min-w-4 px-1 text-[10px] leading-none"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </form>

        {/* 高级筛选行（「筛选」按钮切换，有生效筛选时保持显示）。改动立即重搜 */}
        {(filterOpen || activeFilterCount > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-muted-foreground">年份</span>
            <Input
              type="number"
              value={yearFromText}
              onChange={(e) => setYearFromText(e.target.value)}
              onBlur={() => applyYear(yearFromText, yearToText)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="起"
              aria-label="起始年份"
              className="h-8 w-20 px-2 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <Input
              type="number"
              value={yearToText}
              onChange={(e) => setYearToText(e.target.value)}
              onBlur={() => applyYear(yearFromText, yearToText)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="止"
              aria-label="结束年份"
              className="h-8 w-20 px-2 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  {advFilter?.minRating ? `${advFilter.minRating}+ 分` : "评分不限"}
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {[undefined, 6, 7, 8, 9].map((n) => (
                  <DropdownMenuCheckboxItem
                    key={n ?? "all"}
                    checked={
                      advFilter?.minRating === n ||
                      (n === undefined && !advFilter?.minRating)
                    }
                    onSelect={() =>
                      setAdvFilter((prev) =>
                        normalizeAdv({ ...prev, minRating: n }),
                      )
                    }
                  >
                    {n ? `${n}+ 分` : "评分不限"}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={clearFilter}
              >
                清除全部
              </Button>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setHistoryOpen((o) => !o)}
                title={historyOpen ? "折叠" : "展开"}
                className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    !historyOpen && "-rotate-90",
                  )}
                />
                搜索历史
              </button>
              <button
                type="button"
                onClick={() => setHistory([])}
                className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                清空
              </button>
            </div>
            {historyOpen && (
              <div className="flex flex-wrap gap-1.5">
                {history.map((h) => (
                  <Badge
                    key={h}
                    variant="secondary"
                    className="max-w-full gap-0.5 pr-0.5 font-normal"
                  >
                    <button
                      type="button"
                      className="max-w-40 cursor-pointer truncate"
                      title={`填入「${h}」`}
                      onClick={() => {
                        setKeyword(h);
                        inputRef.current?.focus();
                      }}
                    >
                      {h}
                    </button>
                    <button
                      type="button"
                      title="删除该条历史"
                      aria-label={`删除搜索历史「${h}」`}
                      className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
                      onClick={() =>
                        setHistory((prev) => prev.filter((x) => x !== h))
                      }
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {submitted ? (
          <>
            {!isFetching && !error && results.length === 0 && (
              <p className="text-sm text-muted-foreground">未找到结果，试试其他关键词</p>
            )}
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <span>{error instanceof Error ? error.message : "搜索失败"}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => refetch()}
                >
                  <RefreshCw className="size-3" /> 重试
                </Button>
              </div>
            )}
            {isFetching && results.length === 0 && <RowSkeletons rows={5} />}
            {total > 0 && (
              <p className="text-xs text-muted-foreground">
                已加载 {results.length} / 共 {total} 条
              </p>
            )}
            {view === "grid" ? (
              <GridView>
                {sortedResults.map((s) => (
                  <SubjectGridCard
                    key={s.id}
                    subject={s}
                    caption={s.score ? `评分 ${s.score}` : undefined}
                  />
                ))}
              </GridView>
            ) : (
              <div className="space-y-1">
                {sortedResults.map((s) => (
                  <EnrichedSubjectRow key={s.id} subject={s} />
                ))}
              </div>
            )}
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
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" /> 加载中…
                    </>
                  ) : (
                    "加载更多"
                  )}
                </Button>
              </div>
            )}
          </>
        ) : (
          <TrendingList enabled={visited} viewMode={view} />
        )}
      </div>
    </PageLayout>
  );
}
