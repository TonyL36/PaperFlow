# 作为大学生团队做部署时，我们是怎样把 no-build 发布链路落到 ECS 上的

> 摘要：很多大学生团队第一次把项目发到云上时，第一反应都是“SSH 上去 `git pull` 然后现场构建”。但在 PaperFlow 这个前后端分离项目里，我们最后把 ECS 发布收敛成了一条更克制的链路：本地构建、本地打包、远端只解压、替换产物和重启容器。本文结合真实脚本，整理我们是怎样把 `--no-build`、本地打包、远端替换产物和容器重启串成一条可执行发布链的。
>
> 标签：ECS｜Docker Compose｜Spring Boot｜React｜部署实战｜云端发布

很多人第一次把项目发到服务器时，都会默认走一条很“直接”的路：

```bash
ssh root@server
git pull
mvn package
npm install
npm run build
docker compose up -d --build
```

这条路看起来很省事，因为所有动作都发生在一台机器上。  
但在真正把 PaperFlow 跑通之后，我们越来越确定一件事：

- 服务器应该负责运行；
- 构建问题应该留在本地解决。

PaperFlow 不是单服务项目，而是一套完整的前后端系统：

- `user-service` 负责登录、注册、刷新令牌；
- `content-service` 负责帖子、评论、收藏、通知、Pathfinder；
- `api-gateway` 负责统一入口和鉴权限流；
- `paperflow-web` 是 React 前端；
- `postgres` 承担 `userdb`、`contentdb`、`paperflowdb` 三套数据。

这类系统一旦把“构建”和“运行”都压在云端，问题就会从“能不能发上去”，变成“到底是哪一步炸了”。

## 1. 在我们这个大学生团队项目里，最后采用了 no-build 发布链路

PaperFlow 现在的云端发布主入口是：

```text
scripts/deploy-ecs-no-build.ps1
```

它的整体流程非常明确：

```text
本地构建 jar / 前端 dist
  -> 打包仓库快照
  -> scp 上传到 ECS
  -> 远端解压
  -> docker compose up -d --no-build
  -> docker cp 替换容器内产物
  -> restart 对应服务
```

这条链路和“远端重新构建镜像”最大的区别在于，它刻意把 ECS 的职责收缩成了两件事：

- 起容器；
- 接收已经确认过的运行产物。

远端最关键的命令就是这一句：

```bash
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml up -d --no-build
```

这里的 `--no-build` 不只是一个参数，它本质上是在表达发布策略：

- 不在 ECS 上跑 Maven；
- 不在 ECS 上跑 npm；
- 不在 ECS 上重新构建镜像；
- 不把“环境不一致”带进线上。

## 2. 本地阶段先把产物问题解决干净

脚本默认会先在本地做一次构建：

```powershell
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
```

这里有两个在实现过程中比较关键的点。

第一，它先构建后端三个核心服务，而不是把整个仓库一锅端。  
这说明发布脚本不是随便“跑个 package”，而是明确知道上线真正依赖哪些产物。

第二，前端这里先尝试 `npm ci`，失败再回退到 `npm install`。  
这其实就是很典型的工程妥协：优先保证依赖一致性，但也给现实环境留一个缓冲口。

更重要的是，脚本还给“跳过本地构建”加了硬约束：

```powershell
if (-not (Test-BackendArtifacts $repoRoot)) { throw "missing backend jars while SkipLocalBuild is set" }
```

也就是说，哪怕你传了 `-SkipLocalBuild`，也不能空手上服务器。  
这类校验看起来不起眼，但它能挡住很多低级事故。

## 3. 上传的不是单个 jar，而是一次“仓库快照”

脚本的打包命令是：

```powershell
& tar -czf $packagePath --exclude=.git --exclude=.dev --exclude=node_modules --exclude=apps/paperflow-web/node_modules -C $workspaceRoot $repoName
```

这里有个很实用的思路：  
上传的不是“某个 jar 文件”或“某个 dist 目录”，而是排除无关目录后的仓库快照。

