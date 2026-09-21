import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageLayout } from "@/components/layout/PageLayout";
import { SubjectGridCard } from "@/components/SubjectGridCard";
import { SubjectGroup } from "@/components/SubjectGroup";
import { SubjectRow } from "@/components/SubjectRow";
import { ViewTabs, type ViewMode } from "@/components/ViewTabs";
import { SearchInput } from "@/components/SearchInput";
import { EnrichedSubjectRow } from "@/components/EnrichedSubjectRow";
import { SeasonPicker, SEASON_LABELS } from "@/components/SeasonPicker";
import { subjectQueryOptions, useCalendar, useSeasonSubjects } from "@/lib/queries";
import { usePersistentState } from "@/hooks/usePersistentState";
import { cn } from "@/lib/utils";
import type {
  CalendarDay,
  CalendarSubject,
  CollectionStat,
  SeasonSelection,
  SeasonSubjectItem,
  SlimSubject,
  Subject,
} from "@/types/bgm";

/** 数字星期 (1=Mon..7=Sun) → 中文 */
const WEEKDAY_CN = ["", "一", "二", "三", "四", "五", "六", "日"];

type DensityMode = "full" | "compact";

/* ---- 季度排序 ---- */

type SeasonSortKey = "heat" | "date" | "score" | "name";
const SEASON_SORT_LABELS: Record<SeasonSortKey, string> = {
  heat: "热门",
  date: "开播",
  score: "评分",
  name: "名称",
};
/** 各排序键的自然方向（reversed 在此基础上取反，语义同追番页 sortReversed） */
const SEASON_SORT_NATURAL_DIR: Record<SeasonSortKey, "asc" | "desc"> = {
  heat: "desc",
  date: "asc",
  score: "desc",
  name: "asc",
};

interface SeasonSort {
  key: SeasonSortKey;
  reversed: boolean;
}

const DEFAULT_SEASON_SORT: SeasonSort = { key: "heat", reversed: false };

/** 持久化值兜底校验（旧存值形状异常时回默认，避免渲染层取值崩溃） */
function isSeasonSort(v: unknown): v is SeasonSort {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as SeasonSort).key === "string" &&
    (v as SeasonSort).key in SEASON_SORT_LABELS &&
    typeof (v as SeasonSort).reversed === "boolean"
  );
}

/* ---- 工具函数 ---- */

