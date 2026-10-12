# AGENTS.md

追番计划 — 基于 Bangumi API 的 Windows 桌面追番软件。Tauri 2 + React 19 + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query。

## 常用命令

```bash
npm install              # 安装依赖
npm run tauri dev        # 开发（Vite HMR + Tauri 窗口）
npm run tauri build      # 生产构建（便携 exe；bundle.active=false 不产 NSIS/MSI 安装包）；成功后自动在桌面生成/覆盖快捷方式 追番计划.lnk（scripts/tauri.mjs 转发包装 + make-shortcut.mjs，指向 target/release 产物；CI 环境自动跳过；dev 等其余子命令行为不变）
npx tsc --noEmit         # 仅类型检查
npm run bump minor       # 仅更新版本并提交（不打 tag 不推送）
npm run release patch    # 发布（更新 + 提交 + 打 tag + 推送，触发 CI）
```

## 架构

```
src/
  main.tsx              # 入口，QueryClientProvider
  App.tsx               # 侧边栏（追番/新番/找番/配置/关于）+ 内容区路由（页面保活，切页不丢状态）
  globals.css           # Tailwind v4 + shadcn 主题变量 + 折叠动画 + 滚动条样式
  components/
    layout/             # TitleBar（无边框窗口控件）、ThemeToggle（亮/暗/跟随系统三态）
    ui/                 # shadcn 组件（CLI 生成；badge.tsx 为手写，内容对齐官方源码——本机 shell fnm 环境问题致 CLI 不可用时手写补齐）
    SubjectRow.tsx      # 列表行：标题行（xs Bangumi 图标 + 收藏下拉）+ 可展开详情 + 搜索高亮
    EnrichedSubjectRow.tsx # 带详情补全的列表行（新番列表/找番热度榜/找番搜索结果共用）：进入视口才拉 v0 详情回填简介/标签/NSFW
    SubjectDetailView.tsx # 统一详情容器（inline=展开行 / dialog=卡片弹窗）：字段/标签/「我的」折叠/简介/p1
    SubjectDetailDialog.tsx # 应用内详情弹窗壳（Dialog + SubjectDetailView dialog，网格卡片/p1 关联·推荐卡片共用）
    SubjectEpisodesSection.tsx # 详情剧集列表区（简介与 p1 区块之间；与「我的进度」共享 ["episodes",id] 缓存、进入视口才请求；已看高亮/未播置灰/单话简介，默认 12 行 + 展开全部；空/失败静默隐藏）
    PersonDetailDialog.tsx # 角色/声优详情弹窗（p1 人物端点宽松解析降级；角色弹窗内点 CV 名可再开声优弹窗——递归复用）
    SubjectGridCard.tsx  # 网格视图海报卡片（追番/新番共用，subject+caption props，标题前带条目类型徽标，点击开详情弹窗）
    SubjectGroup.tsx     # 折叠分组容器（追番收藏夹分组 / 新番星期分组共用；无边框，分组头为柔和底色圆角条 bg-muted/50）
    ViewTabs.tsx         # 列表/网格视图切换 Tabs（追番/新番共用）
    SubjectP1Sections.tsx # p1 扩展信息（角色 CV/关联条目/相关推荐，滚动可见才请求+骨架占位，失败静默隐藏；关联/推荐为海报卡片网格（视觉对齐 SubjectGridCard），点击卡片应用内打开详情弹窗，hover 预取；角色卡：署名/身份徽标/全部 CV，点卡片开角色弹窗、点 CV 名开声优弹窗，默认 12 位 +「查看全部」客户端展开——p1 列表未传 limit 响应即全量）
    CollectAction.tsx    # 收藏/移动收藏夹下拉（xs~sm，乐观更新；不提供取消收藏——上游无端点，见 docs/API.md，菜单尾「到网页管理收藏」深链缓解；非 modal——嵌 modal 详情弹窗时避免连带关闭弹窗）
    ProgressEdit.tsx     # RateStars（我的评分）+ ProgressRows（我的进度：逐集/步进 + 书籍卷）
    BangumiLink.tsx      # Bangumi 外链（标题行内联图标模式）
    FadeImg.tsx / ErrorBoundary.tsx / SubjectSummary.tsx # 图片淡入 / 详情渲染兜底 / 简介排版
    SearchInput.tsx、WatchlistToolbar.tsx # 搜索框、追番工具栏（类型筛选/排序组合/跳转/刷新）
  lib/
    bgm.ts              # HTTP 客户端（@tauri-apps/plugin-http，UA+Bearer+401刷新）
    auth.ts             # OAuth 流程编排
    proxy.ts            # HTTP 代理配置（store→插件 ClientOptions.proxy 转换 + 连通性测试）
    store.ts            # Store 插件封装（凭据/token/代理/偏好）
    backup.ts           # 数据备份与恢复（全部 5 类收藏 → 带时间戳 JSON 文件；恢复为聚合导入：校验/计划/并发执行；目录与文件选择走 dialog 插件、读写文件走自定义命令 write_text_file/read_text_file）
    queries.ts          # TanStack Query hooks（缓存+乐观更新+精准失效+hover预取）
    p1.ts               # p1 私有扩展信息（角色/关联/推荐，宽松解析静默失败）
    trending.ts         # 热度榜（p1）+ 日历兜底映射
    cover.ts            # 封面取图（lain /r/<宽>/ 官方缩放前缀改写，200/400/800 档）
    utils.ts            # cn() 工具
  hooks/               # useAuthUser / useOAuthFlow / usePersistentState / useInViewOnce
  pages/               # Watchlist / Calendar / Collection / Config / About 五个页面
  types/bgm.ts          # Bangumi 数据类型（SlimSubject/Subject/UserCollection/枚举/p1）
src-tauri/
  src/lib.rs            # 插件注册 + OAuth 本地回环服务器（tiny_http，动态端口 7359–7369）+ 自定义命令 write/read_text_file（备份文件读写）
  src/main.rs
  capabilities/default.json  # 权限（窗口/store/http/opener/dialog）
  tauri.conf.json       # 无边框窗口、Vite dev URL
docs/                   # 文档（API.md 接口总文档 + dev/ 开发文档，见 docs/README.md）
```

