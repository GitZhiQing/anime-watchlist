import { useMemo, useState } from "react";
import { BookHeart, CalendarDays, Info, Loader2, Search, Settings } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { TitleBar } from "@/components/layout/TitleBar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Config } from "@/pages/Config";
import { WatchlistPage } from "@/pages/Watchlist";
import { Collection } from "@/pages/Collection";
import { About } from "@/pages/About";
import { Calendar } from "@/pages/Calendar";
import { useAuthUser } from "@/hooks/useAuthUser";
import { usePersistentState } from "@/hooks/usePersistentState";
import {
  COLLECTION_ORDER,
  SUBJECT_TYPES,
  SubjectType,
} from "@/types/bgm";
import type { UserCollection } from "@/types/bgm";
import { getAllUserCollections } from "@/lib/bgm";
import { cn } from "@/lib/utils";

export type PageKey = "watchlist" | "collection" | "config" | "about" | "calendar";

/** 追番列表排序方式 */
export type WatchSortKey = "default" | "score" | "name" | "updated";

export const WATCH_SORT_LABELS: Record<WatchSortKey, string> = {
  default: "默认",
  score: "评分",
  name: "名称",
  updated: "最近更新",
};

const NAV: {
  key: PageKey;
  label: string;
  title: string;
  icon: typeof BookHeart;
}[] = [
  { key: "watchlist", label: "追番", title: "追番", icon: BookHeart },
  { key: "calendar", label: "新番", title: "新番", icon: CalendarDays },
  { key: "collection", label: "找番", title: "找番", icon: Search },
  { key: "config", label: "配置", title: "配置", icon: Settings },
  { key: "about", label: "关于", title: "关于", icon: Info },
];

function groupByType(items: UserCollection[]): Record<number, UserCollection[]> {
  const groups: Record<number, UserCollection[]> = {};
  for (const it of items) {
    (groups[it.type] ??= []).push(it);
  }
  return groups;
}

export default function App() {
  const [page, setPage] = useState<PageKey>("watchlist");

  const { user, loading: userLoading } = useAuthUser();
  const username = user?.username;

  const queries = useQueries({
    queries: SUBJECT_TYPES.map((subjectType) => ({
      queryKey: ["collections", username, subjectType],
      queryFn: () => getAllUserCollections(username!, subjectType),
      staleTime: 60_000,
      enabled: !!username,
    })),
  });

  const loading = queries.some((q) => q.isFetching);
  const error = queries.find((q) => q.error)?.error;

  const bySubjectType = useMemo(() => {
    const map: Partial<Record<SubjectType, UserCollection[]>> = {};
    SUBJECT_TYPES.forEach((t, i) => {
      map[t] = (queries[i].data as UserCollection[] | undefined) ?? [];
    });
    return map;
  }, [queries]);

  const [subjectType, setSubjectType] = usePersistentState<
    SubjectType | undefined
  >("prefs.watchlist.subjectType", undefined);
  const [sortKey, setSortKey] = usePersistentState<WatchSortKey>(
    "prefs.watchlist.sortKey",
    "default",
  );

  /**
   * 首次加载门控：相关查询从未 resolve 时（status 'pending'）为 true，用于显示 spinner。
   * 与 loading（isFetching）区分开——后台/手动刷新时不至于把已有列表清空。
   * 选中单类型时只等待该类型；「全部」时等全部类型就绪。
   */
  const initialLoading = subjectType
    ? queries[SUBJECT_TYPES.indexOf(subjectType)]?.isPending ?? true
    : queries.some((q) => q.isPending);

  const groups = useMemo(() => {
    const items = subjectType
      ? bySubjectType[subjectType] ?? []
      : SUBJECT_TYPES.flatMap((t) => bySubjectType[t] ?? []);
    const grouped = groupByType(items);
    if (sortKey !== "default") {
      for (const t of Object.keys(grouped)) {
        grouped[Number(t)].sort((a, b) => {
          switch (sortKey) {
            case "score":
              return (b.subject.score ?? 0) - (a.subject.score ?? 0);
            case "name":
              return (a.subject.name_cn || a.subject.name).localeCompare(
                b.subject.name_cn || b.subject.name,
                "zh-Hans-CN",
              );
            case "updated":
              return (
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
              );
          }
        });
      }
    }
    return grouped;
  }, [bySubjectType, subjectType, sortKey]);

  const subjectCounts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const t of SUBJECT_TYPES) c[t] = bySubjectType[t]?.length ?? 0;
    return c;
  }, [bySubjectType]);

  const totalCount = useMemo(
    () => Object.values(groups).reduce((a, g) => a + g.length, 0),
    [groups],
  );

  const counts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const t of COLLECTION_ORDER) c[t] = groups[t]?.length ?? 0;
    return c;
  }, [groups]);

  const [openMap, setOpenMap] = usePersistentState<Record<number, boolean>>(
    "prefs.watchlist.openMap",
    Object.fromEntries(COLLECTION_ORDER.map((t) => [t, true])),
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {/* 侧边栏 */}
        <nav className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-border bg-background py-3">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setPage(key)}
              title={label}
              className={cn(
                "flex w-12 flex-col items-center gap-1 rounded-md py-2 text-xs transition-colors",
                page === key
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </button>
          ))}
          <div className="mt-auto w-12">
            <ThemeToggle />
          </div>
        </nav>

        {/* 内容区：各页面自行管理标题栏 + 可滚动内容 */}
        <main className="flex min-w-0 flex-1 flex-col">
          {page === "config" ? (
            <Config />
          ) : page === "about" ? (
            <About />
          ) : page === "collection" ? (
            <Collection />
          ) : page === "calendar" ? (
            <Calendar />
          ) : userLoading ? (
            <PageLayout title="追番">
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-5 animate-spin" />
                加载数据中...
              </div>
            </PageLayout>
          ) : !user ? (
            <PageLayout title="追番">
              <p className="text-sm text-muted-foreground">
                请先到「配置」页完成 Bangumi 认证。
              </p>
            </PageLayout>
          ) : (
            <WatchlistPage
              loading={loading}
              initialLoading={initialLoading}
              error={error ?? null}
              totalCount={totalCount}
              groups={groups}
              openMap={openMap}
              setOpenMap={setOpenMap}
              counts={counts}
              subjectCounts={subjectCounts}
              subjectType={subjectType}
              onSubjectTypeChange={setSubjectType}
              sortKey={sortKey}
              onSortChange={setSortKey}
            />
          )}
        </main>
      </div>
    </div>
  );
}
