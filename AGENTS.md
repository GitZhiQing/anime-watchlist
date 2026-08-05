# AGENTS.md

追番计划 — 基于 Bangumi API 的 Windows 桌面追番软件。Tauri 2 + React 19 + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query。

## 常用命令

```bash
npm install              # 安装依赖
npm run tauri dev        # 开发（Vite HMR + Tauri 窗口）
npm run tauri build      # 生产构建（便携 exe；bundle.active=false 不产 NSIS/MSI 安装包）
npx tsc --noEmit         # 仅类型检查
npm run bump minor       # 仅更新版本并提交（不打 tag 不推送）
npm run release patch    # 发布（更新 + 提交 + 打 tag + 推送，触发 CI）
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
  src/lib.rs            # 插件注册 + OAuth 本地回环服务器（tiny_http，动态端口 7359–7369）
  src/main.rs
  capabilities/default.json  # 权限（窗口/store/http/opener）
  tauri.conf.json       # 无边框窗口、Vite dev URL
docs/                   # 文档索引（api/ 接口文档 + dev/ 开发文档，见 docs/README.md）
```

## 关键设计决策

- **数据不落库**：收藏列表实时调 API，仅 token/凭据/偏好存本地（Store 插件）
- **User-Agent**：必须走 `@tauri-apps/plugin-http`（Rust 侧 fetch）才能设 UA，webview fetch 不可
- **HTTP 代理**：`@tauri-apps/plugin-http` 的 `fetch` 支持 `ClientOptions.proxy`，`proxy.ts` 把 store 里的配置转成 `{ all: { url, basicAuth? } }` 注入所有请求（bgm.ts/auth.ts 共用）。配置页提供地址（必填）+ 可选 Basic 认证 + 测试连接。封面/头像图片走 webview 不经此代理
- **OAuth 回调**：本地回环服务器动态选端口（7359–7369，每个端口先 IPv6 `::1` 后 IPv4 `127.0.0.1`），首个可用即用；全部被占才回退手动粘贴 code 模式。换 token 的 `redirect_uri` 等于授权时用的动态值（Bangumi 实测支持，符合 RFC 8252 loopback OAuth），故无需在开发者后台登记回调地址。配置页可勾选「固定端口 7359」回退固定模式（需后台登记）。授权交互由 `useOAuthFlow` 状态机驱动（显式阶段 + 120s 倒计时 + 可取消）；Rust 绑定端口后 emit `oauth-port` 事件，JS 据此构造动态 `redirect_uri` 再开授权页。`doRefresh` 读取 store 持久化的 `redirect_uri` 保证刷新时传值一致。CSRF `state` 参数自动模式校验。
- **凭据管理**：用户自填 client_id/secret，应用不内置凭据
- **缓存**：TanStack Query，条目详情 staleTime 30min，收藏列表 1min + mutation 失效
- **封面**：列表用 `images.small`（`object-contain`，容器比例 `aspect-[5/7]`），弹大图用 `images.medium`

## 版本更新与发布（两件事）

**版本号以 `package.json` 为单一权威源**，其余 4 处由 `scripts/release.mjs` 自动同步：

| 文件                          | 字段                                              |
| ----------------------------- | ------------------------------------------------- |
| `package.json`              | `version`（权威源）                             |
| `src-tauri/Cargo.toml`      | `package.version`                               |
| `src-tauri/tauri.conf.json` | `version`                                       |
| `src-tauri/Cargo.lock`      | `anime-watchlist` 包 `version`                |
| `src/lib/bgm.ts`            | `USER_AGENT` 中的 `anime-watchlist/<version>` |

前端 `src/pages/About.tsx` 通过 Vite `define` 在构建时注入版本号（`vite.config.ts` 读取 `package.json` 的 `version` → `import.meta.env.VITE_APP_VERSION`），无需硬编码。

「更新版本」≠「发布版本」，是两步：

- **更新版本**（只改版本号 + 提交，**不打 tag 不推送**）：
  ```bash
  npm run bump <patch|minor|major|X.Y.Z>
  ```
- **发布版本**（更新（如需）+ 提交 + **打 tag vX.Y.Z 并推送** → 触发 CI 构建发布）：
  ```bash
  npm run release <patch|minor|major|X.Y.Z>
  ```

  已用 `npm run bump` 更新过 → 直接 `npm run release X.Y.Z`（脚本只打 tag + 推送）。

**CI 触发**：`.github/workflows/release.yml` 仅在推送 `v*` tag 时触发（`on: push: tags: v*`），推 `main` 不会触发。**发布 = 打 tag 推送，不是推 main。**

CI 在 `windows-latest`：安装依赖 → `npm run tauri build` → 打包便携 zip → `gh release create` 上传并自动生成 release notes（Checkout 用 `actions/checkout@v5`、`fetch-depth: 0` 取上一 tag 起的提交）。

详情见 `docs/dev/release.md`。

## 注意

- **端口**：开发用 3000（HMR 3001），host 固定 127.0.0.1。本机 Windows 保留 1390-1489 等段，不能用那些段
- **204/空 body**：`bgmRequest` 统一用 `res.text()` 读取，空则返回 undefined，避免 JSON 解析报错
- **SlimSubject vs Subject**：列表接口返回 SlimSubject（`short_summary`/顶层 `score`），完整 Subject 仅 `GET /v0/subjects/{id}` 有 `summary`/`rating.score`/`total_episodes`
- **收藏默认私密**：POST/PATCH collection 必带 `private:true`
- **Bangumi API base**：`https://api.bgm.tv`（v0），OAuth 用 `https://bgm.tv`
