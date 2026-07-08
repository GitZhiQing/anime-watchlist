// OAuth 授权交互状态机。
//
// 取代旧 startOAuthLogin 的单体阻塞 await：把流程拆成显式阶段，让 UI 由 phase 驱动，
// 并在「等待回调」期间提供 120s 倒计时与随时取消（调用 stop_oauth_server）。
//
// 模式：
// - auto（默认）：启动 Rust 回调服务器（动态端口），等浏览器回调 code，校验 state。
//   端口全部被占时自动回退 manual。
// - manual：不启动服务器，用户从地址栏复制 code 粘贴提交。可控性最高。
//
// 动态端口时序：start_oauth_server 绑定端口后立即 emit "oauth-port" 推给 JS，
// JS 拿到 port → 构造动态 redirect_uri → 打开授权页 → 再 await 该命令返回的 code。
// 这样授权 URL 的 redirect_uri 与实际监听端口一致（避免 redirect_uri_mismatch）。
import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  buildAuthorizeUrl,
  buildRedirectUri,
  cancelCallbackServer,
  exchangeAndStore,
  fetchAndStoreUser,
  generateState,
  openAuthorizeUrl,
  startCallbackServer,
} from "@/lib/auth";
import { REDIRECT_URI } from "@/lib/bgm";
import { StoreKeys, getStore } from "@/lib/store";

export type OAuthMode = "auto" | "manual";

export type OAuthPhase =
  | { kind: "idle" }
  | { kind: "starting-server" }
  | { kind: "waiting-code"; remaining: number; mode: OAuthMode; receivedCode?: string }
  | { kind: "exchanging" }
  | { kind: "fetching-profile" }
  | { kind: "success" }
  | { kind: "error"; message: string; tokenAlreadyStored: boolean }
  | { kind: "cancelled" };

const WAIT_SECONDS = 120;

