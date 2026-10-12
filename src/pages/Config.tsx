import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, FolderOpen, Info, Loader2, LogOut, Upload } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/layout/PageLayout";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  parseBackupPayload,
  pickBackupDir,
  planRestore,
  runBackup,
  runRestore,
  type BackupPayload,
  type RestoreMode,
  type RestorePlan,
} from "@/lib/backup";
import { cn } from "@/lib/utils";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function Config() {
  // 登录态（user / needsReLogin）走 useAuthUser：会响应运行期的 auth-expired 事件。
  const { user, needsReLogin, setUser } = useAuthUser();
  const queryClient = useQueryClient();
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

  // 数据备份
  const [backupDir, setBackupDir] = useState("");
  /** 上次备份完成时间（epoch ms）；null = 从未备份。 */
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  // 数据恢复（导入）：预览 → 选模式 → 执行（进度）→ 汇总
  const [restorePreview, setRestorePreview] = useState<{
    path: string;
    payload: BackupPayload;
    plan: RestorePlan;
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("skip");
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ done: number; total: number } | null>(null);

  // OAuth 交互选项
  const [mode, setMode] = useState<OAuthMode>("auto");
  /** 固定端口 7359（默认关，开启动态端口）。 */
  const [fixedPort, setFixedPort] = useState(false);
  /** 手动模式：用户粘贴的授权码。 */
  const [manualCode, setManualCode] = useState("");
  /** 复制回调地址的反馈。 */
  const [copied, setCopied] = useState(false);
  /** 凭据获取向导展开状态（首访默认展开，降低注册门槛）。 */
  const [guideOpen, setGuideOpen] = useState(true);

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
    const [id, secret, proxy, fixed, bDir, bLast] = await Promise.all([
      getStore<string>(StoreKeys.clientId),
      getStore<string>(StoreKeys.clientSecret),
      getStore<ProxyConfig>(StoreKeys.proxy),
      getStore<boolean>(StoreKeys.oauthFixedPort),
      getStore<string>(StoreKeys.backupDir),
      getStore<number>(StoreKeys.backupLastTime),
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
    setBackupDir(bDir ?? "");
    setLastBackupAt(typeof bLast === "number" ? bLast : null);
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

  /** 选择/更换备份目录并记住，之后备份直接使用，无需再选。 */
  async function handlePickBackupDir() {
    try {
      const dir = await pickBackupDir(backupDir || undefined);
      if (!dir) return; // 用户取消
      setBackupDir(dir);
      await setStore(StoreKeys.backupDir, dir);
    } catch (err) {
      toast.error("选择目录失败", { description: errText(err) });
    }
  }

  /** 在系统资源管理器中打开当前备份目录（目录未选或已被删除时由 opener 报错提示）。 */
  async function handleOpenBackupDir() {
    if (!backupDir) return;
    try {
      await openPath(backupDir);
    } catch (err) {
      toast.error("打开目录失败", { description: errText(err) });
    }
  }

  /** 立即备份：未选目录时先弹选择（取消则静默中止），完成后记录时间并 toast 路径。 */
  async function handleBackup() {
    if (!user || backingUp) return;
    setBackingUp(true);
    try {
      let dir = backupDir;
      if (!dir) {
        const picked = await pickBackupDir();
        if (!picked) return;
        dir = picked;
        setBackupDir(dir);
        await setStore(StoreKeys.backupDir, dir);
      }
      const { path, total } = await runBackup(user.username, dir, queryClient);
      const now = Date.now();
      setLastBackupAt(now);
      await setStore(StoreKeys.backupLastTime, now);
      toast.success(`已备份 ${total} 条收藏`, { description: path });
    } catch (err) {
      toast.error("备份失败", { description: errText(err) });
    } finally {
      setBackingUp(false);
    }
  }

  /** 选择备份文件：读取 → 解析校验 → 与当前收藏对比出恢复计划 → 弹预览。 */
  async function handlePickRestoreFile() {
    if (!user || restoring) return;
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        title: "选择备份文件",
        filters: [{ name: "备份 JSON", extensions: ["json"] }],
      });
      if (!picked || Array.isArray(picked)) return; // 用户取消
      const text = await invoke<string>("read_text_file", { path: picked });
      const payload = parseBackupPayload(text);
      const plan = await planRestore(user.username, payload, queryClient);
      setRestoreMode("skip");
      setRestorePreview({ path: picked, payload, plan });
    } catch (err) {
      toast.error("读取备份失败", { description: errText(err) });
    }
  }

  /** 执行恢复：完成后全量失效收藏缓存（显式全量操作，允许全量重拉）并 toast 汇总。 */
  async function handleRestore() {
    if (!restorePreview || !user || restoring) return;
    setRestoring(true);
    setRestoreProgress({ done: 0, total: 0 });
    try {
      const result = await runRestore(
        restorePreview.plan,
        restoreMode,
        (done, total) => setRestoreProgress({ done, total }),
      );
      await queryClient.invalidateQueries({ queryKey: ["collections"] });
      await queryClient.invalidateQueries({ queryKey: ["collection"] });
      setRestorePreview(null);
      const notes = [
        result.failed.length > 0 ? `${result.failed.length} 条失败` : null,
        result.tagsDropped > 0 ? `${result.tagsDropped} 条的个人标签未恢复` : null,
      ].filter(Boolean);
      toast.success(
        `恢复完成：新增 ${result.added} 条${
          restoreMode === "overwrite" ? `、覆盖 ${result.patched} 条` : ""
        }`,
        notes.length > 0 ? { description: notes.join("；") } : undefined,
      );
    } catch (err) {
      toast.error("恢复失败", { description: errText(err) });
    } finally {
      setRestoring(false);
      setRestoreProgress(null);
    }
  }

  // ===== 由 phase 派生的交互态 =====
  const phaseKind = phase.kind;
  const inFlow =
    phaseKind !== "idle" && phaseKind !== "success" && phaseKind !== "error" &&
    phaseKind !== "cancelled";
  const isManualWaiting =
    phaseKind === "waiting-code" && phase.mode === "manual";

  return (
    <PageLayout title="配置">
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" />
          加载数据中...
        </div>
      ) : (
        <div className="mx-auto max-w-xl space-y-6">
      {user ? (
        <section className="space-y-4 rounded-lg border border-border p-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              {/* large 档：64px 容器在高 DPI 下 medium 偏糊 */}
              <AvatarImage src={user.avatar.large} alt={user.nickname} />
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

          {/* 凭据获取向导：分步指引，可折叠（与搜索历史折叠交互一致） */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setGuideOpen((o) => !o)}
              title={guideOpen ? "折叠" : "展开"}
              className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  !guideOpen && "-rotate-90",
                )}
              />
              如何创建应用？（约 1 分钟）
            </button>
            {guideOpen && (
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                <li>
                  打开{" "}
                  <a
                    href="https://bgm.tv/dev/app"
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline"
                  >
                    bgm.tv 开发者后台
                  </a>{" "}
                  并登录 Bangumi 账号。
                </li>
                <li>
                  点击「创建新应用」：名称随意填（如「个人追番」），其余保持默认即可——
                  默认的动态端口模式下<strong className="font-medium">无需登记回调地址</strong>。
                </li>
                <li>
                  创建后在应用列表找到它，复制 App ID 与 App Secret 填入下方输入框，
                  点击「Bangumi 认证」完成登录。
                </li>
              </ol>
            )}
          </div>
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

      <section className="space-y-4 rounded-lg border border-border p-5">
        <div className="flex items-center gap-1.5 text-lg font-semibold">
          数据备份
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="cursor-help text-muted-foreground hover:text-foreground"
                aria-label="备份说明"
              >
                <Info className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-72 space-y-1.5">
              <p>
                范围：动画、书籍、音乐、游戏、三次元 5
                类收藏，包含每条的评分、进度、备注、标签与私密标记
              </p>
              <p>文件：每次备份生成一个带时间戳的新文件，不覆盖历史备份</p>
              <p>目录：记住上次选择，之后点「立即备份」即可再次导出</p>
              <p>
                恢复：增量恢复（新增缺失收藏，可选覆盖已收藏）；不删除现有收藏，不含网页端逐集勾选
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-sm text-muted-foreground">
          将全部收藏导出为 JSON 文件保存到本地目录；数据丢失时可通过「从备份恢复」增量找回。
        </p>
        {user ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="backup-dir">备份目录</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="backup-dir"
                  value={backupDir}
                  readOnly
                  placeholder="尚未选择，点击右侧按钮选择"
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePickBackupDir}
                  disabled={backingUp}
                  title="选择备份目录"
                >
                  <FolderOpen className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenBackupDir}
                  disabled={!backupDir}
                  title="在资源管理器中打开"
                >
                  <ExternalLink className="size-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              上次备份：
              {lastBackupAt
                ? new Date(lastBackupAt).toLocaleString()
                : "从未备份"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleBackup} disabled={backingUp || restoring}>
                {backingUp ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> 备份中…
                  </>
                ) : (
                  "立即备份"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handlePickRestoreFile}
                disabled={restoring || backingUp}
              >
                <Upload className="size-4" /> 从备份恢复…
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            备份需要先登录 Bangumi 账号。
          </p>
        )}
      </section>
      </div>
      )}

      {/* 恢复预览/进度对话框：执行中禁止关闭 */}
      <Dialog
        open={!!restorePreview}
        onOpenChange={(o) => {
          if (!restoring) setRestorePreview(o ? restorePreview : null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>从备份恢复</DialogTitle>
            <DialogDescription>
              增量恢复：新增缺失收藏并恢复其收藏夹/评分/进度/备注，不会删除当前账号已有的收藏。
            </DialogDescription>
          </DialogHeader>
          {restoring ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                恢复中…
                {restoreProgress && restoreProgress.total > 0
                  ? ` ${restoreProgress.done} / ${restoreProgress.total}`
                  : ""}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${
                      restoreProgress && restoreProgress.total > 0
                        ? Math.min(
                            100,
                            (restoreProgress.done / restoreProgress.total) * 100,
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          ) : restorePreview ? (
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                <p
                  className="truncate text-muted-foreground"
                  title={restorePreview.path}
                >
                  文件：{restorePreview.path}
                </p>
                <p className="text-muted-foreground">
                  导出自 {restorePreview.payload.username} ·{" "}
                  {new Date(restorePreview.payload.exportedAt).toLocaleString()}{" "}
                  · 共 {restorePreview.plan.total} 条
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p>
                  当前账号未收藏：
                  <strong>{restorePreview.plan.toAdd.length}</strong>
                  条（将新增并恢复字段）
                </p>
                <p>
                  已收藏：
                  <strong>{restorePreview.plan.toPatch.length}</strong>
                  条
                  {restoreMode === "overwrite"
                    ? "（将被备份覆盖）"
                    : "（保持不动）"}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm">已收藏条目的处理方式：</p>
                <div className="inline-flex rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setRestoreMode("skip")}
                    className={cn(
                      "rounded px-3 py-1 text-sm",
                      restoreMode === "skip"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    跳过（推荐）
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestoreMode("overwrite")}
                    className={cn(
                      "rounded px-3 py-1 text-sm",
                      restoreMode === "overwrite"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    用备份覆盖
                  </button>
                </div>
                {restoreMode === "overwrite" && (
                  <p className="text-xs text-destructive">
                    覆盖将改写这些条目当前的收藏夹、评分、进度与备注，请确认备份较新。
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRestorePreview(null)}
                >
                  取消
                </Button>
                <Button
                  onClick={handleRestore}
                  disabled={
                    (restoreMode === "skip"
                      ? restorePreview.plan.toAdd.length
                      : restorePreview.plan.total) === 0
                  }
                >
                  {(restoreMode === "skip"
                    ? restorePreview.plan.toAdd.length
                    : restorePreview.plan.total) === 0
                    ? "无需恢复"
                    : "开始恢复"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
