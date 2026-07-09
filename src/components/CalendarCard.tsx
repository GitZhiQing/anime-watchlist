import { useState } from "react";
import { Loader2, RotateCw, X } from "lucide-react";
import type { ImgHTMLAttributes } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CollectAction } from "@/components/CollectAction";
import { BangumiLink } from "@/components/BangumiLink";
import { useSubjectDetail } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { SubjectType, SUBJECT_LABELS, SUBJECT_BADGE_STYLES } from "@/types/bgm";
import type { CalendarSubject } from "@/types/bgm";

interface CalendarCardProps {
  item: CalendarSubject;
}

/**
 * 正方形封面适配：
 * - 竖版图片（宽 < 高）：object-cover 全宽铺满，裁掉超出正方形的上下两端（保留中间段）
 * - 横版图片（宽 ≥ 高）：object-contain 全宽完整展示，上下留白
 */
function SquareCoverImg({
  className,
  onLoad,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [cover, setCover] = useState(false);
  return (
    <img
      {...props}
      loading="lazy"
      onLoad={(e) => {
        const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
        setCover(h > w); // 竖版才裁切
        onLoad?.(e);
      }}
      className={cn(
        "h-full w-full",
        cover ? "object-cover" : "object-contain",
        className,
      )}
    />
  );
}

/** 键值对行 */
function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}

/** 表格视图中的条目卡片。点击弹出详情弹窗。 */
export function CalendarCard({ item }: CalendarCardProps) {
  const [open, setOpen] = useState(false);
  const title = item.name_cn || item.name || `#${item.id}`;
  const cover = item.images?.common;
  const coverMedium = item.images?.medium;
  const coverLarge = item.images?.large || item.images?.common || item.images?.medium;

  /* 弹窗打开后才懒加载完整详情 */
  const { data: detail, isLoading, error, refetch } = useSubjectDetail(open ? item.id : 0);

  return (
    <>
      {/* 卡片 */}
      <button
        type="button"
        className="w-full cursor-pointer overflow-hidden rounded-md border border-border text-left transition-colors hover:bg-muted/40"
        onClick={() => setOpen(true)}
        title={title}>
        {/* 封面区域：无封面时用占位高度防止坍缩 */}
        <div className="relative aspect-square w-full bg-muted/30">
          {cover ? (
            <SquareCoverImg src={cover} alt={title} />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
              暂无封面
            </span>
          )}

          {/* 标题浮层：盖在封面底部，半透明深色背景 */}
          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5">
            <p className="line-clamp-1 text-xs font-medium text-white" title={title}>
              {title}
            </p>
          </div>
        </div>
      </button>

      {/* 详情弹窗 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[70vh] max-h-[70vh] w-[620px] max-w-[90vw] flex-col overflow-hidden sm:max-w-[620px] pt-4">
          <DialogTitle className="sr-only">{title} 详情</DialogTitle>

          {/* 固定头部：标题 + 操作 */}
          <div className="flex shrink-0 items-start gap-3 border-b border-border pb-2">
            <h2 className="min-w-0 flex-1 text-base font-semibold">
              {title}
              {SUBJECT_LABELS[item.type as SubjectType] && (
                <span
                  className={cn(
                    "ml-1.5 inline-block rounded px-1 py-0.5 text-[10px] leading-none",
                    SUBJECT_BADGE_STYLES[item.type as SubjectType],
                  )}>
                  {SUBJECT_LABELS[item.type as SubjectType]}
                </span>
              )}
            </h2>
            <CollectAction subjectId={item.id} />
            <BangumiLink subjectId={item.id} />
            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm" title="关闭">
                <X className="size-4" />
                <span className="sr-only">关闭</span>
              </Button>
            </DialogClose>
          </div>

          {/* 详情内容：封面 + 字段 + 标签（固定）| 简介（可滚动） */}
          <DetailBody
            title={title}
            coverMedium={coverMedium}
            coverLarge={coverLarge}
            detail={detail}
            isLoading={isLoading}
            error={error}
            onRetry={refetch}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---- 弹窗主体分体组件 ---- */

interface DetailBodyProps {
  title: string;
  coverMedium: string | undefined;
  coverLarge: string | undefined;
  detail: ReturnType<typeof useSubjectDetail>["data"];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

function DetailBody({
  title,
  coverMedium,
  coverLarge,
  detail,
  isLoading,
  error,
  onRetry,
}: DetailBodyProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 pt-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> 加载数据中...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 pt-3 text-xs text-destructive">
        <span>{error ? "详情加载失败" : "无详情"}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRetry}>
          <RotateCw className="size-3" /> 重试
        </Button>
      </div>
    );
  }

  const score = detail.rating?.score;
  const allTags = detail.tags ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-1">
      {/* 封面行：封面 + 字段 */}
      <div className="flex shrink-0 gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" className="shrink-0 cursor-zoom-in self-start" title="查看大图">
              <img
                src={coverMedium}
                alt={title}
                className="aspect-[5/7] w-24 rounded bg-muted/50 object-contain transition-opacity hover:opacity-80"
              />
            </button>
          </DialogTrigger>
          <DialogContent showCloseButton={false} variant="image">
            <DialogTitle className="sr-only">{title} 封面</DialogTitle>
            <img
              src={coverLarge}
              alt={title}
              className="max-h-[85vh] max-w-[90vw] rounded object-contain"
            />
          </DialogContent>
        </Dialog>
        <div className="min-w-0 flex-1 space-y-0.5">
          <Field label="原名" value={detail.name} />
          <Field label="中文名" value={detail.name_cn} />
          <Field
            label="评分"
            value={
              score ? (
                <span>
                  ★ {score.toFixed(1)}
                  {detail.rating?.total ? `（${detail.rating.total} 人评分）` : ""}
                </span>
              ) : undefined
            }
          />
          <Field
            label="话数"
            value={detail.total_episodes ? `${detail.total_episodes} 话` : undefined}
          />
          <Field label="放送开始" value={detail.date} />
          <Field label="平台" value={detail.platform} />
        </div>
      </div>

      {/* 标签：独占一行，固定不滚动 */}
      {allTags.length > 0 && (
        <div className="shrink-0 pb-2 pt-2">
          <div className="flex flex-wrap gap-1">
            {allTags.map((t) => (
              <span key={t.name} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 简介：独占一行，可滚动，占据剩余空间 */}
      {detail.summary && (
        <div className="min-h-0 flex-1 overflow-y-auto pt-2">
          <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
            {detail.summary}
          </p>
        </div>
      )}
    </div>
  );
}
