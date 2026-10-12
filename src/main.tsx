import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemedToaster } from "@/components/layout/ThemedToaster";
import App from "./App";
import { buildQueryClient } from "@/lib/queries";
import "./globals.css";

const queryClient = buildQueryClient();

/** 根级错误兜底：顶层渲染异常时给出整页提示 + 重载入口，避免无提示白屏 */
function RootErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-foreground">
      <p className="text-sm font-medium">界面渲染出错</p>
      <p className="max-w-lg break-all text-center text-xs text-muted-foreground">
        {error.message}
      </p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="mt-1 rounded-md bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:opacity-90"
      >
        重新加载
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallback={(error) => <RootErrorFallback error={error} />}>
      <QueryClientProvider client={queryClient}>
        <App />
        <ThemedToaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
