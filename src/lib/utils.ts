import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 自定义时长的平滑滚动 —— 浏览器原生的 behavior:"smooth" 时长不可控且偏慢。
 * 用 easeOutQuad 缓动驱动 scrollTop,默认 300ms。
 */
export function smoothScrollTo(
  container: HTMLElement,
  targetTop: number,
  duration = 300,
) {
  const startTop = container.scrollTop;
  const delta = targetTop - startTop;
  if (delta === 0) return;
  const start = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    // easeOutQuad:快速起步,接近终点时减速
    const eased = 1 - (1 - t) * (1 - t);
    container.scrollTop = startTop + delta * eased;
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
