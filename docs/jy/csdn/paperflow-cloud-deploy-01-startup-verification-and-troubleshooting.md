# 项目发到云上以后，我们怎么一步步确认它真的跑起来了

> 摘要：很多大学生团队把项目部署到云上之后，第一反应都是先打开页面看一眼。这当然有必要，但如果只停留在“页面能不能打开”，就很容易漏掉真正关键的链路。结合 PaperFlow 这次部署实践，我们后来慢慢形成了一套更稳的检查顺序：先看入口，再看健康接口，再看真实业务接口，最后才去翻具体日志和配置。本文把原来分散的“最小健康检查”和“线上排障顺序”收成一篇，整理我们是怎么一步步确认系统真的跑起来的。文中的地址、代理目标和远端信息都只保留结构示意，不直接暴露真实部署细节。
>
> 标签：部署验收｜健康检查｜线上排障｜Spring Boot｜Nginx｜大学生项目

很多时候，项目第一次发到云上，最容易出现一种错觉：

- 首页能打开；
- 帖子列表也能出来；
- 于是就觉得“应该差不多上线成功了”。

我们一开始也会这样想。  
但 PaperFlow 这类前后端分离系统一旦真的跑起来，问题通常不会只出在一个地方。

比如用户说一句“页面打不开”，背后可能对应的其实是完全不同的层：

- 前端静态资源没更新进去；
- Nginx 的路径代理错了；
- 网关服务没起来；
- `content-service` 或 `user-service` 没起来；
- 网关能接请求，但下游接口没转通；
- 数据库或环境变量导致业务服务异常。

后来我们逐渐意识到，部署后的第一件事不是“多翻几份日志”，而是先把检查顺序固定下来。  
对学生项目来说，这比一上来就上复杂监控平台更现实，也更容易真正落地。

## 1. 我们先把“上线成功”改成一组可验证的事实

PaperFlow 里有一个很重要的小习惯：  
不把“进程还活着”当成成功，而是把“几条关键接口已经能稳定返回”当成成功。

本地启动脚本 `scripts/dev.ps1` 里，最后会主动跑这样一组探测：

```powershell
if (!(Wait-Http "http://localhost:$ContentServicePort/api/v1/actuator/health" 120)) { throw "content-service not ready" }
if (!(Wait-Http "http://localhost:$UserServicePort/api/v1/actuator/health" 120)) { throw "user-service not ready" }
if (!(Wait-Http "http://localhost:$GatewayPort/actuator/health" 120)) { throw "api-gateway not ready" }
if (!(Wait-Http "http://localhost:$GatewayPort/api/v1/posts?page[number]=1&page[size]=1" 120)) { throw "gateway upstream route not ready" }
```

这 4 步虽然简单，但含义并不一样：

- 前 3 步是在确认服务和基础 HTTP 能力已经起来；
- 最后 1 步是在确认真实业务接口已经能穿过网关跑通。

也就是说，它验证的不是“服务活着”，而是“系统已经具备最小可用性”。

## 2. 真正有用的不是 health 本身，而是它能把问题层级切开

如果没有这组探测，部署失败时你看到的通常只是：

- 页面打不开；
- 页面能开但没有数据；
- 接口偶尔通、偶尔不通。

这时候人最容易慌，因为怀疑对象太多了：

- Java 服务没起来；
- 网关没起来；
- 前端路径错了；
- 数据库没初始化；
- 某个接口转发失败；
- 甚至可能只是前端资源没更新。

而这种分层检查最实际的价值就在于，它能快速帮我们切断猜测范围：

- `content-service` health 不通，就先看内容服务；
- `user-service` health 不通，就先看用户服务；
- 网关 health 不通，就先看网关本身；
- 前三项都通，但 `/api/v1/posts` 不通，就重点看网关到下游的转发链路。

对大学生团队来说，这种“先切层，再看细节”的思路特别重要。  
因为我们的时间和人力都有限，排查路径一旦乱掉，效率会掉得特别快。

## 3. 部署之后，我们先判断这是“页面问题”还是“接口问题”

后来我们排障时基本都会先做一个最小判断，而不是一上来就打开很多日志：

- `/paperflow/...` 页面能不能正常打开；
- 健康接口能不能访问；
- `/api/v1/posts?page[number]=1&page[size]=1` 有没有真实结果。

这一步其实就是在回答一个很关键的问题：

> 当前故障主要卡在浏览器入口，还是已经卡到接口链路里了？

如果首页打不开，但健康接口正常，问题大概率还停留在前端入口或静态资源层。  
如果首页能开、健康接口也正常，但业务接口不通，那就更像是网关转发或下游服务的问题。

## 4. 入口层这一步，我们优先看路径有没有说同一种语言

PaperFlow 的前端不是挂在根路径，而是挂在：

```text
/paperflow/
```

Nginx 配置里，入口层最关键的结构大概是这样：

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

所以一旦用户反馈是下面这些问题：

- 刷新页面 404；
- 页面能开但资源丢失；
- 首页跳转奇怪；
- 页面路径对了但接口前缀不对；

我们第一反应不是“后端挂了”，而是先怀疑入口层：

