# Deploy 模块详解：本地开发与 Docker 编排

## 1. 背景与目标

### 与前序模块的关系
前面的模块文档讲清楚了“系统由哪些功能组成”，这篇文档回答的是另一个更实际的问题：开发者怎样在自己的机器上把这些模块一起跑起来，并验证它们确实能协同工作。

### 为什么这里要单独写一篇
PaperFlow 不是单体应用，而是：
- 前端是 React + Vite
- 后端是三个独立服务
- 数据库既有业务库，也有知识库

如果本地启动方式不统一，就很容易出现下面这些问题：
- 前端起了，但网关没连上正确的后端端口
- Jar 被旧进程占用，重新打包失败
- 数据库初始化了一半，接口看起来启动了但实际不可用

所以项目里同时保留了两条本地路径：

1. `scripts/dev.ps1`
   - 偏“开发联调”
   - 本地直接启动 Java jar 和 Vite dev server

2. `scripts/deploy.ps1` + `docker/compose.dev.yml`
   - 偏“容器化验证”
   - 用 Docker Compose 拉起一整套 dev/test/prod 拓扑

---

## 2. 启动路径总览

### 2.1 路径一：`dev.ps1` 的本地进程模式

代码位置：`scripts/dev.ps1`

这条路径的特点是：
- Java 服务直接跑在宿主机进程上
- 前端跑 Vite dev server
- 端口冲突时脚本会主动检测和清理
- 启动完成后会自动做健康检查和路由抽检

它更适合你正在改接口、改前端页面、频繁重启的场景。

### 2.2 路径二：Compose 的容器模式

代码位置：
- `scripts/deploy.ps1`
- `docker/compose.dev.yml`
- `docker/compose.test.yml`
- `docker/env/dev.env`

这条路径的特点是：
- 服务关系更接近部署环境
- PostgreSQL、网关、业务服务的网络拓扑和线上更像
- 适合做“我改完以后，整套容器能不能一起启动”的验证

---

## 3. 本地进程模式详解

### 3.1 `dev.ps1` 先解决的不是启动，而是清场

`dev.ps1` 一上来没有急着启动服务，而是先做三件事：

1. 创建 `.dev` 和日志目录
2. 检查关键端口是否已被占用
3. 根据 PID 文件或端口占用结果决定是否停止旧进程

核心代码：

```powershell
if ($Action -eq "up" -and $anyPortInUse) {
  $pids = Load-Pids
  if ($pids) {
    Stop-ByPid $pids.spa
    Stop-ByPid $pids.gateway
    Stop-ByPid $pids.userService
    Stop-ByPid $pids.contentService
    Remove-Item -Force -ErrorAction SilentlyContinue $pidFile | Out-Null
    Start-Sleep -Milliseconds 600
  } elseif ($Force) {
    Stop-ByPort $SpaPort
    Stop-ByPort $GatewayPort
    Stop-ByPort $UserServicePort
    Stop-ByPort $ContentServicePort
    Start-Sleep -Milliseconds 600
  } else {
    $inUse = $portsToCheck | Where-Object { Is-PortOpen $_ }
    throw ("port in use: {0}. Run .\\scripts\\dev.ps1 down, or re-run with -Force." -f (($inUse | Sort-Object) -join ","))
  }
}
```

这段逻辑非常实用，因为它正面解决了本地开发最常见的两个坑：
- 上一次启动残留进程没有退出
- jar 正被旧 Java 进程占用，导致重新打包或重启失败

### 3.2 它不是只启动服务，还顺手完成构建

当没有传 `-SkipBuild` 时，脚本会先调用 Maven 打包三个后端服务：

```powershell
& (Join-Path $PSScriptRoot "bootstrap-maven.ps1") -Cmd package -Args @(
  "-DskipTests",
  "-pl",
  "backend/services/api-gateway,backend/services/user-service,backend/services/content-service",
  "-am"
)
```

然后再从各自 `target` 目录里找最新 jar：

```powershell
$gatewayJar = Get-LatestJar (Join-Path $root "backend/services/api-gateway/target") "api-gateway"
$userJar = Get-LatestJar (Join-Path $root "backend/services/user-service/target") "user-service"
$contentJar = Get-LatestJar (Join-Path $root "backend/services/content-service/target") "content-service"
```

这里的设计思路很明确：
- 构建阶段和运行阶段仍然分开
- 运行时只认“已经打好的最新产物”

这样做比“边猜路径边起服务”稳定得多。

### 3.3 启动顺序体现了模块依赖关系

脚本的启动顺序是：

1. `content-service`
2. `user-service`
3. `api-gateway`
4. `apps/paperflow-web` 的 Vite dev server

