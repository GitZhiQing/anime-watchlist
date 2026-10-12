// 统计页：全部数据来自本地收藏缓存（computeStats 纯函数聚合，零请求）。
// 纯 CSS 横向条形（宽度百分比），零图表库依赖。
import { useMemo } from "react";
import { BarChart3, Search, Settings } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { computeStats, type StatsBar } from "@/lib/stats";
import { useAuthUser } from "@/hooks/useAuthUser";
import { cn } from "@/lib/utils";
import type { SubjectType, UserCollection } from "@/types/bgm";
import type { PageKey } from "@/App";

/** 横向条形列表：label | 比例条 | 数值 */
function BarList({ data }: { data: StatsBar[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-xs">
          <span
            className="w-16 shrink-0 truncate text-muted-foreground"
            title={d.label}
          >
            {d.label}
          </span>
          <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-all",
                d.colorClass,
              )}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="text-sm font-medium">{title}</div>
      {children}
      {footer && (
        <div className="text-xs text-muted-foreground">{footer}</div>
      )}
    </section>
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
            <Button variant="outline" size="sm" onClick={() => onNavigate("collection")}>
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
      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
        <StatCard title="收藏夹分布">
          <BarList data={stats.shelfBars} />
        </StatCard>

        <StatCard
          title="类型占比"
          footer={`共 ${stats.total} 条，动画 ${
            stats.typeBars.find((b) => b.label === "动画")?.value ?? 0
          } 条`}
        >
          <BarList data={stats.typeBars} />
        </StatCard>

        <StatCard
          title="我的评分分布"
          footer={
            stats.myAvg !== null
              ? `平均 ${stats.myAvg.toFixed(1)} 分 · 已评 ${stats.ratedCount} / ${stats.total}`
              : "还没有评过分的收藏"
          }
        >
          <BarList data={stats.rateBars} />
        </StatCard>

        <StatCard
          title="我 vs 大众"
          footer={
            rateDiff !== null
              ? rateDiff > 0
                ? `你的均分比大众高 ${rateDiff.toFixed(1)}，口味更偏爱`
                : rateDiff < 0
                  ? `你的均分比大众低 ${Math.abs(rateDiff).toFixed(1)}，打分更严格`
                  : "与大众均分一致"
              : "评分后可对比"
          }
        >
          <div className="flex items-center justify-around py-2">
            <div className="space-y-1 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {stats.myAvg !== null ? stats.myAvg.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">我的均分</p>
            </div>
            <div className="text-xl text-muted-foreground/40">/</div>
            <div className="space-y-1 text-center">
              <p className="text-2xl font-semibold tabular-nums">
                {stats.communityAvg !== null
                  ? stats.communityAvg.toFixed(1)
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">大众均分</p>
            </div>
          </div>
        </StatCard>

        <StatCard
          title="开播年份分布"
          footer="按条目开播日期统计（未定档条目不计）"
        >
          {stats.yearBars.length > 0 ? (
            <BarList data={stats.yearBars} />
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              暂无数据
            </p>
          )}
        </StatCard>
      </div>
    </PageLayout>
  );
}
