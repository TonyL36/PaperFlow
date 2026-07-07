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
- `scripts/backup-local-db.bat`：本地数据库备份脚本（迁移前建议先执行）

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
- `scripts/env/60-pathfinder-ai.sample.bat`

建议做法：
1. 复制 `scripts/env/local.env.sample.bat` 为 `scripts/env/local.env.bat`
2. 在 `local.env.bat` 里填入自己的邮箱账号/授权码等敏感信息

注意：`scripts/env/local.env.bat` 已加入 `.gitignore`，避免误提交敏感信息。

## 19.4 数据库迁移前备份建议

执行 Flyway 结构变更前，建议先备份本地数据库文件，避免误操作导致数据丢失：

- `.\scripts\backup-local-db.bat`

备份目录示例：
- `.\.dev\backup\h2-20260319-162800\`

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
  - `PF_RL_AUTH_PER_MIN`
  - `PF_RL_PUBLIC_PER_MIN`
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

- Pathfinder 模型调用（content-service）
  - `PF_PATHFINDER_AI_ENDPOINT`
  - `PF_PATHFINDER_AI_API_KEY`
  - `PF_PATHFINDER_AI_KEY_PAIRS`
  - `PF_PATHFINDER_AI_TIMEOUT_MS`

## 19.5 本项目测试执行规则（Trae）

- 在 Trae 中执行 `npm run build` 时，若约 30s 内未返回，终端可能进入 `RunningSkipped` 状态（并非一定构建失败）。
- 遇到该状态时，优先按“后端 compile + 关键接口调用 + IDE 诊断”完成验证，不把 `RunningSkipped` 直接判定为失败。
- 若需要确认前端产物，建议重试一次构建；如仍被跳过，以接口验证和诊断结果为准，并在交付说明中注明。

## 19.6 前端白屏时的稳定启动方式

如果 `apps/paperflow-web` 在本地启动后出现下面这种情况：

- 浏览器控制台只有 `vite connected`
- 页面没有报错，但首屏是白的
- `http://localhost:9628/paperflow/` 在 IDE 预览或某些 WebView 里不稳定

优先不要继续死磕 `localhost` 页签，直接切到项目里已经验证过的稳定方式。

### 推荐命令

在 `apps/paperflow-web` 目录执行：

- `npm run dev:cloud`

这条命令会做两件事：

1. 把前端 dev server 绑定到 `127.0.0.1:9630`
2. 把 `VITE_API_BASE` 指到云端网关 `http://47.109.193.180:9628`

对应访问地址：

- `http://127.0.0.1:9630/paperflow/`

### 为什么这条路径更稳

- `127.0.0.1` 在当前项目的 IDE/WebView 环境里比 `localhost` 更稳定
- 云端网关里已经有真实帖子和论文数据，更适合验证 `PaperPdfReaderPage`、帖子列表和阅读链路
- 这条方式已经在本仓库实际验证过，可以正常渲染 `Daily Feed`

### 什么时候用它

- 你主要在改前端页面
- 本地后端没完全启动
- 想直接联调真实数据
- 遇到“没报错但白屏”的情况

### 什么时候不用它

- 你在改本地后端接口，必须验证本地服务是否真的生效
- 你需要完全离线联调，此时应使用 `npm run dev:mock` 或 `scripts/dev.ps1`

### 最小排查顺序

1. 先试 `npm run dev:cloud`
2. 打开 `http://127.0.0.1:9630/paperflow/`
3. 仍异常时，再去看本地后端、代理和浏览器扩展

### 补充说明

- `npm run dev` 现在默认也会优先绑定 `127.0.0.1`
- 如果只是想看真实页面效果，优先使用 `dev:cloud`
- 如果旧页签已经缓存了 `localhost:9628` 的状态，建议关掉后重新开 `127.0.0.1:9630`
