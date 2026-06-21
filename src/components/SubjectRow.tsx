import { useState } from "react";
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
import { SubjectDetail } from "@/components/SubjectDetail";
import { cn } from "@/lib/utils";
import type { SlimSubject } from "@/types/bgm";
import { SubjectType } from "@/types/bgm";

interface SubjectRowProps {
  subject: SlimSubject;
  /** 列表态右侧附加操作区（如收藏页的「+收藏」）。点击不会触发行展开。 */
  action?: React.ReactNode;
  /** 展开态顶部的操作区（如追番页的收藏夹调整）。 */
  expandedAction?: React.ReactNode;
  className?: string;
}

const MAX_TAGS = 10;

/** 列表态元信息行：评分 / 话数 / 放送时间。值为 0/空则隐藏对应项。 */
function MetaRow({ subject }: { subject: SlimSubject }) {
  const score = subject.score && subject.score > 0;
  const eps = subject.eps && subject.eps > 0;
  const hasDate = !!subject.date;
  if (!score && !eps && !hasDate) return null;

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
    </div>
  );
}

/** 通用条目展示行：封面 | 标题/短简介/元信息/标签 | [可选操作]。整行可点击展开详情。 */
export function SubjectRow({
  subject,
  action,
  expandedAction,
  className,
}: SubjectRowProps) {
  const [open, setOpen] = useState(false);
  const title = subject.name_cn || subject.name || `#${subject.id}`;
  const cover = subject.images?.small;
  const coverMedium = subject.images?.medium;
  const tags = (subject.tags ?? []).slice(0, MAX_TAGS);

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
              <img
                src={cover}
                alt={title}
                loading="lazy"
                className="aspect-[5/7] w-16 rounded bg-muted/50 object-contain transition-opacity hover:opacity-80"
              />
            </button>
          </DialogTrigger>
          <DialogContent
            showCloseButton={false}
            className="max-w-fit border-none bg-transparent p-0 shadow-none"
          >
            <DialogTitle className="sr-only">{title} 封面</DialogTitle>
            <img
              src={coverMedium}
              alt={title}
              className="max-h-[80vh] max-w-[80vw] rounded object-contain"
            />
          </DialogContent>
        </Dialog>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="line-clamp-1 font-medium" title={title}>
                  {title}
                </span>
                {subject.type === SubjectType.Book && (
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
                    书籍
                  </span>
                )}
              </span>
              <ChevronRight
                className={cn(
                  "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )}
              />
            </div>
            {subject.short_summary && (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {subject.short_summary}
              </p>
            )}
            <MetaRow subject={subject} />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {tags.map((t) => (
                  <span
                    key={t.name}
                    className="rounded bg-muted px-1.5 py-0.5 text-xs"
                  >
                    {t.name}
                  </span>
                ))}
                {(subject.tags?.length ?? 0) > MAX_TAGS && (
                  <span className="px-1 py-0.5 text-xs text-muted-foreground">
                    +{(subject.tags!.length) - MAX_TAGS}
                  </span>
                )}
              </div>
            )}
          </button>
        </CollapsibleTrigger>
        {action && (
          <div
            className="flex shrink-0 items-start pt-0.5"
            // 操作区点击不触发行展开
            onClick={(e) => e.stopPropagation()}
          >
            {action}
          </div>
        )}
      </div>
      <CollapsibleContent>
        <div className="border-t border-border px-2 pb-2 pl-[84px]">
          {expandedAction && (
            <div className="flex items-center border-b border-border py-2">
              {expandedAction}
            </div>
          )}
          <SubjectDetail subjectId={subject.id} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
