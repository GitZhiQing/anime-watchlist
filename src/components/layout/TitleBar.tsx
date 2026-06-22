import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const unlisten = appWindow.onResized(async () => {
      setMaximized(await appWindow.isMaximized());
    });
    appWindow.isMaximized().then(setMaximized);
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-3 select-none"
    >
      <span
        data-tauri-drag-region
        className="inline-flex items-center gap-1.5 text-sm font-medium text-sidebar-foreground"
      >
        <img src="/logo.png" alt="" className="size-5 rounded" />
        追番计划
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => appWindow.minimize()}
          title="最小化"
        >
          <Minus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => appWindow.toggleMaximize()}
          title="最大化/还原"
        >
          {maximized ? (
            <Copy className="size-3" />
          ) : (
            <Square className="size-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => appWindow.close()}
          title="关闭"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
