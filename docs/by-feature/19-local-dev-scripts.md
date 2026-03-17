# 19 本地启动与可配置项脚本（Windows）

## 19.1 一键启动

在仓库根目录执行：

- 启动（不重新构建）：`.\scripts\run-local.bat up`
- 启动（先构建）：`.\scripts\run-local.bat up build`
- 停止：`.\scripts\run-local.bat down`
- 状态：`.\scripts\run-local.bat status`

脚本说明：
- `scripts/run-local.bat`：Windows 入口脚本（读取可选的本地环境变量文件，再调用 `scripts/dev.ps1`）
- `scripts/dev.ps1`：实际启动器（启动 content-service、user-service、api-gateway、前端 dev server）

## 19.2 本地环境变量文件（建议）

为了便于单独发放配置（尤其是邮件/第三方密钥），脚本会在启动前尝试加载：

- `scripts/env/local.env.bat`（若存在则执行）

仓库提供示例：
- `scripts/env/local.env.sample.bat`
- `scripts/env/10-mail-qq.sample.bat`
- `scripts/env/20-oauth.sample.bat`
- `scripts/env/30-databases.sample.bat`
- `scripts/env/40-gateway.sample.bat`
- `scripts/env/50-ports.sample.bat`

建议做法：
1. 复制 `scripts/env/local.env.sample.bat` 为 `scripts/env/local.env.bat`
2. 在 `local.env.bat` 里填入自己的邮箱账号/授权码等敏感信息

注意：`scripts/env/local.env.bat` 已加入 `.gitignore`，避免误提交敏感信息。

## 19.3 常用可配置项

- 端口与演示 token（给 `scripts/run-local.bat` 使用）
  - `PF_GATEWAY_PORT`（默认 3151）
  - `PF_USER_PORT`（默认 8081）
  - `PF_CONTENT_PORT`（默认 8082）
  - `PF_SPA_PORT`（默认 9628）
  - `PF_DEMO_INGEST_TOKEN`（默认 demo-token）

- 网关（api-gateway）
  - `PF_JWT_SECRET`
  - `PF_ACCESS_TTL`
  - `PF_RL_ANON_PER_MIN`
  - `PF_RL_USER_PER_MIN`

- 数据库（user-service / content-service）
  - `USER_DB_URL / USER_DB_USER / USER_DB_PASS`
  - `CONTENT_DB_URL / CONTENT_DB_USER / CONTENT_DB_PASS`

- 邮件（user-service，验证码发送）
  - `PF_MAIL_ENABLED`
  - `PF_MAIL_HOST / PF_MAIL_PORT / PF_MAIL_USERNAME / PF_MAIL_PASSWORD / PF_MAIL_FROM`

- OAuth（user-service，绑定）
  - `PF_QQ_MOCK / PF_QQ_STATE_SECRET / PF_QQ_APP_ID / PF_QQ_APP_SECRET / PF_QQ_REDIRECT_URI`
  - `PF_WECHAT_MOCK / PF_WECHAT_STATE_SECRET / PF_WECHAT_APP_ID / PF_WECHAT_APP_SECRET / PF_WECHAT_REDIRECT_URI`