对应代码：

```powershell
$p1 = Start-Process -FilePath "java" -ArgumentList @(
    "-jar", $contentJar,
    "--server.port=$ContentServicePort",
    "--paperflow.demo-ingest.enabled=true",
    "--paperflow.demo-ingest.token=$DemoIngestToken"
  ) ...

$p2 = Start-Process -FilePath "java" -ArgumentList @(
    "-jar", $userJar,
    "--server.port=$UserServicePort"
  ) ...

$env:USER_SERVICE_URL = "http://localhost:$UserServicePort"
$env:CONTENT_SERVICE_URL = "http://localhost:$ContentServicePort"
$p3 = Start-Process -FilePath "java" -ArgumentList @(
    "-jar", $gatewayJar,
    "--server.port=$GatewayPort"
  ) ...
```

这里能看出它和前面模块文档的连接关系：
- 网关模块依赖用户服务和内容服务
- 前端模块依赖网关提供统一入口
- 内容服务还在本地启动时打开了 demo ingest 开关，方便联调演示链路

### 3.4 前端不是直接写死后端地址，而是通过环境变量注入

脚本在启动 Vite 前，会先写入 `VITE_API_BASE`：

```powershell
$env:VITE_API_BASE = "http://localhost:$GatewayPort"
$p4 = Start-Process -FilePath $npmCmd -ArgumentList @("run", "dev", "--", "--port", "$SpaPort") ...
```

这和前端文档里提到的统一 API 入口是完全一致的：前端本地开发时也优先走网关，而不是绕过网关直连具体业务服务。

### 3.5 启动成功的标准不是“进程没挂”，而是健康检查通过

脚本最后会主动访问：

```powershell
if (!(Wait-Http "http://localhost:$ContentServicePort/api/v1/actuator/health" 120)) { throw "content-service not ready" }
if (!(Wait-Http "http://localhost:$UserServicePort/api/v1/actuator/health" 120)) { throw "user-service not ready" }
if (!(Wait-Http "http://localhost:$GatewayPort/actuator/health" 120)) { throw "api-gateway not ready" }
if (!(Wait-Http "http://localhost:$GatewayPort/api/v1/posts?page[number]=1&page[size]=1" 120)) { throw "gateway upstream route not ready" }
```

最后这个 `/api/v1/posts` 很关键，因为它不是单纯证明网关活着，而是在验证：
- 网关路由正常
- 内容服务已经可用
- 请求能真正跑完整条链路

---

## 4. Compose 模式详解

### 4.1 `deploy.ps1` 的职责非常克制

`scripts/deploy.ps1` 只有一件事：根据环境选择对应的 compose 和 env 文件，然后执行 `docker compose up -d --build`。

```powershell
$compose = Join-Path $root ("docker/compose.{0}.yml" -f $Env)
$envFile = Join-Path $root ("docker/env/{0}.env" -f $Env)

docker compose --env-file $envFile -f $compose up -d --build
```

这说明项目在本地容器编排上采取的是“薄脚本”策略：
- 复杂逻辑留在 compose 文件
- 脚本只负责选环境、校验文件、执行命令

### 4.2 `compose.dev.yml` 的核心是把多服务关系描述清楚

`docker/compose.dev.yml` 里最关键的不是语法，而是服务边界：

```yaml
postgres:
  image: pgvector/pgvector:pg16
  ports:
    - "${POSTGRES_PORT}:5432"
  volumes:
    - ./postgres/init:/docker-entrypoint-initdb.d:ro

user-service:
  environment:
    USER_DB_URL: jdbc:postgresql://postgres:5432/userdb

content-service:
  environment:
    CONTENT_DB_URL: jdbc:postgresql://postgres:5432/contentdb

api-gateway:
  environment:
    USER_SERVICE_URL: http://user-service:8081
    CONTENT_SERVICE_URL: http://content-service:8082
  ports:
    - "${GATEWAY_PORT}:8080"
```

这几行信息其实已经回答了部署层最重要的四个问题：

1. 数据库是谁
   - `postgres`

2. 用户域和内容域分别连哪个库
   - `userdb`
   - `contentdb`

3. 网关把请求转给谁
   - `user-service`
   - `content-service`

4. 宿主机对外暴露哪个入口
   - 网关端口

### 4.3 `dev.env` 把“会变的东西”全部外置

`docker/env/dev.env` 中可以看到本地默认值：

