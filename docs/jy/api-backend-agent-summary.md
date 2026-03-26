# API 汇总（后端与 Agent 侧）

本文按服务边界汇总后端与 Agent 侧 API，避免与前端调用文档混写。

## 1) API Gateway 路由入口

- 用户域：`/api/v1/auth/**`、`/api/v1/users/**`、`/api/v1/public/users/**`、`/api/v1/oauth/**`、`/api/v1/users/me/bind/**`
- 管理域：`/api/v1/admin/users/**`、`/api/v1/admin/settings/mail-templates/**`、`/api/v1/admin/comments/**`
- 内容域：`/api/v1/posts/**`、`/api/v1/comments/**`、`/api/v1/favorites`、`/api/v1/footprints`、`/api/v1/pathfinder/sessions/**`
- Agent 转发预留：`/api/v1/agents/**`

## 2) user-service（账号与用户）

- 认证：`/auth/register/email-code/request`、`/auth/register`、`/auth/login`、`/auth/refresh`、`/auth/logout`、`/auth/password/request`、`/auth/password/confirm`
- 用户资料：`GET /users/me`、`PATCH /users/me`、`POST /users/me/avatar`
- 绑定：`GET /users/me/bind`、`POST /users/me/bind/email/request`、`POST /users/me/bind/email/confirm`、`POST /users/me/bind/phone/request`、`POST /users/me/bind/phone/confirm`
- OAuth：`GET /oauth/qq/authorize`、`GET /oauth/qq/callback`、`GET /oauth/wechat/authorize`、`GET /oauth/wechat/callback`
- 管理：`GET /admin/users`、`GET /admin/users/{userId}`、`PATCH /admin/users/{userId}`、`POST /admin/users/{userId}/revoke-tokens`
- 邮件模板：`GET /admin/settings/mail-templates/types`、`GET /admin/settings/mail-templates/{templateType}`、`PUT /admin/settings/mail-templates/{templateType}`
- 公共资源：`GET /public/users/avatars/{userId}`

## 3) content-service（内容与学习路径）

- 帖子：`GET /posts`、`GET /posts/{postId}`
- 评论：`GET /comments`、`POST /comments`
- 收藏与足迹：`POST /posts/{postId}/favorite`、`DELETE /posts/{postId}/favorite`、`GET /favorites`、`GET /footprints`
- 评论管理：`GET /admin/comments`、`PATCH /admin/comments/{commentId}`
- Pathfinder：`GET /pathfinder/sessions`、`PUT /pathfinder/sessions/{sessionId}`、`POST /pathfinder/sessions/plan`、`POST /pathfinder/sessions/{sessionId}/favorite`、`DELETE /pathfinder/sessions/{sessionId}/favorite`
- Agent 入库：`POST /internal/agent/posts`

## 4) Agent 侧（Python 服务）

- `POST /api/upload`
- `POST /api/translate`
- `POST /api/agents/workflow`
- `POST /api/agents/sage/pdf-qa`
- `GET /api/tasks/{task_id}`
- `GET /api/agents/runs/{run_id}`
- `GET /api/papers`
- `GET /api/papers/{paper_id}`
- `GET /api/pdf/{task_id}`

## 5) 代码位置

- 网关路由：`backend/services/api-gateway/src/main/resources/application.yml`
- 用户服务控制器：`backend/services/user-service/src/main/java/com/paperflow/user/api/`
- 内容服务控制器：`backend/services/content-service/src/main/java/com/paperflow/content/api/`
- Agent 服务入口：`app/main.py`

