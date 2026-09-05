import { SquareArrowOutUpRight } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BangumiLinkProps {
  subjectId: number;
  /** 内联图标模式：无边框小图标，紧贴标题文本右侧，原生 title 悬浮提示 */
  iconOnly?: boolean;
  className?: string;
}

/** 打开该条目的 Bangumi 主页（系统默认浏览器）。 */
export function BangumiLink({ subjectId, iconOnly, className }: BangumiLinkProps) {
  if (iconOnly) {
    // 不用 Radix Tooltip：其无障碍设计会在键盘 focus 时自动弹出，列表行中易误触发
    return (
      <button
        type="button"
        title="在 Bangumi 查看"
        aria-label="在 Bangumi 查看"
        onClick={(e) => {
          e.stopPropagation();
          openUrl(`https://bangumi.tv/subject/${subjectId}`);
        }}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center text-muted-foreground/70 transition-colors hover:text-foreground",
          className,
        )}
      >
        <SquareArrowOutUpRight className="size-3.5" />
      </button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      onClick={() => openUrl(`https://bangumi.tv/subject/${subjectId}`)}
      title="在 Bangumi 查看"
    >
      Bangumi
      <SquareArrowOutUpRight className="size-3.5" />
    </Button>
  );
}
