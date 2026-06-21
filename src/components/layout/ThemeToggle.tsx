import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 深色/浅色模式切换按钮。图标随当前主题变化。 */
export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const next = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  }

  return (
    <Button
      variant="ghost"
      onClick={toggle}
      title="切换主题"
      className={cn(
        "size-12 shrink-0 p-0",
        "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        className,
      )}
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

