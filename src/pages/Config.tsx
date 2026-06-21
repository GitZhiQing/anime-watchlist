import { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { REDIRECT_URI } from "@/lib/bgm";
import { startOAuthLogin } from "@/lib/auth";
import {
  StoreKeys,
  clearAuth,
  getStore,
  setStore,
} from "@/lib/store";
import type { BgmUser } from "@/types/bgm";

export function Config() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [user, setUser] = useState<BgmUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshState() {
    setLoading(true);
    const [id, secret, u] = await Promise.all([
      getStore<string>(StoreKeys.clientId),
      getStore<string>(StoreKeys.clientSecret),
      getStore<BgmUser>(StoreKeys.user),
    ]);
    setClientId(id ?? "");
    setClientSecret(secret ?? "");
    setUser(u ?? null);
    setLoading(false);
  }

  useEffect(() => {
    refreshState();
  }, []);

  async function saveCredentials() {
    await setStore(StoreKeys.clientId, clientId.trim());
    await setStore(StoreKeys.clientSecret, clientSecret.trim());
  }

  async function handleAuth() {
    setError(null);
    setBusy(true);
    try {
      await saveCredentials();
      await startOAuthLogin();
      await refreshState();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await clearAuth();
    await refreshState();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 加载中…
      </div>
    );
  }

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
            注册一个应用，并把回调地址设为：
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">
              {REDIRECT_URI}
            </code>
          </p>
          <div className="space-y-2">
            <Label htmlFor="client-id">Client ID</Label>
            <Input
              id="client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="应用的 Client ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-secret">Client Secret</Label>
            <Input
              id="client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="应用的 Client Secret"
            />
          </div>
          <Button
            onClick={handleAuth}
            disabled={busy || !clientId.trim() || !clientSecret.trim()}
            className="w-full"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 等待授权…
              </>
            ) : (
              "Bangumi 认证"
            )}
          </Button>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </section>
      )}
    </div>
  );
}
