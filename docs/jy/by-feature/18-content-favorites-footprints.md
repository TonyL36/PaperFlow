# 18 内容：收藏与足迹（favorites / footprints）

## 18.1 目标

- 收藏：用户可以收藏/取消收藏帖子，并查看收藏列表
- 足迹：用户访问帖子详情时自动记录“最近浏览”，并查看足迹列表
- 公开阅读：未登录仍可访问帖子/评论 GET；登录后同一 GET 会携带用户身份以启用“可选登录态”能力

## 18.2 数据模型（content-service）

- `pf_post_favorite`
  - 主键：`(user_id, post_id)`
  - 字段：`created_at`
- `pf_post_footprint`
  - 主键：`(user_id, post_id)`
  - 字段：`last_viewed_at`

迁移文件：
- `V2__post_footprints_and_favorites.sql`

## 18.3 行为约定

- `GET /api/v1/posts...` / `GET /api/v1/comments...`：
  - 无 `Authorization`：匿名访问
  - 有 `Authorization`：网关会解析 JWT 并注入 `X-User-Id`，content-service 会记录足迹、回传收藏状态

## 18.4 API

需要登录：

- 收藏/取消收藏
  - `POST /api/v1/posts/{postId}/favorite`
  - `DELETE /api/v1/posts/{postId}/favorite`
- 列表
  - `GET /api/v1/favorites?page[number]=1&page[size]=20`
  - `GET /api/v1/footprints?page[number]=1&page[size]=20`

帖子详情响应扩展：
- `favorited`: boolean|null（未登录为 null）
- `lastViewedAt`: ISO 时间字符串|null（未登录为 null）

