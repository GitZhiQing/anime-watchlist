// p1 私有扩展信息（角色/关联/推荐）。无官方文档，宽松解析 + 静默失败：
// 解析异常按空数组处理，请求失败由调用方（useQuery isError）降级为"区块不渲染"。
import { bgmRequest } from "@/lib/bgm";
import type { P1Character, P1RecItem, P1Relation } from "@/types/bgm";

const P1_BASE = "https://next.bgm.tv/p1";

/** 条目角色 + CV 列表 */
export async function getSubjectCharacters(
  subjectId: number,
): Promise<P1Character[]> {
  const res = await bgmRequest<P1Character[]>(
    `${P1_BASE}/subjects/${subjectId}/characters`,
    { auth: false },
  );
  return Array.isArray(res) ? res : [];
}

/** 关联条目（前传/续集/衍生等） */
export async function getSubjectRelations(
  subjectId: number,
): Promise<P1Relation[]> {
  const res = await bgmRequest<P1Relation[]>(
    `${P1_BASE}/subjects/${subjectId}/relations`,
    { auth: false },
  );
  return Array.isArray(res) ? res : [];
}

/** 相关推荐（不同版本返回数组或 {rec:[...]}，两种都兼容） */
export async function getSubjectRecs(subjectId: number): Promise<P1RecItem[]> {
  const res = await bgmRequest<unknown>(
    `${P1_BASE}/subjects/${subjectId}/recs`,
    { auth: false },
  );
  if (Array.isArray(res)) return res as P1RecItem[];
  const rec = (res as { rec?: P1RecItem[] } | null)?.rec;
  return Array.isArray(rec) ? rec : [];
}
