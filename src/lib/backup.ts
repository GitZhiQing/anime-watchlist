// 数据备份：把用户全部 5 类收藏（含评分/进度/备注/标签/私密标记）导出为本地 JSON 文件。
// 数据源复用 collectionsQueryOptions（staleTime 内命中缓存零请求，否则走
// getAllUserCollections 分页拉取）；写文件走应用自有 Rust 命令 write_text_file，
// 目录选择走 plugin-dialog——不引入 fs 插件权限面。
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { QueryClient } from "@tanstack/react-query";
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
