# Bangumi API 说明

本文是本项目**全部外部 API 的单一权威文档**，覆盖两个数据 API 来源——**v0 官方 API**（`api.bgm.tv`）与 **p1 私有 API**（`next.bgm.tv`），以及 v0 的认证通道 **OAuth 2.0**（`bgm.tv`）。

## API 来源总览

| 来源 | Base URL | 鉴权 | 用途 |
|---|---|---|---|
| **v0 官方 API** | `https://api.bgm.tv` | `Authorization: Bearer <access_token>`（仅 `/calendar` 公开） | 搜索、条目详情、收藏 CRUD、剧集、用户资料 |
| **OAuth 2.0** | `https://bgm.tv` | client_id / client_secret + 授权码 | v0 的认证前提：授权页跳转、code 换 token、refresh_token 刷新 |
| **p1 私有 API** | `https://next.bgm.tv` | 无（热度榜等公开接口） | 收藏页空态「热门条目」热度榜；详情页条目扩展（角色/关联/推荐） |
| 图片 CDN | `https://lain.bgm.tv` | 无 | 条目封面 / 头像（API 响应返回 URL，`<img>` 直载，**不经 fetch**） |

> - 运行时还有一个**本地**回环服务器（`http://localhost:7359-7369/callback`，Rust tiny_http）接收 OAuth 回调，不是外部服务。
> - 所有 HTTP 请求域名必须在 `src-tauri/capabilities/default.json` 的 `http:default` 白名单内，上述 4 个域名均已登记。**新增域名需同步更新白名单**，否则运行时被 Tauri ACL 拒绝。

---

## 通用约定（HTTP 客户端）

所有对 v0 / OAuth / p1 的请求统一走 `src/lib/bgm.ts` 的 `bgmRequest`（p1 以完整 URL 复用同一封装）。

### 必须使用 `@tauri-apps/plugin-http`

Bangumi 要求所有请求带自定义 User-Agent，而 WebView 内的 `fetch` 无法设置 UA，故全部请求走 plugin-http（Rust 侧 reqwest），同时绕过 WebView CORS。**禁止改用浏览器原生 fetch**。

### User-Agent（必带）

```
GitZhiQing/anime-watchlist/<version> (https://github.com/GitZhiQing/anime-watchlist)
```

版本号来自 `src/lib/bgm.ts` 的 `USER_AGENT` 常量，随发布流程自动同步（见 `dev/release.md`）。

### 统一请求行为（`bgmRequest`）

- `path` 不以 `http` 开头时自动拼 `API_BASE`；p1 等完整 URL 直接透传
- query 参数自动过滤 `undefined` / `null`
- 非 GET 且有 body → 自动加 `Content-Type: application/json`
- 响应统一先 `res.text()` 再解析，**空 body（204）返回 `undefined`**，避免 JSON 解析报错
- 失败抛 `BgmError`（携带 status，message 取服务端 `description`）；认证已失效抛 `AuthExpiredError`（其子类）
- `connectTimeout`：API 15s / OAuth 换 token 10s / 代理测试 8s
- 缓存（TanStack Query，`src/lib/queries.ts`）：条目详情 `staleTime` 30min，收藏列表 1min，mutation 成功后失效

### 401 自动刷新与登录态

- 请求返回 401 → 用 refresh_token 刷新一次 → 换新 token 重试一次，**封顶单周期**（刷新后重试仍 401 视为令牌被持续拒绝）
- Bangumi **每次刷新都会轮换 refresh_token**，并发刷新会互相作废 → 刷新必须串行（in-flight promise 去重锁，`refreshAccessToken`）
- 刷新被服务端明确拒绝（400/401）→ `clearAuth()` + emit `auth-expired` + 抛 `AuthExpiredError`，上层不重试并清除收藏缓存，提示重新认证
- 网络 / 超时错误**保留登录态**，避免断网时把用户无端踢下线
- token 过期判定提前 60s（`isTokenExpired`）；应用启动时 `initAuth` 对临期 token 主动刷新并重取 `/v0/me`

### HTTP 代理（可选）

- `src/lib/proxy.ts` 把 store 中的配置（地址必填 + 可选 Basic 认证）转成 plugin-http 的 `{ all: { url, basicAuth? } }`，注入**所有** Bangumi 请求（API / OAuth / 测试探针共用）
- 内存缓存，保存新配置后调用 `invalidateProxyCache()`
- 「测试连接」探针：`GET https://api.bgm.tv/v0/search/null?limit=1`，状态码 < 500 即链路可用
- 封面 / 头像图片走 WebView `<img>`，**不经此代理**

