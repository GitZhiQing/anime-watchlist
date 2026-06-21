import { useState } from "react";
import { BookHeart, Search, Settings, Info } from "lucide-react";
import { TitleBar } from "@/components/layout/TitleBar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Config } from "@/pages/Config";
import { Watchlist } from "@/pages/Watchlist";
import { Collection } from "@/pages/Collection";
import { About } from "@/pages/About";
import { cn } from "@/lib/utils";

export type PageKey = "watchlist" | "collection" | "config" | "about";

const NAV: {
  key: PageKey;
  label: string;
  title: string;
  icon: typeof Search;
}[] = [
  { key: "watchlist", label: "追番", title: "追番", icon: BookHeart },
  { key: "collection", label: "收藏", title: "收藏", icon: Search },
  { key: "config", label: "配置", title: "配置", icon: Settings },
  { key: "about", label: "关于", title: "关于", icon: Info },
];

export default function App() {
  const [page, setPage] = useState<PageKey>("watchlist");
  const current = NAV.find((n) => n.key === page)!;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        {/* 侧边栏 */}
        <nav className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-border bg-sidebar py-3">
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
          <header className="flex h-12 shrink-0 items-center border-b border-border px-6">
            <h1 className="text-lg font-semibold">{current.title}</h1>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {page === "config" ? (
              <Config />
            ) : page === "watchlist" ? (
              <Watchlist />
            ) : page === "about" ? (
              <About />
            ) : (
              <Collection />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
