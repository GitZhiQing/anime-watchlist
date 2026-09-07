import { useEffect, useRef, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** 加载完成后淡入的封面图（缓存的图片若在挂载前已加载完，直接视为已加载） */
export function FadeImg({
  className,
  onLoad,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // 缓存命中时 onLoad 可能不触发
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
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
      className={cn(
        "transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
