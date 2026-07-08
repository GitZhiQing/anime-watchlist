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
  // 本次换 token 用的 redirect_uri（动态端口下为 http://localhost:{P}/callback），
  // 供 doRefresh 读取——刷新时传的 redirect_uri 必须与换 token 时一致。
  redirectUri: "redirect_uri",
  // 是否强制固定回调端口 7359（默认 false，开启动态端口）。用户已登记 7359 或
  // Bangumi 收紧动态校验时启用。
  oauthFixedPort: "oauth_fixed_port",
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
  await deleteStore(StoreKeys.redirectUri);
}
