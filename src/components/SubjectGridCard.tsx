import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { SubjectDetailDialog } from "@/components/SubjectDetailDialog";
import { NSFWBadge } from "@/components/SubjectDetailView";
import { FadeImg } from "@/components/FadeImg";
import { usePrefetchSubject } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { SlimSubject } from "@/types/bgm";

interface SubjectGridCardProps {
  subject: SlimSubject;
  /** 卡片下方说明文字（追番：看到 N/M；新番：共 N 人在看），缺省时空占位保持对齐 */
  caption?: ReactNode;
  className?: string;
}

/**
 * 网格视图的海报卡片（追番页/新番页共用）：
 * 封面（NSFW 模糊处理）+ 评分角标 + 底部标题浮层，点击打开统一详情弹窗。
 */
export function SubjectGridCard({ subject, caption, className }: SubjectGridCardProps) {
  const [open, setOpen] = useState(false);
  const s = subject;
  const title = s.name_cn || s.name || `#${s.id}`;

  const prefetchSubject = usePrefetchSubject();
  const prefetchTimer = useRef<number | undefined>(undefined);
  function schedulePrefetch() {
    window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = window.setTimeout(() => prefetchSubject(s.id), 300);
  }
  function cancelPrefetch() {
    window.clearTimeout(prefetchTimer.current);
  }
  useEffect(() => cancelPrefetch, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={schedulePrefetch}
        onMouseLeave={cancelPrefetch}
        className={cn("group cursor-pointer text-left", className)}
        title={title}
      >
        <div className="relative aspect-[5/7] w-full overflow-hidden rounded-md border border-border bg-muted/30 transition-colors group-hover:border-primary/40">
          {s.images?.small ? (
            <FadeImg
              src={s.images.small}
              alt={title}
              loading="lazy"
              className={cn(
                "h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]",
                s.nsfw && "blur-md", // NSFW 封面模糊，点击详情查看
              )}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
              暂无封面
            </span>
          )}

          {/* 顶部左：NSFW；顶部右：评分 */}
          {s.nsfw && <NSFWBadge className="absolute top-1 left-1" />}
          {!!s.score && s.score > 0 && (
            <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] leading-none text-amber-400">
              <Star className="size-2.5 fill-current" />
              {s.score.toFixed(1)}
            </span>
          )}

          {/* 底部：标题浮层 */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pt-4 pb-1">
            <p className="line-clamp-1 text-[11px] leading-tight text-white" title={title}>
              {title}
            </p>
          </div>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground" title={title}>
          {caption ?? "\u00A0"}
        </p>
      </button>

      <SubjectDetailDialog
        open={open}
        onOpenChange={setOpen}
        subjectId={s.id}
        title={title}
        subject={s}
      />
    </>
  );
}
