# 12 一键部署（dev / test / prod）：Docker Compose + 脚本

## 功能目标

- 三套环境一键启动：dev / test / prod
- 统一使用 Docker Compose 编排：
  - PostgreSQL（初始化 userdb/contentdb）
  - user-service
  - content-service
  - api-gateway（对外入口）
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

