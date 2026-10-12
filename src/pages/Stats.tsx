// 统计页：全部数据来自本地收藏缓存（computeStats 纯函数聚合，零请求）。
// 紧凑分区布局（KPI 数字行 + 迷你条 + 纵向直方图），零图表库依赖。
import { useMemo } from "react";
import { BarChart3, Search, Settings } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { computeStats, type StatsBar } from "@/lib/stats";
import { useAuthUser } from "@/hooks/useAuthUser";
import { cn } from "@/lib/utils";
import type { SubjectType, UserCollection } from "@/types/bgm";
import type { PageKey } from "@/App";

/** 迷你条形行：标签 | 计数 | 固定宽度短条（不铺满，避免量柱过长），行高 20px */
function MiniBarRow({
  label,
  value,
  max,
  colorClass,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  colorClass?: string;
  /** 条后的附加小字（如类型占比的百分比） */
  suffix?: string;
}) {
  return (
    <div className="flex h-5 items-center gap-2 text-xs">
      <span className="w-12 shrink-0 truncate text-muted-foreground" title={label}>
        {label}
      </span>
      <span className="w-8 shrink-0 text-right tabular-nums">{value}</span>
      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn("h-full rounded-full bg-primary/80", colorClass)}
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </div>
      {suffix && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {suffix}
        </span>
      )}
    </div>
  );
}

/** KPI 数字块：大数字 + 标签 + 可选副行 */
function Kpi({
  value,
  label,
  sub,
  subClass,
}: {
  value: string;
  label: string;
  sub?: string;
  subClass?: string;
}) {
  return (
    <div className="min-w-0 space-y-0.5 px-3 first:pl-0">
      <p className="truncate text-2xl leading-none font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && (
        <p className={cn("text-[10px] text-muted-foreground", subClass)}>
          {sub}
        </p>
      )}
    </div>
  );
}

/** 评分纵向直方图：10 列高度 ∝ 数量，柱顶标计数、柱底标分数。
 *  视觉图表对读屏不可达——外层 role="img" 提供一次可读的概要。 */
