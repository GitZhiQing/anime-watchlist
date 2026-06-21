# Bangumi API 说明

User Agent: GitZhiQing/anime-watchlist/(version) (PC) (https://github.com/GitZhiQing/anime-watchlist)

认证方式详见 (官方文档)[docs\BGM-API\docs-raw\How-to-Auth.md]。

## 关键 API

### POST /v0/search/subjects 条目搜索

通过此 API，实现用户仅输入漫画、动画名时的条目查找。

### GET /v0/subjects/{subject_id} 获取条目

通过此 API，实现通过 ID 获取条目具体信息。

### GET /v0/subjects/{subject_id}/image Get Subject Image

通过此 API，获取条目封面，本应用默认使用最高画质。

### GET /v0/me Get User

通过此 API，在用户认证完成后，获取用户信息。

### GET /v0/users/{username}/collections 获取用户收藏

获取用户的收藏夹信息。

### POST /v0/users/-/collections/{subject_id} 新增或修改用户单个条目收藏

用于将某个条目添加到某个收藏夹。

```
{
  "type": 3,
  "rate": 10,
  "ep_status": 0,
  "vol_status": 0,
  "comment": "string",
  "private": true,
  "tags": [
    "string"
  ]
}
```

rate、ep_status、vol_status、comment、tags 大部分情况下不设置（直接去除）。

private 保持为 true。

### PATCH /v0/users/-/collections/{subject_id} 修改用户单个收藏

用于修改某个条目的收藏夹。

虽然文档中写“由于直接修改剧集条目的完成度可能会引起意料之外效果，只能用于修改书籍类条目的完成度”，但实际测试仅仅是改变收藏夹是没问题的。

```
{
  "type": 3,
  "rate": 10,
  "ep_status": 0,
  "vol_status": 0,
  "comment": "string",
  "private": true,
  "tags": [
    "string"
  ]
}
```

一般只需要传入新的 type 值，其他参数不设置。
