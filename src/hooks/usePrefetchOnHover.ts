import { useEffect, useRef } from "react";
import { usePrefetchSubject } from "@/lib/queries";

/**
 * 悬停意图预取：hover/聚焦 300ms 后预取条目详情，移开取消。
 * 列表行（SubjectRow）、网格卡片（SubjectGridCard）、p1 海报卡共用同一防抖节奏；
 * staleTime 内重复预取零请求。
 */
export function usePrefetchOnHover() {
  const prefetchSubject = usePrefetchSubject();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return {
    schedule(id: number) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => prefetchSubject(id), 300);
    },
    cancel() {
      window.clearTimeout(timer.current);
    },
  };
}
