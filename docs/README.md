# docs 文档索引

本项目文档，面向开发者与 AI 辅助编码（Vibe Coding）。

## 目录

| 文档 | 内容 |
|---|---|
| [API.md](API.md) | **Bangumi API 总文档**：来源总览（v0 官方 `api.bgm.tv` + p1 私有 `next.bgm.tv`）、OAuth 认证、通用 HTTP 约定、全部在用端点与实测结论 |
| [dev/dev.md](dev/dev.md) | 项目概览：技术栈、页面布局、功能说明 |
| [dev/tech.md](dev/tech.md) | 技术报告：架构决策、版本管理、构建与发布 |
| [dev/release.md](dev/release.md) | 版本更新与发布手册：更新 vs 发布、CI 触发、验证 |

## 速查

- 认证/OAuth、全部接口：见 `API.md`
- 本应用类型定义与数据模型：`src/types/bgm.ts`
- HTTP 客户端 / 401 自动刷新：`src/lib/bgm.ts`
- 数据查询 hooks：`src/lib/queries.ts`
- 仓库根 `AGENTS.md`：面向 AI 的架构与命令速览
