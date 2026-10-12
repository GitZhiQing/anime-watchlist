import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 系统是否开启「减弱动效」（平滑滚动等 JS 驱动的动画需自行判断降级） */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 自定义时长的平滑滚动 —— 浏览器原生的 behavior:"smooth" 时长不可控且偏慢。
 * 用 easeOutQuad 缓动驱动 scrollTop,默认 300ms。系统「减弱动效」时直接跳到位。
 */
export function smoothScrollTo(
  container: HTMLElement,
  targetTop: number,
  duration = 300,
) {
  const startTop = container.scrollTop;
  const delta = targetTop - startTop;
  if (delta === 0) return;
  if (prefersReducedMotion()) {
    container.scrollTop = targetTop;
    return;
  }
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

/**
 * 日期统一工具。Bangumi 的 date 形如 "2024-10-05"（部分带时间后缀），
 * 显示统一截取 "YYYY-MM-DD" 前缀。
 * 注意：new Date("YYYY-MM-DD") 按 UTC 解析（与本地时刻差数小时），
 * 涉及与「现在」比较时用 isFutureDate（本地时区构造），勿直接 new Date(iso)。
 */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : iso;
}

/** 日期是否还未到（本地时区判定，避免 UTC 解析导致 ±8h 偏差） */
export function isFutureDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getTime() > Date.now();
}

/** 时间戳 → "2026/10/12 15:04"。显式 zh-CN，避免随系统 locale 显示英文格式 */
export function fmtDateTime(input: number | string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(input));
}
