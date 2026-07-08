import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { initAuth } from "@/lib/auth";
import { StoreKeys, getStore } from "@/lib/store";
import type { BgmUser } from "@/types/bgm";

/**
 * 登录用户与认证状态 —— 模块单例实现。
 *
 * 为什么用单例：App.tsx / Config.tsx / Collection.tsx / CollectAction.tsx 都调用
 * useAuthUser()，旧实现每个实例各自 initAuth() + 各自注册监听器，导致启动时
 * 双重刷新、双重监听。改为模块级共享一份 state：initAuth 只跑一次，监听器只注册
 * 一次，所有组件经 useSyncExternalStore 订阅同一快照。
 *
 * loading 兜底：initAuth 的 Promise 包了 .catch，任何未预期抛错都置
 * loading=false/user=null，避免应用永久卡在「加载中…」。
 */
interface AuthState {
  user: BgmUser | null;
  needsReLogin: boolean;
  loading: boolean;
}

let state: AuthState = { user: null, needsReLogin: false, loading: true };
let initStarted = false;
const listeners = new Set<() => void>();

function setState(next: Partial<AuthState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AuthState {
  return state;
}

/** 启动初始化 + 注册事件监听，整个应用生命周期只执行一次。 */
function ensureInit(): void {
  if (initStarted) return;
  initStarted = true;

  initAuth()
    .then((r) =>
      setState({ user: r.user, needsReLogin: r.needsReLogin, loading: false }),
    )
    .catch((e) => {
      // 兜底：initAuth 抛错也不卡 UI，按未登录处理。
      console.error("initAuth 失败：", e);
      setState({ user: null, needsReLogin: false, loading: false });
    });

  // 运行期令牌失效（bgm.ts 在 401 刷新被拒时 emit）
  void listen("auth-expired", () => {
    setState({ user: null, needsReLogin: true });
  });

  // 登录成功 / initAuth 刷新完成时，同步 store 中的用户到所有实例
  void listen("auth-login", async () => {
    const u = await getStore<BgmUser>(StoreKeys.user);
    setState({ user: u ?? null, needsReLogin: false });
  });
}

/** 写入用户并清除「会话失效」标记（登录成功或主动注销时调用）。 */
export function setAuthUser(u: BgmUser | null): void {
  setState({ user: u, needsReLogin: false });
}

export function useAuthUser() {
  ensureInit();
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snap, setUser: setAuthUser };
}
