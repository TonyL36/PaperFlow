# 2026-03-27 阿里云 ECS 部署手册（无构建版）

## 目标

- 本地先打包后端 jar，再上传到 ECS
- 本地先打包后端 jar 与前端 dist，再上传到 ECS
- ECS 只做解压 + 容器启动，不在服务器执行 Maven 构建
- 支持服务器重启后自动拉起容器

## 本地脚本

- 脚本路径：`scripts/deploy-ecs-no-build.ps1`
- 作用：
  - 本地打包 `user-service`、`content-service`、`api-gateway` 三个 jar
  - 本地构建 `paperflow-web` 的 `dist`
  - 生成 `paperflow-deploy-with-jars.tar.gz`
  - 上传到 ECS
  - 远程执行解压、镜像构建与 `prod` 启动

执行方式：

```powershell
cd F:\Gitee\PaperFlow\paperflow
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-ecs-no-build.ps1 -RemoteHost 47.109.193.180 -RemoteUser root
```

执行过程中仅需按提示输入服务器密码。

也可直接使用 bat 包装脚本：

```bat
cd /d F:\Gitee\PaperFlow\paperflow
scripts\deploy-ecs-no-build.bat 47.109.193.180 root
```

## ECS 端前置条件

- Docker 已安装并可用
- `docker/env/prod.env` 已配置
- 安全组已开放 `3151/tcp`（公网调试阶段）
- 安全组已开放 `9628/tcp`（前端访问）

## 自动启动

容器维度由 `restart: always` 保证重启后自动拉起，建议再确保 Docker 服务开机自启：

```bash
sudo systemctl enable docker
sudo systemctl restart docker
```

验证：

```bash
cd /opt/paperflow
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps
```

## 验证清单

本机：

```bash
curl -g -i 'http://127.0.0.1:3151/api/v1/posts?page[number]=1&page[size]=1'
```

公网：

```bash
curl -g -i 'http://47.109.193.180:3151/api/v1/posts?page[number]=1&page[size]=1'
```

前端页面（公网）：

```text
http://47.109.193.180:9628/paperflow/posts
```

本地页面（开发）：

```bat
scripts\run-local.bat up quick --no-open
```

## 常见问题

1) `curl: (3) bad range in URL`
- 原因：`[]` 被 curl 当作范围语法
- 处理：添加 `-g`，或使用 `%5B` `%5D` 编码

2) `password authentication failed for user "paperflow"`
- 原因：`prod.env` 密码与库内用户密码不一致
- 处理：

```bash
cd /opt/paperflow
set -a; . docker/env/prod.env; set +a
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml exec -T postgres psql -U postgres -d postgres -c "ALTER USER paperflow WITH PASSWORD '${POSTGRES_PASSWORD}';"
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml restart user-service content-service
```

3) SSH 连接卡在 `banner exchange`
- 原因：服务器高负载导致 sshd 响应超时
- 处理：通过阿里云控制台 VNC 登录，先停止构建/高负载进程

4) `PF_MAIL_ENABLED` 文件值和容器值不一致
- 原因：当前 shell 的同名环境变量覆盖 compose 插值
- 处理：

```bash
cd /opt/paperflow
unset PF_MAIL_ENABLED
PF_MAIL_ENABLED=true docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml up -d --force-recreate user-service
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml exec -T user-service printenv PF_MAIL_ENABLED
```
