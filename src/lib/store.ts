// Store 插件封装：本地 KV 配置文件 config.json。
// 存放 OAuth 凭据、token、用户资料缓存、代理与界面偏好等。
//
// 安全说明：client_secret / refresh_token / access_token 以明文存于本文件
// （应用数据目录下，用户级权限）。桌面单用户场景下的常见妥协；如需更强隔离
// 可评估迁移 OS 凭据库（Windows Credential Manager），当前不做。
import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("config.json");

/**
 * HTTP 代理配置。
 * - url 必填，如 http://127.0.0.1:7890 / socks5://127.0.0.1:1080
 * - username/password 可选，用于代理的 Basic 认证
 * 存入 store 时整体读写；该键为空（delete）即表示不启用代理。
 */
export interface ProxyConfig {
  url: string;
  username?: string;
  password?: string;
}

export const StoreKeys = {
  clientId: "client_id",
  clientSecret: "client_secret",
  accessToken: "access_token",
  refreshToken: "refresh_token",
  expiresAt: "expires_at", // epoch ms
  user: "user", // 缓存的 BgmUser
  proxy: "proxy", // ProxyConfig | undefined
  // 本次换 token 用的 redirect_uri（动态端口下为 http://localhost:{P}/callback），
  // 供 doRefresh 读取——刷新时传的 redirect_uri 必须与换 token 时一致。
  redirectUri: "redirect_uri",
  // 是否强制固定回调端口 7359（默认 false，开启动态端口）。用户已登记 7359 或
  // Bangumi 收紧动态校验时启用。
  oauthFixedPort: "oauth_fixed_port",
  // 数据备份：记住的备份目录与上次备份完成时间（epoch ms）
  backupDir: "prefs.backup.dir",
  backupLastTime: "prefs.backup.last_time",
} as const;

export async function getStore<T>(key: string): Promise<T | undefined> {
  return store.get<T>(key);
}

export async function setStore(key: string, value: unknown): Promise<void> {
  // undefined 经 JSON 序列化会丢 value 键，插件侧报 invalid args——约定为清除该键
  if (value === undefined) {
    await deleteStore(key);
    return;
  }
  await store.set(key, value);
  await store.save();
}

/**
 * 批量写入多个键后单次落盘（save 前全部 set 生效于内存，一次写盘）。
 * 多键强关联的数据（token 三键等）必须用本函数：分次 setStore 会在中途
 * 落盘留下「半新半旧」状态，进程若在间隙退出将无法恢复。
 */
export async function setStores(
  entries: readonly (readonly [key: string, value: unknown])[],
): Promise<void> {
  for (const [key, value] of entries) {
    if (value === undefined) {
      await store.delete(key);
    } else {
      await store.set(key, value);
    }
  }
  await store.save();
}

export async function deleteStore(key: string): Promise<void> {
  await store.delete(key);
  await store.save();
}

/** 清除所有认证相关数据（注销）；批量删除单次落盘 */
export async function clearAuth(): Promise<void> {
  await setStores([
    [StoreKeys.accessToken, undefined],
    [StoreKeys.refreshToken, undefined],
    [StoreKeys.expiresAt, undefined],
    [StoreKeys.user, undefined],
    [StoreKeys.redirectUri, undefined],
  ]);
}
