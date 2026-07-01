import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { initAuth } from "@/lib/auth";
import { StoreKeys, getStore } from "@/lib/store";
import type { BgmUser } from "@/types/bgm";

/**
 * 登录用户与认证状态。
 * - 挂载时调用 initAuth：必要时主动刷新令牌、校正缓存登录态。
 * - 监听 "auth-expired" 事件：运行期刷新被服务端拒绝时，bgm.ts 广播该事件，
 *   此处把状态置为未登录 + needsReLogin，驱动 UI 引导重新认证。
 * - 监听 "auth-login" 事件：登录成功或启动刷新完成后，同步读取 store 中的
 *   最新用户资料，保证所有组件实例共享同一登录态。
 */
export function useAuthUser() {
  const [user, setUser] = useState<BgmUser | null>(null);
  const [needsReLogin, setNeedsReLogin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    initAuth().then((r) => {
      if (!alive) return;
      setUser(r.user);
      setNeedsReLogin(r.needsReLogin);
      setLoading(false);
    });

    // 运行期令牌失效（bgm.ts 在 401 刷新被拒时 emit）
    const unlistenExpired = listen("auth-expired", () => {
      setUser(null);
      setNeedsReLogin(true);
    });

    // 登录成功 / initAuth 刷新完成时，同步 store 中的用户到所有实例
    const unlistenLogin = listen("auth-login", async () => {
      const u = await getStore<BgmUser>(StoreKeys.user);
      if (!alive) return;
      setUser(u ?? null);
      setNeedsReLogin(false);
    });

    return () => {
      alive = false;
      void unlistenExpired.then((u) => u());
      void unlistenLogin.then((u) => u());
    };
  }, []);

  /** 写入用户并清除"会话失效"标记（登录成功或主动注销时调用）。 */
  function markAuthenticated(u: BgmUser | null) {
    setUser(u);
    setNeedsReLogin(false);
  }

  return { user, loading, setUser: markAuthenticated, needsReLogin };
}
