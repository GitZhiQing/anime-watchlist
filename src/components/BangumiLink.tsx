import { SquareArrowOutUpRight } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BangumiLinkProps {
  subjectId: number;
  /** 内联图标模式：无边框小图标，紧贴标题文本右侧，原生 title 悬浮提示 */
  iconOnly?: boolean;
  className?: string;
}

/** 打开失败统一提示（无默认浏览器/被拦截），与 CollectAction 的外链口径一致 */
function openSubject(subjectId: number) {
  openUrl(`https://bangumi.tv/subject/${subjectId}`).catch((e) =>
    toast.error("打开网页失败", {
      description: e instanceof Error ? e.message : String(e),
    }),
  );
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
          openSubject(subjectId);
        }}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center text-muted-foreground/70 transition-colors hover:text-foreground",
          className,
        )}
      >
        <SquareArrowOutUpRight className="size-3.5" aria-hidden="true" />
      </button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      onClick={() => openSubject(subjectId)}
      title="在 Bangumi 查看"
    >
      Bangumi
      <SquareArrowOutUpRight className="size-3.5" aria-hidden="true" />
    </Button>
  );
}
