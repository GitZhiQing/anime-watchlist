import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { InfoboxItem, Subject, Tag } from "@/types/bgm";

/**
 * 条目详情的统一渲染单元，供 SubjectDetailView（追番/找番展开、弹窗）复用，
 * 保证字段顺序、文案、布局一致。布局差异（间距、滚动外层）由调用方控制。
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

/** 收藏统计：想看 / 在看 / 看过 / 搁置 / 抛弃，无数据返回 null */
function CollectionValue({ subject }: { subject: Subject }) {
  const c = subject.collection;
  if (!c) return null;
  const parts = [
    c.wish ? `想看 ${c.wish}` : null,
    c.doing ? `在看 ${c.doing}` : null,
    c.collect ? `看过 ${c.collect}` : null,
    c.on_hold ? `搁置 ${c.on_hold}` : null,
    c.dropped ? `抛弃 ${c.dropped}` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span>{parts.join(" · ")}</span>;
}

/** infobox 值统一为字符串：values 元素可能是 {v} 或纯字符串；个别条目缺 values，需容错 */
function infoboxValue(item: InfoboxItem): string {
  const values = Array.isArray(item?.values) ? item.values : [];
  return values
    .map((v) => (typeof v === "string" ? v : v?.v))
    .filter((v) => typeof v === "string" && v.trim() !== "")
    .join(" / ")
    .trim();
}

/**
 * 直接展示的 infobox 关键 key（制作/放送等决策信息）；其余收进「更多信息」折叠。
 * Bangumi 不同类型条目的 key 不统一，列表外的一律不丢，进折叠区。
 */
const PROMINENT_INFOBOX_KEYS = new Set([
  "中文名",
  "别名",
  "话数",
  "放送开始",
  "播放结束",
  "播放期间",
  "放送星期",
  "制作公司",
  "动画制作",
  "原作",
  "导演",
  "系列导演",
  "脚本",
  "系列构成",
  "音乐",
  "音乐制作",
  "主题歌演出",
  "主题歌作曲",
  "人物设定",
  "作画监督",
  "美术监督",
  "色彩设计",
  "摄影监督",
  "音响监督",
  "录音",
  "制片人",
  "企划",
  "出品",
  "官方网站",
]);

/** infobox 其余条目的折叠区「更多信息（N）」 */
function InfoboxMore({ items }: { items: InfoboxItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        更多信息（{items.length}）
        <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 space-y-1.5 border-l border-border pl-2">
          {items.map((item, i) => (
            <Field
              key={`${item.key}-${i}`}
              label={item.key}
              value={infoboxValue(item)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * 统一顺序的字段列表：原名 → 中文名 → 评分 → 排名 → 话数 → 卷数 → 放送开始
 * → 平台 → 收藏统计 → infobox 关键项 → 更多信息折叠。
 * className 控制行间距。
 */
export function SubjectFields({
  subject,
  className,
}: {
  subject: Subject;
  className?: string;
}) {
  const eps = subject.total_episodes ?? subject.eps;
  // infobox 整体也可能是非数组形状，统一收窄为空数组兜底
  const boxes = (Array.isArray(subject.infobox) ? subject.infobox : []).filter(
    (b) => infoboxValue(b) !== "",
  );
  const prominent = boxes.filter((b) => PROMINENT_INFOBOX_KEYS.has(b.key));
  const rest = boxes.filter((b) => !PROMINENT_INFOBOX_KEYS.has(b.key));

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
      <Field
        label="卷数"
        value={
          subject.volumes && subject.volumes > 0
            ? `${subject.volumes} 卷`
            : undefined
        }
      />
      <Field label="放送开始" value={subject.date} />
      <Field label="平台" value={subject.platform} />
      <Field label="收藏" value={<CollectionValue subject={subject} />} />
      {prominent.map((b) => (
        <Field key={b.key} label={b.key} value={infoboxValue(b)} />
      ))}
      {rest.length > 0 && <InfoboxMore items={rest} />}
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
