// Store 插件封装：本地 KV 配置文件 config.json。
// 存放 OAuth 凭据、token、用户资料缓存、主题等。
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
  theme: "theme",
  proxy: "proxy", // ProxyConfig | undefined
} as const;

export async function getStore<T>(key: string): Promise<T | undefined> {
  return store.get<T>(key);
}

export async function setStore(key: string, value: unknown): Promise<void> {
  await store.set(key, value);
  await store.save();
}

export async function deleteStore(key: string): Promise<void> {
  await store.delete(key);
  await store.save();
}

/** 清除所有认证相关数据（注销） */
export async function clearAuth(): Promise<void> {
  await deleteStore(StoreKeys.accessToken);
  await deleteStore(StoreKeys.refreshToken);
  await deleteStore(StoreKeys.expiresAt);
  await deleteStore(StoreKeys.user);
}
