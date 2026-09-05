import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLayout } from "@/components/layout/PageLayout";
import { SubjectGridCard } from "@/components/SubjectGridCard";
import { SubjectGroup } from "@/components/SubjectGroup";
import { ViewTabs, type ViewMode } from "@/components/ViewTabs";
import { SearchInput } from "@/components/SearchInput";
import { useCalendar } from "@/lib/queries";
import { usePersistentState } from "@/hooks/usePersistentState";
import { cn } from "@/lib/utils";
import type { CalendarDay, CalendarSubject, SlimSubject } from "@/types/bgm";
import { EnrichedSubjectRow } from "@/components/EnrichedSubjectRow";

/** 数字星期 (1=Mon..7=Sun) → 中文 */
const WEEKDAY_CN = ["", "一", "二", "三", "四", "五", "六", "日"];

type DensityMode = "full" | "compact";

/* ---- 工具函数 ---- */

/** JS getDay() (0=Sun) → Bangumi weekday.id (1=Mon..7=Sun) */
function getTodayBangumiWeekday(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
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
    collection_total: cs.collection
      ? Object.values(cs.collection).reduce((a, b) => a + b, 0)
      : undefined,
    tags: [],
  };
}

/** 过滤放送数据：精简模式按收藏数阈值 + 关键词按名称/中文名（大小写不敏感），两者取交集 */
function filterCalendarData(
  data: CalendarDay[],
  density: DensityMode,
  threshold: number,
  keyword: string,
): CalendarDay[] {
  const q = keyword.trim().toLowerCase();
  if (density === "full" && !q) return data; // 无过滤时恒等快路径
  return data.map((day) => {
    let items = day.items;
    if (density === "compact") {
      items = items.filter((it) => {
        const total = it.collection ? Object.values(it.collection).reduce((a, b) => a + b, 0) : 0;
        return total >= threshold;
      });
    }
    if (q) {
      items = items.filter((it) => `${it.name ?? ""} ${it.name_cn ?? ""}`.toLowerCase().includes(q));
    }
    return items === day.items ? day : { ...day, items }; // 未变动的一天保持引用
  });
}

/* ---- 页面组件 ---- */

interface CalendarProps {
  /** 首次进入本页才启用日历查询（App 冷启动门控，keep-alive 首帧即渲染） */
  visited?: boolean;
}

