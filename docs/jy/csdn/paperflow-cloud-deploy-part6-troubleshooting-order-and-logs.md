# 线上一出问题就乱翻日志没用：我们怎么给排障定顺序

> 摘要：系统一上云，最让人慌的往往不是报错本身，而是根本不知道先看哪里。PaperFlow 这套前后端分离系统里，线上问题通常会落在 5 个层级：前端入口、Nginx 代理、网关、业务服务、数据或配置。我们后来逐渐固定了一套排查顺序，不再“看到哪不对就点哪”，而是先看最能切分故障层级的接口和日志。本文结合项目里的健康检查脚本、网关过滤器和部署结构，整理这套排障顺序是怎么形成的。文中的代理目标和部署细节只保留结构示意，不直接暴露真实环境信息。
>
> 标签：线上排障｜日志分析｜Docker Compose｜Spring Boot｜Nginx｜故障定位

项目一旦跑到云上，排障最大的敌人通常不是故障本身，而是“同时有太多可疑点”。

以 PaperFlow 为例，用户看到“页面打不开”这件事，背后可能对应完全不同的问题：

- 前端静态资源没更新进去；
- Nginx 路径代理错了；
- 网关没起来；
- `content-service` 或 `user-service` 没起来；
- 网关能进，但下游接口转发失败；
- 数据库或环境变量导致业务服务异常。

先说明一下，这篇也不会放真实公网地址、真实上游目标、服务器登录方式这类敏感信息。  
能公开讲的，我会尽量只讲排查顺序、接口结构和断点判断逻辑。

如果这时什么都一起看，往往只会越看越乱。  
在我们这个项目一路做下来的过程中，我们更依赖一条固定顺序：

```text
先看入口是否活着
  -> 再看网关能不能接请求
  -> 再看业务接口能不能穿透
  -> 再看具体是哪一个服务出错
  -> 最后才回到配置、数据库和数据问题
```

## 1. 第一步，我们先确认这到底是“页面问题”还是“接口问题”

我们不会一上来就打开一堆日志，而是先做最小判断：

- `/paperflow/...` 页面能不能正常打开；
- `/actuator/health` 和 `/api/v1/actuator/health` 能不能访问；
- `/api/v1/posts?page[number]=1&page[size]=1` 有没有真实结果。

这套思路在项目脚本里其实已经固化了。  
本地的 `dev.ps1` 最后验证的是：

```powershell
if (!(Wait-Http "http://localhost:$ContentServicePort/api/v1/actuator/health" 120)) { throw "content-service not ready" }
if (!(Wait-Http "http://localhost:$UserServicePort/api/v1/actuator/health" 120)) { throw "user-service not ready" }
if (!(Wait-Http "http://localhost:$GatewayPort/actuator/health" 120)) { throw "api-gateway not ready" }
if (!(Wait-Http "http://localhost:$GatewayPort/api/v1/posts?page[number]=1&page[size]=1" 120)) { throw "gateway upstream route not ready" }
```

生产侧的 `check-prod-daily-health.ps1` 也延续了这个思路。  
这其实已经给出了一个排障原则：

> 先判断问题卡在入口，还是卡在业务链路。

如果首页打不开，但健康接口正常，问题大概率在前端入口或静态资源层。  
如果首页能开、健康接口也正常，但业务接口不通，问题就往往在网关转发或下游服务。

## 2. 第二步，我们会先看 Nginx 和浏览器入口有没有把路径走对

PaperFlow 线上前端不是挂在根路径，而是挂在：

```text
/paperflow/
```

Nginx 配置里最关键的几段是：

```nginx
location = / {
  return 302 /paperflow/posts;
}

location /api/ {
  proxy_pass http://<gateway-upstream>;
}

location /paperflow/ {
  rewrite ^/paperflow/(.*)$ /$1 break;
  try_files $uri $uri/ /index.html;
}
```

所以只要用户反馈是：

- 刷新页面 404；
- 页面能开但资源丢失；
- 首页跳转奇怪；

第一时间需要怀疑的就是这层：

- `/paperflow/` 子路径是不是还一致；
- 静态资源有没有按 `/paperflow/assets/...` 提供；
- `/api/...` 有没有被错误改成别的入口。

因为这类问题看起来像“前端挂了”，其实常常只是入口层路径没对齐。

## 3. 第三步，我们会先看网关，而不是立刻钻进业务服务

这套系统里，浏览器到后端的统一入口是 `api-gateway`。  
也就是说，大多数线上问题都会先经过网关这一层。

网关的职责在代码里也很清楚：

- `RequestIdGlobalFilter` 负责补 `X-Request-Id`
- `JwtAuthGlobalFilter` 负责 JWT 校验和用户身份透传
- `RateLimitGlobalFilter` 负责限流

比如 `RequestIdGlobalFilter` 的逻辑就是：

```java
String requestId = exchange.getRequest().getHeaders().getFirst(HEADER);
if (requestId == null || requestId.isBlank()) {
  requestId = UUID.randomUUID().toString();
}
exchange.getResponse().getHeaders().set(HEADER, requestId);
ServerHttpRequest mutated = exchange.getRequest().mutate().headers(h -> h.set(HEADER, requestId)).build();
```

这意味着网关其实是最适合做“第一跳判断”的地方。  
因为一旦请求连网关都没过，后面服务日志看再多也没用。

我们会先问几个问题：