function RatingHistogram({ data }: { data: StatsBar[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const rated = data.reduce((s, d) => s + d.value, 0);
  return (
    <div role="img" aria-label={`我的评分分布直方图，共 ${rated} 条已评，横轴 1 到 10 分`}>
      <div className="flex h-24 items-end gap-1.5">
        {data.map((d) => (
          <div
            key={d.label}
            className="flex h-full flex-1 flex-col justify-end gap-0.5"
            title={`${d.label}：${d.value} 部`}
          >
            {d.value > 0 && (
              <span className="text-center text-[10px] leading-none text-muted-foreground tabular-nums">
                {d.value}
              </span>
            )}
            <div
              className="rounded-t-sm bg-amber-500/75"
              style={{
                height: `${d.value > 0 ? Math.max(8, (d.value / max) * 100) : 2}%`,
                minHeight: 2,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 text-center text-[10px] leading-none text-muted-foreground tabular-nums"
          >
            {d.label.replace(" 分", "")}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-medium">{children}</h2>
      {aside && (
        <span className="text-xs text-muted-foreground">{aside}</span>
      )}
    </div>
  );
}

interface StatsPageProps {
  bySubjectType: Partial<Record<SubjectType, UserCollection[]>>;
  onNavigate: (page: PageKey) => void;
}

export function StatsPage({ bySubjectType, onNavigate }: StatsPageProps) {
  const { user } = useAuthUser();
  const stats = useMemo(() => computeStats(bySubjectType), [bySubjectType]);

  if (stats.total === 0) {
    return (
      <PageLayout title="统计">
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <BarChart3 className="size-10 text-muted-foreground/60" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {user ? "还没有可统计的收藏" : "登录后查看你的追番统计"}
            </p>
            <p className="text-xs text-muted-foreground">
              {user
                ? "收藏一些条目后，这里会展示收藏分布与评分趋势"
                : "统计基于你的 Bangumi 收藏，登录并加载后自动生成"}
            </p>
          </div>
          {user ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate("collection")}
            >
              <Search className="size-4" /> 去找番
            </Button>
          ) : (
            <Button size="sm" onClick={() => onNavigate("config")}>
              <Settings className="size-4" /> 去认证
            </Button>
          )}
        </div>
      </PageLayout>
    );
  }

  const rateDiff =
    stats.myAvg !== null && stats.communityAvg !== null
      ? stats.myAvg - stats.communityAvg
      : null;
  const shelfMax = Math.max(1, ...stats.shelfBars.map((b) => b.value));
  const typeMax = Math.max(1, ...stats.typeBars.map((b) => b.value));
  const yearMax = Math.max(1, ...stats.yearBars.map((b) => b.value));

  return (
    <PageLayout
      title={
        <>
          统计
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            共 {stats.total} 条收藏
          </span>
        </>
      }
    >
      <div className="mx-auto max-w-3xl divide-y divide-border">
        {/* KPI 行：总览数字，替代原「我 vs 大众」卡片 */}
        <div className="grid grid-cols-2 gap-y-4 pb-5 sm:grid-cols-4 sm:divide-x sm:divide-border">
          <Kpi value={String(stats.total)} label="总收藏" />
          <Kpi value={String(stats.doingCount)} label="在看" />
          <Kpi
            value={stats.myAvg !== null ? stats.myAvg.toFixed(1) : "—"}
            label="我的均分"
            sub={
              stats.communityAvg !== null
                ? `大众 ${stats.communityAvg.toFixed(1)}`
                : undefined
            }
          />
          <Kpi
            value={rateDiff !== null ? `${rateDiff > 0 ? "+" : ""}${rateDiff.toFixed(1)}` : "—"}
            label="比大众"
            sub={
              rateDiff === null
                ? "评分后可对比"
                : rateDiff > 0
                  ? "口味更偏爱"
                  : rateDiff < 0
                    ? "打分更严格"
                    : "与大众一致"
            }
            subClass={
              rateDiff === null || rateDiff === 0
                ? undefined
                : rateDiff > 0
                  ? "text-orange-500 dark:text-orange-400"
                  : "text-sky-500 dark:text-sky-400"
            }
          />
        </div>

        {/* 构成：收藏夹 + 类型双列迷你条 */}
        <section className="space-y-2 py-5">
          <SectionTitle aside={`已评 ${stats.ratedCount} / ${stats.total}`}>
            构成
          </SectionTitle>
          <div className="grid gap-x-10 gap-y-1 sm:grid-cols-2">
            <div className="space-y-0.5">
              {stats.shelfBars.map((b) => (
                <MiniBarRow key={b.label} {...b} max={shelfMax} />
              ))}
            </div>
            <div className="space-y-0.5">
              {stats.typeBars.map((b) => (
                <MiniBarRow
                  key={b.label}
                  {...b}
                  max={typeMax}
                  suffix={`${Math.round((b.value / stats.total) * 100)}%`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* 评分分布：纵向直方图 */}
        <section className="space-y-2 py-5">
          <SectionTitle
            aside={
              stats.myAvg !== null
                ? `平均 ${stats.myAvg.toFixed(1)} 分`
                : "还没有评过分的收藏"
            }
          >
            我的评分分布
          </SectionTitle>
          <RatingHistogram data={stats.rateBars} />
        </section>

        {/* 开播年份分布：年份多时双列 */}
        <section className="space-y-2 py-5">
          <SectionTitle aside="按条目开播日期（未定档不计）">
            开播年份分布
          </SectionTitle>
          {stats.yearBars.length > 0 ? (
            <div
              className={cn(
                "grid gap-x-10 gap-y-0.5",
                stats.yearBars.length > 8 && "sm:grid-cols-2",
              )}
            >
              {stats.yearBars.map((b) => (
                <MiniBarRow key={b.label} {...b} max={yearMax} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">暂无数据</p>
          )}
        </section>
      </div>
    </PageLayout>
  );
}
