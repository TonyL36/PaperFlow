# 25 管理端：用户管理与邮件模板设置

本文记录管理员端两块能力：

- 用户管理（禁用/启用、会话失效）
- 邮件模板设置（注册验证码 / 找回密码验证码 / 绑定邮箱验证码）

## 25.1 目标与边界

目标：

- 管理员可统一管理用户状态，快速处理异常账号
- 管理员可按场景分别配置验证码邮件内容
- 模板支持占位符，避免每次改代码发版

边界：

- 当前仅支持验证码类模板，不包含营销/通知类模板
- 模板变量目前固定为 `{{purpose}}`、`{{code}}`、`{{minutes}}`

## 25.2 用户管理（Admin Users）

前端入口：

- 路由：`/admin/users`
- 页面：`AdminUsersPage`

后端接口：

- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{userId}`（更新 `status`）
- `POST /api/v1/admin/users/{userId}/revoke-tokens`（使 token 失效）

权限模型：

- 依赖网关注入 `X-User-Roles`
- `ADMIN` 才可访问上述接口

## 25.3 邮件模板设置（Admin Mail Templates）

前端入口：

- 路由：`/admin/settings/mail`
- 页面：`AdminMailSettingsPage`

后端接口：

- `GET /api/v1/admin/settings/mail-templates/types`
- `GET /api/v1/admin/settings/mail-templates/{templateType}`
- `PUT /api/v1/admin/settings/mail-templates/{templateType}`

支持的模板类型：

- `REGISTER_VERIFICATION`
- `PASSWORD_RESET_VERIFICATION`
- `BIND_EMAIL_VERIFICATION`

模板存储：

- 表：`pf_mail_template`
- Flyway：
  - `V6__mail_template_settings.sql`（建表 + 兼容旧模板）
  - `V7__mail_template_multi_types.sql`（新增三类模板初始数据）

## 25.4 发送链路如何命中对应模板

验证码发信时，后端会按业务场景传入模板类型：

- 注册验证码：`REGISTER_VERIFICATION`
- 找回密码验证码：`PASSWORD_RESET_VERIFICATION`
- 绑定邮箱验证码：`BIND_EMAIL_VERIFICATION`

`MailService` 通过 `MailTemplateService` 渲染标题和正文，再交给 Spring Mail 发送。

## 25.5 运维与排查建议

- 若管理页更新模板后无效果，先确认当前环境 `PF_MAIL_ENABLED=true`
- 若启动报 Flyway checksum mismatch，不要修改已执行版本，新增更高版本迁移
- 模板文本建议保留占位符，避免发出无验证码的无效邮件
