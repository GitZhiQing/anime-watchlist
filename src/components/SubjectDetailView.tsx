import { useCallback, useState } from "react";
import { ChevronRight, Lock, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CollectAction } from "@/components/CollectAction";
import { BangumiLink } from "@/components/BangumiLink";
import { RateStars, ProgressRows } from "@/components/ProgressEdit";
import { FadeImg } from "@/components/FadeImg";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SubjectFields, SubjectTags } from "@/components/SubjectFields";
import { SubjectSummary } from "@/components/SubjectSummary";
import { SubjectP1Sections } from "@/components/SubjectP1Sections";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  usePatchCollection,
  useSubjectDetail,
  useUserCollectionSmart,
} from "@/lib/queries";
import {
  SUBJECT_BADGE_STYLES,
  SUBJECT_LABELS,
  CollectionType,
} from "@/types/bgm";
import type {
  SlimSubject,
  Subject as SubjectFull,
  SubjectType,
} from "@/types/bgm";
import { cn } from "@/lib/utils";

/**
 * 统一条目详情容器（全应用唯一的详情渲染单元）：
 * - variant="inline"：展开行内嵌（追番/找番/热度榜），操作区在顶部，简介可折叠
 * - variant="dialog"：弹窗主体（新番表格、网格卡片），头部固定 + 简介独立滚动区
 * 字段顺序、标签、我的备注、加载骨架、错误重试、p1 扩展区块在各页完全一致。
 */

interface SubjectDetailViewProps {
  subjectId: number;
  variant: "inline" | "dialog";
  /** dialog 头部标题（inline 的标题由列表行渲染） */
  title?: string;
  /** 新增收藏时用于乐观插入列表缓存的条目数据 */
  subject?: SlimSubject;
  /** 是否渲染操作区（收藏/外链/进度编辑），默认 true */
  showActions?: boolean;
  /** dialog 头部是否带关闭按钮，默认 true */
  showClose?: boolean;
}

/** NSFW（R18）角标，列表行与详情头部共用 */
export function NSFWBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-red-500/15 px-1 py-0.5 text-[10px] leading-none font-medium text-red-500",
        className,
      )}
    >
      R18
    </span>
  );
}

/** 可点击放大的封面（medium 展示、large 放大） */
function ZoomableCover({
  subject,
  widthClass = "w-24",
}: {
  subject: SubjectFull;
  widthClass?: string;
}) {
  const title = subject.name_cn || subject.name;
  const src =
    subject.images?.medium || subject.images?.large || subject.images?.common;
  const zoom = subject.images?.large || subject.images?.medium;
  if (!src) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="shrink-0 cursor-zoom-in"
          title="查看大图"
        >
          <FadeImg
            src={src}
            alt={title}
            loading="lazy"
            className={cn(
              "aspect-[5/7] rounded bg-muted/50 object-contain transition-opacity hover:opacity-80",
              widthClass,
            )}
          />
        </button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} variant="image">
        <DialogTitle className="sr-only">{title} 封面</DialogTitle>
        <img
          src={zoom}
          alt={title}
          className="max-h-[85vh] max-w-[90vw] rounded object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}

/** 备注保存（inline 面板与 dialog 只读行共用）：保存成功后回调 done 关闭编辑态 */
function useCommentSave(subjectId: number) {
  const { user } = useAuthUser();
  const patchMut = usePatchCollection();
  const save = useCallback(
    (value: string, done: () => void) => {
      patchMut.mutate(
        { subjectId, username: user?.username, comment: value },
        {
          onSuccess: () => {
            done();
            toast.success(value ? "备注已保存" : "备注已清除");
          },
          onError: (e) =>
            toast.error("保存备注失败", {
              description: e instanceof Error ? e.message : String(e),
            }),
        },
      );
    },
    [patchMut, subjectId, user?.username],
  );
  return { save, pending: patchMut.isPending };
}

