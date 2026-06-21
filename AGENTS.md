# AGENTS.md

追番计划 — 基于 Bangumi API 的 Windows 桌面追番软件。Tauri 2 + React 19 + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query。

## 常用命令

```bash
npm install              # 安装依赖
npm run tauri dev        # 开发（Vite HMR + Tauri 窗口）
npm run tauri build      # 生产打包（Windows nsis/msi）
npx tsc --noEmit         # 仅类型检查
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
  lib/
    bgm.ts              # HTTP 客户端（@tauri-apps/plugin-http，UA+Bearer+401刷新）
    auth.ts             # OAuth 流程编排
    store.ts            # Store 插件封装（凭据/token/偏好）
    queries.ts          # TanStack Query hooks（缓存+失效）
    utils.ts            # cn() 工具
  hooks/               # useAuthUser
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
- **OAuth 回调**：本地回环服务器 `127.0.0.1:7359`，固定端口
- **凭据管理**：用户自填 client_id/secret，应用不内置凭据
- **缓存**：TanStack Query，条目详情 staleTime 30min，收藏列表 1min + mutation 失效
- **封面**：列表用 `images.small`（`object-contain`，容器比例 `aspect-[5/7]`），弹大图用 `images.medium`

## 注意

- **端口**：开发用 5173，本机 Windows 保留 1390-1489 等段，不能改回 1420
- **204/空 body**：`bgmRequest` 统一用 `res.text()` 读取，空则返回 undefined，避免 JSON 解析报错
- **SlimSubject vs Subject**：列表接口返回 SlimSubject（`short_summary`/顶层 `score`），完整 Subject 仅 `GET /v0/subjects/{id}` 有 `summary`/`rating.score`/`total_episodes`
- **收藏默认私密**：POST/PATCH collection 必带 `private:true`
- **Bangumi API base**：`https://api.bgm.tv`（v0），OAuth 用 `https://bgm.tv`
