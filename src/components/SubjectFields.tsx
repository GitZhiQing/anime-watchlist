import type { ReactNode } from "react";
import type { Subject, Tag } from "@/types/bgm";

/**
 * 条目详情的统一渲染单元，供 SubjectDetail（追番/收藏展开）与
 * CalendarCard.DetailBody（新番表格详情）复用，保证字段顺序、文案、
 * 标签宽度一致。布局差异（间距、滚动外层）由调用方控制。
 */

/** 统一键值对行：label 宽度 w-20，值为空/null/0 不渲染 */
export function Field({ label, value }: { label: string; value?: ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}

/** 格式化评分值 */
function ScoreValue({ subject }: { subject: Subject }) {
  const score = subject.rating?.score;
  if (!score || score <= 0) return null;
  return (
    <span>
      ★ {score.toFixed(1)}
      {subject.rating?.total ? `（${subject.rating.total} 人评分）` : ""}
    </span>
  );
}

/** 收藏统计：想看 / 在看 / 看过 三项汇总，无数据返回 null */
function CollectionValue({ subject }: { subject: Subject }) {
  const c = subject.collection;
  if (!c) return null;
  const parts = [
    c.wish ? `想看 ${c.wish}` : null,
    c.doing ? `在看 ${c.doing}` : null,
    c.collect ? `看过 ${c.collect}` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span>{parts.join(" · ")}</span>;
}

/**
 * 统一顺序的字段列表。顺序固定：原名 → 中文名 → 评分 → 排名 → 话数
 * → 放送开始 → 平台 → 收藏。className 控制行间距。
 */
export function SubjectFields({
  subject,
  className,
}: {
  subject: Subject;
  className?: string;
}) {
  const eps = subject.total_episodes ?? subject.eps;
  return (
    <div className={className}>
      <Field label="原名" value={subject.name} />
      <Field label="中文名" value={subject.name_cn} />
      <Field label="评分" value={<ScoreValue subject={subject} />} />
      <Field
        label="排名"
        value={
          subject.rating?.rank && subject.rating.rank > 0
            ? `#${subject.rating.rank}`
            : undefined
        }
      />
      <Field
        label="话数"
        value={eps && eps > 0 ? `${eps} 话` : undefined}
      />
      <Field label="放送开始" value={subject.date} />
      <Field label="平台" value={subject.platform} />
      <Field label="收藏" value={<CollectionValue subject={subject} />} />
    </div>
  );
}

/** 标签区：标题「标签（全部 N）」+ 芯片。空则不渲染 */
export function SubjectTags({ tags }: { tags?: Tag[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">标签（全部 {tags.length}）</div>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <span key={t.name} className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {t.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 简介区：标题「简介」+ 正文。空则不渲染 */
export function SubjectSummary({ summary }: { summary?: string }) {
  if (!summary) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">简介</div>
      <p className="whitespace-pre-line text-xs leading-relaxed">
        {summary}
      </p>
    </div>
  );
}
