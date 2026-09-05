import { useEffect, useRef, useState } from "react";
import { ChevronRight, Star } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubjectDetailView, NSFWBadge } from "@/components/SubjectDetailView";
import { FadeImg } from "@/components/FadeImg";
import { BangumiLink } from "@/components/BangumiLink";
import { CollectAction } from "@/components/CollectAction";
import { usePrefetchSubject } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { SlimSubject } from "@/types/bgm";
import { SubjectType, SUBJECT_LABELS, SUBJECT_BADGE_STYLES } from "@/types/bgm";

interface SubjectRowProps {
  subject: SlimSubject;
  /** 列表态额外信息行，渲染在元信息行内（如热度值、我的进度文字） */
  extraInfo?: React.ReactNode;
  /** 本地搜索关键词：在标题/短简介中高亮命中片段 */
  highlight?: string;
  className?: string;
}

const MAX_TAGS = 10;

/** 关键词高亮：大小写不敏感的子串拆分，命中片段以 mark 高亮 */
export function Highlight({
  text,
  query,
}: {
  text: string;
  query?: string;
}) {
  const q = query?.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let from = 0;
  let key = 0;
  for (;;) {
    const idx = lower.indexOf(q, from);
    if (idx === -1) {
      nodes.push(text.slice(from));
      break;
    }
    if (idx > from) nodes.push(text.slice(from, idx));
    nodes.push(
      <mark
        key={key++}
        className="rounded-sm bg-amber-300/50 text-inherit dark:bg-amber-500/30"
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    from = idx + q.length;
  }
  return <>{nodes}</>;
}

/** 列表态元信息行：评分 / 话数 / 放送时间 + 页面附加信息（同一行内联展示）。 */
function MetaRow({
  subject,
  extra,
}: {
  subject: SlimSubject;
  extra?: React.ReactNode;
}) {
  const score = !!(subject.score && subject.score > 0);
  const eps = !!(subject.eps && subject.eps > 0);
  const hasDate = !!subject.date;
  if (!score && !eps && !hasDate && !extra) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {score && (
        <span className="inline-flex items-center gap-0.5">
          <Star className="size-3 fill-current text-amber-500" />
          {subject.score!.toFixed(1)}
        </span>
      )}
      {eps && <span>{subject.eps} 话</span>}
      {hasDate && <span>{subject.date}</span>}
      {extra}
    </div>
  );
}

/** 放送开始日期晚于当前时间 → 未开播角标（仅能确定这一种状态，其余不显示） */
function AirBadge({ date }: { date?: string | null }) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime()) || d.getTime() <= Date.now()) return null;
  return (
    <span className="rounded bg-sky-500/15 px-1 py-0.5 text-[10px] leading-none text-sky-500">
      未开播
    </span>
  );
}

/** 通用条目展示行：封面 | 标题/短简介/元信息/标签 | [可选操作]。整行可点击展开详情。 */
export function SubjectRow({
  subject,
  extraInfo,
  highlight,
  className,
}: SubjectRowProps) {
  const [open, setOpen] = useState(false);
  const title = subject.name_cn || subject.name || `#${subject.id}`;
  const cover = subject.images?.small;
  const coverMedium = subject.images?.medium;
  const tags = (subject.tags ?? []).slice(0, MAX_TAGS);

  // 悬停/聚焦 300ms 后预取完整详情，展开时秒开（staleTime 内重复预取零请求）
  const prefetchSubject = usePrefetchSubject();
  const prefetchTimer = useRef<number | undefined>(undefined);
  function schedulePrefetch() {
    window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = window.setTimeout(
      () => prefetchSubject(subject.id),
      300,
    );
  }
  function cancelPrefetch() {
    window.clearTimeout(prefetchTimer.current);
  }
  useEffect(() => cancelPrefetch, []);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "rounded-md transition-colors hover:bg-muted/40 data-[state=open]:bg-muted/30",
        className,
      )}
    >
      <div className="flex gap-3 p-2">
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              // 点击封面只弹大图，不触发行展开
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 cursor-zoom-in"
              title="查看大图"
            >
              <FadeImg
                src={cover}
                alt={title}
                loading="lazy"
                className="aspect-[5/7] w-16 rounded bg-muted/50 object-contain transition-opacity hover:opacity-80"
              />
            </button>
          </DialogTrigger>
          <DialogContent showCloseButton={false} variant="image">
            <DialogTitle className="sr-only">{title} 封面</DialogTitle>
            <img
              src={coverMedium}
              alt={title}
              className="max-h-[85vh] max-w-[90vw] rounded object-contain"
            />
          </DialogContent>
        </Dialog>
        {/* 内容列：标题行（标题可点展开 + 徽章 + Bangumi 链接）与其余信息（可点展开） */}
        <div
          className="flex min-w-0 flex-1 flex-col gap-1"
          onMouseEnter={schedulePrefetch}
          onMouseLeave={cancelPrefetch}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="min-w-0 cursor-pointer truncate text-left font-medium"
                title={title}
              >
                <Highlight text={title} query={highlight} />
              </button>
            </CollapsibleTrigger>
            {/* Bangumi 链接 + 收藏下拉（xs）紧贴标题右侧；均在触发器外，点击不触发行展开 */}
            <BangumiLink subjectId={subject.id} iconOnly />
            <CollectAction subjectId={subject.id} subject={subject} size="xs" />
            {SUBJECT_LABELS[subject.type as SubjectType] && (
              <span
                className={cn(
                  "shrink-0 rounded px-1 py-0.5 text-[10px] leading-none",
                  SUBJECT_BADGE_STYLES[subject.type as SubjectType],
                )}
              >
                {SUBJECT_LABELS[subject.type as SubjectType]}
              </span>
            )}
            {subject.nsfw && <NSFWBadge />}
            <AirBadge date={subject.date} />
            <ChevronRight
              className={cn(
                "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
          </div>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 cursor-pointer flex-col gap-1 text-left"
            >
              {subject.short_summary && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  <Highlight text={subject.short_summary} query={highlight} />
                </p>
              )}
              <MetaRow subject={subject} extra={extraInfo} />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {tags.map((t) => (
                    <span
                      key={t.name}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs"
                    >
                      <Highlight text={t.name} query={highlight} />
                    </span>
                  ))}
                  {(subject.tags?.length ?? 0) > MAX_TAGS && (
                    <span className="px-1 py-0.5 text-xs text-muted-foreground">
                      +{subject.tags!.length - MAX_TAGS}
                    </span>
                  )}
                </div>
              )}
            </button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent>
        <div className="border-t border-border px-4 pb-4 pt-2">
          <SubjectDetailView subjectId={subject.id} variant="inline" subject={subject} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
