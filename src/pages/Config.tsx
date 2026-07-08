import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { REDIRECT_URI } from "@/lib/bgm";
import { invalidateProxyCache, testProxy } from "@/lib/proxy";
import {
  StoreKeys,
  clearAuth,
  deleteStore,
  getStore,
  setStore,
} from "@/lib/store";
import type { ProxyConfig } from "@/lib/store";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useOAuthFlow, type OAuthMode } from "@/hooks/useOAuthFlow";
import { cn } from "@/lib/utils";

export function Config() {
  // 登录态（user / needsReLogin）走 useAuthUser：会响应运行期的 auth-expired 事件。
  const { user, needsReLogin, setUser } = useAuthUser();
  // OAuth 交互状态机：phase 驱动按钮/倒计时/取消/手动粘贴等全部 UI。
  const { phase, start, cancel, submitManualCode, reset } = useOAuthFlow();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyUser, setProxyUser] = useState("");
  const [proxyPass, setProxyPass] = useState("");
  /** 最近一次落库的代理配置快照，用于判断表单是否有未保存改动。 */
  const [savedProxy, setSavedProxy] = useState<ProxyConfig | null>(null);
  const [testing, setTesting] = useState(false);
  /** 保存成功后短暂置 true，配合徽章 + 自动淡出。 */
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [proxyMsg, setProxyMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // OAuth 交互选项
  const [mode, setMode] = useState<OAuthMode>("auto");
  /** 固定端口 7359（默认关，开启动态端口）。 */
  const [fixedPort, setFixedPort] = useState(false);
  /** 手动模式：用户粘贴的授权码。 */
  const [manualCode, setManualCode] = useState("");
  /** 复制回调地址的反馈。 */
  const [copied, setCopied] = useState(false);

  /** 用户编辑任一代理字段时：清除「已保存」闪烁态与遗留的测试/保存文案。 */
  function onProxyEdit() {
    setProxyMsg(null);
    if (savedTimer.current) {
      clearTimeout(savedTimer.current);
      savedTimer.current = null;
    }
    setJustSaved(false);
  }

  async function refreshState() {
    setLoading(true);
    const [id, secret, proxy, fixed] = await Promise.all([
      getStore<string>(StoreKeys.clientId),
      getStore<string>(StoreKeys.clientSecret),
      getStore<ProxyConfig>(StoreKeys.proxy),
      getStore<boolean>(StoreKeys.oauthFixedPort),
    ]);
    setClientId(id ?? "");
    setClientSecret(secret ?? "");
    setProxyUrl(proxy?.url ?? "");
    setProxyUser(proxy?.username ?? "");
    setProxyPass(proxy?.password ?? "");
    setSavedProxy(
      proxy
        ? { url: proxy.url, username: proxy.username, password: proxy.password }
        : null,
    );
    setFixedPort(fixed === true);
    setLoading(false);
  }

  /** 表单当前值是否与已保存配置不同（用户存在未保存的改动）。 */
  const proxyDirty = useMemo(() => {
    const cur = {
      url: proxyUrl.trim(),
      username: proxyUser.trim(),
      password: proxyPass,
    };
    const saved = savedProxy
      ? {
          url: savedProxy.url.trim(),
          username: savedProxy.username?.trim() ?? "",
          password: savedProxy.password ?? "",
        }
      : { url: "", username: "", password: "" };
    return (
      cur.url !== saved.url ||
      cur.username !== saved.username ||
      cur.password !== saved.password
    );
  }, [proxyUrl, proxyUser, proxyPass, savedProxy]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  useEffect(() => {
    refreshState();
  }, []);

  // 手动模式：回调服务器收到 code 后自动填入输入框
  useEffect(() => {
    if (
      phase.kind === "waiting-code" &&
      phase.mode === "manual" &&
      phase.receivedCode &&
      !manualCode
    ) {
      setManualCode(phase.receivedCode);
    }
  }, [phase, manualCode]);

  async function saveCredentials() {
    await setStore(StoreKeys.clientId, clientId.trim());
    await setStore(StoreKeys.clientSecret, clientSecret.trim());
    await setStore(StoreKeys.oauthFixedPort, fixedPort);
  }

  async function handleAuth() {
    await saveCredentials();
    setManualCode("");
    await start(mode, fixedPort);
  }

  async function handleToggleFixedPort(checked: boolean) {
    setFixedPort(checked);
    await setStore(StoreKeys.oauthFixedPort, checked);
  }

  async function copyRedirectUri() {
    try {
      await navigator.clipboard.writeText(REDIRECT_URI);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function handleLogout() {
    await clearAuth();
    setUser(null);
    await refreshState();
  }

  /** 用表单当前值测试代理连通性（无需先保存）。 */
  async function handleTestProxy() {
    setProxyMsg(null);
    setTesting(true);
    try {
      const result = await testProxy({
        url: proxyUrl,
        username: proxyUser,
        password: proxyPass,
      });
      setProxyMsg(
        result.ok
          ? { type: "ok", text: "代理可用，已成功连接 Bangumi" }
          : { type: "err", text: result.message },
      );
    } finally {
      setTesting(false);
    }
  }

  /** 标记「已保存」徽章，约 3s 后自动淡出回到干净态。 */
  function flashSaved() {
    setJustSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 3000);
  }

  /** 保存代理配置；地址为空则视为关闭代理。 */
  async function handleSaveProxy() {
    setProxyMsg(null);
    if (!proxyUrl.trim()) {
      await deleteStore(StoreKeys.proxy);
      invalidateProxyCache();
      setSavedProxy(null);
      setProxyMsg({ type: "ok", text: "已清除代理，请求将直连" });
      flashSaved();
      return;
    }
    const cfg: ProxyConfig = {
      url: proxyUrl.trim(),
      username: proxyUser.trim(),
      password: proxyPass,
    };
    await setStore(StoreKeys.proxy, cfg);
    invalidateProxyCache();
    setSavedProxy(cfg);
    setProxyMsg({ type: "ok", text: "代理已保存，对所有请求立即生效" });
    flashSaved();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 加载中…
      </div>
    );
  }

  // ===== 由 phase 派生的交互态 =====
  const phaseKind = phase.kind;
  const inFlow =
    phaseKind !== "idle" && phaseKind !== "success" && phaseKind !== "error" &&
    phaseKind !== "cancelled";
  const isManualWaiting =
    phaseKind === "waiting-code" && phase.mode === "manual";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {user ? (
        <section className="space-y-4 rounded-lg border border-border p-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarImage src={user.avatar.medium} alt={user.nickname} />
              <AvatarFallback>
                {user.nickname.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <div className="text-lg font-semibold">{user.nickname}</div>
              <div className="text-sm text-muted-foreground">
                @{user.username}
              </div>
              {user.sign && (
                <div className="text-sm text-muted-foreground line-clamp-2">
                  {user.sign}
                </div>
              )}
            </div>
          </div>
          <Separator />
          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full"
          >
            <LogOut className="size-4" /> 注销
          </Button>
        </section>
      ) : (
        <section className="space-y-4 rounded-lg border border-border p-5">
          {needsReLogin ? (
            <p className="text-sm text-destructive">
              会话已失效，请重新认证。
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              请先在{" "}
              <a
                href="https://bgm.tv/dev/app"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                bgm.tv 开发者后台
              </a>{" "}
              注册一个应用，然后将 App ID 和 App Secret 填入下方。
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="client-id">App ID</Label>
            <Input
              id="client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="应用的 App ID"
              disabled={inFlow}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-secret">App Secret</Label>
            <Input
              id="client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="应用的 App Secret"
              disabled={inFlow}
            />
          </div>

          {/* 模式切换 + 固定端口开关 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-md border border-border p-0.5">
              <button
                type="button"
                disabled={inFlow}
                onClick={() => setMode("auto")}
                className={cn(
                  "rounded px-3 py-1 text-sm",
                  mode === "auto"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                自动
              </button>
              <button
                type="button"
                disabled={inFlow}
                onClick={() => setMode("manual")}
                className={cn(
                  "rounded px-3 py-1 text-sm",
                  mode === "manual"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                手动
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={fixedPort}
                disabled={inFlow}
                onCheckedChange={(v) => void handleToggleFixedPort(v === true)}
              />
              固定端口 7359
            </label>
          </div>

          {/* 回调地址说明 / 展示 */}
          {fixedPort ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                固定端口模式需在开发者后台登记以下回调地址：
              </p>
              <div className="flex items-center gap-2">
                <Input value={REDIRECT_URI} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyRedirectUri}
                  title="复制回调地址"
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              回调地址由应用自动选择本地端口（7359–7369），无需在开发者后台登记。
            </p>
          )}

          {/* 主按钮 / 状态文本，由 phase 驱动 */}
          {phaseKind === "waiting-code" && phase.mode === "auto" ? (
            <div className="flex items-center gap-2">
              <Button disabled className="flex-1">
                <Loader2 className="size-4 animate-spin" /> 等待授权… 剩余 {phase.remaining}s
              </Button>
              <Button variant="outline" onClick={cancel}>
                取消
              </Button>
            </div>
          ) : phaseKind === "starting-server" ? (
            <Button disabled className="w-full">
              <Loader2 className="size-4 animate-spin" /> 准备回调服务…
            </Button>
          ) : phaseKind === "exchanging" ? (
            <Button disabled className="w-full">
              <Loader2 className="size-4 animate-spin" /> 换取令牌中…
            </Button>
          ) : phaseKind === "fetching-profile" ? (
            <Button disabled className="w-full">
              <Loader2 className="size-4 animate-spin" /> 获取用户资料…
            </Button>
          ) : phaseKind === "cancelled" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">已取消认证。</p>
              <Button onClick={reset} className="w-full">
                重新认证
              </Button>
            </div>
          ) : phaseKind === "error" ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{phase.message}</p>
              {phase.tokenAlreadyStored && (
                <p className="text-sm text-muted-foreground">
                  已获取授权，但拉取用户资料失败。请重启应用或切换到其他标签页后返回，资料将自动补全。
                </p>
              )}
              <Button onClick={reset} className="w-full">
                重试
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleAuth}
              disabled={!clientId.trim() || !clientSecret.trim()}
              className="w-full"
            >
              Bangumi 认证
            </Button>
          )}

          {/* 手动模式：粘贴授权码 */}
          {isManualWaiting && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {manualCode
                  ? "授权码已自动填入，确认无误后点击提交。"
                  : "浏览器授权后授权码将自动填入，请稍候…"}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="粘贴授权码 code"
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  onClick={cancel}
                >
                  取消
                </Button>
                <Button
                  onClick={() => void submitManualCode(manualCode)}
                  disabled={!manualCode.trim()}
                >
                  提交
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="space-y-4 rounded-lg border border-border p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">网络代理</div>
          {/* 编辑/保存状态徽章 */}
          {justSaved ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-500">
              <Check className="size-3" /> 已保存
            </span>
          ) : proxyDirty ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-500">
              未保存修改
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {savedProxy ? "已保存" : "未配置"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          所有 Bangumi 请求将经此代理转发，用于在受限网络环境下访问 API。留空并保存即为关闭，恢复直连。
        </p>
        <div className="space-y-2">
          <Label htmlFor="proxy-url">代理地址</Label>
          <Input
            id="proxy-url"
            value={proxyUrl}
            onChange={(e) => {
              setProxyUrl(e.target.value);
              onProxyEdit();
            }}
            placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="proxy-user">用户名（可选）</Label>
            <Input
              id="proxy-user"
              value={proxyUser}
              onChange={(e) => {
                setProxyUser(e.target.value);
                onProxyEdit();
              }}
              placeholder="需要 Basic 认证时填写"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proxy-pass">密码（可选）</Label>
            <Input
              id="proxy-pass"
              type="password"
              value={proxyPass}
              onChange={(e) => {
                setProxyPass(e.target.value);
                onProxyEdit();
              }}
              placeholder="需要 Basic 认证时填写"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleTestProxy}
            disabled={testing || !proxyUrl.trim()}
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 测试中…
              </>
            ) : (
              "测试连接"
            )}
          </Button>
          <Button onClick={handleSaveProxy} disabled={!proxyDirty}>
            {proxyDirty ? "保存" : "无需保存"}
          </Button>
        </div>
        {proxyMsg && (
          <p
            className={cn(
              "text-sm",
              proxyMsg.type === "ok"
                ? "text-emerald-600 dark:text-emerald-500"
                : "text-destructive",
            )}
          >
            {proxyMsg.text}
          </p>
        )}
      </section>
    </div>
  );
}
