// 统计聚合（纯函数，零请求）：输入为收藏列表缓存（App 的 bySubjectType），
// 输出统计页各卡片的数据。渲染层只做展示，不重复计算。
import {
  COLLECTION_LABELS,
  COLLECTION_ORDER,
  SUBJECT_LABELS,
  SUBJECT_TYPES,
} from "@/types/bgm";
import type { CollectionType, SubjectType, UserCollection } from "@/types/bgm";

/** 单条横向条形数据；colorClass 为条的颜色类（缺省 bg-primary） */
export interface StatsBar {
  label: string;
  value: number;
  colorClass?: string;
}

export interface StatsResult {
  total: number;
  /** 收藏夹分布（想看/看过/在看/搁置/抛弃） */
  shelfBars: StatsBar[];
  /** 条目类型占比（动画/书籍/…） */
  typeBars: StatsBar[];
  /** 我的评分分布（1~10 分，仅统计已评分） */
  rateBars: StatsBar[];
  /** 已评分数与我的均分 */
  ratedCount: number;
  myAvg: number | null;
  /** 收藏条目的社区评分均分（评分缺失不计） */
  communityAvg: number | null;
  /** 开播年份分布（按条目 date 统计——v0 收藏接口无 created_at，加入时间不可得；未定档不计） */
  yearBars: StatsBar[];
}

/** 收藏夹条形配色（软色系，与徽标风格协调） */
const SHELF_COLORS: Record<number, string> = {
  1: "bg-sky-500", // 想看
  2: "bg-violet-500", // 看过
  3: "bg-emerald-500", // 在看
  4: "bg-amber-500", // 搁置
  5: "bg-rose-500", // 抛弃
};

/** 条目类型条形配色（沿用类型徽标同色系） */
const TYPE_COLORS: Record<number, string> = {
  1: "bg-sky-500", // 书籍
  2: "bg-emerald-500", // 动画
  3: "bg-pink-500", // 音乐
  4: "bg-violet-500", // 游戏
  6: "bg-amber-500", // 三次元
};

export function computeStats(
  bySubjectType: Partial<Record<SubjectType, UserCollection[]>>,
): StatsResult {
  const all: UserCollection[] = SUBJECT_TYPES.flatMap(
    (t) => bySubjectType[t] ?? [],
  );

  // 收藏夹分布
  const shelfBars = COLLECTION_ORDER.map((type) => ({
    label: COLLECTION_LABELS[type as CollectionType],
    value: all.filter((c) => c.type === type).length,
    colorClass: SHELF_COLORS[type],
  }));

  // 类型占比
  const typeBars = SUBJECT_TYPES.map((t) => ({
    label: SUBJECT_LABELS[t],
    value: (bySubjectType[t] ?? []).length,
    colorClass: TYPE_COLORS[t],
  })).filter((b) => b.value > 0);

  // 我的评分分布（1~10）
  const rateCounts = new Array(11).fill(0) as number[];
  for (const c of all) {
    if (c.rate > 0) rateCounts[Math.min(10, Math.round(c.rate))] += 1;
  }
  const rated = all.filter((c) => c.rate > 0);
  const rateBars = Array.from({ length: 10 }, (_, i) => ({
    label: `${i + 1} 分`,
    value: rateCounts[i + 1],
  }));
  const myAvg = rated.length
    ? rated.reduce((s, c) => s + c.rate, 0) / rated.length
    : null;

  // 社区评分均分（收藏条目的 subject.score）
  const scored = all.filter((c) => (c.subject?.score ?? 0) > 0);
  const communityAvg = scored.length
    ? scored.reduce((s, c) => s + (c.subject.score ?? 0), 0) / scored.length
    : null;

  // 开播年份分布（条目 date 的年份；未定档不计）。超过 15 个年份时早年合并为「更早」
  const byYear = new Map<number, number>();
  for (const c of all) {
    const d = c.subject?.date;
    if (!d) continue;
    const y = parseInt(d.slice(0, 4), 10);
    if (!isNaN(y) && y > 1900 && y < 2100) byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
  let yearBars: StatsBar[] = years.map(([y, n]) => ({ label: `${y}`, value: n }));
  if (years.length > 15) {
    const cut = years.length - 14; // 保留最近 14 个年份 + 「更早」
    const earlier = years.slice(0, cut).reduce((s, [, n]) => s + n, 0);
    yearBars = [
      { label: "更早", value: earlier },
      ...years.slice(cut).map(([y, n]) => ({ label: `${y}`, value: n })),
    ];
  }

  return {
    total: all.length,
    shelfBars,
    typeBars,
    rateBars,
    ratedCount: rated.length,
    myAvg,
    communityAvg,
    yearBars,
  };
}