这会直接带来三个技术效果：

- 远端解压后仍然保留完整目录结构；
- Compose、env、脚本、jar、前端 dist 都在同一棵树里；
- 服务器端不需要再维护一套“和本地不同的目录语义”。

换句话说，这条做法虽然不复杂，但它把发布链里最容易混乱的几步拆开了：

- 没有镜像仓库；
- 没有完整 CI/CD；
- 但需要一条足够稳、足够容易复现的发布路径。

## 4. 远端阶段真正做的事，其实只有替换和重启

脚本上传完压缩包之后，会再生成一份远端 bash 脚本。里面最核心的部分是：

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

这段实现非常“土”，但也非常诚实。

它没有把发布过程包装成复杂流水线，而是把几个关键技术动作明确拆开：

- 先把容器网络和拓扑拉起来；
- 找到对应容器 ID；
- 把新 jar 和前端静态文件直接塞进去；
- 最后重启服务让新产物生效。

这就是一条很直接的 no-build 发布实现。  
直接能看出来的技术特点是：

- 脚本结构直接；
- 不依赖镜像仓库；
- 对前后端分离项目的小规模发布链很容易落地。

但它也会把一个技术前提暴露得很明确：

> 你的“发布质量”，本质上取决于本地产物有多可信。

## 5. 为什么我们没有在 ECS 上直接构建

原因其实不是“服务器不能构建”，而是“不值得把构建不确定性放到运行环境里”。

在这次部署实践中，我们希望尽量避免下面这些问题：

- Maven 依赖下载慢，甚至临时失败；
- npm 源波动导致 `npm install` 卡住；
- 服务器磁盘、内存、CPU 被构建过程吃掉；
- 一次发布里混入“代码问题”和“服务器环境问题”两类故障。

如果这些问题发生在本地，排查是线性的。  
但如果它们发生在 ECS 上，你会同时怀疑：

- 是代码挂了；
- 是网络挂了；
- 是服务器环境挂了；
- 还是容器编排本身有问题。

发布最怕的不是某一步失败，而是失败原因不干净。

## 6. 这种 no-build 方案的边界也要看清楚

这并不是最终形态，但它已经是一条结构清楚的 no-build 发布实现。

这条发布链更容易发挥作用的场景是：

- 产物规模不算特别大；
- 发布频率可控；
- 还没有投入完整镜像化流水线；
- 更强调快速迭代和可解释性。

这条发布链会暴露问题的场景也很明确：

- 多环境、多节点、大规模灰度；
- 需要严格回滚版本管理；
- 希望镜像层面完全可追踪；
- 已经有成熟制品库和 CI/CD。

因此从技术演进角度看，这更像是一条已经跑通、后面还可以继续升级的发布基线：

- 比“SSH 上去手工改”稳定很多；
- 但还没走到“镜像仓库 + 自动流水线 + 回滚策略”那一步。

## 7. 这套方案最核心的价值，不是高级，而是边界清楚

回头看，PaperFlow 这套 ECS 发布方案最有价值的地方，不是它多优雅，而是它把边界画清楚了：

- 本地负责构建和验证；
- 云端负责运行和替换；
- Compose 负责拓扑；
- `docker cp` 负责产物落位；
- `restart` 负责切换生效。

只要边界清楚，脚本就不会越堆越乱。  
对大学生团队项目、个人项目或者还在快速迭代中的系统来说，这种“克制”其实比“堆满概念”更重要。

## 8. 最后

如果是类似的大学生 Spring Boot + React 项目，而且暂时没有精力把整套 CI/CD、镜像仓库、自动回滚都搭起来，可以先把“云端不构建”这件事想清楚。

因为上线最先要解决的，从来不是“技术栈够不够高级”，而是：

- 发布路径能不能复现；
- 问题到底出在本地还是云端；
- 系统能不能稳定地把新版本替换进去。

至少对我们这个 PaperFlow 学生项目来说，`--no-build` 不是退让，而是一次很有意识的工程收缩。
