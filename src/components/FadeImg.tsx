import { useEffect, useRef, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** 加载完成后淡入的封面图（缓存的图片若在挂载前已加载完，直接视为已加载）。
 *  加载失败时退出淡入隐藏：保持可见让浏览器渲染 alt 占位，用户能看出是裂图而非空白。 */
export function FadeImg({
  className,
  onLoad,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // 缓存命中时 onLoad 可能不触发
  useEffect(() => {
    if (ref.current?.complete) {
      if (ref.current.naturalWidth === 0) setFailed(true);
      else setLoaded(true);
    }
  }, []);

  return (
    <img
      loading="lazy"
      decoding="async"
      {...props}
      ref={ref}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
      className={cn(
        "transition-opacity duration-300",
        failed || loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
