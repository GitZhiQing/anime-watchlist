// OAuth 授权流程编排：
// 1. 读取已存的 client_id/secret
// 2. 启动 Rust 端本地回环服务器（阻塞等待 code）
// 3. 打开浏览器到 Bangumi 授权页
// 4. 拿到 code 后换 access/refresh token 并存 Store
// 5. 获取用户资料存 Store
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { OAUTH_BASE, REDIRECT_URI, USER_AGENT, getMe } from "@/lib/bgm";
import { StoreKeys, getStore, setStore } from "@/lib/store";
import type { OAuthTokenResponse } from "@/types/bgm";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/** 是否已完成认证（有 access_token 且未过期）。 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getStore<string>(StoreKeys.accessToken);
  if (!token) return false;
  const expiresAt = await getStore<number>(StoreKeys.expiresAt);
  if (!expiresAt) return false;
  return Date.now() < expiresAt;
}

/** 发起完整 OAuth 授权码流程。成功后用户资料已存入 Store。 */
export async function startOAuthLogin(): Promise<void> {
  const clientId = await getStore<string>(StoreKeys.clientId);
  const clientSecret = await getStore<string>(StoreKeys.clientSecret);
  if (!clientId || !clientSecret) {
    throw new Error("请先填写 client_id 和 client_secret");
  }

  // 1. 启动本地回环服务器（阻塞直到收到 code 或超时）
  //    用 Promise 包装 invoke，并在打开浏览器前先发起监听。
  const codePromise = invoke<string>("start_oauth_server");

  // 2. 打开浏览器授权页
  const authUrl = new URL(`${OAUTH_BASE}/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  await openUrl(authUrl.toString());

  // 3. 等待回调 code
  const code = await codePromise;

  // 4. 用 code 换 token
  const tokenRes = await tauriFetch(`${OAUTH_BASE}/oauth/access_token`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) {
    let msg = `换取令牌失败 (${tokenRes.status})`;
    try {
      const err = await tokenRes.json();
      msg = err?.error_description || err?.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const token = (await tokenRes.json()) as OAuthTokenResponse;
  await setStore(StoreKeys.accessToken, token.access_token);
  await setStore(StoreKeys.refreshToken, token.refresh_token);
  await setStore(StoreKeys.expiresAt, Date.now() + token.expires_in * 1000);

  // 5. 获取用户资料
  const user = await getMe();
  await setStore(StoreKeys.user, user);
}
