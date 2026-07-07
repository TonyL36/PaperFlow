# 作为大学生团队做部署时，我们是怎样用 Docker Compose 把多服务真正接起来的

> 摘要：很多大学生团队做前后端分离项目时，本地能跑不代表部署后还能稳定协同。真正容易出问题的地方，往往不是某一个服务本身，而是多服务怎么接、环境变量怎么传、前端到底从哪里进系统。PaperFlow 在部署时继续使用 Docker Compose，但关注点不再是“工具轻不轻”，而是把几层技术连接关系搭清楚：数据库和服务如何对应，网关如何转发，前端如何通过 Nginx 进入统一入口，配置项如何分发到各个容器。本文结合 `compose.prod.yml` 和真实配置，整理我们是怎样把这一套多服务技术实现真正接起来的。
>
> 标签：Docker Compose｜生产环境｜Nginx｜Spring Boot｜React｜配置管理

很多大学生团队第一次做部署时，最容易卡住的并不是 Docker 命令本身，而是下面这些更具体的技术问题：

- PostgreSQL、用户服务、内容服务之间的连接怎么写；
- 网关到底该连哪个容器地址；
- 前端访问 `/api` 时请求究竟会先到哪里；
- 环境变量应该写进镜像、写进代码，还是写进部署文件；
- 某个服务启动了，但为什么另一个服务还是访问不到它。

PaperFlow 目前的做法比较务实：  
本地、测试、生产都继续沿用 Compose 这条主线，但每个环境的职责边界非常明确。

在生产环境里，核心文件就是：

```text
docker/compose.prod.yml
docker/env/prod.env
docker/Dockerfile.frontend
docker/nginx/paperflow.conf
```

如果只看技术名词，这些都不新。  
但对大学生团队来说，真正难的往往也不是“听过没有”，而是能不能把这些东西一层层接通。

## 1. 先把生产拓扑定死，而不是边跑边猜

`compose.prod.yml` 里当前的服务拓扑很清楚：

```yaml
services:
  postgres:
  user-service:
  content-service:
  api-gateway:
  frontend:
```

这五个服务不是随便拼出来的，它刚好对应 PaperFlow 当前的系统职责：

- `postgres` 负责多数据库承载；
- `user-service` 负责账号与认证域；
- `content-service` 负责帖子、评论、通知、Pathfinder；
- `api-gateway` 负责统一入口和流量收口；
- `frontend` 负责 React 构建产物和前端入口。

这套拓扑最重要的一点，是部署结构直接跟代码里的服务拆分对应起来。  
前面业务上怎么拆，Compose 里就怎么连。

这样做的好处很直接：  
当我们去查某个接口为什么不通时，可以马上定位它属于哪一层，而不是在部署时又把服务边界搅乱。

## 2. `restart: always` 看起来普通，但它解决的是多服务运行时的连续性

在 `compose.prod.yml` 里，核心服务都加了：

```yaml
restart: always
```

很多人会忽略这种配置，觉得只是顺手一写。  
但放在多服务部署里，它解决的是一个很具体的技术问题：

- 某个容器异常退出后，整条调用链不要就此断掉；
- 网关、前端、业务服务之间的依赖关系不要因为单点退出而长期失效。

本地开发时，服务挂掉往往是在帮你暴露问题。  
但到了部署环境里，如果 `api-gateway`、`content-service` 或 `frontend` 其中一个退出，前后端整条访问链都会受到影响。

所以即使只是 Compose，这种最基础的运行态约束也还是要补上。

## 3. 环境差异不塞进 YAML，而是尽量交给 `prod.env`

在我们这个项目一路做下来的过程中，我们采用的一条原则是：  
Compose 文件本身应该尽量稳定，环境差异尽量通过 env 注入。

PaperFlow 的生产环境变量文件目前长这样：