/**
 * 「我的」折叠栏（inline 与 dialog 共用）：默认收起，点击展开三行——
 * 我的评分 / 我的进度（仅在看、看过）/ 我的备注。
 * 收藏夹下拉在标题行（SubjectRow / dialog 头部），此处不再重复。
 */
function MySection({
  subjectId,
  detail,
  wrapClassName,
}: {
  subjectId: number;
  detail: SubjectFull;
  /** 外层包装类（inline 顶部分隔线布局用；无内容时不渲染包装层） */
  wrapClassName?: string;
}) {
  const { user } = useAuthUser();
  const { data: col } = useUserCollectionSmart(user?.username, subjectId);
  const [open, setOpen] = useState(false);
  const [editingComment, setEditingComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const { save, pending: commentPending } = useCommentSave(subjectId);

  if (!col) return null;

  // 评分与进度仅对「在看、看过」有意义
  const progressEligible =
    col.type === CollectionType.Doing || col.type === CollectionType.Done;
  const comment = col.comment?.trim() ?? "";
  const updated = col.updated_at
    ? new Date(col.updated_at).toLocaleDateString()
    : "";

  function startEdit() {
    setCommentText(comment);
    setEditingComment(true);
  }

  const content = (
    <Collapsible open={open} onOpenChange={setOpen} className="text-xs">
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex shrink-0 cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-90",
              )}
            />
            我的
          </button>
        </CollapsibleTrigger>
        {col.private && (
          <span
            className="inline-flex items-center gap-0.5 text-muted-foreground"
            title="仅自己可见"
          >
            <Lock className="size-3" />
            私密
          </span>
        )}
        {updated && (
          <span className="text-[10px] text-muted-foreground">
            {updated} 更新
          </span>
        )}
      </div>
      <CollapsibleContent>
        <div className="space-y-1.5 pt-1.5">
          {progressEligible && (
            <div className="flex items-start gap-2">
              <span className="w-16 shrink-0 leading-6 text-muted-foreground">
                我的评分
              </span>
              <RateStars subjectId={subjectId} rate={col.rate} />
            </div>
          )}
          {progressEligible && (
            <div className="flex items-start gap-2">
              <span className="w-16 shrink-0 pt-0.5 text-muted-foreground">
                我的进度
              </span>
              <div className="min-w-0 flex-1">
                <ProgressRows
                  subjectId={subjectId}
                  subjectType={detail.type}
                  epStatus={col.ep_status}
                  // total_episodes 为 0 时（书籍常见）回退 eps
                  totalEps={detail.total_episodes || detail.eps || 0}
                  volStatus={col.vol_status}
                  volumes={detail.volumes ?? 0}
                />
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <span className="w-16 shrink-0 pt-0.5 text-muted-foreground">
              我的备注
            </span>
            <div className="min-w-0 flex-1">
              {editingComment ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="吐槽/备注（保存到 Bangumi 收藏记录）"
                    className="min-h-16 text-xs"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setEditingComment(false)}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={commentPending}
                      onClick={() =>
                        save(commentText.trim(), () => setEditingComment(false))
                      }
                    >
                      保存
                    </Button>
                  </div>
                </div>
              ) : comment ? (
                <p className="border-l-2 border-border pl-2 leading-relaxed whitespace-pre-line">
                  {comment}
                </p>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={startEdit}
                >
                  添加备注
                </Button>
              )}
            </div>
            {!editingComment && comment && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-xs"
                onClick={startEdit}
              >
                编辑备注
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  return wrapClassName ? <div className={wrapClassName}>{content}</div> : content;
}

/** 详情加载骨架：封面块（仅弹窗）+ 字段行 + 简介行 */
function DetailSkeleton({ variant }: { variant: "inline" | "dialog" }) {
  return (
    <div className="space-y-3 py-1">
      {variant === "dialog" ? (
        <div className="flex gap-3">
          <Skeleton className="aspect-[5/7] w-24 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      )}
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

/** 详情加载失败：错误文案 + 重试 */
function DetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-xs text-destructive">
      <span>详情加载失败</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={onRetry}
      >
        <RotateCw className="size-3" /> 重试
      </Button>
    </div>
  );
}

export function SubjectDetailView({
  subjectId,
  variant,
  title,
  subject,
  showActions = true,
  showClose = true,
}: SubjectDetailViewProps) {
  const {
    data: detail,
    isLoading,
    error,
    refetch,
  } = useSubjectDetail(subjectId);

  const typeBadge =
    detail && SUBJECT_LABELS[detail.type as SubjectType] ? (
      <span
        className={cn(
          "ml-1.5 inline-block rounded px-1 py-0.5 align-middle text-[10px] leading-none",
          SUBJECT_BADGE_STYLES[detail.type as SubjectType],
        )}
      >
        {SUBJECT_LABELS[detail.type as SubjectType]}
      </span>
    ) : null;

  /** 详情主体：加载骨架 / 错误重试 / 完整内容（两变体共用同一套块，仅布局不同） */
  let body: React.ReactNode;
  if (isLoading) {
    body = <DetailSkeleton variant={variant} />;
  } else if (error || !detail) {
    body = <DetailError onRetry={() => void refetch()} />;
  } else {
    // inline 变体不显示封面（列表行已有封面缩略图，避免重复）；弹窗变体无行封面，保留
    const coverAndFields =
      variant === "dialog" ? (
        <div className="flex gap-3">
          <ZoomableCover subject={detail} widthClass="w-24" />
          <SubjectFields
            subject={detail}
            className="min-w-0 flex-1 space-y-0.5"
          />
        </div>
      ) : (
        <SubjectFields
          subject={detail}
          className="min-w-0 flex-1 space-y-1.5"
        />
      );
    const tags = <SubjectTags tags={detail.tags} />;

    body =
      variant === "dialog" ? (
        <div className="flex min-h-0 flex-1 flex-col pt-2">
          {/* 固定区：封面+字段 / 标签 / 我的（折叠） */}
          <div className="shrink-0 space-y-2">
            {coverAndFields}
            {tags}
            <MySection subjectId={subjectId} detail={detail} />
          </div>
          {/* 滚动区：简介 + p1 扩展（角色/关联/推荐） */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pt-2">
            <SubjectSummary summary={detail.summary} />
            <SubjectP1Sections subjectId={subjectId} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {coverAndFields}
          {tags}
          <SubjectSummary
            summary={detail.summary}
            collapsible={variant === "inline"}
          />
          <SubjectP1Sections subjectId={subjectId} />
        </div>
      );
  }

  if (variant === "dialog") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* 固定头部：标题 + 收藏(xs) + Bangumi 链接 + 徽章 | 关闭（items-center 垂直对齐） */}
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border pb-2">
          <h2 className="flex min-w-0 flex-1 items-center gap-1.5 text-base leading-none font-semibold">
            <span className="min-w-0 truncate" title={title}>
              {title}
            </span>
            {showActions && (
              <CollectAction subjectId={subjectId} subject={subject} size="xs" />
            )}
            <BangumiLink subjectId={subjectId} iconOnly />
            {typeBadge}
            {detail?.nsfw && <NSFWBadge />}
          </h2>
          {showClose && (
            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm" title="关闭">
                <X className="size-4" />
                <span className="sr-only">关闭</span>
              </Button>
            </DialogClose>
          )}
        </div>
        <ErrorBoundary key={subjectId} label="详情">
          {body}
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ErrorBoundary key={subjectId} label="详情">
        {showActions && detail && (
          <MySection
            subjectId={subjectId}
            detail={detail}
            wrapClassName="border-b border-border pb-2"
          />
        )}
        {body}
      </ErrorBoundary>
    </div>
  );
}
