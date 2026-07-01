# AGENTS.md

追番计划 — 基于 Bangumi API 的 Windows 桌面追番软件。Tauri 2 + React 19 + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query。

## 常用命令

```bash
npm install              # 安装依赖
npm run tauri dev        # 开发（Vite HMR + Tauri 窗口）
npm run tauri build      # 生产构建（便携 exe；bundle.active=false 不产 NSIS/MSI 安装包）
npx tsc --noEmit         # 仅类型检查
npm run release patch    # 发版（补丁/小/大版本号 或 指定 X.Y.Z）
```

## 架构

```
src/
  main.tsx              # 入口，QueryClientProvider
  App.tsx               # 侧边栏（追番/收藏/配置/关于）+ 内容区路由
  globals.css           # Tailwind v4 + shadcn 主题变量 + 滚动条样式
  pages/                # 四个页面组件
  components/
    layout/             # TitleBar（无边框窗口控件）、ThemeToggle
    ui/                 # shadcn 组件（CLI 生成）
    SubjectRow.tsx      # 列表项（封面/信息/展开/操作槽）
    SubjectDetail.tsx   # 展开后的完整详情
    CollectAction.tsx   # 收藏页展开后的收藏操作
    BangumiLink.tsx     # 打开 Bangumi 条目页
    WatchlistToolbar.tsx # 追番页工具栏（快速导航/条目类型筛选/刷新/折叠全部）
  lib/
    bgm.ts              # HTTP 客户端（@tauri-apps/plugin-http，UA+Bearer+401刷新）
    auth.ts             # OAuth 流程编排
    proxy.ts            # HTTP 代理配置（store→插件 ClientOptions.proxy 转换 + 连通性测试）
    store.ts            # Store 插件封装（凭据/token/代理/偏好）
    queries.ts          # TanStack Query hooks（缓存+失效）
    utils.ts            # cn() 工具
  hooks/               # useAuthUser
  pages/               # Watchlist / Collection / Config / About
  types/bgm.ts          # Bangumi 数据类型（SlimSubject/Subject/UserCollection/枚举）
src-tauri/
  src/lib.rs            # 插件注册 + OAuth 本地回环服务器（tiny_http:7359）
  src/main.rs
  capabilities/default.json  # 权限（窗口/store/http/opener）
  tauri.conf.json       # 无边框窗口、Vite dev URL
docs/                   # 设计文档 + Bangumi OpenAPI 规约
```

## 关键设计决策

- **数据不落库**：收藏列表实时调 API，仅 token/凭据/偏好存本地（Store 插件）
- **User-Agent**：必须走 `@tauri-apps/plugin-http`（Rust 侧 fetch）才能设 UA，webview fetch 不可
- **HTTP 代理**：`@tauri-apps/plugin-http` 的 `fetch` 支持 `ClientOptions.proxy`，`proxy.ts` 把 store 里的配置转成 `{ all: { url, basicAuth? } }` 注入所有请求（bgm.ts/auth.ts 共用）。配置页提供地址（必填）+ 可选 Basic 认证 + 测试连接。封面/头像图片走 webview 不经此代理
- **OAuth 回调**：本地回环服务器 `127.0.0.1:7359`，固定端口
- **凭据管理**：用户自填 client_id/secret，应用不内置凭据
- **缓存**：TanStack Query，条目详情 staleTime 30min，收藏列表 1min + mutation 失效
- **封面**：列表用 `images.small`（`object-contain`，容器比例 `aspect-[5/7]`），弹大图用 `images.medium`

## 版本发布

**版本号以 `package.json` 为单一权威源**，其余文件由 `scripts/release.mjs` 自动同步：

| 文件 | 字段 | 同步方式 |
|---|---|---|
| `package.json` | `version` | 手动修改或脚本递增 |
| `src-tauri/Cargo.toml` | `package.version` | 脚本正则替换 |
| `src-tauri/tauri.conf.json` | `version` | 脚本 JSON 写入 |
| `src-tauri/Cargo.lock` | `anime-watchlist` 包的 `version` | 脚本块锚定正则替换 |
| `src/lib/bgm.ts` | `USER_AGENT` 中的 `anime-watchlist/<version>` | 脚本正则替换 |

前端 `src/pages/About.tsx` 通过 Vite `define` 在构建时注入版本号（`vite.config.ts` 读取 `package.json` 的 `version` → `import.meta.env.VITE_APP_VERSION`），无需硬编码。

### 发版流程

```
npm run release <bump>  →  同步 5 处版本文件  →  git commit  →  git tag vX.Y.Z  →  git push --tags
                                                                                       ↓
                                                                         GitHub Actions 自动触发
                                                                                       ↓
                                                                    构建 portable exe → 打包 zip → 发布 GitHub Release
```

命令：`patch`（0.1.0→0.1.1）、`minor`（0.1.0→0.2.0）、`major`（0.1.0→1.0.0）或直接指定如 `1.2.3`。版本号相同时仅打标签不提交（用于首次发版/重打标签）。

CI 配置在 `.github/workflows/release.yml`，在 `windows-latest` 上构建。Checkout 用 `actions/checkout@v5`（`fetch-depth: 0`，确保 release notes 能取到上一个 tag 至当前的全部提交），产物为便携 zip，通过 `gh release create` 上传并自动生成 release notes。

## 注意

- **端口**：开发用 3000（HMR 3001），host 固定 127.0.0.1。本机 Windows 保留 1390-1489 等段，不能用那些段
- **204/空 body**：`bgmRequest` 统一用 `res.text()` 读取，空则返回 undefined，避免 JSON 解析报错
- **SlimSubject vs Subject**：列表接口返回 SlimSubject（`short_summary`/顶层 `score`），完整 Subject 仅 `GET /v0/subjects/{id}` 有 `summary`/`rating.score`/`total_episodes`
- **收藏默认私密**：POST/PATCH collection 必带 `private:true`
- **Bangumi API base**：`https://api.bgm.tv`（v0），OAuth 用 `https://bgm.tv`
