import { useEffect, useRef, useState } from "react";
import { getStore, setStore } from "@/lib/store";

/**
 * 持久化到 Store 插件（config.json）的 state。
 * 初次挂载异步读取已存值（读到 undefined 则保持初始值）；
 * 加载完成后的每次变更写回。仅适合界面偏好这类低频小数据。
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getStore<T>(key).then((v) => {
      if (!cancelled && v !== undefined && v !== null) setValue(v);
      loaded.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (loaded.current) setStore(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
