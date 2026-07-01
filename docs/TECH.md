# 技术报告

> 追番计划 —— 基于 Bangumi API 的 Windows 桌面追番软件。
>
> 技术栈：**Tauri 2.x + Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui**。

---

## 1. 技术栈与选型理由

| 技术 | 角色 | 选型理由 |
|---|---|---|
| **Tauri 2** | 桌面外壳 + Rust 后端 | 产物体积小（几 MB）、系统 WebView、2.x 引入 capabilities 权限模型 |
| **Vite** | 前端构建/HMR | Tauri 官方推荐；冷启动与 HMR 亚秒级；产物干净 |
| **React 19 + TS** | UI 运行时 | shadcn/ui 为 React 专属；TS 提供类型安全 |
| **Tailwind v4** | 原子化 CSS | CSS-first 配置（`@theme`），无 JS 配置文件 |
| **shadcn/ui** | 组件样式 | 「复制源码」模式，组件归项目所有；底层 Radix 保证可访问性 |
| **TanStack Query** | 数据获取与缓存 | Bangumi API 请求的缓存、自动重新获取、乐观更新 |

前端用 Vite 而非 Next.js：Next.js 的 SSR / RSC / API Routes 在 Tauri 的 webview 加载本地静态文件场景下全部失效；Vite 是 Tauri 官方引导路径。

---

## 2. 项目结构

```
anime-watchlist/
├── src/
│   ├── components/
│   │   ├── ui/                  # shadcn/ui 组件（button, card, dialog, dropdown-menu, input 等）
│   │   ├── layout/
│   │   │   ├── TitleBar.tsx     # 无边框自绘标题栏（data-tauri-drag-region）
│   │   │   └── ThemeToggle.tsx  # 暗色/亮色模式切换
│   │   ├── BangumiLink.tsx      # 跳转 Bangumi 条目页
│   │   ├── CollectAction.tsx    # 收藏操作下拉
│   │   ├── SubjectDetail.tsx    # 条目详情展开面板
│   │   ├── SubjectRow.tsx       # 收藏列表行（封面/信息/操作）
│   │   └── WatchlistToolbar.tsx # 追番页工具栏（快速导航/类型筛选/刷新/折叠）
│   ├── lib/
│   │   ├── auth.ts              # OAuth 认证流程
│   │   ├── bgm.ts               # Bangumi HTTP 客户端（UA + Bearer + 401 刷新）
│   │   ├── proxy.ts             # HTTP 代理配置（store→插件 proxy 选项 + 连通性测试）
│   │   ├── queries.ts           # TanStack Query hooks
│   │   ├── store.ts             # tauri-plugin-store 封装（凭据/令牌/代理/偏好）
│   │   └── utils.ts             # cn() 工具函数
│   ├── hooks/
│   │   └── useAuthUser.ts       # 认证用户 hook
│   ├── pages/
│   │   ├── Watchlist.tsx         # 追番首页（5 个可折叠收藏夹）
│   │   ├── Collection.tsx        # 搜索与收藏页面
│   │   ├── Config.tsx            # OAuth 凭据配置与登录
│   │   └── About.tsx             # 关于页（版本信息、免责声明、链接）
│   ├── types/
│   │   └── bgm.ts                # Bangumi 数据类型定义
│   ├── App.tsx
│   ├── main.tsx
│   ├── globals.css               # Tailwind v4 + shadcn 主题变量
│   └── vite-env.d.ts
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               # Rust 入口（windows_subsystem = "windows"）
│   │   └── lib.rs                # 插件注册 + OAuth 本地回调服务器（tiny_http :7359）
│   ├── capabilities/default.json # Tauri 2 ACL 权限
│   ├── icons/                    # 应用图标（多尺寸）
│   ├── Cargo.toml
│   └── tauri.conf.json           # 应用元数据、窗口、打包配置
├── scripts/
│   └── release.mjs               # 一键发布脚本
├── .github/workflows/
│   └── release.yml               # CI/CD（推送标签时构建并发布 Release）
├── index.html                    # Vite 入口（含防闪烁主题脚本）
├── vite.config.ts
├── components.json               # shadcn/ui 配置
├── tsconfig.json
├── .nvmrc                        # Node.js 版本（CI 使用）
└── package.json
```