```env
POSTGRES_PASSWORD=paperflow_prod_change_me
GATEWAY_PORT=3151
FRONTEND_PORT=9628
PF_JWT_SECRET=prod_change_me_prod_change_me_prod_change_me
PF_RL_ANON_PER_MIN=60
PF_RL_USER_PER_MIN=1200
PAPERFLOW_DB_HOST=postgres
PAPERFLOW_DB_PORT=5432
PAPERFLOW_DB_NAME=paperflowdb
PAPERFLOW_DB_USER=paperflow
PAPERFLOW_DB_PASSWORD=paperflow_prod_change_me
PF_MAIL_ENABLED=true
PF_MAIL_HOST=smtp.qq.com
PF_MAIL_PORT=465
PF_PATHFINDER_AI_ENDPOINT=https://open.bigmodel.cn/api/paas/v4/chat/completions
PF_PATHFINDER_AI_TIMEOUT_MS=30000
PAPERFLOW_DEMO_INGEST_ENABLED=false
```

这里最重要的不是变量多，而是它们有明确分组：

- 基础运行端口；
- 认证与限流；
- 数据库连接；
- 邮件通知；
- Pathfinder AI；
- demo ingest 开关。

只要变量按职责分组，后面去定位和分发配置时就会清楚很多。  
因为你不需要在一堆“意义不明的配置项”里猜，某个值到底会影响哪个服务。

## 4. 业务服务只拿自己应该拿到的配置

`compose.prod.yml` 的另一个好处，是配置注入没有失控。

比如 `user-service` 只拿自己需要的东西：

```yaml
user-service:
  environment:
    USER_DB_URL: jdbc:postgresql://postgres:5432/userdb
    USER_DB_USER: paperflow
    USER_DB_PASS: ${POSTGRES_PASSWORD}
    PF_JWT_SECRET: ${PF_JWT_SECRET}
    PF_MAIL_ENABLED: ${PF_MAIL_ENABLED}
    PF_MAIL_HOST: ${PF_MAIL_HOST}
    PF_MAIL_PORT: ${PF_MAIL_PORT}
    PF_MAIL_USERNAME: ${PF_MAIL_USERNAME}
    PF_MAIL_PASSWORD: ${PF_MAIL_PASSWORD}
    PF_MAIL_FROM: ${PF_MAIL_FROM}
```

这说明用户服务的生产关切主要是两类：

- 连上 `userdb`；
- 让登录/注册/邮件通知相关能力正常工作。

而 `content-service` 则显式拿的是另一组配置：

```yaml
content-service:
  environment:
    CONTENT_DB_URL: jdbc:postgresql://postgres:5432/contentdb
    CONTENT_DB_USER: paperflow
    CONTENT_DB_PASS: ${POSTGRES_PASSWORD}
    PF_PATHFINDER_AI_ENDPOINT: ${PF_PATHFINDER_AI_ENDPOINT}
    PF_PATHFINDER_AI_API_KEY: ${PF_PATHFINDER_AI_API_KEY}
    PF_PATHFINDER_AI_KEY_PAIRS: ${PF_PATHFINDER_AI_KEY_PAIRS}
    PF_PATHFINDER_AI_TIMEOUT_MS: ${PF_PATHFINDER_AI_TIMEOUT_MS}
    PAPERFLOW_DEMO_INGEST_ENABLED: ${PAPERFLOW_DEMO_INGEST_ENABLED}
    PAPERFLOW_DEMO_INGEST_TOKEN: ${PAPERFLOW_DEMO_INGEST_TOKEN}
    PF_PAPERS_CACHE_DIR: ${PF_PAPERS_CACHE_DIR:-/var/lib/paperflow/pdf-cache}
```

这组配置和内容服务真实职责是对得上的：

- 内容主库；
- AI 路径规划能力；
- 论文缓存目录；
- 演示数据导入开关。

这种“谁拿什么配置”的清晰度，直接决定后面我们能不能看懂部署结构。  
如果每个服务都塞一大堆全局变量，最后往往谁都说不清某个变量究竟是给谁用的。

## 5. 网关继续当统一入口，而不是让前端直连后端

生产编排里，`api-gateway` 依然保留单独服务：

```yaml
api-gateway:
  environment:
    USER_SERVICE_URL: http://user-service:8081
    CONTENT_SERVICE_URL: http://content-service:8082
    PF_JWT_SECRET: ${PF_JWT_SECRET}
    PF_RL_ANON_PER_MIN: ${PF_RL_ANON_PER_MIN}
    PF_RL_USER_PER_MIN: ${PF_RL_USER_PER_MIN}
  ports:
    - "${GATEWAY_PORT}:8080"
```