---

## 认证：OAuth 2.0 Authorization Code（bgm.tv）

官方原始文档：<https://github.com/bangumi/api/blob/master/docs-raw/How-to-Auth.md>

凭据（client_id / client_secret）由用户在配置页自填，应用不内置；配置页提供 `bgm.tv/dev/app` 注册入口。

### 流程四步

**1. 引导授权**

```
GET https://bgm.tv/oauth/authorize
```

| 参数 | 说明 |
| --- | --- |
| `client_id` | App ID（注册应用时获取） |
| `response_type` | 固定 `code` |
| `redirect_uri` | 回调地址，见下节 |
| `state` | 16 字节随机 hex，防 CSRF（自动模式下校验） |

**2. 用 code 换 token**

```
POST https://bgm.tv/oauth/access_token
Content-Type: application/x-www-form-urlencoded
```

`grant_type=authorization_code`，参数：`client_id`、`client_secret`、`code`、`redirect_uri`。**`code` 有效期 60 秒**。失败处理：4xx（凭据无效 / `redirect_uri_mismatch` 等）为确定性失败不重试；5xx / 网络错误最多重试 2 次（退避 500ms / 1s）。

**3. 刷新 token**（同一端点）

`grant_type=refresh_token`，参数：`client_id`、`client_secret`、`refresh_token`、`redirect_uri`。**`redirect_uri` 必须与当初换 token 时一致**（本应用把每次的 `redirect_uri` 持久化到 store 供刷新读取）。返回新的 access_token + refresh_token（**轮换**，见「401 自动刷新」）。

**4. 访问 API**

```
Authorization: Bearer <access_token>
```

> v0 接口**不允许**用 query string 传 token，必须走 Authorization Header。

token 响应：

```json
{ "access_token": "...", "expires_in": 604800, "token_type": "Bearer",
  "scope": null, "refresh_token": "...", "user_id": 123 }
```

`expires_in` 604800 = 7 天；`user_id` 即 Bangumi 用户 ID。

### 回调地址（redirect_uri）

| 模式 | 行为 | 后台登记 |
| --- | --- | --- |
| **动态端口（默认）** | Rust 从 7359–7369 逐个尝试绑定（每端口先 IPv6 `::1` 后 IPv4 `127.0.0.1`），绑定后 emit `oauth-port` 事件，JS 据此构造 `http://localhost:{port}/callback` 再打开授权页 | **无需登记**（换 token 的 `redirect_uri` 等于授权时用的动态值，Bangumi 实测支持，符合 RFC 8252 loopback OAuth） |
| 固定端口（配置页勾选回退） | 仅试 7359 | 需在开发者后台登记 `http://localhost:7359/callback` |
| 手动粘贴 code | 全部端口被占时的兜底 | — |

> Rust 回调服务器只接受 `/callback` 路径，120s 超时，返回成功 / 失败 HTML 页；取消授权时由 JS 调 `stop_oauth_server` 释放端口。

### 本应用实现

- `src/hooks/useOAuthFlow.ts` — 授权交互状态机：显式阶段 + 120s 倒计时 + 可取消
- `src/lib/auth.ts` — `buildAuthorizeUrl` / `exchangeCodeForToken` / `storeTokens` / `initAuth`（启动时认证状态单一真相源）
- `src-tauri/src/lib.rs` — `start_oauth_server` / `stop_oauth_server`

---

## v0 官方 API（api.bgm.tv）

### 在用端点总表（10 个）

| # | 方法 | 路径 | 用途 | 认证 | 本应用封装 |
|---|---|---|---|---|---|
| 1 | GET | `/v0/me` | 当前用户资料 | Bearer | `getMe` |
| 2 | GET | `/calendar` | 每日放送（日历） | **公开** | `getCalendar` |
| 3 | POST | `/v0/search/subjects` | 条目搜索 | Bearer | `searchSubjects` |
| 4 | GET | `/v0/subjects/{subject_id}` | 条目完整详情 | Bearer | `getSubject` |
| 5 | GET | `/v0/users/{username}/collections` | 收藏列表（分页） | Bearer | `getUserCollections` / `getAllUserCollections` |
| 6 | GET | `/v0/users/{username}/collections/{subject_id}` | 单条收藏状态 | Bearer | `getUserCollection` |
| 7 | POST | `/v0/users/-/collections/{subject_id}` | 新增收藏 | Bearer | `setCollection` |
| 8 | PATCH | `/v0/users/-/collections/{subject_id}` | 修改收藏（夹 / 进度 / 评分） | Bearer | `patchCollection` |
| 9 | GET | `/v0/episodes` | 条目剧集列表（分页） | Bearer | `getEpisodes` |
| 10 | PUT | `/v0/users/-/collections/-/episodes/{episode_id}` | 标记单话看过 / 未看 | Bearer | `setEpisodeWatched` |

