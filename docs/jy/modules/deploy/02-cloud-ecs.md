# Deploy 模块详解：云端 ECS 发布与运行约束

## 1. 背景与目标

### 与前序模块的关系
如果说上一章解决的是“本地怎么跑”，这一章解决的就是“本地确认没问题以后，怎么把它安全地放到云端”。它直接承接前面的前端、网关、用户服务、内容服务和 Python Agent 模块，因为 ECS 发布面对的是它们的整套产物，而不是单个服务。

### 为什么这部分需要单独约束
PaperFlow 当前的 ECS 发布并不是走完整 CI/CD，而是通过脚本完成：
- 本地构建产物
- 打包仓库
- 上传到远端
- 用 Docker Compose 替换运行内容

这种方式可用，但前提是流程必须足够克制。项目里已经通过脚本和经验文档明确形成了一条红线：

- 云端只做运行与替换
- 不在 ECS 上做前后端构建

这样做的核心目的，是把构建失败、依赖下载失败、机器环境不一致这些风险，全部留在本地解决。

---

## 2. 发布链路总览

### 2.1 整体流程

PaperFlow 当前的 ECS 发布主入口是 `scripts/deploy-ecs-no-build.ps1`。它的流程可以概括为：

1. 本地校验产物
2. 本地可选构建 jar 和前端 dist
3. 打包整个仓库为 tar.gz
4. 上传压缩包到服务器
5. 生成并上传远端部署脚本
6. 远端解压、替换、重启容器
7. 做运行态检查

也就是说，它不是“远端重新构建镜像”，而是“把本地产物复制进正在运行的容器，再重启对应服务”。

### 2.2 为什么叫 no-build

因为远端核心命令是：

```bash
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml up -d --no-build
```

这里的 `--no-build` 很关键，它把远端行为限制在：
- 起容器
- 找到容器
- 替换容器内部产物
- 重启容器

而不是在 ECS 上重新执行 Maven、npm、docker build。

---

## 3. 核心脚本详解

## 3.1 本地构建阶段：先保证产物存在

`deploy-ecs-no-build.ps1` 在默认情况下，会先在本地执行后端和前端构建：

```powershell
if (-not $SkipLocalBuild) {
  & $mvnCmd -DskipTests -pl backend/services/user-service,backend/services/content-service,backend/services/api-gateway -am package

  Push-Location (Join-Path $repoRoot "apps/paperflow-web")
  try {
    & $npmCmd ci
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "frontend npm ci failed, fallback to npm install."
      & $npmCmd install
    }
    if ($LASTEXITCODE -eq 0) {
      & $npmCmd run build
    }
  } finally {
    Pop-Location
  }
}
```

这个设计和前面本地开发文档是连着的：
- 开发阶段用 `dev.ps1` 跑通功能
- 发布阶段再用 ECS 脚本固化一次产物

如果你已经有可信的本地产物，也可以传 `-SkipLocalBuild`，但脚本会反过来要求产物必须已经存在：

```powershell
if (-not (Test-BackendArtifacts $repoRoot)) { throw "missing backend jars while SkipLocalBuild is set" }
```

这能防止“跳过构建，却没有可发布产物”的低级错误。

## 3.2 打包阶段：上传的是仓库快照，不是单个文件

脚本会执行：

```powershell
& tar -czf $packagePath --exclude=.git --exclude=.dev --exclude=node_modules --exclude=apps/paperflow-web/node_modules -C $workspaceRoot $repoName
```

它的特点是：
- 保留仓库结构
- 排除 Git、开发态目录、前端依赖目录
- 让远端解压后仍能拿到完整 compose、env、脚本、jar、dist 结构

这样一来，远端脚本可以用和本地一致的相对路径，不需要再为“服务器上的目录长什么样”单独写另一套逻辑。

## 3.3 上传阶段：压缩包和远端执行脚本分开发送

脚本使用 `scp` 分别上传：

1. 主压缩包
2. 远端部署脚本 `/tmp/paperflow-remote-deploy.sh`

随后通过：

```powershell
& ssh "$RemoteUser@$RemoteHost" "bash $remoteScriptPath"
```

把真正的远端部署动作一次性执行掉。

这种做法的好处是：
- PowerShell 只负责生成命令
- 真正上服务器后，统一按 bash 语义执行
- 避免本地 shell 差异污染远端 Linux 行为

## 3.4 远端阶段：不重建，只替换容器内容

远端脚本最核心的部分是：