export function Calendar({ visited = true }: CalendarProps) {
  const { data, isLoading, error, refetch, isFetching } = useCalendar(visited);
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
  const [thresholdInput, setThresholdInput] = useState("100");
  const [keyword, setKeyword] = useState("");

  /* 持久化阈值异步载入后同步输入框 */
  useEffect(() => {
    setThresholdInput(String(threshold));
  }, [threshold]);

  /* 过滤后的数据 */
  const filteredData = useMemo(
    () => (data ? filterCalendarData(data, density, threshold, keyword) : undefined),
    [data, density, threshold, keyword],
  );

  /* 过滤后是否还有条目（全为空则显示空态提示） */
  const filteredHasItems = useMemo(
    () => (filteredData ?? []).some((d) => d.items.length > 0),
    [filteredData],
  );

  /* 标题统计（基于过滤后数据） */
  const titleStats = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;

    let month: number | null = null;
    for (const day of filteredData) {
      for (const item of day.items) {
        const m = item.air_date ? parseInt(item.air_date.split("-")[1], 10) : NaN;
        if (!isNaN(m) && m >= 1 && m <= 12) {
          month = m;
          break;
        }
      }
      if (month !== null) break;
    }
    if (month === null) month = new Date().getMonth() + 1;

    const allIds = new Set(filteredData.flatMap((d) => d.items.map((i) => i.id)));
    const totalCount = allIds.size;

    const todayId = getTodayBangumiWeekday();
    const todayDay = filteredData.find((d) => d.weekday.id === todayId);
    const todayCount = todayDay?.items.length ?? 0;

    return { month, totalCount, todayCount };
  }, [filteredData]);

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
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {titleStats.month} 月共 {titleStats.totalCount} 部
              <span className="mx-1 text-border">|</span>
              今日共 {titleStats.todayCount} 部
            </span>
          </>
        ) : (
          "新番"
        )
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
                  disabled={isLoading}
                  aria-label="在看人数阈值"
                  className="h-8 w-16 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="加 100"
                  disabled={isLoading}
                  onClick={() => step(100)}
                >
                  <Plus className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  title="减 100"
                  disabled={isLoading}
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
            onClick={() => refetch()}
            disabled={isFetching || isLoading}
            title="刷新">
            <RefreshCw className={cn("size-4", (isFetching || isLoading) && "animate-spin")} />
          </Button>
        </>
      }>
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" />
          加载数据中...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-destructive">
          <span>{error instanceof Error ? error.message : "加载失败"}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => refetch()}>
            <RefreshCw className="size-3" /> 重试
          </Button>
        </div>
      ) : !filteredData || filteredData.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          暂无放送数据
        </div>
      ) : (
        <>
          {filteredHasItems ? (
            <CalendarGroups data={filteredData} viewMode={view} />
          ) : (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              {keyword.trim() ? "未找到匹配的条目" : "暂无放送数据"}
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}

/* ---- 列表视图子组件 ---- */

/** 列表态新番特有信息：在看人数（评分、话数、放送日期及周几已由 MetaRow 统一展示） */
function CalendarExtraInfo({ item }: { item: CalendarSubject }) {
  const doing = item.collection?.doing ? `共 ${item.collection.doing} 人在看` : "";

  if (!doing) return null;

  return <p className="text-xs text-muted-foreground">{doing}</p>;
}

/** 网格卡片说明文字：在看人数（与列表态一致） */
function doingCaption(item: CalendarSubject): string | undefined {
  return item.collection?.doing
    ? `共 ${item.collection.doing} 人在看`
    : undefined;
}

interface CalendarGroupsProps {
  data: CalendarDay[];
  viewMode: ViewMode;
}

/** 每日放送视图：周一至周日折叠分组（分组样式与追番页一致），列表行 / 网格卡片两种内容 */
function CalendarGroups({ data, viewMode }: CalendarGroupsProps) {
  const todayId = getTodayBangumiWeekday();
  const [openMap, setOpenMap] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    for (const day of data) initial[day.weekday.id] = true;
    return initial;
  });

  return (
    <div className="space-y-2">
      {data.map((day) => {
        const isToday = day.weekday.id === todayId;
        return (
          <SubjectGroup
            key={day.weekday.id}
            title={
              <>
                <span className={cn(isToday && "text-primary")}>
                  {day.weekday.cn}
                </span>
                {isToday && (
                  <span className="ml-1.5 rounded bg-primary px-1 py-0.5 text-[10px] text-primary-foreground">
                    今天
                  </span>
                )}
              </>
            }
            count={day.items.length}
            open={openMap[day.weekday.id]}
            onOpenChange={(o) =>
              setOpenMap((m) => ({ ...m, [day.weekday.id]: o }))
            }
            headerClassName={isToday ? "bg-primary/5" : undefined}
          >
            {day.items.length === 0 ? (
              <div className="px-4 py-3 text-xs text-muted-foreground">暂无</div>
            ) : viewMode === "grid" ? (
              <div className="border-t border-border p-2">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
                  {day.items.map((item) => (
                    <SubjectGridCard
                      key={item.id}
                      subject={calendarToSlimSubject(item)}
                      caption={doingCaption(item)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-t border-border p-1">
                {day.items.map((item) => (
                  <EnrichedSubjectRow
                    key={item.id}
                    subject={calendarToSlimSubject(item)}
                    extraInfo={<CalendarExtraInfo item={item} />}
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