> 路径中的 `-` 代表「当前认证用户」，本应用一律用 `/v0/users/-/…`，不写死 username。

### 端点细节

#### GET /v0/me 当前用户

认证完成后获取用户资料（id / username / nickname / sign / avatar / user_group），存入 store 作为登录态。启动时 `initAuth` 与授权成功后各取一次。

#### GET /calendar 每日放送

**公开接口，无需认证**（`auth: false`）。返回 Legacy 格式 `CalendarDay[]`（weekday + `CalendarSubject[]`，与 v0 新版类型不同，单独建模）。用途：日历页（`Calendar.tsx`）+ p1 热度榜失败时的**兜底数据源**（见下文 p1 章节）。

#### POST /v0/search/subjects 条目搜索

- query：`limit`、`offset`（无限翻页，`useSearchSubjects`）
- body：

```json
{
  "keyword": "搜索词",
  "sort": "match",
  "filter": { "type": [2, 1, 3, 4, 6] }
}
```

`filter.type`：选了具体类型时为 `[subjectType]` 单类型精确搜索；未选时为全部 5 类型 `[2,1,3,4,6]`（动画优先）。**注意 `SubjectType` 枚举无 5**：1=Book、2=Anime、3=Music、4=Game、6=Real。

#### GET /v0/subjects/{subject_id} 条目完整详情

**列表接口只返回 `SlimSubject`**（`short_summary` / 顶层 `score`）；`summary`、`rating.score`、`collection`、`total_episodes` 等完整字段**仅此接口有**（`Subject`）。缓存 30min。展开详情（`SubjectDetailView.tsx`）时按需拉取。

#### GET /v0/users/{username}/collections 收藏列表

query：`subject_type`、`limit`（本应用 50）、`offset`。返回 `PagedUserCollections`（`data` / `total` / `limit` / `offset`）。

`getAllUserCollections` 抓全量策略：先取第 0 页探知 `total`（并信任服务端压低的 `limit`），剩余页**有界并发 2** 拉取（5 类型并行时峰值并发 ≈ 5 + 5×2，兼顾速度与限流），单类型上限 100 页（5000 条 / 类型），结果按 offset 升序拼接。

#### GET /v0/users/{username}/collections/{subject_id} 单条收藏状态

**404 表示未收藏**，封装层捕获并返回 `null`，便于调用方区分「未收藏」（`CollectAction.tsx`）。

#### POST /v0/users/-/collections/{subject_id} 新增收藏

body 只传 `{ "type": <CollectionType>, "private": true }`，其余字段（rate / ep_status / comment / tags）不设置。**本应用收藏一律默认私密**。成功返回 204 无内容。

#### PATCH /v0/users/-/collections/{subject_id} 修改收藏

body 为 `CollectionPatch` 子集：`type`（收藏夹）、`ep_status`、`vol_status`、`rate`、`comment`、`private`。本应用用于：切换收藏夹、编辑进度（`ProgressEdit.tsx`）、评分（`Watchlist.tsx`）。

> 官方文档警告「直接修改剧集条目完成度只能用于书籍类条目」，**实测**修改收藏夹与动画进度均可用。**改非 type 字段时也必须带 `private`**（服务端要求）。

> **没有「取消收藏」端点**：官方 OpenAPI 对该路径只定义 POST/PATCH，服务端 routes.go 中条目/人物/角色的 DELETE 均因 `TODO: wait for soft delete` 未实现（实测返回框架默认 404「This is default response」）。本应用因此**不提供取消收藏功能**，勿凭文档添加 DELETE 调用。

#### GET /v0/episodes 剧集列表

query：`subject_id`、`type=0`（主篇）、`limit=100`、`offset`。`getEpisodes` 自动翻页（并发 2）拼全量。`Episode` 字段：`id` 为**全局剧集 id**（标记单话时用），`ep` 为条目内序号，另有 `name` / `name_cn` / `airdate` / `duration` / `desc`。用途：进度编辑（`ProgressEdit.tsx`）。

