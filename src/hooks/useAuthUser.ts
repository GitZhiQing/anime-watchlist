import { useEffect, useState } from "react";
import { StoreKeys, getStore } from "@/lib/store";
import type { BgmUser } from "@/types/bgm";

/** 读取本地缓存的已登录用户（null 表示未认证）。 */
export function useAuthUser() {
  const [user, setUser] = useState<BgmUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStore<BgmUser>(StoreKeys.user)
      .then((u) => setUser(u ?? null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, setUser };
}
