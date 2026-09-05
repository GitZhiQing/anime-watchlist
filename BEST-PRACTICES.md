# Tauri 桌面应用最佳实践

> 面向 AI 与开发者的 **Vite + React + Tauri 2** 桌面应用开发指南。
> 原则：结论先行、命令可复制、最小代码示例。每条 = **结论 + 理由 + 命令/片段**。

---

## A. 技术栈基线

| 层 | 选型 | 理由 |
|---|---|---|
| 外壳/后端 | **Tauri 2.x**（Rust） | 产物几 MB、系统 WebView（不打包，体积小且跟随系统补丁） |
| 前端构建 | **Vite** | Tauri 官方引导路径；冷启动/HMR 亚秒；产物干净 |
| UI 框架 | **React 19 + TypeScript（strict）** | 类型安全；shadcn/ui 生态为 React 专属 |
| 样式 | **Tailwind CSS v4** | CSS-first（`@theme`），无 JS 配置 |
| 组件 | **shadcn/ui**（Radix 底层） | 「复制源码」模式，组件归项目所有，可访问性有保障 |
| 数据 | **TanStack Query 5** | 桌面应用的缓存、失效、重试理想范式 |
| 路由 | 无（侧边栏切换）或轻量状态路由 | Tauri 加载本地静态文件，重路由框架收益小 |

**不要用 Next.js**：其 SSR / RSC / API Routes 在 webview 加载本地文件场景全部失效，徒增复杂度。Vite 是 Tauri 的官方推荐路径。

---

## B. 标准化开发工作流

> **⚠️ 所有命令必须「非交互可执行」**：AI 执行终端命令时无法回应交互式提示（会卡住直到超时）。下表给出每个脚手架命令的非交互写法，下文各节均采用这些形式。
>
> | 命令 | 是否交互 | 非交互写法 |
> |---|---|---|
> | `create-tauri-app`（无参） | ✅ 问名/语言/包管理器/模板 | `npm create tauri-app@latest <name> -- --template react-ts` |
> | `tauri init`（手动模式） | ✅ 问 app 名/devUrl 等 | 加 `--ci` + 显式传 `-A/-W/-D/-P/--before-*-command` |
> | `shadcn init` / `add` | ⚠️ 有确认提示 | 命令尾加 `-y` |
> | `tauri add <plugin>` | ❌ 非交互 | 直接执行（仅改文件） |

### B1. 项目初始化

**前置依赖**：Node.js（LTS）、Rust（stable）、Windows 的 WebView2（Win10/11 多预装，老版本需装 Runtime）、Linux 的 WebKitGTK。详见 Tauri Prerequisites。

**一键脚手架**（推荐，自动配好 `src-tauri` + 前端）。非交互形式，AI 可直接执行：

```bash
npm create tauri-app@latest my-app -- --template react-ts   # npm 7+ 需 --
cd my-app
npm install
npm run tauri dev      # 开发：Vite HMR + Tauri 窗口
```

> 用 `.` 当项目名可在当前目录脚手架；`react-ts` 模板已含 React+TS+Vite。
>
> **手动模式**（已有前端，只补 Tauri 外壳）用 `tauri init`，必须加 `--ci` 非交互：

```bash
npx tauri init --ci -A "我的应用" -W "我的应用" -D ../dist -P http://localhost:5173 --before-dev-command "npm run dev" --before-build-command "npm run build"
```

**日常命令矩阵**：

| 操作 | 命令 |
|---|---|
| 开发 | `npm run tauri dev` |
| 仅前端 | `npm run dev` |
| 类型检查 | `npx tsc --noEmit` |
| 生产构建 | `npm run tauri build` |
| 仅前端构建 | `npm run build` |

### B2. shadcn/ui 接入与组件管理

> Tailwind v4 流程（CSS-first，无 `tailwind.config.js`）。

**① 装 Tailwind v4**（脚手架若已含则跳过）：

```bash
npm add tailwindcss @tailwindcss/vite
```

`src/index.css` 顶部：`@import "tailwindcss";`；`vite.config.ts` 的 `plugins: [react(), tailwindcss()]`。