/** JS getDay() (0=Sun) → Bangumi weekday.id (1=Mon..7=Sun) */
function getTodayBangumiWeekday(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** 收藏总数（wish/collect/doing/on_hold/dropped 求和；Partial 字段可能缺省） */
function collectionTotal(collection?: Partial<CollectionStat>): number {
  if (!collection) return 0;
  return Object.values(collection).reduce((a, b) => a + (b ?? 0), 0);
}

/** CalendarSubject → SlimSubject 字段映射，使 SubjectRow 可复用；
 *  简介等缺失字段由 EnrichedSubjectRow 进入视口后自动补全 */
function calendarToSlimSubject(cs: CalendarSubject): SlimSubject {
  return {
    id: cs.id,
    type: cs.type,
    name: cs.name,
    name_cn: cs.name_cn,
    short_summary: cs.summary,
    // 共性字段映射到 SlimSubject，使 MetaRow（评分/话数/放送日期）与追番、收藏页一致
    // date 后拼接星期，用    保持与 MetaRow gap-x-3 一致的间距
    date: cs.air_date
      ? `${cs.air_date}    周${WEEKDAY_CN[cs.air_weekday] || ""}`
      : "",
    images: {
      ...cs.images,
      small: cs.images?.common || cs.images?.grid || cs.images?.medium || cs.images?.small,
      medium: cs.images?.large || cs.images?.common || cs.images?.medium,
    },
    eps: cs.eps || cs.eps_count || undefined,
    score: cs.rating?.score ?? 0,
    rank: cs.rating?.rank,
    collection_total: cs.collection ? collectionTotal(cs.collection) : undefined,
    tags: [],
  };
}

/** 季度接口（/v0/subjects）返回完整 Subject，仅映射形状供行组件复用，无需再补全详情 */
function subjectToSlim(s: Subject): SlimSubject {
  return {
    id: s.id,
    type: s.type,
    name: s.name,
    name_cn: s.name_cn,
    short_summary: s.summary,
    date: s.date,
    images: s.images ?? {},
    eps: s.eps || s.total_episodes || undefined,
    score: s.rating?.score ?? 0,
    rank: s.rating?.rank,
    collection_total: s.collection ? collectionTotal(s.collection) : undefined,
    tags: s.tags ?? [],
    nsfw: s.nsfw,
  };
}

/* ---- 统一分组渲染模型 ---- */

/** 行条目：enrich=true（本季数据缺简介/标签/大图）进视口后补全详情；季度数据已完整直接渲染 */
interface RowItem {
  slim: SlimSubject;
  /** 在看人数（列表态附加信息 / 网格卡片 caption） */
  doing?: number;
  enrich: boolean;
}

/** 折叠分组：本季按星期 7 组（今日高亮）、季度按开播月 3 组，共用同一渲染组件 */
interface RenderGroup {
  id: string | number;
  title: ReactNode;
  items: RowItem[];
  isToday?: boolean;
}

/** 本季（/calendar）→ 按星期 7 组 */
function calendarToGroups(data: CalendarDay[]): RenderGroup[] {
  const todayId = getTodayBangumiWeekday();
  return data.map((day) => {
    const isToday = day.weekday.id === todayId;
    return {
      id: day.weekday.id,
      title: (
        <>
          <span className={cn(isToday && "text-primary")}>{day.weekday.cn}</span>
          {isToday && (
            <span className="ml-1.5 rounded bg-primary px-1 py-0.5 text-[10px] text-primary-foreground">
              今天
            </span>
          )}
        </>
      ),
      items: day.items.map((it) => ({
        slim: calendarToSlimSubject(it),
        doing: it.collection?.doing,
        enrich: true,
      })),
      isToday,
    };
  });
}

/** 季度（/v0/subjects，已排序）→ 按开播月 3 组。
 *  归属月取数据层标注的来源月份：远期季度大量条目未定档（date 为 null），解析 date 无法分组 */
function seasonToGroups(sorted: SeasonSubjectItem[], sel: SeasonSelection): RenderGroup[] {
  const months = [sel.season, sel.season + 1, sel.season + 2];
  const buckets: RowItem[][] = months.map(() => []);
  for (const item of sorted) {
    const idx = months.indexOf(item.month);
    buckets[idx >= 0 ? idx : 0].push({
      slim: subjectToSlim(item.subject),
      doing: item.subject.collection?.doing,
      enrich: false,
    });
  }
  return months.map((m, i) => ({ id: `${sel.year}-${m}`, title: `${m} 月`, items: buckets[i] }));
}

/** 季度内排序：各键含自然方向（热门/评分降序、开播/名称升序），reversed 取反；无值条目沉底 */
function compareSeasonSubject(
  a: Subject,
  b: Subject,
  key: SeasonSortKey,
  reversed: boolean,
): number {
  const r = reversed ? -1 : 1;
  switch (key) {
    case "heat":
      return (collectionTotal(b.collection) - collectionTotal(a.collection)) * r;
    case "date": {
      const av = a.date ?? "";
      const bv = b.date ?? "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv) * r;
    }
    case "score":
      return ((b.rating?.score ?? 0) - (a.rating?.score ?? 0)) * r;
    case "name":
      return (a.name_cn || a.name).localeCompare(b.name_cn || b.name, "zh") * r;
  }
}

/** 过滤分组：精简模式按收藏总数阈值 + 关键词按名称/中文名（大小写不敏感），两者取交集 */
function filterGroups(
  groups: RenderGroup[],
  density: DensityMode,
  threshold: number,
  keyword: string,
): RenderGroup[] {
  const q = keyword.trim().toLowerCase();
  if (density === "full" && !q) return groups; // 无过滤时恒等快路径
  return groups.map((g) => {
    let items = g.items;
    if (density === "compact") {
      items = items.filter((it) => (it.slim.collection_total ?? 0) >= threshold);
    }
    if (q) {
      items = items.filter((it) =>
        `${it.slim.name ?? ""} ${it.slim.name_cn ?? ""}`.toLowerCase().includes(q),
      );
    }
    return items === g.items ? g : { ...g, items }; // 未变动的组保持引用
  });
}

/* ---- 页面组件 ---- */

interface CalendarProps {
  /** 首次进入本页才启用日历查询（App 冷启动门控，keep-alive 首帧即渲染） */
  visited?: boolean;
}

export function Calendar({ visited = true }: CalendarProps) {
  /** null = 本季（每周放送 /calendar）；否则显示对应季度（/v0/subjects 按开播月）。
   *  不持久化：每次启动回本季，会话内 keep-alive 切页保留选择。 */
  const [season, setSeason] = useState<SeasonSelection | null>(null);
  const calendarQuery = useCalendar(visited);
  const seasonQuery = useSeasonSubjects(season, visited);
  const active = season ? seasonQuery : calendarQuery;

  const [viewMode, setViewMode] = usePersistentState<ViewMode>(
    "prefs.calendar.viewMode",
    "list",
  );
  // 旧版存值 "table" 归一化为网格
  const view: ViewMode = viewMode === "list" ? "list" : "grid";
  const [density, setDensity] = usePersistentState<DensityMode>(
    "prefs.calendar.density",
    "full",
  );
  const [threshold, setThreshold] = usePersistentState<number>(
    "prefs.calendar.threshold",
    100,
  );
  const [rawSeasonSort, setSeasonSort] = usePersistentState<SeasonSort>(
    "prefs.calendar.seasonSort",
    DEFAULT_SEASON_SORT,
  );
  const seasonSort = isSeasonSort(rawSeasonSort) ? rawSeasonSort : DEFAULT_SEASON_SORT;
  const [thresholdInput, setThresholdInput] = useState("100");
  const [keyword, setKeyword] = useState("");

  /* 季度数据写入条目详情缓存（列表与 GET /v0/subjects/{id} 同构）：
   * 行展开/hover 预取命中 ["subject", id] 30min 缓存，零请求秒开 */
  const qc = useQueryClient();
  const seasonData = seasonQuery.data;
  useEffect(() => {
    if (!seasonData) return;
    for (const { subject } of seasonData) {
      qc.setQueryData(subjectQueryOptions(subject.id).queryKey, subject);
    }
  }, [seasonData, qc]);

  /* 持久化阈值异步载入后同步输入框 */
  useEffect(() => {
    setThresholdInput(String(threshold));
  }, [threshold]);

  /* 统一分组：本季按星期 / 季度按开播月（先组内排序） */
  const groups = useMemo<RenderGroup[] | undefined>(() => {
    if (season) {
      if (!seasonQuery.data) return undefined;
      const sorted = [...seasonQuery.data].sort((a, b) =>
        compareSeasonSubject(a.subject, b.subject, seasonSort.key, seasonSort.reversed),
      );
      return seasonToGroups(sorted, season);
    }
    return calendarQuery.data ? calendarToGroups(calendarQuery.data) : undefined;
  }, [season, seasonQuery.data, calendarQuery.data, seasonSort]);

  /* 过滤后的数据 */
  const filteredGroups = useMemo(
    () => (groups ? filterGroups(groups, density, threshold, keyword) : undefined),
    [groups, density, threshold, keyword],
  );

  /* 过滤后是否还有条目（全为空则显示空态提示） */
  const filteredHasItems = useMemo(
    () => (filteredGroups ?? []).some((g) => g.items.length > 0),
    [filteredGroups],
  );

  /* 标题统计（基于过滤后数据）：本季显示月份+今日，季度显示年份季度 */
  const titleStats = useMemo(() => {
    if (!filteredGroups) return null;
    const allIds = new Set(filteredGroups.flatMap((g) => g.items.map((i) => i.slim.id)));

    if (season) {
      return {
        seasonLabel: `${season.year}年${SEASON_LABELS[season.season]}`,
        totalCount: allIds.size,
      };
    }

    let month: number | null = null;
    for (const g of filteredGroups) {
      for (const item of g.items) {
        const m = item.slim.date ? parseInt(item.slim.date.split("-")[1], 10) : NaN;
        if (!isNaN(m) && m >= 1 && m <= 12) {
          month = m;
          break;
        }
      }
      if (month !== null) break;
    }
    if (month === null) month = new Date().getMonth() + 1;

    const todayId = getTodayBangumiWeekday();
    const todayDay = filteredGroups.find((g) => g.id === todayId);

    return { month, totalCount: allIds.size, todayCount: todayDay?.items.length ?? 0 };
  }, [filteredGroups, season]);

  /* 排序方向图标（自然方向经 reversed 翻转后的实际方向） */
  const sortDir: "asc" | "desc" = seasonSort.reversed
    ? SEASON_SORT_NATURAL_DIR[seasonSort.key] === "desc"
      ? "asc"
      : "desc"
    : SEASON_SORT_NATURAL_DIR[seasonSort.key];

  /* 应用阈值（失焦或回车时） */
  function applyThreshold(value: string) {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 0) {
      setThreshold(n);
      setThresholdInput(String(n));
    } else {
      setThresholdInput(String(threshold));
    }
  }

  /** 点击 ±100：在当前阈值基础上增减（下限 0），并立即应用。 */
  function step(delta: number) {
    const next = Math.max(0, threshold + delta);
    setThreshold(next);
    setThresholdInput(String(next));
  }

  /* ---- 内容 ---- */

  return (
    <PageLayout
      title={
        titleStats ? (
          <>
            <span className="text-lg font-semibold">新番</span>
            {season && "seasonLabel" in titleStats ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {titleStats.seasonLabel} · 共 {titleStats.totalCount} 部
              </span>
            ) : (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {titleStats.month} 月共 {titleStats.totalCount} 部
                <span className="mx-1 text-border">|</span>
                今日共 {titleStats.todayCount} 部
              </span>
            )}
          </>
        ) : (
          "新番"
        )
      }
      subheader={
        <>
          <SeasonPicker value={season} onChange={setSeason} />

          {/* 季度排序：左半 toggle 升/降序，右半选排序键（仅季度模式，本季为每周放送固定序） */}
          {season && (
            <ButtonGroup className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="w-8 p-0"
                onClick={() =>
                  setSeasonSort((s) => ({ ...s, reversed: !s.reversed }))
                }
                title={sortDir === "desc" ? "降序（大→小）" : "升序（小→大）"}
              >
                {sortDir === "desc" ? (
                  <ArrowDownWideNarrow className="size-3.5" />
                ) : (
                  <ArrowUpNarrowWide className="size-3.5" />
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    {SEASON_SORT_LABELS[seasonSort.key]}
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(SEASON_SORT_LABELS) as SeasonSortKey[]).map((k) => (
                    <DropdownMenuItem
                      key={k}
                      onClick={() => setSeasonSort((s) => ({ ...s, key: k }))}
                    >
                      <Check
                        className={cn(
                          "size-3.5",
                          seasonSort.key === k ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {SEASON_SORT_LABELS[k]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          )}
        </>
      }
      toolbar={
        <>
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder="新番名称"
            className="w-44"
          />
          {/* 视图切换（与追番页共用样式，文案 列表/网格） */}
          <ViewTabs value={view} onChange={setViewMode} />

          {/* 完整 / 精简切换 */}
          <Tabs value={density} onValueChange={(v) => setDensity(v as DensityMode)}>
            <TabsList className="border border-border bg-background">
              <TabsTrigger value="full">完整</TabsTrigger>
              <TabsTrigger value="compact">精简</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* 精简模式下的阈值输入 */}
          {density === "compact" && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>在看人数 ≥</span>
              <ButtonGroup>
                <Input
                  type="number"
                  min={0}
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  onBlur={(e) => applyThreshold(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyThreshold(thresholdInput);
                  }}
                  disabled={active.isLoading}
                  aria-label="在看人数阈值"
                  className="h-8 w-16 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="加 100"
                  disabled={active.isLoading}
                  onClick={() => step(100)}
                >
                  <Plus className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="减 100"
                  disabled={active.isLoading}
                  onClick={() => step(-100)}
                >
                  <Minus className="size-3.5" />
                </Button>
              </ButtonGroup>
            </div>
          )}

          {/* 刷新按钮 */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => active.refetch()}
            disabled={active.isFetching || active.isLoading}
            title="刷新">
            <RefreshCw className={cn("size-4", (active.isFetching || active.isLoading) && "animate-spin")} />
          </Button>
        </>
      }>
      {active.isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" />
          加载数据中...
        </div>
      ) : active.error ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-destructive">
          <span>{active.error instanceof Error ? active.error.message : "加载失败"}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => active.refetch()}>
            <RefreshCw className="size-3" /> 重试
          </Button>
        </div>
      ) : !filteredGroups || filteredGroups.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          暂无放送数据
        </div>
      ) : (
        <>
          {filteredHasItems ? (
            <SubjectGroups groups={filteredGroups} viewMode={view} />
          ) : (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              {keyword.trim()
                ? "未找到匹配的条目"
                : season
                  ? "该季度暂无数据"
                  : "暂无放送数据"}
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}

/* ---- 列表视图子组件 ---- */

/** 列表态附加信息：在看人数（评分、话数、放送日期及周几已由 MetaRow 统一展示） */
function doingExtra(doing?: number): ReactNode {
  return doing ? <p className="text-xs text-muted-foreground">共 {doing} 人在看</p> : null;
}

/** 网格卡片说明文字：在看人数（与列表态一致） */
function doingCaption(doing?: number): string | undefined {
  return doing ? `共 ${doing} 人在看` : undefined;
}

interface SubjectGroupsProps {
  groups: RenderGroup[];
  viewMode: ViewMode;
}

/** 折叠分组渲染：本季按星期（今日高亮）、季度按开播月，列表行 / 网格卡片两种内容。
 *  openMap 只在首挂载建立（默认全开），切换季度出现的新分组 id 未登记时按展开处理。 */
function SubjectGroups({ groups, viewMode }: SubjectGroupsProps) {
  const [openMap, setOpenMap] = useState<Record<string | number, boolean>>(() => {
    const initial: Record<string | number, boolean> = {};
    for (const g of groups) initial[g.id] = true;
    return initial;
  });

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <SubjectGroup
          key={g.id}
          title={g.title}
          count={g.items.length}
          open={openMap[g.id] ?? true}
          onOpenChange={(o) =>
            setOpenMap((m) => ({ ...m, [g.id]: o }))
          }
          headerClassName={g.isToday ? "bg-primary/15 hover:bg-primary/20" : undefined}
        >
          {g.items.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">暂无</div>
          ) : viewMode === "grid" ? (
            <div className="p-2">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
                {g.items.map((item) => (
                  <SubjectGridCard
                    key={item.slim.id}
                    subject={item.slim}
                    caption={doingCaption(item.doing)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-1">
              {g.items.map((item) =>
                item.enrich ? (
                  <EnrichedSubjectRow
                    key={item.slim.id}
                    subject={item.slim}
                    extraInfo={doingExtra(item.doing)}
                  />
                ) : (
                  <SubjectRow
                    key={item.slim.id}
                    subject={item.slim}
                    extraInfo={doingExtra(item.doing)}
                  />
                ),
              )}
            </div>
          )}
        </SubjectGroup>
      ))}
    </div>
  );
}