- 网关 `actuator/health` 正常吗；
- 网关是不是直接返回了 `401`、`429`；
- 响应头里有没有 `X-Request-Id`；
- 响应头里有没有 `X-Api-Gateway: paperflow`。

这几个信息一旦拿到，很多问题都能先切掉一半。

## 4. 第四步，再去看业务服务，而且一定按“路由归属”去看

在这次实践里，我们不会一上来同时翻 `user-service` 和 `content-service`，因为那样很容易把排查路径绕乱。

更稳的方式是先按接口归属判断。

比如：

- `/api/v1/auth/**`
- `/api/v1/users/**`
- `/api/v1/oauth/**`

这类问题先看 `user-service`。

而下面这些：

- `/api/v1/posts/**`
- `/api/v1/comments/**`
- `/api/v1/favorites`
- `/api/v1/notifications/**`
- `/api/v1/pathfinder/sessions/**`
- `/api/v1/ai/**`

就先看 `content-service`。

因为网关 `application.yml` 已经把路由边界写死了：

```yaml
- id: user-auth
  predicates:
    - Path=/api/v1/auth/**

- id: content-posts
  predicates:
    - Path=/api/v1/posts,/api/v1/posts/**

- id: content-comments
  predicates:
    - Path=/api/v1/comments,/api/v1/comments/**
```

这个边界特别重要。  
排障时别跳过路由归属这一步，不然你很容易在错误的服务里浪费时间。

## 5. 第五步，如果返回 401 或 429，我们不会先怀疑业务代码

这套系统里，很多“像业务报错”的现象，其实是在网关层就被拦住了。

比如 `JwtAuthGlobalFilter` 会直接拦：

```java
if (auth == null || auth.isBlank() || !auth.startsWith("Bearer ")) {
  return writer.writeError(exchange, HttpStatus.UNAUTHORIZED, "AUTH_MISSING_TOKEN", "Missing Authorization Bearer token", Map.of());
}
```

`RateLimitGlobalFilter` 也会直接拦：

```java
if (!d.allowed()) {
  exchange.getResponse().getHeaders().set("Retry-After", "60");
  return writer.writeError(exchange, HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many requests", Map.of());
}
```

所以当线上反馈是：

- “接口偶尔 401”
- “评论发不出去”
- “请求偶尔突然失败”

我们不会先去查 Controller，而是先判断：

- token 有没有过期；
- 前端有没有把 `Authorization` 带上；
- 这个接口是不是本来就要求登录；
- 有没有被限流。

很多时候，业务服务根本没收到这次请求。

## 6. 第六步，只有当网关和路由都没问题，我们才回头看配置和数据库

这一步经常是最后才看，不是因为它不重要，而是因为它更适合在链路已经定位之后再看。

比如：

- `POSTGRES_PASSWORD` 错了；
- `PF_JWT_SECRET` 不一致；
- `PF_PATHFINDER_AI_ENDPOINT` 或 `PF_PATHFINDER_AI_API_KEY` 配错；
- `paperflowdb` 没初始化好；
- `contentdb` 有表但数据异常。

这些问题当然会造成线上故障，但如果你在还没确认入口、网关、路由层之前就钻进配置，会非常低效。

我们更倾向于把配置和数据库层理解成：

> 当你已经知道是哪一个服务、哪一类接口出问题之后，再往下挖的那一步。

## 7. 这套部署方式下，我们最常看的不是“所有日志”，而是“最靠近断点的日志”

PaperFlow 当前发布方式是：

- `docker compose up -d --no-build`
- `docker cp` 替换容器内 jar 和前端 dist
- `restart` 对应服务

这意味着排障时最怕的一件事是：

- 你看到的是旧问题；
- 但服务其实已经替换过产物；
- 或者前端资源没更新到位；
- 又或者容器起来了，但实际内容不是你以为的版本。

所以在我们这个项目里，我们更强调“最靠近断点的证据”：

- 入口层异常就先看页面路径、静态资源和 Nginx 行为；
- 接口层异常就先看网关响应头、状态码和健康接口；
- 某个服务归属明确后，再进对应服务日志；
- 数据异常才去看数据库和定时任务产出。

与其一上来同时看 10 个地方，不如先把断点定准。

## 8. 对我们这个学生团队来说，排障顺序本身就是架构的一部分

很多人只在写文档时讲“系统架构图”，但真正到了线上，架构是否清晰，其实体现在另一个地方：

> 出问题时，你能不能很快知道下一步该看哪里。

PaperFlow 现在这套结构虽然不大，但它之所以还算好查，是因为边界比较清楚：

- 前端入口有 `/paperflow/`
- API 入口有 `/api/`
- 网关统一收口
- 用户域和内容域路由分开
- 健康检查和业务探测脚本都已经在仓库里

这些东西平时看着像“工程细节”，但排障时会发现，它们决定了你到底是在做定位，还是在做碰运气。

## 9. 最后

如果是类似的大学生前后端分离项目，并且也采用 Docker Compose 上云，就很值得尽早把自己的排障顺序固定下来。

至少把这几个层级想清楚：

- 是页面入口问题，还是接口问题；
- 是网关层问题，还是业务服务问题；
- 是认证限流问题，还是业务逻辑问题；
- 是服务问题，还是配置/数据库问题。

对我们这个 PaperFlow 学生项目来说，我们现在最依赖的不是“多会看日志”，而是先知道什么阶段不该看什么。  
这比一上来同时翻一堆输出有效得多。
