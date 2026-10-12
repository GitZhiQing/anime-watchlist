import { useEffect, useMemo, useRef, useState } from "react";
import { BookHeart, CalendarDays, Info, Loader2, Search, Settings } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { collectionsQueryOptions } from "@/lib/queries";
import {
  COLLECTION_ORDER,
  SUBJECT_TYPES,
  SubjectType,
} from "@/types/bgm";
import type { UserCollection } from "@/types/bgm";
import { cn } from "@/lib/utils";

export type PageKey = "watchlist" | "collection" | "config" | "about" | "calendar";

/** 追番列表排序方式 */
export type WatchSortKey = "default" | "collect" | "score" | "name" | "updated";

/** 排序方向（绝对方向） */
export type WatchSortDir = "asc" | "desc";

export const WATCH_SORT_LABELS: Record<WatchSortKey, string> = {
  default: "默认",
  collect: "收藏",
  score: "评分",
  name: "名称",
  updated: "更新",
};

/** 各排序键的自然方向：收藏/评分/更新默认从大到小，名称/默认从小到大 */
const WATCH_SORT_NATURAL_DIR: Record<WatchSortKey, WatchSortDir> = {
  default: "asc",
  collect: "desc",
  score: "desc",
  name: "asc",
  updated: "desc",
};

/** 升序比较器；「默认」返回 0 表示保持接口原序（倒序时整体 reverse） */
function compareCollectionAsc(
  a: UserCollection,
  b: UserCollection,
  key: WatchSortKey,
): number {
  switch (key) {
    case "collect":
      return (a.subject.collection_total ?? 0) - (b.subject.collection_total ?? 0);
    case "score":
      return (a.subject.score ?? 0) - (b.subject.score ?? 0);
    case "name":
      return (a.subject.name_cn || a.subject.name).localeCompare(
        b.subject.name_cn || b.subject.name,
        "zh-Hans-CN",
      );
    case "updated":
      return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    default:
      return 0;
  }
}

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

  /** 用户是否手动切换过页面。未登录自动落地新番页只应发生在「从未手动切页」时：
   *  覆盖冷启动无凭据与登录态中途丢失（注销/会话失效）两种情形 */
  const userInteracted = useRef(false);
  function navigate(key: PageKey) {
    userInteracted.current = true;
    setPage(key);
  }

  /* 未登录引导：认证判定完成仍无 user 且用户从未手动切页 → 落地新番页（游客可浏览，
   * 空追番页对游客零价值）。用户切过页则不再打扰 */
  useEffect(() => {
    if (userLoading) return;
    if (!user && !userInteracted.current) setPage("calendar");
  }, [userLoading, user]);

  /** 收藏列表按需拉取：首次进入追番页才启用（此后保持），冷启动停在其他页不产生请求风暴 */
  const [watchlistVisited, setWatchlistVisited] = useState(false);
  /** 新番/找番同理：日历与热度榜首次进入对应页才拉取（keep-alive 首帧即渲染，需显式门控） */
  const [calendarVisited, setCalendarVisited] = useState(false);
  const [collectionVisited, setCollectionVisited] = useState(false);
  useEffect(() => {
    if (page === "watchlist") setWatchlistVisited(true);
    if (page === "calendar") setCalendarVisited(true);
    if (page === "collection") setCollectionVisited(true);
  }, [page]);

  const queries = useQueries({
    queries: SUBJECT_TYPES.map((subjectType) => ({
      ...collectionsQueryOptions(username!, subjectType),
      enabled: !!username && watchlistVisited,
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
  /** 排序方向以「自然方向」为基准取反持久化，老用户已有排序行为不受影响 */
  const [sortReversed, setSortReversed] = usePersistentState<boolean>(
    "prefs.watchlist.sortReversed",
    false,
  );
  const toggleSortReversed = () => setSortReversed((r) => !r);
  const naturalDir = WATCH_SORT_NATURAL_DIR[sortKey];
  const sortDir: WatchSortDir = sortReversed
    ? naturalDir === "asc"
      ? "desc"
      : "asc"
    : naturalDir;

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
    for (const t of Object.keys(grouped)) {
      const arr = grouped[Number(t)];
      if (sortKey === "default") {
        // 默认 = 接口原序；倒序时整体反转
        if (sortDir === "desc") arr.reverse();
        continue;
      }
      arr.sort((a, b) => {
        const cmp = compareCollectionAsc(a, b, sortKey);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return grouped;
  }, [bySubjectType, subjectType, sortKey, sortDir]);

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

  /** "/" 聚焦当前可见页面的搜索框（输入框内不拦截；隐藏页面的输入框不可聚焦） */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      ) {
        return;
      }
      const input = document.querySelector<HTMLInputElement>(
        "input[data-search-input]",
      );
      if (input && input.offsetParent !== null) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** 保活面板：追番/新番/找番首次渲染后常驻（display:none 隐藏），
   *  切页保留搜索词、结果与滚动位置 */
  const keepAlivePages: PageKey[] = ["watchlist", "calendar", "collection"];

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {/* 侧边栏 */}
        <nav className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-border bg-background py-3">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => navigate(key)}
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
          {keepAlivePages.map((key) => {
            const active = page === key;
            return (
              <div
                key={key}
                className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}
              >
                {key === "watchlist" ? (
                  userLoading ? (
                    <PageLayout title="追番">
                      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 size-5 animate-spin" />
                        加载数据中...
                      </div>
                    </PageLayout>
                  ) : !user ? (
                    <PageLayout title="追番">
                      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                        <BookHeart className="size-10 text-muted-foreground/60" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            登录后同步你的 Bangumi 收藏
                          </p>
                          <p className="text-xs text-muted-foreground">
                            在看 / 想看 / 看过的收藏夹、评分与进度，登录后自动同步
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => navigate("config")}>
                            <Settings className="size-4" /> 去认证
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("calendar")}
                          >
                            先逛逛新番
                          </Button>
                        </div>
                      </div>
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
                      sortDir={sortDir}
                      onToggleSortDir={toggleSortReversed}
                      onNavigate={navigate}
                    />
                  )
                ) : key === "calendar" ? (
                  <Calendar visited={calendarVisited || page === "calendar"} />
                ) : (
                  <Collection
                    visited={collectionVisited || page === "collection"}
                    onNavigate={navigate}
                  />
                )}
              </div>
            );
          })}
          {page === "config" && <Config />}
          {page === "about" && <About />}
        </main>
      </div>
    </div>
  );
}
