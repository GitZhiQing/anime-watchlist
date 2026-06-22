import { useMemo, useRef, useState } from "react";
import { BookHeart, Info, Loader2, Search, Settings } from "lucide-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { TitleBar } from "@/components/layout/TitleBar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { WatchlistToolbar } from "@/components/WatchlistToolbar";
import { Config } from "@/pages/Config";
import { Watchlist } from "@/pages/Watchlist";
import { Collection } from "@/pages/Collection";
import { About } from "@/pages/About";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  COLLECTION_ORDER,
  CollectionType,
  SUBJECT_TYPES,
  SubjectType,
} from "@/types/bgm";
import type { UserCollection } from "@/types/bgm";
import { getAllUserCollections } from "@/lib/bgm";
import { cn, smoothScrollTo } from "@/lib/utils";

export type PageKey = "watchlist" | "collection" | "config" | "about";

const NAV: {
  key: PageKey;
  label: string;
  title: string;
  icon: typeof BookHeart;
}[] = [
  { key: "watchlist", label: "追番", title: "追番", icon: BookHeart },
  { key: "collection", label: "收藏", title: "收藏", icon: Search },
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
  const current = NAV.find((n) => n.key === page)!;

  const { user, loading: userLoading } = useAuthUser();
  const username = user?.username;
  // 拉取全部 5 种条目类型的收藏（与 useUserCollectionsAll 同 key/staleTime，命中同一缓存）
  const queries = useQueries({
    queries: SUBJECT_TYPES.map((subjectType) => ({
      queryKey: ["collections", username, subjectType],
      queryFn: () => getAllUserCollections(username!, subjectType),
      staleTime: 60_000,
      enabled: !!username,
    })),
  });
  const qc = useQueryClient();

  const loading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error;

  // 每种 subjectType 对应的收藏列表，供筛选使用
  const bySubjectType = useMemo(() => {
    const map: Partial<Record<SubjectType, UserCollection[]>> = {};
    SUBJECT_TYPES.forEach((t, i) => {
      map[t] = (queries[i].data as UserCollection[] | undefined) ?? [];
    });
    return map;
  }, [queries]);

  const [subjectType, setSubjectType] = useState<SubjectType | undefined>(
    undefined,
  );

  const groups = useMemo(() => {
    const items = subjectType
      ? bySubjectType[subjectType] ?? []
      : SUBJECT_TYPES.flatMap((t) => bySubjectType[t] ?? []);
    return groupByType(items);
  }, [bySubjectType, subjectType]);

  /** 每种条目类型的收藏总数（与当前筛选无关，始终反映该类型全部条目） */
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

  const [openMap, setOpenMap] = useState<Record<number, boolean>>(() =>
    // 默认全部展开
    Object.fromEntries(COLLECTION_ORDER.map((t) => [t, true])),
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["collections"] });
  }

  function jumpTo(type: CollectionType) {
    setOpenMap((m) => ({ ...m, [type]: true }));
    const container = scrollRef.current;
    if (!container) return;
    // 等 Radix 折叠动画落定后再滚动，避免目标高度未展开导致滚动不到位
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

        {/* 内容区 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-6">
            <h1 className="text-lg font-semibold">{current.title}</h1>
            {page === "watchlist" && user && !userLoading && (
              <WatchlistToolbar
                loading={loading}
                totalCount={totalCount}
                counts={counts}
                subjectCounts={subjectCounts}
                subjectType={subjectType}
                onSubjectTypeChange={setSubjectType}
                onRefresh={refresh}
                onJumpTo={jumpTo}
                onJumpToTop={jumpToTop}
              />
            )}
          </header>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-6">
            {page === "config" ? (
              <Config />
            ) : page === "about" ? (
              <About />
            ) : page === "collection" ? (
              <Collection />
            ) : userLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> 加载中…
              </div>
            ) : !user ? (
              <p className="text-sm text-muted-foreground">
                请先到「配置」页完成 Bangumi 认证。
              </p>
            ) : (
              <>
                {error && (
                  <p className="mb-2 text-sm text-destructive">
                    {error instanceof Error ? error.message : "加载失败"}
                  </p>
                )}
                <Watchlist
                  loading={loading}
                  totalCount={totalCount}
                  groups={groups}
                  openMap={openMap}
                  setOpenMap={setOpenMap}
                />
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