这一步在我们这个项目里比较重要。  
因为大学生团队在接前后端时，最容易图省事的做法就是：

- 前端直接连用户服务；
- 前端再直接连内容服务；
- 鉴权、限流、统一错误全部分散到各处。

这样虽然一开始看起来能跑，但一旦接口多起来，请求路径就会越来越不好追。

PaperFlow 这里继续保留网关，实际上是在守住三件事：

- 单一 API 入口；
- 服务地址不暴露给前端；
- 鉴权与限流不在业务服务里重复实现。

这和前面网关模块的设计是完全一致的，部署层没有把这层边界打碎。

## 6. 前端容器不是“摆设”，它实际上把浏览器访问路径固定了下来

很多人会把前端当成“顺手发一下静态文件”。  
但在这套生产编排里，`frontend` 是一个正式服务：

```yaml
frontend:
  build:
    context: ..
    dockerfile: docker/Dockerfile.frontend
  restart: always
  ports:
    - "${FRONTEND_PORT}:80"
  depends_on:
    - api-gateway
```

对应的 `Dockerfile.frontend` 很干净：

```dockerfile
FROM nginx:1.27-alpine
COPY apps/paperflow-web/dist /usr/share/nginx/html
COPY docker/nginx/paperflow.conf /etc/nginx/conf.d/default.conf
```

这说明前端上线并不是“把 dist 丢到某个目录就完了”，而是：

- 用 Nginx 托管静态资源；
- 用统一配置接入反向代理；
- 让浏览器始终从一个稳定入口进入系统。

这点非常关键。  
因为前端一旦成为正式入口，很多原本容易混乱的问题就能被固定下来：

- 路由路径怎么映射；
- `/api` 怎么代理；
- 静态资源怎么缓存；
- 前后端部署边界怎么划分。

## 7. 这套 Compose 技术实现真正成立，靠的是连接关系足够清楚

通过这次部署实践，我们逐渐感受到，Compose 这套方案能不能跑稳，关键就在于下面这些技术连接关系有没有写清楚、接清楚。

PaperFlow 现在这套配置之所以能跑起来，主要是因为这些关系是明确的：

- 哪个服务连哪个数据库；
- 网关把请求转发给哪个下游服务；
- 前端静态资源由哪个容器托管；
- 浏览器里的 `/api` 请求经过哪层代理；
- 哪些配置应该交给 `user-service`，哪些应该交给 `content-service`。

只要这些连接关系足够稳定，Compose 就不只是“把容器拉起来”，而是能成为一份真正可解释的部署实现。

这也是大学生团队做部署时很重要的一点。  
因为老师或者队友问你“这个请求最后去了哪里”“这个配置为什么写在这里”的时候，你必须能顺着文件和容器关系把它讲清楚。

真正容易出问题的不是“用了 Compose”，而是：

- 一边用 Compose；
- 一边又把所有环境差异直接写死在文件里；
- 一边让前端和后端到处直连；
- 一边让每个服务承担自己不该承担的配置责任。

那样系统当然会失控。

## 8. 最后

回头看这套生产编排，这套实现最重要的一点，就是技术连接关系足够清楚：

- `compose.prod.yml` 负责稳定拓扑；
- `prod.env` 负责环境差异；
- `api-gateway` 负责统一流量入口；
- `frontend + Nginx` 负责浏览器访问入口；
- 各服务只接收自己职责范围内的配置。

对我们这个阶段的 PaperFlow 学生项目来说，这已经足够支撑一个真实可跑的线上系统。  
更重要的是，这套实现不只是能跑，我们自己也能讲清楚它为什么这样接。

如果是类似的大学生 Spring Boot + React 项目，打算先用 Docker Compose 把系统部署起来，更值得优先想清楚的不是“平台够不够高级”，而是：

- 哪些配置应该外置；
- 哪些服务应该继续隔离；
- 前端到底该怎么进入系统；
- 网关这层边界要不要保留。

这些问题想清楚了，Compose 才不会从“工具”变成“负担”。