```bash
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml up -d --no-build
USER_CID=$(docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps -q user-service)
CONTENT_CID=$(docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps -q content-service)
GATEWAY_CID=$(docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps -q api-gateway)
FRONTEND_CID=$(docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps -q frontend)

docker cp backend/services/user-service/target/user-service-0.1.0-SNAPSHOT.jar "$USER_CID":/app/app.jar
docker cp backend/services/content-service/target/content-service-0.1.0-SNAPSHOT.jar "$CONTENT_CID":/app/app.jar
docker cp backend/services/api-gateway/target/api-gateway-0.1.0-SNAPSHOT.jar "$GATEWAY_CID":/app/app.jar

if [ -f apps/paperflow-web/dist/index.html ]; then
  docker cp apps/paperflow-web/dist/. "$FRONTEND_CID":/usr/share/nginx/html/
fi

docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml restart user-service content-service api-gateway frontend
```

这里体现了当前部署策略的真实特点：

1. Compose 负责把容器网络和卷先准备好
2. `docker cp` 负责把新 jar 和前端静态文件塞进容器
3. 最后用 `restart` 让新产物真正生效

这是一种非常务实的“轻量发布”方式，优点是：
- 上手成本低
- 不依赖镜像仓库
- 能快速把本地确认过的产物送上去

但它也带来一个约束：你必须对“本地产物可信”这件事非常认真。

---

## 4. 生产编排与代理配置

## 4.1 `compose.prod.yml` 比 dev 多了运行态配置

和 dev/test 相比，`docker/compose.prod.yml` 的重点变化有三类。

### 第一类：重启策略

```yaml
restart: always
```

这说明 prod 环境的目标不是“便于调试”，而是“服务掉了也尽快拉起来”。

### 第二类：生产配置注入更完整

例如 `user-service` 额外注入了邮件配置：

```yaml
PF_MAIL_ENABLED: ${PF_MAIL_ENABLED}
PF_MAIL_HOST: ${PF_MAIL_HOST}
PF_MAIL_PORT: ${PF_MAIL_PORT}
PF_MAIL_USERNAME: ${PF_MAIL_USERNAME}
PF_MAIL_PASSWORD: ${PF_MAIL_PASSWORD}
PF_MAIL_FROM: ${PF_MAIL_FROM}
```

`content-service` 额外注入了 Pathfinder AI 和 demo ingest 相关配置：

```yaml
PF_PATHFINDER_AI_ENDPOINT: ${PF_PATHFINDER_AI_ENDPOINT}
PF_PATHFINDER_AI_API_KEY: ${PF_PATHFINDER_AI_API_KEY}
PF_PATHFINDER_AI_KEY_PAIRS: ${PF_PATHFINDER_AI_KEY_PAIRS}
PF_PATHFINDER_AI_TIMEOUT_MS: ${PF_PATHFINDER_AI_TIMEOUT_MS}
PAPERFLOW_DEMO_INGEST_ENABLED: ${PAPERFLOW_DEMO_INGEST_ENABLED}
PAPERFLOW_DEMO_INGEST_TOKEN: ${PAPERFLOW_DEMO_INGEST_TOKEN}
```

这和前面的内容服务、用户服务、前端 Pathfinder 文档直接对应上了：上线不只是让服务能跑，还要让邮件、AI 路径规划、内部演示接口这些能力按环境正确生效。

### 第三类：前端容器正式进入拓扑

```yaml
frontend:
  build:
    context: ..
    dockerfile: docker/Dockerfile.frontend
  ports:
    - "${FRONTEND_PORT}:80"
  depends_on:
    - api-gateway
```

说明 prod 模式下，外部访问入口不再是 Vite，而是 Nginx 容器。

## 4.2 `paperflow.conf` 解释了为什么线上前端和网关能同源工作

`docker/nginx/paperflow.conf` 里最关键的三段配置分别是：

### 根路径重定向

```nginx
location = / {
  return 302 /paperflow/posts;
}
```

说明线上首页会直接进入前端应用的帖子页。

### `/api/` 反向代理到网关

```nginx
location /api/ {
  resolver 127.0.0.11 ipv6=off valid=10s;
  set $api_upstream http://api-gateway:8080;
  proxy_pass $api_upstream;
}
```

这段配置特别重要，原因有两个：

1. 它让前端和后端在浏览器看来是同源的
2. 它显式使用 Docker DNS 动态解析，避免 `api-gateway` 容器重建后 IP 漂移导致 502

这一点和已有的云端复盘文档完全一致，也说明这个修复不是纸面设计，而是从真实故障里长出来的。