- `/paperflow/` 子路径是不是还一致；
- 静态资源是不是按 `/paperflow/assets/...` 提供；
- `/api/...` 有没有被改成别的入口；
- SPA fallback 有没有失效。

这类问题看起来像“前端挂了”，其实常常只是部署入口没对齐。

## 5. 网关是我们排障时最重要的第一跳

入口层确认完之后，我们下一步通常先看网关，而不是立刻钻进业务服务。

原因很简单：  
浏览器到后端的统一入口就是 `api-gateway`，大多数线上请求都要先经过它。

网关在 PaperFlow 里承担的职责也很清楚：

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
```

这意味着网关特别适合做“第一跳判断”。  
因为如果请求连网关都没正常经过，后面去翻服务日志通常也没有意义。

我们排障时经常会先问这几个问题：

- 网关 `actuator/health` 正常吗；
- 网关是不是直接返回了 `401` 或 `429`；
- 响应头里有没有 `X-Request-Id`；
- 网关有没有把请求继续往下转。

这些信息一旦确认，很多问题能先切掉一半。

## 6. 真到业务服务这一步，我们不会两个服务一起翻

PaperFlow 当前的后端不是一个大单体，而是至少分成：

- `user-service`
- `content-service`
- `api-gateway`

所以到了业务服务排障这一步，我们不会一上来同时翻两个服务，而是先按接口归属判断。

比如：

- `/api/v1/auth/**`
- `/api/v1/users/**`
- `/api/v1/oauth/**`

这类问题就先看 `user-service`。

而下面这些接口：

- `/api/v1/posts/**`
- `/api/v1/comments/**`
- `/api/v1/favorites`
- `/api/v1/notifications/**`
- `/api/v1/pathfinder/sessions/**`

就先看 `content-service`。

这一步之所以重要，是因为网关路由边界本来就已经写清楚了。  
如果排障时跳过“路由归属”这一步，很容易在错误的服务里浪费很多时间。

## 7. 如果返回 401 或 429，我们不会先怀疑业务代码

这套系统里，很多“看起来像业务报错”的现象，其实是在网关层就被拦住了。

比如 `JwtAuthGlobalFilter` 会直接拒绝没有 Bearer token 的请求：

```java
if (auth == null || auth.isBlank() || !auth.startsWith("Bearer ")) {
  return writer.writeError(exchange, HttpStatus.UNAUTHORIZED, "AUTH_MISSING_TOKEN", "Missing Authorization Bearer token", Map.of());
}
```

`RateLimitGlobalFilter` 也会直接拦住超限请求：

```java
if (!d.allowed()) {
  exchange.getResponse().getHeaders().set("Retry-After", "60");
  return writer.writeError(exchange, HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many requests", Map.of());
}
```

所以当线上反馈变成这样：

- “接口偶尔 401”
- “评论发不出去”
- “请求偶尔突然失败”

我们不会先去查 Controller，而是会先判断：

- token 有没有过期；
- 前端有没有把 `Authorization` 带上；
- 接口本身是不是就要求登录；
- 有没有被限流；

很多时候，业务服务根本没收到这次请求。

## 8. 只有前面这些都没问题，我们才回头看配置和数据库

配置和数据库当然重要，但我们通常不会第一步就扎进去。

比如真正可能引起故障的配置问题包括：

- 数据库密码配错；
- JWT 密钥不一致；
- 某个 AI 接口配置不对；
- 数据库表没初始化好；
- 某个服务虽然能起，但数据状态异常。

这些都可能造成线上故障。  
但如果你在还没确认入口、网关、路由这几层之前就直接去翻配置，通常效率很低。

我们更愿意把这一步理解成：

> 当你已经知道是哪一个服务、哪一类接口出问题之后，再往下挖的那一步。

## 9. 这套检查顺序为什么适合学生团队

回头看这次实践，我们觉得这套方法最重要的地方不是“多高级”，而是它真的能在学生团队里落地。

原因很现实：

- 不需要一开始就上很重的监控体系；
- 不需要每次出问题都靠经验硬猜；
- 不需要同时翻很多地方把自己绕晕；
- 更适合边开发边部署、边部署边修正的项目节奏。

对我们来说，真正有用的不是“把所有日志都看一遍”，而是：

- 先看入口层有没有活着；
- 再看网关能不能接住请求；
- 再看真实业务接口能不能穿透；
- 再看具体是哪一个服务出错；
- 最后才回到配置、数据库和数据问题。

## 10. 最后

如果你也是类似的大学生团队项目，项目第一次发到云上之后，可以先给自己准备一套很朴素的检查顺序：

1. 页面入口能不能打开  
2. health 接口能不能返回  
3. 一条真实业务接口能不能穿过网关  
4. 当前问题更像入口问题、网关问题，还是服务问题  
5. 定位清楚之后再去翻具体日志和配置

这套顺序听起来不复杂，但它确实帮我们把很多部署后的混乱情况收住了。  
对 PaperFlow 来说，它也是我们从“项目能跑”走向“项目真的可排查、可验证”的一个很实际的阶段。