## 关键设计决策

- **数据不落库**：收藏列表实时调 API，仅 token/凭据/偏好存本地（Store 插件）
- **User-Agent**：必须走 `@tauri-apps/plugin-http`（Rust 侧 fetch）才能设 UA，webview fetch 不可
- **HTTP 代理**：`@tauri-apps/plugin-http` 的 `fetch` 支持 `ClientOptions.proxy`，`proxy.ts` 把 store 里的配置转成 `{ all: { url, basicAuth? } }` 注入所有请求（bgm.ts/auth.ts 共用）。配置页提供地址（必填）+ 可选 Basic 认证 + 测试连接。封面/头像图片走 webview 不经此代理
- **OAuth 回调**：本地回环服务器动态选端口（7359–7369，每个端口先 IPv6 `::1` 后 IPv4 `127.0.0.1`），首个可用即用；全部被占才回退手动粘贴 code 模式。换 token 的 `redirect_uri` 等于授权时用的动态值（Bangumi 实测支持，符合 RFC 8252 loopback OAuth），故无需在开发者后台登记回调地址。配置页可勾选「固定端口 7359」回退固定模式（需后台登记）。授权交互由 `useOAuthFlow` 状态机驱动（显式阶段 + 120s 倒计时 + 可取消）；Rust 绑定端口后 emit `oauth-port` 事件，JS 据此构造动态 `redirect_uri` 再开授权页。`doRefresh` 读取 store 持久化的 `redirect_uri` 保证刷新时传值一致。CSRF `state` 参数自动模式校验。
- **凭据管理**：用户自填 client_id/secret，应用不内置凭据
- **缓存与乐观更新**：TanStack Query（条目详情/剧集 30min，日历/热度 10min，收藏列表 1min，单条收藏 2min，搜索 5min，p1 扩展 1h）。全局 `gcTime` 30min（默认 5min 会在 staleTime 内就回收缓存导致重复请求）；`refetchOnWindowFocus`/`refetchOnReconnect` 均关闭，桌面端焦点切换/网络恢复不触发后台重拉。收藏 mutation **乐观直写全部缓存**（`patchCachedCollections`）+ 失败回滚，成功仅精准失效单条、列表只置 stale 不重拉——勿恢复对 `["collections"]` 的全量失效（会触发 5 类全量分页重拉）。**新增收藏仅乐观插入对应 subjectType 的列表缓存**（勿按 `["collections", username]` 前缀遍历插入全部 5 类——同一 stub 被多类缓存持有后，「全部」视图 flatMap 会渲染出重复卡片）；`getAllUserCollections` 分页拼接时按 `subject_id` 去重（并发翻页期间服务端列表变动平移 offset 可致跨页重复）。收藏状态读取一律走 `useUserCollectionSmart`（先查列表缓存，命中零请求；其返回的 `refetch` 供 CollectAction 失败态重试），勿直接单条 GET。三个 keep-alive 页面均由 App 内 `*Visited` 门控（`watchlistVisited`/`calendarVisited`/`collectionVisited`），首次进入对应页才拉取，冷启动停在其他页零请求
- **未登录引导**：冷启动认证判定完成后仍无用户且用户从未手动切页（App 内 `userInteracted` ref，侧边栏导航经 `navigate()` 置位）→ 自动落地**新番页**（游客可浏览公开数据，空追番页对游客零价值）；注销/会话失效同样适用。追番页未登录空态提供「去认证 / 先逛逛新番」按钮、找番页未登录横幅提供「去认证」按钮（均经 `onNavigate` 回调由 App 注入）；配置页认证区内置可折叠三步凭据创建向导（动态端口模式无需登记回调）
- **今日放送标识**：追番页在看条目经 `useTodayAiringIds`（`lib/today.ts`）匹配每日放送日历缓存（`["calendar"]` 与新番页/热度榜兜底共用，缓存命中零额外请求；60s 心跳跨 0 点自动迁移）——列表行标题行「今天更新」徽标（`SubjectRow todayAiring`）+ 网格卡封面左上「今日」角标（与 R18 同排）+ 在看组头「今日更新 N 部」计数；**仅在看组**（其余收藏组不放送）
- **统一详情容器**：`SubjectDetailView` 是全应用唯一的详情渲染单元（inline=展开行 / dialog=弹窗），字段顺序、加载骨架、错误重试、p1 区块只写一份；收藏/外链操作位于标题行（列表行或弹窗头部），「我的」折叠栏承载评分/进度/备注
- **追番/新番/找番视图统一**：三页共用 `ViewTabs`（列表/网格切换）与 `SubjectGroup`（折叠分组容器；追番/新番分组用，找番无分组）。追番/新番的 ViewTabs 位于搜索框右侧，找番页位于标题栏 toolbar 插槽（持久化 `prefs.collection.viewMode`）。新番页默认列表视图，两种视图都是周一→周日 7 个分组（旧存值 `prefs.calendar.viewMode="table"` 归一化为网格）；网格卡片共用 `SubjectGridCard`（`subject` + `caption` props，追番传进度、新番传关键指标人数——本季在看、季度随所选季为想看/在看/看过；找番搜索传评分、热度榜传热度值）
- **折叠分组无边框样式**：`SubjectGroup` 统一为「柔和底色圆角条分组头 + 内容区无边框无分隔线」（`bg-muted/50` 头部、`hover:bg-muted/70`，组间距 `space-y-3`），新番「今天」分组头部改用 `bg-primary/15` 强调（`primary` 是中性色，/5 与普通头部几乎无差别）。`SubjectRow` 展开详情区同步去掉 `border-t` 分隔线（仅留 `px-4 pb-4 pt-3` 内距，靠行自身的 `data-[state=open]:bg-muted/30` 底色区分）。页面侧的内容包装不再加 `border-t`；追番页骨架屏（`WatchlistSkeleton`）样式与之对齐。**新增分组/折叠容器请沿用此无边框样式**，勿加 `border border-border`
- **卡片类型徽标**：网格卡片（`SubjectGridCard`）与 p1 海报卡片（`SubjectP1Sections.P1SubjectCard`）在封面**右上角**渲染条目类型徽标（`SUBJECT_LABELS` + `SUBJECT_BADGE_STYLES` 彩色胶囊，与列表行 `SubjectRow` 的徽标同款）——该位置原先放评分角标，现由类型徽标顶替（评分仍在列表视图与详情弹窗展示）；p1 卡片的关系角标与类型徽标同排（关系角标可截断，类型徽标 `shrink-0` 不被挤掉）；左上角保留 R18 徽标（`SubjectGridCard`，封面已模糊）。网格卡片底部标题浮层只余标题
- **新番季度切换**：新番页默认「本季」= `/calendar` 每周放送（周一→周日 7 组 + 今日高亮）。季度选择器是**内容区顶部的固定选择条**（`SeasonPicker` 经 `PageLayout` 的 `subheader` 插槽渲染，不随列表滚动）：`[本季] | [年份 ▾] [1月|4月|7月|10月]`，全部**单层平铺**——年份下拉是「次年→2015」的扁列表（含次年，无子菜单），季度是四段分段控件（选中 primary 反白，样式对齐配置页分段控件）；**未来季度可选**（下季条目在库里已公布，实测 2026-10 有 101 条；勿再加「未来置灰」限制）。季度数据走公开接口 `GET /v0/subjects?type=2&year&month`（返回**完整 Subject**，一季 = 3 个月并行 × 月内 limit=50 翻页，每条结果标注**来源月份**作为归属月，合并按 id 去重；勿用 `sort=rank`——会静默丢无排名条目），按**归属月**分 3 组渲染（接口无 `air_weekday`，不按星期；bgm 官方口径：3 月底开播的春季番归 1 月季）。**分组必须用来源月份而非解析 `date`**：远期季度大量条目未定档（`date` 为 null，实测 2027-01 为 48/50），解析日期会把它们全堆进季首月；`date` 为 null 的行由 `MetaRow` 自然隐藏日期。行直接用 `SubjectRow`（数据完整，无需 `EnrichedSubjectRow` 视口补全），数据加载后逐条 `setQueryData(["subject", id])` 预热详情缓存（与 `{id}` 详情同构，展开/hover 预取零请求）。季度选择**不持久化**（启动回本季，会话内 keep-alive 保留）；季度排序（指标/开播/评分/名称 + 方向，自然方向为基准取反，无日期条目排在「开播」序末）持久化 `prefs.calendar.seasonSort`（首键 key 仍为 `heat`，存值形状不变），控件随选择条右侧显示（仅季度模式）。**首键是自适应指标键**（`seasonMetric`：未来季=想看 wish、当前季=在看 doing、过往季=看过 collect，按 `collection` 对应分项降序、同值以收藏总数 tie-break），控件与菜单标签随季度动态显示指标名（如「在看 ▾」）；列表行/网格卡片的「共 N 人X」附加信息同随指标变化（`RowItem.metric` + `metricLabel`）。本季每周放送**无排序控件**，组内静默按在看降序（`collection?.doing ?? 0`，稳定排序同值保持接口原序）。`["calendar"]` query key 保持不变（找番热度榜兜底继续共用）
- **列表信息补全**：`/calendar`、p1 热度榜、搜索结果等列表源缺简介/标签/NSFW（实测 calendar summary 全空，搜索的 tags 常为空、`short_summary` 截短）；`EnrichedSubjectRow`（新番列表行、找番热度榜、找番搜索结果共用）经 `useInViewOnce` 进入视口后才逐行调 `GET /v0/subjects/{id}` 回填（`mergeSubjectDetail`），与 hover 预取/展开详情共享 `["subject", id]` 30min 缓存，失败静默降级；网格视图不做补全（卡片无简介/标签）
- **追番排序**：排序键 默认/收藏/评分/名称/更新（`collect`=条目收藏人数 `collection_total`，接口可能缺省按 0）+ 升降序 toggle。持久化 `prefs.watchlist.sortReversed`（布尔，以各键自然方向为基准取反），老用户已有排序行为不变；「默认」倒序 = 接口原序整体反转
- **找番搜索历史**：提交关键词即记录——最新在前、去重、上限 10 条，持久化 `prefs.collection.searchHistory`（Store）；搜索框下方 badge 区：点击 badge 填入搜索框、× 删单条、标题行可折叠、「清空」全清；清空搜索框即回热度榜初始态（`submitted` 置 null）。类型筛选持久化 `prefs.collection.subjectType`（**哨兵值 0=全部**——store 的 setStore(undefined) 即删键，删键会回默认值动画，无法区分「存过全部」与「未存」，故用 0 表示全部）。搜索结果排序（默认/评分/名称）为客户端对**已加载条目**排序，会话内状态不持久化；热度榜带刷新按钮（`useTrendingFeed` 透出 refetch，p1 仍失败时日历兜底继续生效）
- **数据备份与恢复**：配置页把全部 5 类收藏（含评分/进度/备注/标签/私密标记）导出为带时间戳的 JSON 文件（`anime-watchlist-backup-YYYYMMDD-HHmmss.json`，每次新文件不覆盖历史）。数据仍实时拉 API（「数据不落库」原则不变）：取数复用 `collectionsQueryOptions`（`qc.fetchQuery`，staleTime 内命中缓存零请求）；目录选择走 `@tauri-apps/plugin-dialog`（`dialog:default` 权限），读写文件走应用自有 Rust 命令 `write_text_file`/`read_text_file`（自有命令不占 capability 权限面，**勿为此引入 fs 插件**）；备份目录与上次备份时间持久化 `prefs.backup.dir`/`prefs.backup.last_time`（Store）。**恢复（导入）为聚合恢复**（`backup.ts`）：选文件 → `parseBackupPayload` 校验（app 标识/schemaVersion/形状）→ `planRestore` 与当前收藏按 subject_id 对比出 {新增/已存在} 预览 → 选模式（跳过已收藏 / 用备份覆盖）→ `runRestore` 并发 2 逐条执行——新增条目 POST `{type}` 后立即 PATCH 恢复字段（偶发 404 服务端索引延迟会重试一次），带 `tags` 的 PATCH 被拒时自动去 tags 重试并计数；单条失败记录不中断，完成后**全量失效** `["collections"]`/`["collection"]`（显式全量操作允许全量重拉）。**不做**：删除当前账号多出的收藏（上游无删除端点）、逐集勾选的读取与恢复（无读取端点，网页端非连续勾选会被「前 N 话」推断改写——明确放弃，见 docs/roadmap.md PM-4）
- **封面**：所有封面/角色图取图统一走 `lib/cover.ts` 的 `coverUrl(images, 200|400|800)`——lain.bgm.tv 的 `/r/<宽>/` 是官方缩放前缀（v0 各字段即 `r/100|200|400|800` 包裹同一原始 `l/` 路径，2026-10 实测 v0 详情/用户收藏/搜索同构、`common`=r/400；p1 同形但同名键小一档），函数把任意 lain 原始路径（r/ 包裹形或经典 `l/` 形，含 `pic/crt/` 角色图与 `r/WxH` 方形裁切）改写到精确档位并归一 https；经典 `s/m/c/g` 是独立文件不可改写（此类源改写自 `large` 的 `l/` 路径），非 lain 源按档位回退就近字段。档位：列表行缩略(64px)→200、网格卡/详情弹窗缩略/p1 海报卡→400、行点击放大→800（详情弹窗内放大仍 `large` 原图）；r/400 与 v0 `common` 同 URL 跨页共享 WebView2 缓存。`mergeSubjectDetail` 的 images 回填保留（v0 权威源），但 merge 前的行/卡/放大已直接清晰，`calendarToSlimSubject` 的字段级 images 重映射已移除。`index.html` 对封面 CDN `lain.bgm.tv` 做 preconnect（API 走 Rust 侧不经 webview，无需预连接），`FadeImg` 默认 `loading="lazy" decoding="async"`（WebView2 会因批量 lazy 封面打 `[Intervention]` INFO 日志，属正常机制回执勿当报错）

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

