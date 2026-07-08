import { ExternalLink } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Separator } from "@/components/ui/separator";

const LINKS = [
  { label: "Bangumi 官网", href: "https://bgm.tv" },
  { label: "API 文档", href: "https://bangumi.github.io/api" },
  { label: "项目仓库", href: "https://github.com/GitZhiQing/anime-watchlist" },
];

export function About() {
  return (
    <PageLayout title="关于">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* 应用信息 */}
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="追番计划" className="size-16 rounded-xl" />
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">追番计划</h1>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                v{import.meta.env.VITE_APP_VERSION}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              基于 Bangumi API 的桌面追番应用，管理你的漫画与动画收藏。
            </p>
          </div>
        </div>

        <Separator />

        {/* 说明 */}
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            本应用展示的全部内容（条目信息、封面、简介、评分等）均来自{" "}
            <a
              href="https://bgm.tv"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Bangumi
            </a>
            ，版权归 Bangumi 及其贡献者所有。你的收藏数据存储在 Bangumi
            账户中，本地仅保存 OAuth 凭据与界面偏好。
          </p>
          <p>
            本应用为第三方开源项目，与 Bangumi 无官方隶属关系。技术栈：Tauri · React · shadcn/ui。
          </p>
        </div>

        <Separator />

        {/* 相关链接：一行展示 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {LINKS.map((l, i) => (
            <span key={l.href} className="flex items-center gap-x-4">
              {i > 0 && (
                <span className="text-border select-none">·</span>
              )}
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {l.label}
                <ExternalLink className="size-3" />
              </a>
            </span>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