### `/paperflow/` 子路径静态资源支持

```nginx
location /paperflow/assets/ {
  rewrite ^/paperflow/(.*)$ /$1 break;
  types {
    application/javascript js mjs;
    text/css css;
  }
  try_files $uri =404;
}

location /paperflow/ {
  rewrite ^/paperflow/(.*)$ /$1 break;
  try_files $uri $uri/ /index.html;
}
```

这和前端模块里的 `base` / `basename` 设计是严格匹配的：前端不是部署在根路径，而是部署在 `/paperflow/` 子路径下。

---

## 5. 发布后的验收与运行红线

## 5.1 项目已经明确禁止把构建放到 ECS

已有经验文档给出的红线非常明确：
- 不在 ECS 执行 `npm ci`、`npm run build`
- 不在 ECS 执行 `mvn package`
- 不在没做健康检查和接口抽检前就认定“已上线”

这背后的核心逻辑是：
- 本地环境更适合处理构建失败
- ECS 更适合做可重复的产物替换

## 5.2 验收不是只看容器是否在 running

上线后至少要做三类检查：

1. 基础健康检查
   - `/actuator/health`

2. 业务抽检
   - `/api/v1/posts`
   - `/api/v1/posts/{postId}`
   - 评论等核心接口

3. 静态资源抽检
   - `/paperflow/assets/*.js`
   - 检查 MIME 是否正确

只有这样，才能同时覆盖：
- 网关到后端链路
- 前端静态资源发布
- Nginx 代理行为

## 5.3 重启顺序会影响窗口期报错

已有部署经验中提到过：如果 `content-service` 刚重启、还没 ready，网关可能会出现短暂的 `Connection refused`。

因此推荐顺序是：

1. 重启内容服务
2. 等待它 ready
3. 再重启网关

这说明发布过程不只是“把服务都重启一遍”，而是要尊重模块间的依赖顺序。

---

## 6. 常见问题与踩坑经验

### 6.1 经 `3151` 直连网关正常，但经前端代理访问报 502

这类问题几乎已经在项目经验文档里被定性了：优先排查 Nginx 上游解析，而不是先怀疑后端业务代码。

典型根因：
- `api-gateway` 容器重建后 IP 变化
- Nginx 还缓存着旧解析结果

当前解决方案也已经落在正式配置里了：
- `resolver 127.0.0.11`
- 变量形式 `proxy_pass`

### 6.2 发布后还是旧前端

这通常不是 React 没构建，而是：
- dist 没成功复制进 frontend 容器
- frontend 容器没重启
- 浏览器或代理层还在用旧静态文件

所以排查顺序应该是：
- 先看远端 `dist/index.html`
- 再看前端容器内静态文件
- 再看容器是否真的重启

### 6.3 中文内容上传后变成乱码或 `???`

这属于部署与运行层面的协议问题，不是业务字段本身的问题。已有经验里给出的原则是：
- 统一用 UTF-8 字节发送 JSON
- 显式使用 `application/json; charset=utf-8`
- 避免 PowerShell 用默认编码隐式提交正文

---

## 7. 可演进方向

### 7.1 从“docker cp 替换产物”升级到镜像化发布
当前方案能跑，但长期来看更稳的方向仍然是：
- 本地或 CI 构建镜像
- 推送到镜像仓库
- ECS 只拉镜像并重启

### 7.2 把验收步骤脚本化
现在项目里已经有明确的健康检查和抽检经验，后续可以把这些固化成真正的发布后 smoke script，而不是人工逐条执行。

### 7.3 增加更明确的回滚入口
现在的经验更偏“单服务优先回滚”，后续如果继续完善，可以把 frontend、gateway 的快速回滚做成独立脚本，减少线上窗口期。

---

## 8. 小结

ECS 发布这一层，PaperFlow 的核心思想可以总结成一句话：

先在本地把产物做对，再在云端把产物放对。

它不是最重型的部署体系，但和当前项目阶段是匹配的。更重要的是，这套流程已经把几个关键风险点都显式写进了脚本和配置里：
- 云端不构建
- 前端通过 Nginx 同源代理网关
- 容器重启要尊重依赖顺序
- 上线必须做真实接口验收

---

## 9. 页内导航

- 所属模块：[Deploy 模块索引](./00-index.md)
- 上一篇：[Deploy 模块详解：本地开发与 Docker 编排](./01-local-dev.md)
- 下一篇：[Deploy 模块详解：数据库初始化与运维操作](./03-database-ops.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
