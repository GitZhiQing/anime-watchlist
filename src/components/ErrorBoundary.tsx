import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 降级文案主体（如「详情」），默认「该区块」 */
  label?: string;
  /** 自定义降级渲染（根级边界用它渲染整页兜底） */
  fallback?: (error: Error) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 轻量错误边界：数据驱动区块（详情字段、infobox 等）渲染异常时降级为一段提示，
 * 不拖垮整页。使用处用 key 绑定数据主体（如 subjectId），换数据自动重置。
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // 边界只负责降级不中断渲染，错误同时打到 console 便于排障
    console.error("[ErrorBoundary]", this.props.label ?? "root", error);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      return (
        <div className="py-3 text-xs text-destructive">
          {this.props.label ?? "该区块"}渲染出错：{this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
