// p1 私有扩展信息（角色/关联/推荐）。无官方文档，宽松解析 + 静默失败：
// 解析异常按空数组处理，请求失败由调用方（useQuery isError）降级为"区块不渲染"。
// 2026-09 实测响应已从「顶层数组」变为 {data:[...],total} 包装，条目嵌套在
// character/subject 键下，relation 由字符串变为 {cn,en,jp} 对象，CV 键由 cast
// 变为 casts[].person。此处统一解包并归一化为 types/bgm.ts 的扁平类型，
// 渲染层不感知形状漂移（同时宽松兼容旧形状）。
import { bgmRequest } from "@/lib/bgm";
import type { P1Character, P1RecItem, P1Relation } from "@/types/bgm";

const P1_BASE = "https://next.bgm.tv/p1";

/** 响应包装解包：顶层数组（旧）/ {data:[...]}（现）/ {rec:[...]}（旧 recs）→ 数组 */
function p1List(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  const obj = res as Record<string, unknown> | null;
  if (Array.isArray(obj?.data)) return obj.data;
  if (Array.isArray(obj?.rec)) return obj.rec;
  return [];
}

/** 条目可能在顶层（旧扁平）或嵌套在 key（character/subject）下，宽松取内层对象 */
function innerItem<T>(item: unknown, key: string): T {
  const obj = item as Record<string, unknown> | null | undefined;
  const inner = obj?.[key];
  return ((typeof inner === "object" && inner !== null ? inner : obj) ??
    {}) as T;
}

/** 条目角色 + CV 列表 */
export async function getSubjectCharacters(
  subjectId: number,
): Promise<P1Character[]> {
  const res = await bgmRequest<unknown>(
    `${P1_BASE}/subjects/${subjectId}/characters`,
    { auth: false },
  );
  return p1List(res).map((raw) => {
    const it = raw as { cast?: unknown; casts?: unknown };
    const ch = innerItem<P1Character>(raw, "character");
    // CV：旧 cast:[{name}]，新 casts:[{person:{name}}]——拍平成旧形状
    const castRaw: unknown[] = Array.isArray(it.casts)
      ? it.casts
      : Array.isArray(it.cast)
        ? it.cast
        : [];
    const cast = castRaw.map((c): P1Character["cast"][number] => {
      const o = (c ?? {}) as P1Character["cast"][number] & {
        person?: P1Character["cast"][number];
      };
      return typeof o.person === "object" && o.person !== null
        ? { ...o, ...o.person }
        : o;
    });
    return { ...ch, cast };
  });
}

/** 关系标签：旧版是字符串，新版是 {id,en,cn,jp} 对象（cn 优先、en 兜底） */
function relationLabel(rel: unknown, fallback = ""): string {
  if (typeof rel === "string") return rel;
  if (typeof rel === "object" && rel !== null) {
    const o = rel as { cn?: string; en?: string };
    return o.cn || o.en || fallback;
  }
  return fallback;
}

/** 关联条目（前传/续集/衍生等） */
export async function getSubjectRelations(
  subjectId: number,
): Promise<P1Relation[]> {
  const res = await bgmRequest<unknown>(
    `${P1_BASE}/subjects/${subjectId}/relations`,
    { auth: false },
  );
  return p1List(res).map((raw) => {
    const it = raw as { relation?: unknown };
    const r = innerItem<P1Relation>(raw, "subject");
    return { ...r, relation: relationLabel(it.relation, r.relation) };
  });
}

/** 相关推荐。包装随版本漂移：顶层数组 / {rec:[...]}（旧）/ {data:[...]}（现），p1List 统一兼容 */
export async function getSubjectRecs(subjectId: number): Promise<P1RecItem[]> {
  const res = await bgmRequest<unknown>(
    `${P1_BASE}/subjects/${subjectId}/recs`,
    { auth: false },
  );
  return p1List(res).map((raw) => {
    const r = innerItem<P1RecItem & { rating?: { score?: number } }>(
      raw,
      "subject",
    );
    // 评分：旧扁平 score，新嵌套 subject.rating.score
    return { ...r, score: r.score ?? r.rating?.score };
  });
}