---

## 3. 关键架构决策

### 3.1 无边框自定义标题栏

`tauri.conf.json` 设置 `decorations: false` 关闭原生标题栏，由 `TitleBar.tsx` 自绘。

Tauri 通过 `data-tauri-drag-region` 属性提供原生窗口拖拽——放在标题栏容器上即可拖动窗口，双击自动切换最大化。窗口控制按钮调用 `@tauri-apps/api/window` 的 `getCurrentWindow()` 方法。

**注意**：Tauri 2 的 ACL 默认不放开窗口操作，必须在 `capabilities/default.json` 中显式授权：
```json
"permissions": [
  "core:default",
  "core:window:allow-start-dragging",
  "core:window:allow-minimize",
  "core:window:allow-toggle-maximize",
  "core:window:allow-close"
]
```

### 3.2 暗色模式（无 FOUC）

shadcn 的主题通过 `<html>` 上的 `.dark` class 切换 CSS 变量。为防止首屏闪烁（FOUC），`index.html` 的 `<head>` 中内联同步脚本：

```html
<html lang="zh-CN" class="dark">
  <head>
    <script>
      (function () {
        var t = localStorage.getItem("theme");
        if (t === "light") document.documentElement.classList.remove("dark");
      })();
    </script>
  </head>
```

默认 `class="dark"`，脚本按 `localStorage` 纠正——确保首屏不闪白。`ThemeToggle.tsx` 通过切换 `.dark` class 并写入 `localStorage` 实现切换。

### 3.3 数据持久化：tauri-plugin-store

本地仅存储 OAuth 凭据、访问令牌、HTTP 代理配置与界面偏好，不缓存业务数据（条目信息始终从 Bangumi API 实时获取）。

使用 `tauri-plugin-store` 持久化到 `config.json`（Rust 侧 `lib.rs` 注册插件，前端通过 `@tauri-apps/plugin-store` 的 `LazyStore` 读写）。详见 `src/lib/store.ts`。

### 3.4 OAuth 认证

Bangumi OAuth 2.0 流程：应用注册 → 获取授权码 → 换访问令牌。Rust 侧 `lib.rs` 使用 `tiny_http` 在本地 `127.0.0.1:7359` 启动一次性回调服务器接收授权码。前端 `src/lib/auth.ts` 编排完整流程，令牌通过 store 插件持久化。

### 3.5 API 客户端

`src/lib/bgm.ts` 封装 Bangumi HTTP 请求：统一 User-Agent（含开发者标识）、Bearer 令牌注入、401 自动刷新令牌重试。上层通过 TanStack Query（`src/lib/queries.ts`）管理缓存与失效策略。

### 3.6 HTTP 代理

`@tauri-apps/plugin-http` 的 `fetch` 第二参为 `RequestInit & ClientOptions`，其中 `ClientOptions.proxy` 原生支持 `{ all?: { url, basicAuth? } }` 形式。`src/lib/proxy.ts` 把 store 中的 `ProxyConfig`（地址 + 可选 Basic 认证）转成该选项，由 `bgm.ts`（2 处）与 `auth.ts`（1 处）的 `tauriFetch` 调用共用注入——每次请求读取最新配置，配置页保存后立即对所有请求生效，无需重启。

配置页（`Config.tsx`）提供地址（必填）+ 可选用户名/密码 + 「测试连接」（用表单当前值请求一次 Bangumi 验证）+ 「保存」（地址留空保存即关闭代理）。标题旁有编辑/保存状态徽章。

> 限制：封面/头像图片（`lain.bgm.tv`）通过 webview 的 `<img>` 加载，走 webview 网络栈，不经过 `tauriFetch`，因此不被代理覆盖。

---

## 4. 版本号管理

项目以 `package.json` 的 `version` 字段为权威源，发布脚本自动同步到其余文件：

| 文件 | 字段 | 作用 |
|---|---|---|
| `package.json` | `version` | **权威源**，脚本以此为准 |
| `src-tauri/Cargo.toml` | `package.version` | Rust crate 版本，脚本正则同步 |
| `src-tauri/tauri.conf.json` | `version` | 应用版本，写入安装包元数据，脚本 JSON 写入 |
| `src-tauri/Cargo.lock` | `anime-watchlist` 包的 `version` | 依赖锁文件中的本地包版本，脚本块锚定正则同步 |
| `src/lib/bgm.ts` | `USER_AGENT` 中的 `anime-watchlist/<version>` | HTTP 请求头标识，脚本正则同步 |