#### PUT /v0/users/-/collections/-/episodes/{episode_id} 标记单话

body：`{ "type": 2 }` 看过 / `{ "type": 0 }` 未收藏。

> **注意：路径中没有 subject_id**，按全局 `episode_id` 定位；且用 PUT 传 type，而非 POST / DELETE。

### 数据模型注记

- **SlimSubject vs Subject**：列表 / 搜索 / 热度榜用 `SlimSubject`（顶层 `score` + `short_summary`）；完整 `Subject` 仅 `GET /v0/subjects/{id}`
- **CollectionType**（收藏夹）1–5：想看 / 看过 / 在看 / 搁置 / 抛弃
- `/calendar` 返回 Legacy `CalendarSubject`（旧格式），与 v0 新版类型分开建模
- p1 的返回为 camelCase，单独建模后映射（见下节）
- 全部类型定义见 `src/types/bgm.ts`

---

## p1 私有 API（next.bgm.tv）

> p1 是 Bangumi Web 新前端（`next.bgm.tv`）使用的后端接口族，**官方文档未公开**（`bangumi.github.io/api` 只覆盖 v0）。本应用使用其中的**热度榜**（找番空态）与**条目角色/关联/推荐**（详情页扩展区块）接口，其余仅记录供参考。**未文档化接口随时可能变更，接入需配套兜底方案**——2026-09 详情三接口就发生过响应形状变更（见下文），`src/lib/p1.ts` 统一解包归一化。

### 概览

| 项 | 说明 |
|---|---|
| 域名 | `https://next.bgm.tv`（与 v0 的 `https://api.bgm.tv` 并存） |
| 鉴权 | 热度榜等公开接口**无需鉴权**；用户私有数据接口需 Web 登录态（v0 的 Bearer token 在 p1 上返回 401） |
| 字段风格 | **camelCase**（`nameCN` / `metaTags`），与 v0 的 snake_case 不同，接入需映射 |
| 发现途径 | 第三方客户端仓库记录的私有接口文档 + 生成的 p1 OpenAPI 规范（见文末「原始文档」） |

### GET /p1/trending/subjects 热度榜（在用）

Web 端「近期注目」榜（`bangumi.tv/anime/browser/?sort=trends`）的数据源，按**新增热度**排序。本应用用于收藏页空态「热门条目」（`useTrendingSubjects` / `useTrendingFeed`）。

**参数**

| 参数 | 必填 | 说明 |
|---|---|---|
| `type` | ✅ | `SubjectType` 整数枚举：`1=book`、`2=anime`、`3=music`、`4=game`、`6=real` |
| `limit` | | 默认 `20`，最大 `100` |
| `offset` | | 默认 `0`，最小 `0` |

**响应**

```jsonc
{
  "data": [
    {
      "subject": {
        "id": 622206,
        "name": "ヤニねこ",
        "nameCN": "尼古喵喵",
        "type": 2,
        "info": "2026年7月2日 / ...",
        "metaTags": ["TV", "日本", "漫画改"],
        "rating": { "rank": 1964, "score": 7.15, "total": 2933, "count": [/* 分段评分人数 */] },
        "images": { "large": "...", "common": "...", "medium": "...", "small": "...", "grid": "..." }
      },
      "count": 8273   // 新增热度值
    }
  ],
  "total": 20
}
```

**`count` 语义（实证结论，官方未说明）**

- 是 trends 排名的排序键，顺序与 Web 端 `sort=trends` 完全一致
- 是「近期热度」而非静态指标：当季新番霸榜，长篇老番（航海王 / 柯南）不入榜
- **非小时级实时值**：间隔约 2 小时两次快照 20 条 `count` 全部一致 → 服务端强缓存或时间窗在数天以上
- **分区相对值**：动画榜顶 ~8000，书籍榜顶仅 ~200，跨 `type` 不可比
- 最可能含义：最近时间窗内把该条目加入收藏的人数（可能带时间衰减），**未证实，展示时勿当「观看人数 / 总收藏数」**

**p1 → v0 `SlimSubject` 字段映射**（`src/lib/trending.ts` 的 `p1ToSlimSubject`）