**② 配 `@/*` 路径别名**（shadcn 必需）：

```jsonc
// tsconfig.json → compilerOptions
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

> 新版 Vite 拆分了配置：**`tsconfig.app.json` 也要加同样的 `baseUrl`/`paths`**，否则编辑器无法解析 `@/*`。

```bash
npm add -D @types/node
```

```ts
// vite.config.ts
import path from "path";
resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
```

**③ 初始化 shadcn**（`-y` 跳过确认，非交互可执行）：

```bash
npx shadcn@latest init -y      # 生成 components.json + cn() + CSS 变量
```

**④ 添加组件**（按需，复制源码进项目）：

```bash
npx shadcn@latest add button card dialog input dropdown-menu -y
```

统一从 `@/components/ui/<name>` 导入：

```tsx
import { Button } from "@/components/ui/button";
```

组件归项目所有——可自由改源码，不随 npm 升级。

### B3. Tauri 插件接入范式（以 HTTP 为主例）

Tauri 2 插件接入遵循**统一三步法则**：

```bash
npm run tauri add http          # ① 非交互：自动改 Cargo.toml + 在 lib.rs 注册插件
npm install @tauri-apps/plugin-http   # ② 装 JS 侧包
```

③ **capabilities 授权 + scope 白名单**（`src-tauri/capabilities/default.json`）：

```jsonc
{
  "permissions": [
    {
      "identifier": "http:default",
      "allow": [
        { "url": "https://api.example.com/*" },
        { "url": "https://cdn.example.com/*" }
      ]
    }
  ]
}
```

④ **JS 端用 `fetch`**（走 Rust 侧，可设 `User-Agent`、`proxy`、绕 CORS）：

```ts
import { fetch } from "@tauri-apps/plugin-http";

const res = await fetch("https://api.example.com/data", {
  method: "GET",
  headers: { "User-Agent": "my-app/1.0.0 (https://github.com/me/app)" },
  connectTimeout: 15_000,
  // proxy: { all: { url: "http://127.0.0.1:7890" } },
});
const text = await res.text();
```

**关键取舍**：

| 场景 | 用什么 | 原因 |
|---|---|---|
| 需设 UA / 走代理 / 携带鉴权头 | `@tauri-apps/plugin-http` 的 `fetch` | Rust 侧发起，不受 webview CORS 与禁头限制 |
| 纯展示图片（`<img src>`） | webview 原生 | 走 webview 网络栈，不经上面 scope/代理 |
| 调用第三方 API | 必须先在 `http:default.allow` 加白名单 | 否则运行时被 ACL 拒绝 |

**同构插件**（同样三步）：

| 插件 | 命令 | 用途 |
|---|---|---|
| 本地存储 | `npm run tauri add store` + `npm i @tauri-apps/plugin-store` | 持久化配置/凭据/偏好（KV JSON 文件） |
| 打开外链 | `npm run tauri add opener` + `npm i @tauri-apps/plugin-opener` | 用系统浏览器打开 URL |
| 文件系统 | `npm run tauri add fs` + `npm i @tauri-apps/plugin-fs` | 读写本地文件 |
| 更新器 | `npm run tauri add updater` + `npm i @tauri-apps/plugin-updater` | 应用自更新 |

> `tauri add <name>` 会修改 Rust 侧；JS 包要单独装。漏装 JS 包会报模块找不到。

### B4. 自定义 Command 接入流程

前端调用 Rust 能力的标准四步：

```rust
// ① src-tauri/src/lib.rs 定义（命令名全局唯一）
#[tauri::command]
async fn greet(name: String) -> Result<String, String> {
    Ok(format!("Hello, {}!", name))
}

// ② 注册（在 tauri::Builder::default() 链上）
.invoke_handler(tauri::generate_handler![greet])
```

```ts
// ③ 前端调用
import { invoke } from "@tauri-apps/api/core";
const msg = await invoke<string>("greet", { name: "world" });
```

**检查清单**：① 函数加 `#[tauri::command]` ② 进 `generate_handler![]` ③ 重活**必须 `async`**（否则跑主线程阻塞 UI）④ 自定义错误类型实现 `serde::Serialize`。

---

## C. 架构与最佳实践

### C1. 项目结构

```
├── src/                  # 前端
│   ├── components/ui/    # shadcn 组件（CLI 生成）
│   ├── lib/              # 业务逻辑（HTTP 客户端、查询、store 封装）
│   ├── pages/            # 页面
│   └── types/            # 类型定义
├── src-tauri/
│   ├── src/
│   │   ├── main.rs       # 只调 app_lib::run()，勿改
│   │   └── lib.rs        # 写逻辑 + 插件注册 + mobile 入口
│   ├── capabilities/     # 权限文件（JSON）
│   ├── tauri.conf.json
│   └── Cargo.toml
└── vite.config.ts
```

- **`lib.rs` 写所有逻辑**（带 `#[cfg_attr(mobile, tauri::mobile_entry_point)]` 的 `run()`），`main.rs` 仅入口——这样桌面/移动复用同一入口。
- 命令多时拆模块（`commands.rs`，函数加 `pub`，注册时写 `commands::xxx`）。

### C2. 安全模型（核心）

Tauri 2 的安全基于**信任边界**：

- **Rust core** = 全系统权限（不受限）
- **WebView** = 仅能通过 IPC 调用「已授权」的命令

四条铁律：

1. **capabilities 最小授权**：按 window **label**（非标题）授权，只放开真正用到的权限。
2. **设并收紧 CSP**：`tauri.conf.json` 的 `app.security.csp`，`default-src 'self'`，避免远程 CDN 脚本。
3. **不打包 WebView**：用系统 WebView，跟随系统安全补丁。
4. **HTTP 用 scope 白名单**：见 B3，禁止 `allow: "*"`。

```jsonc
// capabilities/default.json 示例
{
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "store:default",
    { "identifier": "http:default", "allow": [{ "url": "https://api.example.com/*" }] },
    "core:window:allow-start-dragging",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close"
  ]
}
```

### C3. IPC 通信

| 方式 | 类型安全 | 返回值 | 适用场景 |
|---|---|---|---|
| **command**（`invoke`） | ✅ | ✅ | 前端→Rust 的首选，绝大多数调用 |
| **Channel** | ✅（流） | 单向推送 | 流式数据（下载进度、大文件分块） |
| **event**（`emit`/`listen`） | ❌ | ❌ | 广播、Rust→前端主动推送、跨窗口 |

**规则**：

- 默认用 command。需要 Rust 主动通知前端才用 event。
- **重活必须 `async`**：非 async 命令跑在主线程，会卡 UI。
- **错误用 `thiserror` + 自定义 `Serialize`**，别一律 `map_err(|e| e.to_string())`。

```rust
#[derive(Debug, thiserror::Error)]
enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
}
impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.to_string().as_ref())
    }
}
```

- **React 中事件必须清理**，否则内存泄漏 + 重复触发：

```tsx
useEffect(() => {
  const unlisten = listen("download-progress", (e) => setProgress(e.payload));
  return () => { unlisten.then((fn) => fn()); };   // 卸载时取消
}, []);
```

- **命令名全局唯一**（跨模块亦然）。多命令一次性传给单个 `generate_handler![a, b, c]`，勿多次调 `invoke_handler`。
- **跨命令共享状态**：`Builder::manage(data)` 注入，命令以 `tauri::State<T>` 读取（适合配置、连接池、后台任务句柄等全局单例）。

### C4. 数据与状态

- **业务数据用 TanStack Query**：分层 `staleTime`（详情类长缓存、列表类短缓存），mutation 成功后 `invalidateQueries` 失效。
- **本地仅存配置**：用 `tauri-plugin-store`（KV JSON），存 OAuth token、主题、代理等偏好；**不缓存业务数据到本地**，保持单一数据源（API）。
- **secret 不入仓库**：凭据由用户运行时输入并存 store，应用不内置；`.env`、硬编码 token 一律禁止。

```ts
// TanStack Query 典型配置
new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, err) => n < 1 && !isFatalAuthError(err),
      refetchOnWindowFocus: false,   // 桌面应用频繁切窗，按需开启
    },
  },
});
```

### C5. 窗口与 UI

- **无边框自绘标题栏**：`tauri.conf.json` 设 `app.windows[].decorations: false`，标题栏容器加 `data-tauri-drag-region`（原生拖拽 + 双击最大化），窗口按钮调 `@tauri-apps/api/window` 的 `getCurrentWindow()`。**必须在 capabilities 加 `core:window:allow-*`**。
- **暗色模式无 FOUC**：`index.html` 的 `<head>` 内联**同步**脚本读 localStorage 增删 `.dark` class，确保首屏不闪白（脚本若在 React 之后执行会闪）。
- **图片走 webview**：`<img>` 用 webview 网络栈，不经 `tauriFetch` 的代理/scope——需代理的图片要单独处理。

### C6. 构建与发布

- **版本号单一源**：`package.json` 的 `version` 为权威，脚本同步到 `Cargo.toml`/`tauri.conf.json`/`Cargo.lock`/`USER_AGENT`。
- **Vite 三要点**：`clearScreen: false`（不挡 Rust 报错）、`server.strictPort: true`（Tauri 要固定端口）、`server.watch.ignored: ['**/src-tauri/**']`（避免 Rust 改动触发前端重编译）。
- **构建目标**：`build.target` 按 `chrome105`(Win) / `safari13`(mac/linux)。
- **CI 由 tag 触发**：推送 `v*` tag → Actions 构建 → Release。推 `main` 不触发发版。

```ts
// vite.config.ts 关键项
export default defineConfig({
  clearScreen: false,
  server: {
    port: 3000,
    strictPort: true,
    host: "127.0.0.1",
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
  },
});
```

---

## D. 反模式清单（Don'ts）

| ❌ 反模式 | ✅ 正确做法 |
|---|---|
| 非 async command 跑重活 | 重活命令必须 `async` |
| capabilities 用 `allow: "*"` / 越权 | 最小授权 + URL scope 白名单 |
| CSP 留空或允许远程 CDN | 设并收紧 CSP，`default-src 'self'` |
| 命令名跨模块重复 | 全局唯一 |
| event 监听忘 `unlisten` | `useEffect` 返回清理函数 |
| 用 Next.js（SSR/RSC） | 用 Vite（本地静态文件） |
| 业务数据缓存进本地 store | 只缓存配置，业务数据走 API + TanStack Query |
| 硬编码 token/凭据 | 用户运行时输入，存 store，不入仓库 |
| 图片也想走代理但用 `<img>` | webview 网络栈不经 `tauriFetch` 代理 |
| 多次调 `invoke_handler` | 单次 `generate_handler![a, b, c]` |
| 改 `main.rs` 加逻辑 | 逻辑写在 `lib.rs`，`main.rs` 只入口 |
| webview fetch 调需 UA/代理的 API | 用 `@tauri-apps/plugin-http` 的 `fetch` |
| AI 跑交互式命令（无参 `create-tauri-app` / `tauri init` 不带 `--ci`） | 全部参数显式传入，见 B 章速查表 |

---

## E. 参考链接

- [Tauri v2 文档](https://v2.tauri.app/)
- [创建项目](https://v2.tauri.app/start/create-project/)｜[项目结构](https://v2.tauri.app/start/project-structure/)｜[Vite 配置](https://v2.tauri.app/start/frontend/vite/)
- [安全总览](https://v2.tauri.app/security/)｜[Capabilities](https://v2.tauri.app/security/capabilities/)｜[CSP](https://v2.tauri.app/security/csp/)
- [Calling Rust（IPC/Commands/Events）](https://v2.tauri.app/develop/calling-rust/)
- [HTTP Client 插件](https://v2.tauri.app/plugin/http-client/)｜[Store 插件](https://v2.tauri.app/plugin/store/)｜[Opener 插件](https://v2.tauri.app/plugin/opener/)
- [shadcn/ui Vite 安装](https://ui.shadcn.com/docs/installation/vite)｜[shadcn CLI](https://ui.shadcn.com/docs/cli)
- [TanStack Query](https://tanstack.com/query/)
