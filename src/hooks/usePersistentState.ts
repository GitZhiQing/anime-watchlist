import { useEffect, useRef, useState } from "react";
import { getStore, setStore } from "@/lib/store";

/**
 * 持久化到 Store 插件（config.json）的 state。
 * 初次挂载异步读取已存值（读到 undefined 则保持初始值）；
 * 加载完成后的每次变更写回。仅适合界面偏好这类低频小数据。
 * 注意：initial 需为稳定字面量（不随渲染变化），本 hook 不将其列入读取 effect 依赖。
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // 同实例换 key：回到初始值并重置加载态，避免旧 key 的当前值被写入新 key
    loaded.current = false;
    setValue(initial);
    getStore<T>(key)
      .then((v) => {
        if (cancelled) return;
        if (v !== undefined && v !== null) setValue(v);
        loaded.current = true;
      })
      .catch((e) => {
        // 读取失败：保持 loaded=false 不写回，避免用 initial 覆盖可能存在的已存值
        console.warn(`[prefs] 读取 ${key} 失败`, e);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    // 后台写回，失败只警告不中断（Store IO 异常不应产生未捕获的 promise rejection）
    if (loaded.current)
      setStore(key, value).catch((e) =>
        console.warn(`[prefs] 写入 ${key} 失败`, e),
      );
  }, [key, value]);

  return [value, setValue] as const;
}
