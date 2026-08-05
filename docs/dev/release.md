# 版本更新与发布手册

> 面向开发者与 AI：把「**更新版本**」和「**发布版本**」两件事分开做、做清晰。
> 脚本入口：`scripts/release.mjs`，通过 `npm run bump` / `npm run release` 调用。

## 两件事的区分

| 动作 | 命令 | 做了什么 | 打 tag / 推送 |
|---|---|---|---|
| **更新版本** | `npm run bump <bump>` | 改 5 处版本号 + 提交 `chore: bump version to vX.Y.Z` | 否 |
| **发布版本** | `npm run release <bump>` | bump（如需）+ 提交 + 打 tag + 推送 | 是 → 触发 CI |

`<bump>` 取值：

- `patch`：`1.2.0 → 1.2.1`
- `minor`：`1.2.0 → 1.3.0`
- `major`：`1.2.0 → 2.0.0`
- 或直接指定版本号：`1.2.3`

## 版本语义（何时用哪种）

| 类型 | 场景 |
|---|---|
| `patch` | 修复 bug / 小调整 |
| `minor` | 新增功能（向后兼容） |
| `major` | 破坏性变更 |

## 5 个版本文件

以 `package.json` 的 `version` 为**权威源**，脚本自动同步其余 4 处：

| 文件 | 字段 |
|---|---|
| `package.json` | `version`（权威源） |
| `src-tauri/Cargo.toml` | `package.version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.lock` | `anime-watchlist` 包 `version` |
| `src/lib/bgm.ts` | `USER_AGENT` 中的 `anime-watchlist/<version>` |

## 流程

### 更新版本（只改版本号 + 提交）

```bash
npm run bump minor        # 1.2.0 → 1.3.0
```

- 改动 5 个版本文件并提交，**不打 tag、不推送**。
- 提交后可以继续开发；确认要发布时再走下一步。

### 发布版本（打 tag 推送触发 CI）

```bash
npm run release minor     # 一步到位：bump + 提交 + 打 tag + 推送
# 或已用 bump 更新过版本：
npm run release 1.3.0      # 版本已一致，脚本只打 tag + 推送
```

- **CI 触发条件**：`.github/workflows/release.yml` 只在推送 `v*` tag 时触发（`on: push: tags: v*`）。**推 `main` 分支不会触发**。
- CI 在 `windows-latest`：安装依赖 → `npm run tauri build` → 打包便携 zip → `gh release create` 发布。

### 验证

```bash
gh run list --workflow release.yml     # 查看触发与状态
gh run watch <run-id>                  # 等待完成
gh release view v1.3.0                 # 确认 Release 已发布
```

## AI 决策树

用户说什么 → 做什么：

| 用户的话 | 动作 |
|---|---|
| 「更新版本」「升到 X.Y.Z」 | `npm run bump <bump>`，**不打 tag 不 push** |
| 「发布」「发版」「推送」「打 tag」 | 已 bump 过 → `npm run release X.Y.Z`；未 bump → `npm run release <bump>`；随后 `gh run list` 验证 |
| 只说「提交」 | 只 commit，不 push（版本已改则提交版本文件） |

**常见坑**：改了版本号、提交了、推了 `main`，但 CI 没跑 —— 因为没打 tag。**发布 = 打 tag 推送，不是推 main。**

## 相关文件

- 脚本：`scripts/release.mjs`
- CI：`.github/workflows/release.yml`
- 版本号权威源：`package.json`