| p1 | v0 `SlimSubject` | 备注 |
|---|---|---|
| `nameCN` | `name_cn` | 空时回退 `name` |
| `name` | `name` | |
| `metaTags` | `tags` | 映射为 `{ name, count: 0 }` |
| `rating.score` | `score` | 无 `rating` 时置 0 |
| `rating.rank` | `rank` | |
| `images` | `images` | 键结构相同**但同名键尺寸不同**（见下方实测），透传后需经 `mergeSubjectDetail` 回填 v0 `images` 修正 |
| — | `short_summary` | **p1 无此字段**，置空字符串 |
| — | `date` | **p1 无此字段**，热度榜行不显示放送日期 |

**同名 `images` 键、不同尺寸（2026-09 实测）**

| 来源 | `medium` | `small` | `large` |
|---|---|---|---|
| v0 `GET /v0/subjects/{id}` | `lain.bgm.tv/r/800/…`（**800px，弹窗大图基准**） | `r/200` | 原图（实测 1200px） |
| p1 `/p1/trending/subjects` | `lain.bgm.tv/r/200/…`（200px 缩略图） | `r/100` | 原图 |
| calendar（legacy 经典路径） | `pic/cover/m/…`（实测仅 100×142） | `pic/cover/s/…` | `pic/cover/l/…` |

含义：封面弹窗统一取 `images.medium`，但热度榜（p1）与日历兜底行透传的 `medium` 是缩略图尺寸，点开会「仍然是缩略图」。`EnrichedSubjectRow` 的 `mergeSubjectDetail` 已把 v0 详情的 `images` 回填进列表行统一修正（详情本就因补全简介而拉取，零额外请求；详情拉取失败时降级保持原样）。

**兜底策略**：p1 失败时自动切 `/calendar`，按追番人数（`collection.doing`）降序取前 limit（`deriveCalendarTrending`，过滤热度 > 0）。`TrendingItem.source` 区分 `"trends"` / `"calendar"`，UI 可标注数据来源。

### GET /p1/subjects/{id}/characters・relations・recs 条目扩展信息（在用）

详情页底部「角色/CV / 关联条目 / 相关推荐」三区块的数据源（`src/lib/p1.ts`），公开接口无需鉴权。**2026-09 实测响应形状变更**：由「顶层数组」变为 `{data:[...], total}` 包装，且条目本身由扁平变为嵌套（`character` / `subject` 键）。`p1.ts` 统一解包并归一化为扁平类型（宽松兼容旧形状），渲染层不感知。

**响应（三个接口同构）**

```jsonc
{
  "data": [
    // characters：角色 + CV（CV 在 casts[].person 下）
    { "character": { "id": 302, "name": "碇シンジ", "nameCN": "碇真嗣", "images": { "medium": "...", "small": "...", "large": "..." } },
      "casts": [ { "person": { "id": 75303, "name": "绪方惠美", "images": { /* … */ } } /*, lang 等 */ } ],
      "type": 1, "order": 1 },
    // relations：关联条目（relation 由旧版字符串变为对象，cn 优先）
    { "subject": { "id": 114284, "name": "...", "nameCN": "...", "type": 2, "images": { "grid": "...", "medium": "..." }, "rating": { /* … */ } },
      "relation": { "id": 1, "en": "Adaptation", "cn": "改编", "jp": "", "desc": "..." },
      "order": 1 },
    // recs：相关推荐（评分嵌套在 subject.rating.score）
    { "subject": { "id": 6049, "name": "...", "nameCN": "...", "images": { /* … */ }, "rating": { "score": 8.86, /* … */ } },
      "sim": 8, "count": 0 }
  ],
  "total": 20
}
```

**实测结论**

- 部分条目三接口均返回 `{"data":[],"total":0}`（服务端无数据），UI 按空数据隐藏区块，非异常
- 数据完整度不稳定（如 EVA TV 版 characters/recs 为空、relations 有值），三区块需独立降级
- 归一化映射：`character`/`subject` 内层 → 扁平条目；`casts[].person` → `cast[]`；`relation.cn||en` → `relation` 字符串；`subject.rating.score` → `score`

### 其余 p1 接口（参考，未使用）

完整路径来自第三方生成的 p1 OpenAPI 规范（见文末）：

