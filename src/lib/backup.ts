// 数据备份：把用户全部 5 类收藏（含评分/进度/备注/标签/私密标记）导出为本地 JSON 文件。
// 数据源复用 collectionsQueryOptions（staleTime 内命中缓存零请求，否则走
// getAllUserCollections 分页拉取）；写文件走应用自有 Rust 命令 write_text_file，
// 目录选择走 plugin-dialog——不引入 fs 插件权限面。
//
// 恢复（导入）为**聚合恢复**：新增缺失收藏（POST + PATCH）与按需覆盖已存在条目
// （PATCH），恢复收藏夹/评分/进度/卷数/备注/标签；上游 API 无删除端点，无法移除
// 当前账号多出的收藏，也无法读取/恢复网页端的逐集勾选（无读取端点，见 docs/API.md）。
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { QueryClient } from "@tanstack/react-query";
import {
  AuthExpiredError,
  BgmError,
  mapWithConcurrency,
  patchCollection,
  setCollection,
  type CollectionPatch,
} from "@/lib/bgm";
import { collectionsQueryOptions } from "@/lib/queries";
import { SubjectType, SUBJECT_TYPES } from "@/types/bgm";
import type { UserCollection } from "@/types/bgm";

/** 备份文件结构。schemaVersion 仅在结构破坏性变更时递增。 */
export interface BackupPayload {
  app: "anime-watchlist";
  schemaVersion: 1;
  appVersion: string;
  username: string;
  /** 导出时间（ISO 8601） */
  exportedAt: string;
  /** 收藏总条数（各类型之和） */
  total: number;
  /** key 为 Bangumi subject_type（1 书籍 / 2 动画 / 3 音乐 / 4 游戏 / 6 三次元） */
  collections: Partial<Record<SubjectType, UserCollection[]>>;
}

/** 备份文件名：anime-watchlist-backup-YYYYMMDD-HHmmss.json */
export function backupFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `anime-watchlist-backup-${date}-${time}.json`;
}

