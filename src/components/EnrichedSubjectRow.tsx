import { useMemo } from "react";
import { SubjectRow } from "@/components/SubjectRow";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useSubjectDetail } from "@/lib/queries";
import type { SlimSubject, Subject } from "@/types/bgm";

/** 详情补全合并：列表接口普遍缺简介/标签/NSFW，detail 存在时用
 *  GET /v0/subjects/{id} 的结果回填；无 detail（未加载/失败）时保持原样。
 *  images 一并回填：p1/日历源的尺寸键与 v0 漂移（p1 medium=r/200、
 *  calendar medium 仅 100px 缩略图），v0 的 medium=r/800 才是封面弹窗大图。 */
export function mergeSubjectDetail(
  base: SlimSubject,
  detail?: Subject,
): SlimSubject {
  if (!detail) return base;
  return {
    ...base,
    images: detail.images ?? base.images,
    short_summary: detail.summary || base.short_summary,
    tags: detail.tags?.length ? detail.tags : base.tags,
    nsfw: detail.nsfw || base.nsfw,
    score: detail.rating?.score ?? base.score,
    eps: detail.total_episodes || base.eps,
  };
}

interface EnrichedSubjectRowProps {
  subject: SlimSubject;
  /** 列表态额外信息行，透传给 SubjectRow（如热度值、在看人数） */
  extraInfo?: React.ReactNode;
  /** 本地搜索关键词高亮，透传给 SubjectRow */
  highlight?: string;
  className?: string;
}

/** 带详情补全的列表行：进入视口后才拉取完整详情（与 hover 预取/展开详情
 *  共享 30min 缓存），补齐简介/标签/NSFW 等字段；失败静默降级为基础行。 */
export function EnrichedSubjectRow({
  subject,
  ...rest
}: EnrichedSubjectRowProps) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const { data: detail } = useSubjectDetail(subject.id, inView);
  const merged = useMemo(
    () => mergeSubjectDetail(subject, detail),
    [subject, detail],
  );
  return (
    <div ref={ref}>
      <SubjectRow subject={merged} {...rest} />
    </div>
  );
}