| 分组 | 路径 |
|---|---|
| 热度 | `/p1/trending/subjects`、`/p1/trending/subjects/topics` |
| 条目 | `/p1/subjects`、`/p1/subjects/{subjectID}`、`{id}/comments`、`{id}/episodes`、`{id}/reviews`、`{id}/staffs/persons`、`{id}/staffs/positions`、`{id}/topics`、`/p1/subjects/-/posts/{postID}`、`/p1/subjects/-/topics/{topicID}`(+`/replies`)（`{id}/characters`、`{id}/recs`、`{id}/relations` 已在用，见上文） |
| 角色/人物 | `/p1/characters/{characterID}`(+`/casts`、`/collects`、`/comments`)、`/p1/persons/{personID}`(+`/casts`、`/collects`、`/comments`、`/works`) |
| 收藏 | `/p1/collections/subjects`、`/p1/collections/subjects/{subjectID}`、`/p1/collections/characters`、`/p1/collections/persons`、`/p1/collections/indexes`、`/p1/collections/episodes/{episodeID}`、`/p1/users/{username}/collections/{subjects\|characters\|persons\|indexes}` |
| 日历 | `/p1/calendar` |
| 用户 | `/p1/me`、`/p1/users/{username}`(+`/followers`、`/friends`、`/groups`、`/indexes`、`/timeline`、`/blogs`)、`/p1/followers`、`/p1/friends` |
| 小组/讨论 | `/p1/groups/{groupName}`(+`/members`、`/topics`)、`/p1/groups/-/posts/{postID}`、`/p1/groups/-/topics/{topicID}`(+`/replies`) |
| 日志/相册 | `/p1/blogs/{entryID}`(+`/comments`、`/photos`、`/subjects`)、`/p1/blogs/-/comments/{commentID}` |
| 时间线 | `/p1/timeline`、`/p1/timeline/{timelineID}`(+`/replies`) |
| 通知 | `/p1/notify`、`/p1/clear-notify` |
| Wiki | `/p1/wiki/subjects`、`/p1/wiki/subjects/{subjectID}`(+`/covers`、`/covers/{imageID}/vote`、`/ep`、`/history-summary`)、`/p1/wiki/ep/{episodeID}`、`/p1/wiki/persons/{personID}`、`/p1/wiki/recent`、`/p1/wiki/lock/subjects`、`/p1/wiki/unlock/subjects` |
| 认证/其他 | `/p1/login`、`/p1/logout`、`/p1/turnstile`（Cloudflare 验证）、`/p1/blocklist`(+`/{id}`)、`/p1/debug` |

> 上面部分接口在 p1 规范中存在，但与 Web 端页面**并非完全等价**（如 `game` 类型热门榜差异较大），接入前需按接口实测。

### 原始文档 URL

| 资源 | URL |
|---|---|
| **p1 OpenAPI 规范**（open-ani/animeko，`p1.yaml`） | <https://github.com/open-ani/animeko/blob/main/datasource/bangumi/p1.yaml> |
| **私有接口接入记录**（bangumi-electron，含 `/p1/trending/subjects` 实测对比） | <https://github.com/CottonCandyZ/bangumi-electron/blob/main/docs/private-api.md> |
| **Web 热度页**（`sort=trends`，服务端渲染，抓取会撞登录墙） | <https://bangumi.tv/anime/browser/?sort=trends> |

---

## 官方文档与参考

- v0 源仓库：<https://github.com/bangumi/api/>
- v0 完整 OpenAPI 规范：<https://github.com/bangumi/api/blob/master/open-api/v0.yaml>
- v0 在线文档：<https://bangumi.github.io/api>
- OAuth How-to-Auth：<https://github.com/bangumi/api/blob/master/docs-raw/How-to-Auth.md>

## 相关代码

| 文件 | 职责 |
|---|---|
| `src/lib/bgm.ts` | HTTP 客户端：UA / Bearer / 401 自动刷新 / v0 与 p1 全部封装 |
| `src/lib/auth.ts` | OAuth 流程编排原语 + `initAuth` 启动认证 |
| `src/hooks/useOAuthFlow.ts` | 授权交互状态机（阶段 / 倒计时 / 取消） |
| `src/lib/proxy.ts` | 代理配置转换 + 连通性测试 |
| `src/lib/trending.ts` | p1 热度榜数据层 + 日历兜底 + 字段映射 |
| `src/lib/queries.ts` | TanStack Query hooks（缓存 / 失效 / 认证失效处理） |
| `src/types/bgm.ts` | 全部数据类型（v0 / calendar / p1） |
| `src-tauri/src/lib.rs` | OAuth 本地回环回调服务器（tiny_http，7359–7369） |
| `src-tauri/capabilities/default.json` | Tauri HTTP 域名白名单 |