```env
POSTGRES_PASSWORD=paperflow
POSTGRES_PORT=5432
GATEWAY_PORT=3151
PF_JWT_SECRET=change-me-in-dev-change-me-in-dev-change-me
PF_RL_ANON_PER_MIN=10
PF_RL_USER_PER_MIN=120
PAPERFLOW_DB_HOST=postgres
PAPERFLOW_DB_PORT=5432
PAPERFLOW_DB_NAME=paperflowdb
PAPERFLOW_DB_USER=paperflow
PAPERFLOW_DB_PASSWORD=paperflow
```

这里能看出两层配置思路：
- 业务系统运行所需配置
  - 比如 JWT、限流、网关端口
- 知识库相关配置
  - 比如 `paperflowdb`

也就是说，虽然用户服务和内容服务各有自己的业务库，但项目还预留了一套独立的知识库数据库给 Python Agent 和知识检索能力使用。

### 4.4 `test` 环境和 `dev` 环境几乎同构

`compose.test.yml` 和 `compose.dev.yml` 的结构几乎一致，区别更多体现在：
- 卷名分离
- env 文件分离
- 用途从“日常开发”切换到“测试验证”

这种设计的好处是，当 dev 能稳定跑通时，test 环境一般不会出现完全不同的拓扑问题。

---

## 5. 边界与约束

### 5.1 `dev.ps1` 更像“联调入口”，不是完整生产模拟

它的优势是快，但也有明显边界：
- 前端跑的是 Vite，而不是 Nginx
- Java 服务是本地进程，不是容器
- 更适合功能开发，不适合完全模拟线上容器行为

### 5.2 Compose dev/test 负责“拓扑接近”，不负责“生产约束”

dev/test Compose 重点是：
- 统一容器网络
- 初始化 PostgreSQL
- 让网关和服务关系更接近线上

但它没有完全覆盖生产上的所有非功能要求，比如：
- 重启策略
- 线上反向代理细节
- 发布窗口和回滚策略

这些内容要放到下一篇 ECS 文档里看。

### 5.3 本地验证的成功标准必须是“接口可用”

单看日志或进程存在并不够。至少要验证：
- `/actuator/health`
- `/api/v1/posts`
- 前端页面能通过网关正常取数

只有这样，才算真正完成“部署前先本地验证”。

---

## 6. 常见问题与踩坑经验

### 6.1 Maven 打包时报 `.jar.original` 重命名失败

这是 `dev.ps1` 里已经明确处理过的典型问题。根因通常不是 Maven 本身，而是旧 Java 进程还占着 jar 文件。

正确处理方式：
- 先执行 `.\scripts\dev.ps1 down`
- 或者重新执行 `.\scripts\dev.ps1 up -Force`

### 6.2 端口被占用，但找不到是谁占的

脚本内部是通过 `netstat -ano -p tcp` 和 PID 文件双重判断来处理的。如果你绕过脚本手工启动过服务，就容易出现这种情况。

经验上最稳的处理方式是：
- 优先用 `down` 回收
- 必要时再用 `-Force`

### 6.3 网关健康了，但帖子接口不通

这通常意味着问题不在网关自身，而在上游内容服务没有真正 ready。

从脚本设计也能看出来，项目已经把“网关 health”和“业务接口 health”分开对待了：
- `/actuator/health` 只说明网关进程在
- `/api/v1/posts` 才说明整个转发链路可用

---

## 7. 可演进方向

### 7.1 为 Compose dev 增加前端容器
现在的 `compose.dev.yml` 只覆盖 PostgreSQL 和三个后端服务，如果后续需要更接近线上，可以把 `frontend` 也纳入 dev 编排。

### 7.2 为本地联调增加统一日志聚合
目前 `dev.ps1` 把日志写到 `.dev/logs`，已经比直接刷控制台强，但还可以继续做：
- 统一命名
- 自动 tail
- 启动失败时自动定位最近日志

### 7.3 增加更明确的 smoke 检查脚本
现在 `Wait-Http` 已经做了基础可用性验证，后面可以继续把“注册、登录、帖子列表、评论”做成固定冒烟脚本，进一步提高本地验收质量。

---

## 8. 小结

本地部署这一层，PaperFlow 其实采用了“两套入口、一个原则”：

- 两套入口：
  - `dev.ps1` 负责高频开发联调
  - `deploy.ps1` + Compose 负责容器化验证

- 一个原则：
  - 启动不是目的，验证整条链路可用才是目的

这篇文档和前面的网关、用户服务、内容服务、前端模块是直接连起来的，因为本地启动顺序和健康检查，本质上就是这些模块依赖关系的运行版证明。

---

## 9. 页内导航

- 所属模块：[Deploy 模块索引](./00-index.md)
- 上一篇：当前已是本模块第一篇，建议先回看 [模块索引](./00-index.md)
- 下一篇：[Deploy 模块详解：云端 ECS 发布与运行约束](./02-cloud-ecs.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
