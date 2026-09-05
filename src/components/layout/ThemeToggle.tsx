import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 主题模式：亮色 / 暗色 / 跟随系统 */
type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "theme";
const MODES: ThemeMode[] = ["light", "dark", "system"];
const MODE_LABELS: Record<ThemeMode, string> = {
  light: "亮色",
  dark: "暗色",
  system: "跟随系统",
};

function applyTheme(mode: ThemeMode) {
  const dark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function initialMode(): ThemeMode {
  const t = localStorage.getItem(THEME_KEY);
  return t === "light" || t === "dark" ? t : "system";
}

/** 主题切换按钮：亮色 → 暗色 → 跟随系统 循环。系统模式下跟随系统变化。 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  // 应用主题；系统模式下监听系统主题变化实时跟随
  useEffect(() => {
    applyTheme(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  function cycle() {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    localStorage.setItem(THEME_KEY, next);
    setMode(next);
  }

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;

  return (
    <Button
      variant="ghost"
      onClick={cycle}
      title={`主题：${MODE_LABELS[mode]}（点击切换）`}
      className={cn(
        "size-12 shrink-0 p-0",
        "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        className,
      )}
    >
      <Icon className="size-5" />
    </Button>
  );
}
