# 12 一键部署（dev / test / prod）：Docker Compose + 脚本

## 功能目标

- 三套环境一键启动：dev / test / prod
- 统一使用 Docker Compose 编排：
  - PostgreSQL（初始化 userdb/contentdb）
  - user-service
  - content-service
  - api-gateway（对外入口）
  - frontend（Nginx 托管 SPA + `/api` 反代网关）
- 通过 `.env` 注入环境变量，避免改动 compose 文件

## 目录结构

- compose 文件：
  - [compose.dev.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.dev.yml)
  - [compose.test.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.test.yml)
  - [compose.prod.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.prod.yml)
- env 文件：
  - [dev.env](file:///f:/Gitee/PaperFlow/PaperFlow/docker/env/dev.env)
  - [test.env](file:///f:/Gitee/PaperFlow/PaperFlow/docker/env/test.env)
  - [prod.env](file:///f:/Gitee/PaperFlow/PaperFlow/docker/env/prod.env)
- 数据库初始化：
  - [01-init.sql](file:///f:/Gitee/PaperFlow/PaperFlow/docker/postgres/init/01-init.sql)
- Dockerfile：
  - [Dockerfile.api-gateway](file:///f:/Gitee/PaperFlow/PaperFlow/docker/Dockerfile.api-gateway)
  - [Dockerfile.user-service](file:///f:/Gitee/PaperFlow/PaperFlow/docker/Dockerfile.user-service)
  - [Dockerfile.content-service](file:///f:/Gitee/PaperFlow/PaperFlow/docker/Dockerfile.content-service)
  - [Dockerfile.frontend](file:///f:/Gitee/PaperFlow/PaperFlow/docker/Dockerfile.frontend)
- Nginx 路由：
  - [paperflow.conf](file:///f:/Gitee/PaperFlow/PaperFlow/docker/nginx/paperflow.conf)

## 关键代码原文 + 解读

### 12.1 compose（以 dev 为例）

代码位置：[compose.dev.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.dev.yml)

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "${POSTGRES_PORT}:5432"
    volumes:
      - postgres_data_dev:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d:ro

  user-service:
    build:
      context: ..
      dockerfile: docker/Dockerfile.user-service
    environment:
      USER_DB_URL: jdbc:postgresql://postgres:5432/userdb
      USER_DB_USER: paperflow
      USER_DB_PASS: ${POSTGRES_PASSWORD}
      PF_JWT_SECRET: ${PF_JWT_SECRET}
    depends_on:
      - postgres

  content-service:
    build:
      context: ..
      dockerfile: docker/Dockerfile.content-service
    environment:
      CONTENT_DB_URL: jdbc:postgresql://postgres:5432/contentdb
      CONTENT_DB_USER: paperflow
      CONTENT_DB_PASS: ${POSTGRES_PASSWORD}
    depends_on:
      - postgres

  api-gateway:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api-gateway
    environment:
      USER_SERVICE_URL: http://user-service:8081
      CONTENT_SERVICE_URL: http://content-service:8082
      PF_JWT_SECRET: ${PF_JWT_SECRET}
      PF_RL_ANON_PER_MIN: ${PF_RL_ANON_PER_MIN}
      PF_RL_USER_PER_MIN: ${PF_RL_USER_PER_MIN}
    ports:
      - "${GATEWAY_PORT}:8080"
    depends_on:
      - user-service
      - content-service
```

解释：

- Postgres：
  - 通过 `./postgres/init` 挂载初始化脚本，首次启动会创建 `userdb/contentdb`
  - dev/test 通过端口映射暴露在宿主机，prod 可按需关闭端口映射
- user-service/content-service：
  - 通过 `*_DB_URL` 指向容器网络里的 postgres
  - token secret 通过环境变量统一注入（与网关一致）
- api-gateway：
  - 对外只暴露网关端口
  - 通过 `USER_SERVICE_URL/CONTENT_SERVICE_URL` 配置上游路由

### 12.3 云端前端编排与访问

- `frontend` 容器通过 Nginx 托管 `apps/paperflow-web/dist`
- SPA 基础路径为 `/paperflow/`，静态资源路径为 `/paperflow/assets/*`
- `location /api/` 反代到 `api-gateway:8080`，前端与后端同源访问
- 云端默认入口：
  - `http://<ECS_IP>:9628/paperflow/posts`
  - `http://<ECS_IP>:9628/api/v1/posts?page[number]=1&page[size]=1`

### 12.4 云端验证码开关核验（user-service）

- 核验配置文件值：

```bash
grep -n "^PF_MAIL_ENABLED=" /opt/paperflow/docker/env/prod.env
```

- 核验容器实际值：

```bash
cd /opt/paperflow
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml exec -T user-service printenv PF_MAIL_ENABLED
```

### 12.5 云端服务重启顺序与窗口期

- 现象：网关偶发 `SYS_INTERNAL_ERROR`，日志显示 `Connection refused: content-service:8082`
- 原因：`content-service` 重启窗口期，网关先转发到未就绪下游
- 推荐顺序：

```bash
cd /opt/paperflow
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml restart content-service
sleep 10
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml restart api-gateway
```

- 验证：

```bash
curl -i http://127.0.0.1:3151/actuator/health
curl -g -i "http://127.0.0.1:3151/api/v1/posts?page[number]=1&page[size]=1"
```

### 12.6 前端可见性与发布时间策略

- 批量导入真实论文时，若保留论文原始 `publishedAt`，前台首页可能不在首屏显示
- 验收阶段建议使用“当前发布时间”策略，确保新导入文章置顶
- 脚本参数：
  - `mock-agent-paper-ingest-openalex.ps1 -PublishNow`
- API 验证建议：

```bash
curl -g "http://127.0.0.1:3151/api/v1/posts?page[number]=1&page[size]=200"
```

- 若文件与容器不一致，使用显式环境值重建（避免会话覆盖）：

```bash
cd /opt/paperflow
unset PF_MAIL_ENABLED
PF_MAIL_ENABLED=true docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml up -d --force-recreate user-service
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml exec -T user-service printenv PF_MAIL_ENABLED
```

### 12.2 一键启动脚本（Windows）

代码位置：[deploy.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/deploy.ps1)

```powershell
param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("dev", "test", "prod")]
  [string]$Env = "dev"
)

$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root ("docker/compose.{0}.yml" -f $Env)
$envFile = Join-Path $root ("docker/env/{0}.env" -f $Env)

if (!(Test-Path $compose)) { throw "compose not found: $compose" }
if (!(Test-Path $envFile)) { throw "env file not found: $envFile" }

Push-Location $root
try {
  docker compose --env-file $envFile -f $compose up -d --build
} finally {
  Pop-Location
}
```

解释：

- 按 `$Env` 选择 compose/env 文件
- `docker compose up -d --build`：后台启动并强制重建镜像，适合开发/测试快速迭代

## 启动后的访问入口

- 网关：`http://localhost:${GATEWAY_PORT}`
- 健康检查：
  - `GET http://localhost:${GATEWAY_PORT}/actuator/health`

## 演进方向

- prod：把镜像构建从 compose 移到 CI，compose 只做拉取与运行
- 增加反向代理（Nginx/Caddy）承载 TLS、静态资源与 gzip
- 增加观测栈（Prometheus/Grafana/OTEL）
- 为前端构建增加产物断言（`dist/index.html`）与失败重试，避免“构建卡住但无产物”
