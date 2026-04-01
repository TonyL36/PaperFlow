# 30 云端部署红线与经验（ECS）

## 背景

- 目标是把线上发布做成“可重复、可恢复、可验证”的固定流程
- 本阶段重点覆盖三类故障：部署不一致、反向代理 502、线上内容编码异常
- 约束：云端只做运行与替换，不做业务构建

## 红线（禁止项）

- 禁止在 ECS 执行前端构建：`npm ci`、`npm run build`
- 禁止在 ECS 执行后端构建：`mvn package`、全量并发 `docker build`
- 禁止在 PowerShell 直接执行 Linux 语义命令（`sysctl`、`grep`、`export` 等）
- 禁止未做健康检查与接口抽检就判定“已上线”

## 标准发布流程

### 1) 本地产物阶段

- 后端在本地打包 jar
- 前端在本地执行构建，确认 `dist/index.html` 存在且 hash 已更新
- 如涉及静态资源协议，先本地验证 MIME 与路由

### 2) 云端替换阶段

- 使用无构建发布脚本：`scripts/deploy-ecs-no-build.ps1 -SkipLocalBuild`
- 云端只做解压、容器替换、`docker compose up -d`
- 变更代理配置后必须重建或重启 frontend 容器使配置生效

### 3) 发布后验收阶段

- 基础健康：`/actuator/health`
- 业务抽检：`/api/v1/posts/{postId}`、`/api/v1/comments?...`
- 静态抽检：`/paperflow/assets/*.js` 返回 `application/javascript`

## 2026-04-01 线上 502 复盘（关键）

### 现象

- 页面随机报错：`HTTP 502 code=SYS_HTTP_ERROR`
- `3151` 直连网关正常，`9628/api/...` 经 frontend 代理不稳定

### 根因

- frontend Nginx 上游指向 `api-gateway:8080`
- 网关容器重建后 IP 漂移，Nginx 使用旧解析结果，出现 `connect() failed (111: Connection refused)`

### 处理

- 紧急恢复：重启 frontend 容器，刷新上游解析
- 永久修复：在 Nginx API 代理增加 Docker DNS 动态解析
  - `resolver 127.0.0.11 ipv6=off valid=10s;`
  - 使用变量 `proxy_pass $api_upstream;`

## 高发坑与处理

### 1) 云端仍是旧前端

- 先核对云端 `index.html` hash，再核对静态文件 hash 与 MIME
- 不一致时仅重建 frontend，避免全量连带风险

### 2) 前端接口偶发 502

- 先比对：
  - `http://127.0.0.1:3151/...`（网关直连）
  - `http://127.0.0.1:9628/api/...`（前端代理）
- 若前者 200、后者 502，优先排查 Nginx 上游解析与容器网络

### 3) 上传后中文出现 `???`

- 统一用 UTF-8 字节发送 JSON，显式 `application/json; charset=utf-8`
- 禁止让 PowerShell 按默认编码隐式提交正文内容

## 回滚策略

- 优先单服务回滚（frontend > api-gateway）
- 回滚后最小验收：
  - `/paperflow/posts` 可打开
  - `/api/v1/posts/{id}` 返回 200
  - 评论接口返回 200
  - 关键页面无 `SYS_HTTP_ERROR`
