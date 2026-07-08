import type { RefObject, ReactNode } from "react";

interface PageLayoutProps {
  title: ReactNode;
  /** 标题栏右侧的工具栏 */
  toolbar?: ReactNode;
  children: ReactNode;
  /** 内容区滚动容器的 ref，用于程序化滚动 */
  scrollRef?: RefObject<HTMLDivElement | null>;
}

/** 通用页面布局：固定标题栏 + 可滚动内容区 */
export function PageLayout({ title, toolbar, children, scrollRef }: PageLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-6 py-2">
        <h1 className="min-w-0 text-lg font-semibold">{title}</h1>
        {toolbar && <div className="ml-auto flex shrink-0 items-center gap-2">{toolbar}</div>}
      </header>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  );
}
