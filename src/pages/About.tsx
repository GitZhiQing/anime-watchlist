import { ExternalLink } from "lucide-react";

const LINKS = [
  { label: "Bangumi 官网", href: "https://bgm.tv" },
  { label: "Bangumi API 文档", href: "https://bangumi.github.io/api" },
  {
    label: "项目仓库",
    href: "https://github.com/GitZhiQing/anime-watchlist",
  },
];

function LinkItem({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm text-foreground underline-offset-4 hover:underline"
    >
      {label}
      <ExternalLink className="size-3 text-muted-foreground" />
    </a>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export function About() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* 应用信息 */}
      <header className="space-y-4">
        <img src="/logo.png" alt="追番计划" className="size-20 rounded-xl" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">追番计划</h1>
          <p className="text-sm text-muted-foreground">
            一个基于 Bangumi API 的 Windows 桌面追番软件，用于收藏与管理漫画和动画。
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>版本 {import.meta.env.VITE_APP_VERSION}</span>
            <span>技术栈：Tauri · React · shadcn/ui</span>
          </div>
        </div>
      </header>

      {/* 数据所有权 */}
      <Section title="数据来源与所有权">
        <p>
          本应用展示的全部内容——条目信息、封面、简介、评分、标签等——均来自{" "}
          <a
            href="https://bgm.tv"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Bangumi
          </a>
          ，其版权归 Bangumi 及其内容贡献者所有。本应用不生产、不拥有这些数据，仅作展示与个人收藏管理之用。
        </p>
        <p>
          你的收藏记录存储在你的 Bangumi 账户中。本应用通过你授权的 OAuth
          凭据访问你的账户；注销或撤回授权后，应用即失去访问权限，而你的数据始终归属于你与 Bangumi。
        </p>
        <p>
          本地仅保存你自行填写的 OAuth
          应用凭据、访问令牌与界面偏好，不缓存任何条目业务数据。
        </p>
      </Section>

      {/* 免责声明 */}
      <Section title="免责声明">
        <p>
          本应用为第三方开源项目，与 Bangumi
          无任何官方隶属关系或商业合作。所有数据、商标及名称的版权归原作者及 Bangumi 所有。
        </p>
        <p>
          应用按 Bangumi API
          使用规范调用接口（含开发者标识 User-Agent）。使用本应用产生的一切后果由使用者自行承担。
        </p>
      </Section>

      {/* 相关链接 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">相关链接</h2>
        <div className="flex flex-col gap-1.5">
          {LINKS.map((l) => (
            <LinkItem key={l.href} {...l} />
          ))}
        </div>
      </section>
    </div>
  );
}