**发版前置检查**：发版前先确认本地提交已全部推送——`git fetch` 后 `git status -sb` 应无 ahead，有未推送提交先 `git push`。tag 打在本地提交上，未推送的提交不会进 CI 构建，也不会进自动生成的 release notes。

**CI 触发**：`.github/workflows/release.yml` 仅在推送 `v*` tag 时触发（`on: push: tags: v*`），推 `main` 不会触发。**发布 = 打 tag 推送，不是推 main。**

CI 在 `windows-latest`：安装依赖 → `npm run tauri build` → 打包便携 zip → `gh release create` 上传并自动生成 release notes（Checkout 用 `actions/checkout@v5`、`fetch-depth: 0` 取上一 tag 起的提交）。

详情见 `docs/dev/release.md`。

## 注意

- **端口**：开发用 3000（HMR 3001），host 固定 127.0.0.1。本机 Windows 保留 1390-1489 等段，不能用那些段
- **204/空 body**：`bgmRequest` 统一用 `res.text()` 读取，空则返回 undefined，避免 JSON 解析报错
- **SlimSubject vs Subject**：列表接口返回 SlimSubject（`short_summary`/顶层 `score`），完整 Subject 仅 `GET /v0/subjects/{id}` 有 `summary`/`rating.score`/`total_episodes`
- **infobox 形状多态**：Bangumi 部分条目 infobox 缺 `values` 或整体非数组，渲染前必须容错（`infoboxValue`）；详情树包 ErrorBoundary，数据异常只降级单区块不白屏
- **p1 私有接口**（next.bgm.tv，无官方文档）：解析宽松、失败静默降级（区块直接隐藏），缓存 1h（`lib/p1.ts`）。**响应形状会漂移**：2026-09 实测 characters/relations/recs 由顶层数组变为 `{data:[...],total}` 包装、条目嵌套 `character`/`subject` 键、`relation` 变对象、CV 键 `cast`→`casts[].person`——`p1.ts` 统一解包归一化为扁平类型（列表 getter 返回 `{items,total}`，total 供截断校验），渲染层与 `types/bgm.ts` 不感知，改形状时只动 p1.ts；`/p1/characters/{id}`、`/p1/persons/{id}` 详情端点形状未实测，`normalizePerson` 宽松归一化「能取多少取多少」，弹窗 UI 降级；部分条目数据本身为空（`{"data":[],"total":0}`），按空数据隐藏非异常（详见 `docs/API.md` p1 章节）
- **收藏默认私密**：POST collection 恒带 `private:true`（新增收藏默认私密）；PATCH 的 `private` 由 queries 层组装——`usePatchCollection` 以 vars `currentPrivate`（各调用点传 `col.private`）兜底、显式切换传 `private` 字段（「我的」头部私密开关），**勿在 bgm 层重新硬编码 private**（会把网页端设为公开的收藏重置回私密）；服务端要求改非 type 字段必带 private
- **不提供「取消收藏」**：Bangumi v0 API 无取消收藏条目端点——官方 OpenAPI 对 `/v0/users/-/collections/{subject_id}` 只定义 post/patch，服务端 routes.go 相关 DELETE 注释为 `TODO: wait for soft delete`（人物/角色同理），实测 DELETE 返回框架默认 404。相关调用代码已移除，勿凭文档加回
- **Bangumi API base**：`https://api.bgm.tv`（v0），OAuth 用 `https://bgm.tv`