前端通过 Vite `define` 在构建时注入版本号（`vite.config.ts` 读取 `package.json` 的 `version` → `import.meta.env.VITE_APP_VERSION`），`src/pages/About.tsx` 直接引用，无需硬编码。

---

## 5. 构建与发布

### 5.1 开发与构建命令

```bash
npm run dev          # Vite 开发服务器（端口 3000，HMR 3001）
npm run tauri dev    # Tauri 开发模式（Vite HMR + Tauri 窗口）
npm run build        # TypeScript 类型检查 + Vite 构建 → dist/
npm run tauri build  # 前端构建 + Rust release 编译（bundle.active=false，不产安装包）
```

产物：`src-tauri/target/release/anime-watchlist.exe`（便携 exe）+ 前端 `dist/`。本项目的 `bundle.active` 设为 `false`，不发 NSIS/MSI 安装包；CI 另行把 exe + dist 打成便携 zip 发布。

### 5.2 一键发布脚本

```bash
npm run release patch   # 补丁版本：0.1.0 → 0.1.1
npm run release minor   # 小版本：  0.1.0 → 0.2.0
npm run release major   # 大版本：  0.1.0 → 1.0.0
npm run release 1.2.3   # 指定精确版本号
```

脚本 (`scripts/release.mjs`) 执行流程：
1. 从 `package.json` 读取当前版本，按参数计算新版本号
2. 同步更新 5 处版本文件：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.lock`、`src/lib/bgm.ts`
3. `git add` → `git commit -m "chore: bump version to vX.Y.Z"`
4. `git tag vX.Y.Z` → `git push && git push --tags`

### 5.3 CI/CD 自动构建

推送 `v*` 标签后，`.github/workflows/release.yml` 在 `windows-latest` 上自动执行：

| 步骤 | 说明 |
|---|---|
| Checkout | `actions/checkout@v5`，`fetch-depth: 0`（完整历史，确保 release notes 能取到上一个 tag 至当前的全部提交） |
| Node.js | `actions/setup-node@v5`，版本来自 `.nvmrc`（24） |
| Rust | `actions-rust-lang/setup-rust-toolchain@v1` |
| 安装依赖 | `npm ci` |
| Tauri 构建 | `npm run tauri build` |
| 打包便携版 | 将 `anime-watchlist.exe` + `dist/` 打成 zip |
| 发布 | `gh release create`，自动生成 release notes（列出自上一 tag 以来的提交），上传便携 zip |

> Release notes 注意：tag-push 触发的 workflow 运行的是**该 tag 指向 commit 上的 workflow 文件**，因此若发版后修改了 `release.yml`，需在新 tag 上才能生效（不能仅重打旧 tag）。

完整流水线：`npm run release <bump>` → 推送标签 → Actions 自动构建 → GitHub Release 页面出现便携 zip。

完整流水线：`npm run release <bump>` → 推送标签 → Actions 自动构建 → GitHub Release 页面出现产物。

**首次发布前**需配置远程仓库：
```bash
git remote add origin https://github.com/GitZhiQing/anime-watchlist
```

---

## 6. 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| `data-tauri-drag-region` / 窗口按钮无反应 | 未授权窗口权限 | `capabilities/default.json` 加 `core:window:allow-*` 权限 |
| 暗色模式首屏闪白 | 主题脚本在 React 之后执行 | 脚本放 `index.html` 的 `<head>`，同步执行 |
| invoke 报 command not found | 命令未注册 | `invoke_handler![...]` 必须列出该命令 |

---

## 7. 参考链接

- [Tauri v2 文档](https://v2.tauri.app/)
- [shadcn/ui (Vite 安装)](https://ui.shadcn.com/docs/installation/vite)
- [TanStack Query](https://tanstack.com/query)
- [Bangumi API](https://bangumi.github.io/api)
- [GitHub Actions — Tauri v2](https://v2.tauri.app/distribute/github-actions/)
