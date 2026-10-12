// p1 私有扩展信息（角色/关联/推荐）。无官方文档，宽松解析 + 静默失败：
// 解析异常按空数组处理，请求失败由调用方（useQuery isError）降级为"区块不渲染"。
// 2026-09 实测响应已从「顶层数组」变为 {data:[...],total} 包装，条目嵌套在
// character/subject 键下，relation 由字符串变为 {cn,en,jp} 对象，CV 键由 cast
// 变为 casts[].person。此处统一解包并归一化为 types/bgm.ts 的扁平类型，
// 渲染层不感知形状漂移（同时宽松兼容旧形状）。
import { bgmRequest } from "@/lib/bgm";
import type {
  P1Character,
  P1PersonDetail,
  P1RecItem,
  P1Relation,
  SubjectImages,
} from "@/types/bgm";

const P1_BASE = "https://next.bgm.tv/p1";

/** 列表端点返回：items + total（total 用于校验是否被服务端截断；旧形状回退 items.length） */
export interface P1ListResult<T> {
  items: T[];
  total: number;
}

/** 响应包装解包：顶层数组（旧）/ {data:[...]}（现）/ {rec:[...]}（旧 recs）→ items + total */
function p1List(res: unknown): P1ListResult<unknown> {
  if (Array.isArray(res)) return { items: res, total: res.length };
  const obj = res as Record<string, unknown> | null;
  if (Array.isArray(obj?.data))
    return {
      items: obj.data,
      total: typeof obj.total === "number" ? obj.total : obj.data.length,
    };
  if (Array.isArray(obj?.rec)) return { items: obj.rec, total: obj.rec.length };
  return { items: [], total: 0 };
}

/** 条目可能在顶层（旧扁平）或嵌套在 key（character/subject）下，宽松取内层对象 */
function innerItem<T>(item: unknown, key: string): T {
  const obj = item as Record<string, unknown> | null | undefined;
  const inner = obj?.[key];
  return ((typeof inner === "object" && inner !== null ? inner : obj) ??
    {}) as T;
}

/** 条目角色 + CV 列表（未传 limit，响应即服务端给到的全量；total 供截断校验） */
export async function getSubjectCharacters(
  subjectId: number,
): Promise<P1ListResult<P1Character>> {
  const res = await bgmRequest<unknown>(
    `${P1_BASE}/subjects/${subjectId}/characters`,
    { auth: false },
  );
  const { items, total } = p1List(res);
  return {
    items: items.map((raw) => {
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
    }),
    total,
  };
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
): Promise<P1ListResult<P1Relation>> {
  const res = await bgmRequest<unknown>(
    `${P1_BASE}/subjects/${subjectId}/relations`,
    { auth: false },
  );
  const { items, total } = p1List(res);
  return {
    items: items.map((raw) => {
      const it = raw as { relation?: unknown };
      const r = innerItem<P1Relation>(raw, "subject");
      return { ...r, relation: relationLabel(it.relation, r.relation) };
    }),
    total,
  };
}

/** 相关推荐。包装随版本漂移：顶层数组 / {rec:[...]}（旧）/ {data:[...]}（现），p1List 统一兼容 */
export async function getSubjectRecs(
  subjectId: number,
): Promise<P1ListResult<P1RecItem>> {
  const res = await bgmRequest<unknown>(
    `${P1_BASE}/subjects/${subjectId}/recs`,
    { auth: false },
  );
  const { items, total } = p1List(res);
  return {
    items: items.map((raw) => {
      const r = innerItem<P1RecItem & { rating?: { score?: number } }>(
        raw,
        "subject",
      );
      // 评分：旧扁平 score，新嵌套 subject.rating.score
      return { ...r, score: r.score ?? r.rating?.score };
    }),
    total,
  };
}

// ===== 角色 / 声优详情 =====
// /p1/characters/{id} 与 /p1/persons/{id} 仅在上游 p1.yaml 里有登记、响应形状未实测：
// 归一化按「能取多少取多少」宽松处理，缺失字段静默为 undefined，由弹窗 UI 降级展示。

/** 未知形状 → 宽松归一化（字段全可选） */
function normalizePerson(res: unknown, fallbackId: number): P1PersonDetail {
  if (typeof res !== "object" || res === null) return { id: fallbackId };
  const o = res as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return {
    id: typeof o.id === "number" ? o.id : fallbackId,
    name: str(o.name),
    nameCN: str(o.nameCN) ?? str(o.nicename),
    images:
      typeof o.images === "object" && o.images !== null
        ? (o.images as SubjectImages)
        : undefined,
    summary: str(o.summary),
    career: Array.isArray(o.career)
      ? o.career.filter((c): c is string => typeof c === "string")
      : undefined,
  };
}

/** 角色详情 */
export async function getCharacterDetail(
  characterId: number,
): Promise<P1PersonDetail> {
  const res = await bgmRequest<unknown>(`${P1_BASE}/characters/${characterId}`, {
    auth: false,
  });
  return normalizePerson(res, characterId);
}

/** 声优（人物）详情 */
export async function getPersonDetail(
  personId: number,
): Promise<P1PersonDetail> {
  const res = await bgmRequest<unknown>(`${P1_BASE}/persons/${personId}`, {
    auth: false,
  });
  return normalizePerson(res, personId);
}
