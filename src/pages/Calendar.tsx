import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Minus, Plus, RefreshCw, Star } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLayout } from "@/components/layout/PageLayout";
import { SubjectRow } from "@/components/SubjectRow";
import { BangumiLink } from "@/components/BangumiLink";
import { CollectAction } from "@/components/CollectAction";
import { CalendarTable } from "@/components/CalendarTable";
import { useCalendar } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { CalendarDay, CalendarSubject, SlimSubject } from "@/types/bgm";

/** 数字星期 (1=Mon..7=Sun) → 中文 */
const WEEKDAY_CN = ["", "一", "二", "三", "四", "五", "六", "日"];

type ViewMode = "table" | "list";
type DensityMode = "full" | "compact";

/* ---- 工具函数 ---- */

/** JS getDay() (0=Sun) → Bangumi weekday.id (1=Mon..7=Sun) */
function getTodayBangumiWeekday(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** CalendarSubject → SlimSubject 字段映射，使 SubjectRow 可复用 */
function calendarToSlimSubject(cs: CalendarSubject): SlimSubject {
  return {
    id: cs.id,
    type: cs.type,
    name: cs.name,
    name_cn: cs.name_cn,
    short_summary: cs.summary,
    // MetaRow 由 extraInfo 替代，设 0 使其隐藏
    date: "",
    images: {
      ...cs.images,
      small: cs.images?.common || cs.images?.grid || cs.images?.medium || cs.images?.small,
      medium: cs.images?.large || cs.images?.common || cs.images?.medium,
    },
    eps: 0,
    score: 0,
    rank: cs.rating?.rank,
    collection_total: cs.collection
      ? Object.values(cs.collection).reduce((a, b) => a + b, 0)
      : undefined,
    tags: [],
  };
}

/** 过滤放送数据：精简模式下按收藏数阈值过滤 */
function filterCalendarData(
  data: CalendarDay[],
  density: DensityMode,
  threshold: number,
): CalendarDay[] {
  if (density === "full") return data;
  return data.map((day) => ({
    ...day,
    items: day.items.filter((item) => {
      const total = item.collection ? Object.values(item.collection).reduce((a, b) => a + b, 0) : 0;
      return total >= threshold;
    }),
  }));
}

/* ---- 页面组件 ---- */

export function Calendar() {
  const { data, isLoading, error, refetch, isFetching } = useCalendar();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [density, setDensity] = useState<DensityMode>("full");
  const [threshold, setThreshold] = useState(100);
  const [thresholdInput, setThresholdInput] = useState("100");

  /* 过滤后的数据 */
  const filteredData = useMemo(
    () => (data ? filterCalendarData(data, density, threshold) : undefined),
    [data, density, threshold],
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
          {/* 视图切换 */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="border border-border bg-background">
              <TabsTrigger value="table">表格</TabsTrigger>
              <TabsTrigger value="list">列表</TabsTrigger>
            </TabsList>
          </Tabs>

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
      ) : viewMode === "table" ? (
        <CalendarTable data={filteredData} />
      ) : (
        <CalendarList data={filteredData} />
      )}
    </PageLayout>
  );
}

/* ---- 列表视图子组件 ---- */

/** 列表态额外信息：原名 / 放送日期 周x · 评分 · 共 xxx 人在看 */
function CalendarExtraInfo({ item }: { item: CalendarSubject }) {
  const hasName = item.name && item.name !== item.name_cn;
  const weekday = item.air_weekday ? `周${WEEKDAY_CN[item.air_weekday] || ""}` : "";
  const hasScore = item.rating?.score != null && item.rating.score > 0;
  const doing = item.collection?.doing ? `共 ${item.collection.doing} 人在看` : "";

  if (!hasName && !item.air_date && !weekday && !hasScore && !doing) return null;

  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      {hasName && <p>原名：{item.name}</p>}
      {(hasScore || doing || item.air_date || weekday) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {hasScore && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3 fill-current text-amber-500" />
              {item.rating!.score!.toFixed(1)}
            </span>
          )}
          {doing && <span>{doing}</span>}
          {item.air_date && <span>{item.air_date}</span>}
          {weekday && <span>{weekday}</span>}
        </p>
      )}
    </div>
  );
}

interface CalendarListProps {
  data: CalendarDay[];
}

/** 每日放送列表视图：按周一至周日折叠分组 */
function CalendarList({ data }: CalendarListProps) {
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
        const open = openMap[day.weekday.id];
        return (
          <Collapsible
            key={day.weekday.id}
            open={open}
            onOpenChange={(o) => setOpenMap((m) => ({ ...m, [day.weekday.id]: o }))}
            className="rounded-lg border border-border">
            <CollapsibleTrigger
              className={cn(
                "flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50",
                isToday && "bg-primary/5",
              )}>
              <span>
                <span className={cn(isToday && "text-primary")}>{day.weekday.cn}</span>
                {isToday && (
                  <span className="ml-1.5 rounded bg-primary px-1 py-0.5 text-[10px] text-primary-foreground">
                    今天
                  </span>
                )}
                <span className="ml-2 text-muted-foreground">({day.items.length})</span>
              </span>
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {day.items.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted-foreground">暂无</div>
              ) : (
                <div className="border-t border-border p-1">
                  {day.items.map((item) => (
                    <SubjectRow
                      key={item.id}
                      subject={calendarToSlimSubject(item)}
                      extraInfo={<CalendarExtraInfo item={item} />}
                      expandedAction={
                        <div className="flex items-center gap-2">
                          <CollectAction subjectId={item.id} />
                          <BangumiLink subjectId={item.id} />
                        </div>
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
  );
}
