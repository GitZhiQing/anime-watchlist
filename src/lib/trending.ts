// 热度榜数据层。
// 主数据源：p1 私有 API（next.bgm.tv/p1/trending/subjects）的新增热度榜，
// 返回 `subject + count`，`count` 即热度值。p1 字段命名与 v0 不同，需映射到 SlimSubject。
// 兜底数据源：每日放送（/calendar）按追番人数(doing) 降序，避免热度接口不可用时空态。
import { bgmRequest } from "@/lib/bgm";
import type {
  CalendarDay,
  CalendarSubject,
  P1TrendingResponse,
  SlimSubject,
  TrendingItem,
} from "@/types/bgm";

/** p1 条目 → SlimSubject。p1 无简介/日期字段，置空。 */
function p1ToSlimSubject(
  s: P1TrendingResponse["data"][number]["subject"],
): SlimSubject {
  return {
    id: s.id,
    type: s.type,
    name: s.name,
    name_cn: s.nameCN || s.name,
    short_summary: "",
    images: s.images,
    score: s.rating?.score ?? 0,
    rank: s.rating?.rank,
    tags: (s.metaTags ?? []).map((name) => ({ name, count: 0 })),
  };
}

/** 拉取 p1 热度榜。type 取 SubjectType 整数（本应用搜索/热度仅用 2=动画）。公开接口，无需认证。 */
export async function getTrendingSubjects(
  type: number,
  limit = 20,
): Promise<TrendingItem[]> {
  const res = await bgmRequest<P1TrendingResponse>(
    "https://next.bgm.tv/p1/trending/subjects",
    { auth: false, query: { type, limit } },
  );
  return (res?.data ?? []).map((d) => ({
    subject: p1ToSlimSubject(d.subject),
    heat: d.count,
    source: "trends" as const,
  }));
}

/** calendar 条目 → SlimSubject（保留追番数做热度）。 */
function calendarToSlimSubject(c: CalendarSubject): SlimSubject {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    name_cn: c.name_cn || c.name,
    short_summary: c.summary ?? "",
    date: c.air_date,
    images: c.images,
    eps: c.eps_count ?? c.eps,
    score: c.rating?.score ?? 0,
    rank: c.rating?.rank,
    tags: [],
  };
}

/** 兜底：每日放送按追番人数(doing) 降序取前 limit。纯函数，数据由调用方（useCalendar）传入。 */
export function deriveCalendarTrending(
  days: CalendarDay[],
  limit = 20,
): TrendingItem[] {
  return days
    .flatMap((d) => d.items)
    .map((c) => ({
      subject: calendarToSlimSubject(c),
      heat: c.collection?.doing ?? 0,
      source: "calendar" as const,
    }))
    .filter((it) => it.heat > 0)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, limit);
}