export function useOAuthFlow() {
  const [phase, setPhase] = useState<OAuthPhase>({ kind: "idle" });
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const stateRef = useRef<string>(""); // CSRF state
  const redirectUriRef = useRef<string>(REDIRECT_URI); // 动态回调地址
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 记录当前流程要用的 clientId/secret（submitManualCode / 兜底时取用）。
  const credsRef = useRef<{ clientId: string; clientSecret: string } | null>(
    null,
  );

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  /** 启动 auto 模式倒计时：每秒递减，到 0 自动取消。 */
  function startCountdown() {
    clearTimer();
    let remaining = WAIT_SECONDS;
    setPhase({ kind: "waiting-code", remaining, mode: "auto" });
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearTimer();
        cancel();
        return;
      }
      setPhase({ kind: "waiting-code", remaining, mode: "auto" });
    }, 1000);
  }

  /** 手动模式 / 自动模式端口全占回退：
   * 启动固定端口回调服务器 → 打开浏览器 → 等待 code → 展示结果页 + 自动填入。
   * 服务器启动失败或无 code 时保留旧行为（用户从地址栏复制粘贴）。 */
  async function fallbackToManual(
    clientId: string,
    clientSecret: string,
    state: string,
  ) {
    redirectUriRef.current = REDIRECT_URI;
    credsRef.current = { clientId, clientSecret };

    setPhase({ kind: "starting-server" });
    await cancelCallbackServer();

    let codePromise: ReturnType<typeof startCallbackServer>;
    try {
      codePromise = startCallbackServer(true); // fixed port 7359
    } catch {
      // invoke 本身不应同步抛错，此处仅防卫
      setPhase({ kind: "waiting-code", remaining: 0, mode: "manual" });
      await openAuthorizeUrl(
        buildAuthorizeUrl(clientId, redirectUriRef.current, state),
      );
      return;
    }

    await openAuthorizeUrl(
      buildAuthorizeUrl(clientId, redirectUriRef.current, state),
    );
    setPhase({ kind: "waiting-code", remaining: 0, mode: "manual" });

    try {
      const result = await codePromise;
      if (cancelRef.current.cancelled) {
        setPhase({ kind: "cancelled" });
        return;
      }
      if (result.state !== stateRef.current) {
        setPhase({
          kind: "error",
          message: "CSRF 校验失败（state 不匹配），请重试",
          tokenAlreadyStored: false,
        });
        return;
      }
      // 将收到的 code 随 phase 传递，Config 中 useEffect 自动填入输入框
      setPhase({
        kind: "waiting-code",
        remaining: 0,
        mode: "manual",
        receivedCode: result.code,
      });
    } catch (e) {
      if (cancelRef.current.cancelled) {
        setPhase({ kind: "cancelled" });
        return;
      }
      // 超时 / 端口被占 → 保持 waiting-code 状态，用户仍可手动粘贴
      // phase 已是 waiting-code，无需额外操作
    } finally {
      await cancelCallbackServer();
    }
  }

  async function start(mode: OAuthMode, fixedPort: boolean): Promise<void> {
    const clientId = (await getStore<string>(StoreKeys.clientId))?.trim();
    const clientSecret = (await getStore<string>(StoreKeys.clientSecret))?.trim();
    if (!clientId || !clientSecret) {
      setPhase({
        kind: "error",
        message: "请先填写 App ID 和 App Secret",
        tokenAlreadyStored: false,
      });
      return;
    }
    credsRef.current = { clientId, clientSecret };
    cancelRef.current = { cancelled: false };
    const state = generateState();
    stateRef.current = state;

    if (mode === "manual") {
      await fallbackToManual(clientId, clientSecret, state);
      return;
    }

    // ===== auto 模式 =====
    setPhase({ kind: "starting-server" });
    await cancelCallbackServer(); // 清残留监听

    // 监听一次 oauth-port 事件以拿到实际绑定端口（动态端口核心）。
    let unlistenPort: UnlistenFn | undefined;
    const portReady = new Promise<number>((resolvePort) => {
      void listen<number>("oauth-port", (e) => {
        resolvePort(e.payload);
      }).then((u) => {
        unlistenPort = u;
      });
    });

    const codePromise = startCallbackServer(fixedPort);

    // codePromise 在「收到 code」时 resolve，在「绑定失败/超时/取消」时 reject。
    // 绑定若失败，port 事件不会发出，portReady 会永久挂起——故用 onlyFailure
    // 把 codePromise 的 reject 抢占进 race；成功则不干扰（成功时 port 必先到）。
    // onlyFailure：仅当 codePromise reject 时 reject，resolve 时永远挂起（不 settle），
    // 这样不会产生成功路径上的未处理 rejection。
    const onlyFailure = new Promise<never>((_, reject) => {
      codePromise.catch((e) => reject(e));
    });

    // 等待 port 事件；但若绑定失败，port 永不发出——用 onlyFailure 抢占。
    let port: number;
    try {
      port = await Promise.race([portReady, onlyFailure]);
    } catch {
      // 绑定失败（端口全被占）→ 回退手动模式（fallbackToManual 已 setPhase manual）。
      void unlistenPort?.();
      await fallbackToManual(clientId, clientSecret, state);
      return;
    }
    void unlistenPort?.();

    redirectUriRef.current = buildRedirectUri(port);
    if (cancelRef.current.cancelled) return;

    // 打开授权页（redirect_uri 用动态端口，与监听端口一致）。
    await openAuthorizeUrl(
      buildAuthorizeUrl(clientId, redirectUriRef.current, state),
    );

    // 进入等待回调阶段 + 倒计时。
    startCountdown();

    try {
      const result = await codePromise;
      clearTimer();
      if (cancelRef.current.cancelled) {
        setPhase({ kind: "cancelled" });
        return;
      }
      // CSRF 校验：state 必须与发出的一致。
      if (result.state !== stateRef.current) {
        setPhase({
          kind: "error",
          message: "CSRF 校验失败（state 不匹配），请重试",
          tokenAlreadyStored: false,
        });
        return;
      }
      setPhase({ kind: "exchanging" });
      await exchangeAndStore(
        result.code,
        clientId,
        clientSecret,
        redirectUriRef.current,
      );
      setPhase({ kind: "fetching-profile" });
      await fetchAndStoreUser();
      setPhase({ kind: "success" });
    } catch (e) {
      clearTimer();
      if (cancelRef.current.cancelled) {
        setPhase({ kind: "cancelled" });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      // 「已取消」「等待授权超时」是用户可预期的，归到 cancelled。
      if (msg === "已取消" || msg === "等待授权超时") {
        setPhase({ kind: "cancelled" });
        return;
      }
      const token = await getStore<string>(StoreKeys.accessToken);
      setPhase({
        kind: "error",
        message: msg,
        tokenAlreadyStored: !!token,
      });
    } finally {
      await cancelCallbackServer();
    }
  }

  async function submitManualCode(code: string): Promise<void> {
    if (!credsRef.current) return;
    if (cancelRef.current.cancelled) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    setPhase({ kind: "exchanging" });
    try {
      await exchangeAndStore(
        trimmed,
        credsRef.current.clientId,
        credsRef.current.clientSecret,
        redirectUriRef.current,
      );
      setPhase({ kind: "fetching-profile" });
      await fetchAndStoreUser();
      setPhase({ kind: "success" });
    } catch (e) {
      const token = await getStore<string>(StoreKeys.accessToken);
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
        tokenAlreadyStored: !!token,
      });
    }
  }

  function cancel(): void {
    cancelRef.current.cancelled = true;
    void cancelCallbackServer();
    clearTimer();
    setPhase({ kind: "cancelled" });
  }

  function reset(): void {
    cancelRef.current = { cancelled: false };
    clearTimer();
    setPhase({ kind: "idle" });
  }

  // 卸载清理
  useEffect(() => {
    return () => {
      void cancelCallbackServer();
      clearTimer();
    };
  }, []);

  return { phase, start, cancel, submitManualCode, reset };
}
