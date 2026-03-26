# API 汇总（前端侧）

本文只保留前端实际调用的 API，按页面职责分组，便于联调与回归。

## 1) 认证与账号

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/register/email-code/request`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/password/request`
- `POST /api/v1/auth/password/confirm`

## 2) 个人中心与绑定

- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `POST /api/v1/users/me/avatar`

## 3) 内容阅读与互动

- `GET /api/v1/posts`
- `GET /api/v1/posts/{postId}`
- `GET /api/v1/comments`
- `POST /api/v1/comments`
- `POST /api/v1/posts/{postId}/favorite`
- `DELETE /api/v1/posts/{postId}/favorite`
- `GET /api/v1/favorites`
- `GET /api/v1/footprints`

## 4) Pathfinder 学习路径

- `GET /api/v1/pathfinder/sessions`
- `PUT /api/v1/pathfinder/sessions/{sessionId}`
- `POST /api/v1/pathfinder/sessions/plan`
- `POST /api/v1/pathfinder/sessions/{sessionId}/favorite`
- `DELETE /api/v1/pathfinder/sessions/{sessionId}/favorite`

## 5) 管理端

- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{userId}`
- `POST /api/v1/admin/users/{userId}/revoke-tokens`
- `GET /api/v1/admin/comments`
- `PATCH /api/v1/admin/comments/{commentId}`
- `GET /api/v1/admin/settings/mail-templates/types`
- `GET /api/v1/admin/settings/mail-templates/{templateType}`
- `PUT /api/v1/admin/settings/mail-templates/{templateType}`

## 6) 调用实现位置

- 前端 API 封装：`apps/paperflow-web/src/ui/data/api.ts`
- Vite 代理规则：`apps/paperflow-web/vite.config.ts`

