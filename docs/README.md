# docs 文档索引

本项目文档，面向开发者与 AI 辅助编码（Vibe Coding）。

## 目录

| 文档 | 内容 |
|---|---|
| [api/v0.md](api/v0.md) | Bangumi **v0 官方 API**（`api.bgm.tv`）：OAuth 认证、本应用用到的关键接口 |
| [api/p1.md](api/p1.md) | Bangumi **p1 私有 API**（`next.bgm.tv`）：热度榜接口、完整接口清单、原始文档 URL |
| [dev/dev.md](dev/dev.md) | 项目概览：技术栈、页面布局、功能说明 |
| [dev/tech.md](dev/tech.md) | 技术报告：架构决策、版本管理、构建与发布 |

## 速查

- 认证/OAuth：见 `api/v0.md`
- 本应用类型定义与数据模型：`src/types/bgm.ts`
- HTTP 客户端 / 401 自动刷新：`src/lib/bgm.ts`
- 数据查询 hooks：`src/lib/queries.ts`
- 仓库根 `AGENTS.md`：面向 AI 的架构与命令速览