/** 拼接备份文件完整路径。目录来自原生对话框，Windows 下为反斜杠。 */
function joinPath(dir: string, filename: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${sep}${filename}`;
}

/** 弹出系统目录选择框；用户取消返回 null。 */
export async function pickBackupDir(
  defaultPath?: string,
): Promise<string | null> {
  const picked = await open({
    directory: true,
    multiple: false,
    title: "选择备份保存目录",
    defaultPath,
  });
  if (!picked) return null;
  // 根目录（如 C:\）自带尾分隔符，统一去掉，展示与拼接一致
  return picked.replace(/[\\/]+$/, "");
}

/** 收集全部 5 类收藏并序列化为备份 JSON（2 空格缩进，便于 diff 与人工查看）。 */
export async function collectBackupData(
  username: string,
  queryClient: QueryClient,
): Promise<BackupPayload> {
  const lists = await Promise.all(
    SUBJECT_TYPES.map((t) =>
      queryClient.fetchQuery(collectionsQueryOptions(username, t)),
    ),
  );
  const collections: Partial<Record<SubjectType, UserCollection[]>> = {};
  SUBJECT_TYPES.forEach((t, i) => {
    collections[t] = lists[i];
  });
  return {
    app: "anime-watchlist",
    schemaVersion: 1,
    appVersion: import.meta.env.VITE_APP_VERSION,
    username,
    exportedAt: new Date().toISOString(),
    total: lists.reduce((sum, list) => sum + list.length, 0),
    collections,
  };
}

/** 备份编排：收集数据 → 写入 dir 下的时间戳文件 → 返回完整路径与条数。 */
export async function runBackup(
  username: string,
  dir: string,
  queryClient: QueryClient,
): Promise<{ path: string; total: number }> {
  const payload = await collectBackupData(username, queryClient);
  const path = joinPath(dir, backupFilename());
  await invoke("write_text_file", {
    path,
    contents: JSON.stringify(payload, null, 2),
  });
  return { path, total: payload.total };
}

// ===== 恢复（导入）：聚合恢复 =====

/** 恢复模式：skip=已收藏条目不动；overwrite=用备份覆盖其收藏夹/评分/进度/备注 */
export type RestoreMode = "skip" | "overwrite";

/** 恢复计划：与当前账号收藏（复用列表缓存）按 subject_id 对比的结果 */
export interface RestorePlan {
  /** 当前未收藏 → POST 新增 + PATCH 恢复字段 */
  toAdd: UserCollection[];
  /** 当前已收藏 → 仅 overwrite 模式下 PATCH 覆盖 */
  toPatch: UserCollection[];
  /** 备份总条数 */
  total: number;
}

/** 恢复执行结果（逐条失败不中断，最后汇总） */
export interface RestoreResult {
  added: number;
  patched: number;
  failed: Array<{ subjectId: number; name: string; error: string }>;
  /** 带 tags 的 PATCH 被服务端拒绝、降级去掉 tags 后成功的条数（接口接受度未验证） */
  tagsDropped: number;
}

/** 解析并校验备份文件全文；非法文件抛带人话信息的 Error。 */
export function parseBackupPayload(text: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as BackupPayload).app !== "anime-watchlist"
  ) {
    throw new Error("不是本应用导出的备份文件（缺少应用标识）");
  }
  const payload = raw as BackupPayload;
  if (payload.schemaVersion !== 1) {
    throw new Error(`不支持的备份格式版本：v${payload.schemaVersion}`);
  }
  if (typeof payload.username !== "string" || !payload.username) {
    throw new Error("备份文件缺少导出账号名");
  }
  if (!payload.collections || typeof payload.collections !== "object") {
    throw new Error("备份文件缺少收藏数据");
  }
  for (const [key, list] of Object.entries(payload.collections)) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      throw new Error(`备份中的收藏数据形状异常（类型 ${key}）`);
    }
    // 元素级校验：损坏/手改文件的坏条目会让恢复阶段以 undefined 发请求、逐条静默失败
    for (const c of list) {
      if (
        typeof c !== "object" ||
        c === null ||
        typeof c.subject_id !== "number" ||
        typeof c.type !== "number"
      ) {
        throw new Error(
          `备份中的收藏条目形状异常（类型 ${key}，subject_id/type 缺失）`,
        );
      }
    }
  }
  return payload;
}

/** 制定恢复计划：对比备份与当前账号收藏（fetchQuery 命中缓存零请求）。 */
export async function planRestore(
  username: string,
  payload: BackupPayload,
  queryClient: QueryClient,
): Promise<RestorePlan> {
  const currentLists = await Promise.all(
    SUBJECT_TYPES.map((t) =>
      queryClient.fetchQuery(collectionsQueryOptions(username, t)),
    ),
  );
  const currentIds = new Set(currentLists.flat().map((c) => c.subject_id));
  const toAdd: UserCollection[] = [];
  const toPatch: UserCollection[] = [];
  for (const t of SUBJECT_TYPES) {
    for (const c of payload.collections[t] ?? []) {
      if (currentIds.has(c.subject_id)) toPatch.push(c);
      else toAdd.push(c);
    }
  }
  return { toAdd, toPatch, total: toAdd.length + toPatch.length };
}

/**
 * 由备份条目构造 PATCH body（覆盖收藏夹 + 评分/进度/卷数/备注/标签）。
 * private 透传统一原则：备份里存了该字段就读——把用户在网页端设为公开的
 * 收藏重置回私密属于数据破坏；旧备份/缺省时兜底 true（本应用新增恒私密）。
 */
function entryPatch(c: UserCollection): CollectionPatch {
  return {
    type: c.type,
    ep_status: c.ep_status ?? 0,
    vol_status: c.vol_status ?? 0,
    rate: c.rate ?? 0,
    ...(c.comment ? { comment: c.comment } : {}),
    ...(c.tags && c.tags.length > 0 ? { tags: c.tags } : {}),
    private: c.private ?? true,
  };
}

/**
 * 对单条执行 PATCH。PATCH 携带 tags 的接受度未实测验证（官方文档未列出）：
 * 带 tags 失败时去掉 tags 重试一次，成功则计入 tagsDropped。
 */
async function patchEntry(c: UserCollection): Promise<{ tagsDropped: boolean }> {
  const patch = entryPatch(c);
  try {
    await patchCollection(c.subject_id, patch);
    return { tagsDropped: false };
  } catch (e) {
    if (patch.tags && e instanceof BgmError) {
      const { tags, ...rest } = patch;
      void tags;
      await patchCollection(c.subject_id, rest);
      return { tagsDropped: true };
    }
    throw e;
  }
}

/** 新增一条收藏并恢复字段。POST 刚建收藏即 PATCH 偶发 404（服务端索引延迟）时重试一次。 */
async function addWithPatch(c: UserCollection) {
  await setCollection(c.subject_id, c.type);
  try {
    return await patchEntry(c);
  } catch (e) {
    if (e instanceof BgmError && e.status === 404) {
      await new Promise((r) => setTimeout(r, 600));
      return await patchEntry(c);
    }
    throw e;
  }
}

/** 恢复执行：并发 2 逐条进行，单条失败记录后继续；进度经 onProgress 上报。
 *  认证失效（AuthExpiredError）时整体短路——继续跑只会逐条全失败。 */
export async function runRestore(
  plan: RestorePlan,
  mode: RestoreMode,
  onProgress?: (done: number, total: number) => void,
): Promise<RestoreResult> {
  const tasks = [
    ...plan.toAdd.map((entry) => ({ entry, kind: "add" as const })),
    ...(mode === "overwrite"
      ? plan.toPatch.map((entry) => ({ entry, kind: "patch" as const }))
      : []),
  ];
  const result: RestoreResult = {
    added: 0,
    patched: 0,
    failed: [],
    tagsDropped: 0,
  };
  let done = 0;
  onProgress?.(0, tasks.length);
  await mapWithConcurrency(
    tasks,
    async ({ entry, kind }) => {
      try {
        const res = kind === "add" ? await addWithPatch(entry) : await patchEntry(entry);
        if (kind === "add") result.added += 1;
        else result.patched += 1;
        if (res.tagsDropped) result.tagsDropped += 1;
      } catch (e) {
        // 认证已失效：抛出让 mapWithConcurrency 停止派发，整体 reject 提示重新认证
        if (e instanceof AuthExpiredError) throw e;
        result.failed.push({
          subjectId: entry.subject_id,
          name:
            entry.subject?.name_cn || entry.subject?.name || `#${entry.subject_id}`,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        done += 1;
        onProgress?.(done, tasks.length);
      }
    },
    2,
  );
  return result;
}
