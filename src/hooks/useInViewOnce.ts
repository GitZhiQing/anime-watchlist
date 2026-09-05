import { useEffect, useRef, useState } from "react";

/**
 * 元素首次进入视口（含 rootMargin 缓冲区）时置 true 并停止观察。
 * 用于懒加载：仅对滚动到可见区域的行发起补充请求，滚动再远也不会集中爆发。
 */
export function useInViewOnce<T extends HTMLElement>(rootMargin = "300px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
