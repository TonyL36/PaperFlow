# 02 网关：JWT 鉴权与身份透传（X-User-Id / X-User-Roles）

## 功能目标

- SPA 只需要携带 `Authorization: Bearer <accessToken>` 访问受保护 API
- 网关完成：
  - JWT 校验（签名 + 过期）
  - 访问控制豁免（登录/刷新、公开帖子/评论查询）
  - 将用户身份透传给下游服务（`X-User-Id`、`X-User-Roles`），让下游服务专注业务
- 网关输出统一错误 Envelope（401/403）

## 端到端行为

1. 公共接口（无需登录）：
   - `GET /api/v1/posts...`
   - `GET /api/v1/comments...`
2. 认证接口（无需 access token）：
   - `POST /api/v1/auth/register`
   - `POST /api/v1/auth/login`
   - `POST /api/v1/auth/refresh`
3. OAuth 回调（无需 access token）：
   - `GET /api/v1/oauth/qq/callback`
4. 其他接口均要求 `Authorization: Bearer ...`：
   - token 缺失 → `401 AUTH_MISSING_TOKEN`
   - token 无效/过期 → `401 AUTH_INVALID_TOKEN`
   - token 合法 → 注入 `X-User-Id`、`X-User-Roles` 后转发
5. 特殊说明（公开 GET + 可选登录态）：
   - `GET /api/v1/posts...` / `GET /api/v1/comments...` 在没有 `Authorization` 时可匿名访问
   - 若携带了 `Authorization: Bearer ...`，网关会校验并注入身份头（用于足迹/收藏等“可选登录态”的能力）

## 关键实现点

代码位置：[JwtAuthGlobalFilter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/JwtAuthGlobalFilter.java)

- 认证豁免只覆盖 `register/login/refresh`，`logout` 需要携带 `Authorization`，从而保证下游拿到 `X-User-Id`
- 帖子/评论 GET 允许匿名访问，但如果带了 `Authorization`，会校验并透传身份（用于“可选登录态”的能力，比如足迹/收藏）
- `/api/v1/oauth/qq/callback` 允许匿名回调（state 内携带并签名用户信息，避免回调必须携带 token）

## 安全注意事项与演进

- 生产建议启用：
  - 更严格的 secret 管理（KMS/密钥轮换）
  - refresh token 的专用域与 CSRF 防护（你现在的方案是 refresh 走 HttpOnly cookie）
  - 对 `/api/v1/admin/**` 增加更细权限策略（目前由内容服务按角色判断）
- 现在是“网关信任下游、下游信任网关”的模式：生产需要网关与下游网络隔离（仅允许网关访问下游），避免外部绕过网关直接打到服务端口。
