// HTTP 代理配置：把 store 中的 ProxyConfig 转成 plugin-http 可用的选项，
// 并提供连通性测试。所有 Bangumi 请求（bgm.ts / auth.ts）共用本模块。
import type { Proxy, ProxyConfig as HttpProxyConfig } from "@tauri-apps/plugin-http";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { API_BASE, USER_AGENT } from "@/lib/bgm";
import { StoreKeys, getStore } from "@/lib/store";
import type { ProxyConfig } from "@/lib/store";

/**
 * 把 store 中的 ProxyConfig 转成 plugin-http 的 { all: {...} } 形式。
 * url 为空返回 undefined（不启用代理）。
 */
function toProxy(cfg: ProxyConfig): Proxy | undefined {
  const url = cfg.url.trim();
  if (!url) return undefined;
  const all: HttpProxyConfig = { url };
  const user = cfg.username?.trim();
  if (user || cfg.password) {
    all.basicAuth = { username: user ?? "", password: cfg.password ?? "" };
  }
  return { all };
}

/**
 * 读取已存的代理配置并组装成 fetch 可用的 proxy 选项。
 * 未配置或 url 为空时返回 undefined。
 */
export async function getProxy(): Promise<Proxy | undefined> {
  const cfg = await getStore<ProxyConfig>(StoreKeys.proxy);
  if (!cfg) return undefined;
  return toProxy(cfg);
}

/**
 * 用给定代理配置测试是否能连通 Bangumi。
 * 成功返回 ok:true；失败返回 ok:false 与错误文案。
 * 不要求先落库，便于「测试连接」按钮直接用表单当前值。
 */
export async function testProxy(
  cfg: ProxyConfig,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const proxy = toProxy(cfg);
  if (!proxy) return { ok: false, message: "请填写代理地址" };
  try {
    const res = await tauriFetch(`${API_BASE}/v0/search/null?limit=1`, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
      proxy,
      // 坏代理应快速失败，避免长时间挂起
      connectTimeout: 8000,
    });
    // 2xx / 4xx 都说明请求确实到达了 Bangumi，即代理链路可用
    return res.status < 500
      ? { ok: true }
      : { ok: false, message: `Bangumi 返回状态码 ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
