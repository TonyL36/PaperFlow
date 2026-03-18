# 17 用户：资料、绑定与 OAuth（Email/Phone/QQ/WeChat）

## 17.1 目标

- 用户资料支持更多字段（头像、简介、手机号等）
- 支持“绑定与验证”闭环：
  - 绑定邮箱（验证码申请/确认）
  - 绑定手机号（验证码申请/确认）
- 支持 QQ / 微信绑定（OAuth2 基础流程，默认提供 mock 模式便于本地演示）

## 17.2 数据模型（user-service）

- `pf_user`：新增字段
  - `status`：ACTIVE/DISABLED（禁用后无法登录与 refresh）
  - `avatar_url`、`bio`
  - `phone`、`phone_verified_at`
  - `email_verified_at`
  - `qq_open_id`、`qq_nickname`、`qq_bound_at`
  - `wechat_open_id`、`wechat_nickname`、`wechat_bound_at`
- `pf_user_verification`：验证码与绑定验证记录
  - `type`: EMAIL_BIND / PHONE_BIND
  - `target`: 邮箱或手机号
  - `code_hash`: bcrypt hash（不存明文）
  - `expires_at/consumed_at`

迁移文件：
- `V2__user_status.sql`
- `V3__user_profile_and_bindings.sql`
- `V5__user_wechat_binding.sql`

## 17.3 用户资料接口

- `GET /api/v1/users/me`
  - 返回 `avatarUrl/bio/phone/emailVerified/phoneVerified/qqBound` 等字段
- `PATCH /api/v1/users/me`
  - 更新 `displayName/avatarUrl/bio`

## 17.4 绑定与验证码接口

需要登录（网关注入 `X-User-Id`）：

- `GET /api/v1/users/me/bind`：查询绑定状态
- `POST /api/v1/users/me/bind/email/request`
  - body: `{ "email": "alice@example.com" }`
- `POST /api/v1/users/me/bind/email/confirm`
  - body: `{ "code": "123456" }`
- `POST /api/v1/users/me/bind/phone/request`
  - body: `{ "phone": "13800000000" }`
- `POST /api/v1/users/me/bind/phone/confirm`
  - body: `{ "code": "123456" }`

本地演示：
- 当 user-service 使用 H2 内存库（`jdbc:h2:mem:`）时，request 接口会在响应里返回 `data.debugCode` 便于你快速验证流程。

实际发送邮件：
- 验证码邮件使用 Spring Mail；生产/联调时通过环境变量配置 `spring.mail.*` 与发件人
- 关键环境变量：
  - `PF_MAIL_ENABLED`（对应 kkbbs 的 `send.mail.open`）
  - `PF_MAIL_HOST / PF_MAIL_PORT / PF_MAIL_USERNAME / PF_MAIL_PASSWORD`
  - `PF_MAIL_FROM`（可选，不填则默认用 `PF_MAIL_USERNAME`）

## 17.5 QQ 绑定（OAuth mock + 回调）

### 17.5.1 配置项

user-service `application.yml`：

- `paperflow.qq.mock`（默认 true，本地演示）
- `paperflow.qq.appId / appSecret / redirectUri`（对接真实 QQ OAuth 时使用）
- `paperflow.qq.stateSecret`（state 签名密钥，生产必须替换）

### 17.5.2 接口

- `GET /api/v1/oauth/qq/authorize`
  - 需要登录
  - 返回 `data.authorizeUrl`（mock 模式下直接是可点击的回调 URL）
- `GET /api/v1/oauth/qq/callback?code=...&state=...`
  - 允许匿名访问（用于 QQ 回调）
  - 校验 state（含 userId + 过期时间 + HMAC 签名）
  - 绑定 `qq_open_id` 到对应用户

## 17.6 微信绑定（OAuth mock + 回调）

配置项（user-service `application.yml`）：
- `paperflow.wechat.mock`（默认 true，本地演示）
- `paperflow.wechat.appId / appSecret / redirectUri`（对接真实微信 OAuth 时使用）
- `paperflow.wechat.stateSecret`（state 签名密钥，生产必须替换）

接口：
- `GET /api/v1/oauth/wechat/authorize`（需要登录，返回 `authorizeUrl`）
- `GET /api/v1/oauth/wechat/callback?code=...&state=...`（允许匿名访问，用于回调绑定）
