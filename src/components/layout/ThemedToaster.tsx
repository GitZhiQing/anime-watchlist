import { useEffect, useState } from "react";
import { Toaster } from "sonner";

/**
 * 跟随应用主题的全局 toast 容器。
 * 主题切换是通过 <html> 上的 dark class 实现的（见 ThemeToggle），sonner 自身
 * 不感知 class 变化，故用 MutationObserver 监听后同步 theme prop。
 */
export function ThemedToaster() {
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const sync = () =>
      setDark(document.documentElement.classList.contains("dark"));
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  return (
    <Toaster theme={dark ? "dark" : "light"} position="bottom-right" richColors closeButton />
  );
}
