# 前端、网关、业务服务怎么共用一套 API 入口

> 摘要：前后端分离项目刚起步时，最容易图快的做法就是“前端先直连后端服务”。服务一多之后，这种写法就会慢慢失控，前端开始分别记用户服务、内容服务、AI 服务的地址，还要自己处理鉴权和错误逻辑。PaperFlow 后来尽量把 API 入口收在网关和相对路径里：前端统一打 `/api/v1/...`，网关负责路由、鉴权、身份透传和限流，下游服务只接自己职责范围内的请求。本文结合前端请求封装、网关过滤器和路由配置，整理我们是怎么把这套统一入口接起来的。文中的代理地址和服务目标只保留结构示意，不直接暴露真实部署细节。
>
> 标签：API 设计｜Spring Cloud Gateway｜React｜前后端分离｜鉴权｜工程实践

先说明一下，这篇不会放真实公网地址、真实上游目标或者能直接复现部署结构的细节。  
能公开讲的，主要还是接口入口设计和代码里的连接关系。

很多项目在最早阶段都走过一条很自然的路：

- 前端先连一个后端服务；
- 后来又加了第二个服务；
- 再后来哪个接口在哪，就写哪个地址。

这条路的问题不是一开始不能用，而是它会越来越难收拾。

尤其像 PaperFlow 这种系统，本身就不是单一后端：

- `user-service` 负责认证和用户域；
- `content-service` 负责帖子、评论、互动、通知、Pathfinder；
- `api-gateway` 负责统一入口；
- 还有一部分 Agent 能力未来继续扩展。

在这种结构下，如果前端直接到处连，问题迟早会集中爆发。

## 1. 先看前端：它其实一直在坚持“只认相对 `/api`”

PaperFlow 前端的请求封装在：

```text
apps/paperflow-web/src/ui/data/http.ts
apps/paperflow-web/src/ui/data/api.ts
```

`http.ts` 里真正发请求的地方很直接：

```ts
resp = await fetch(input, { ...init, headers, signal });
```

关键不在 `fetch`，而在 `api.ts` 传进去的 `input` 基本都是统一的相对路径：

```ts
httpJson<AuthResp>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(req) });
httpJson<UserProfile>("/api/v1/users/me", { method: "GET", accessToken, signal });
httpJson<Paged<Post>>(`/api/v1/posts?page[number]=${pageNumber}&page[size]=${pageSize}`, { method: "GET", signal });
httpJson<Comment>("/api/v1/comments", {
  method: "POST",
  accessToken,
  body: JSON.stringify({ postId, content, parentCommentId: parentCommentId || undefined })
});
```

也就是说，前端根本不关心：

- 用户服务在哪个端口；
- 内容服务在哪个端口；
- 某个接口是不是以后会迁移到别的服务。

它只认一件事：

```text
/api/v1/...
```

这件事看起来很普通，但其实是整个系统能持续演进的基础。

## 2. 本地开发和生产部署，接口入口也是同一套语义

前端开发态的 `vite.config.ts` 是这样配的：

```ts
server: {
  proxy: {
    "/api": {
      target: process.env.VITE_API_BASE ?? "<local-api-base>",
      changeOrigin: true
    }
  }
}
```

生产环境里，Nginx 也是这样转：

```nginx
location /api/ {
  proxy_pass http://<gateway-upstream>;
}
```

这意味着无论环境怎么变，前端的接口认知都没变：

- 开发态：`/api/...` 由 Vite 代理到网关
- 生产态：`/api/...` 由 Nginx 代理到网关

这也是这次项目里比较重要的“入口语义一致”。  
环境可以切，地址可以换，但调用面不应该到处跟着改。

## 3. 网关真正带来的，不只是“少记几个地址”

很多人会把网关理解成一种“方便转发”的东西，好像只是替前端省掉了几个端口号。  
但在 PaperFlow 里，网关承担的其实是多层职责。

第一层是路由分发。  
`application.yml` 里已经把边界写得很明确：

```yaml
- id: user-auth
  uri: ${USER_SERVICE_URL:<user-service-upstream>}
  predicates:
    - Path=/api/v1/auth/**

- id: content-posts
  uri: ${CONTENT_SERVICE_URL:<content-service-upstream>}
  predicates:
    - Path=/api/v1/posts,/api/v1/posts/**

- id: content-comments
  uri: ${CONTENT_SERVICE_URL:<content-service-upstream>}
  predicates:
    - Path=/api/v1/comments,/api/v1/comments/**
```

第二层是请求标识统一。  
`RequestIdGlobalFilter` 会补 `X-Request-Id`：

```java
if (requestId == null || requestId.isBlank()) {
  requestId = UUID.randomUUID().toString();
}
exchange.getResponse().getHeaders().set(HEADER, requestId);
```

第三层是 JWT 鉴权和身份透传。  
`JwtAuthGlobalFilter` 在校验通过后，会把身份写给下游：

```java
h.set("X-User-Id", userId);
h.set("X-User-Roles", rolesStr);
h.set("X-User-Email", email);
```

第四层是限流。  
`RateLimitGlobalFilter` 会根据接口类型和是否登录，决定不同限额：

```java
if (isAuth) {
  limit = props.getAuthPerMinute();
} else if (isPublic) {
  limit = props.getPublicGetPerMinute();
} else if (userId == null) {
  limit = props.getAnonymousPerMinute();
} else {
  limit = props.getUserPerMinute();
}
```

这些职责如果不收在网关，就只能散落到前端和各个业务服务里。

## 4. 如果前端直接连多个服务，最先失控的往往不是路由，而是鉴权和错误处理

随着模块逐渐增多，这一点变得越来越明显。

假设前端直接连：

- `user-service`
- `content-service`
- 以后再加一个 Agent 服务

那前端很快就要开始承担下面这些事情：

- 记住每个服务的地址；
- 知道每个接口是不是需要登录；
- 知道哪些接口可以匿名访问；
- 处理不同服务返回的错误格式；
- 分别考虑每个服务的限流和跨域策略。

这时候前端就不再只是“调用接口”，而是在偷偷承担网关才该做的部分工作。

而 PaperFlow 现在的好处是，前端请求层基本只关心三件事：

- 打 `/api/v1/...`
- 需要登录时带 `Authorization`
- 失败时按统一 envelope 和 `requestId` 处理

例如 `http.ts` 里，401 后会走 refresh 重试逻辑：

```ts
if (
  resp.status === 401 &&
  !init._retriedWithRefresh &&
  !!init.accessToken &&
  !input.includes("/api/v1/auth/refresh") &&
  authTransport
) {
  const refreshed = await authTransport.refreshAccessToken();
  if (refreshed) {
    return httpJson<T>(input, { ...init, accessToken: refreshed, _retriedWithRefresh: true });
  }
}
```

这类处理之所以能稳定工作，一个前提就是：前端面对的是统一接口入口和统一错误语义。

## 5. 统一 API 入口还有一个经常被低估的价值：后端可以继续演进，而前端不用跟着抖

这种结构的一个直接好处是，它给后端演进留了空间。

比如以后如果发生这些变化：

- 某个内容接口拆到独立服务；
- 某类 AI 接口从 `content-service` 挪出去；
- 某个用户接口路径内部重组；

前端理论上都不需要立刻大改，只要：

- 外部 API 前缀还能保持稳定；
- 网关把转发和内部路由接住。

这才是“统一入口”更实际的价值。  
它不是今天少写几行配置，而是把内部变化和外部调用隔开。

## 6. 这套结构还让路径部署和子路径部署更容易统一

前面我已经把 `/paperflow/` 子路径部署那篇写了。  
那篇里有一个关键点其实和这里直接相关：

- 页面入口走 `/paperflow/...`
- 接口入口走 `/api/...`

如果前端直接连多个服务地址，这层边界就很容易被打碎。  
你会开始在浏览器里同时看到：

- 某些请求走相对路径；
- 某些请求走 `<user-service-url>`
- 某些请求走 `<content-service-url>`

最后不仅部署环境难切，连 Nginx 和本地代理都变得难统一。

而现在 PaperFlow 前端只认相对 `/api`，这就让：

- Vite proxy
- Nginx proxy
- 网关路由

三层可以用同一套心智来理解。

## 7. 统一入口不等于“大网关包治百病”，关键还是边界要收住

“有网关”并不自动等于设计合理。  
真正重要的是，网关承担的职责要明确，前端和业务服务各自也不要越界。

对我们这个 PaperFlow 学生项目来说，这条边界大致是合理的：

- 前端负责调用统一 API、带 token、处理统一响应；
- 网关负责路由、请求标识、鉴权、身份透传、限流；
- 业务服务负责具体领域逻辑；
- 下游服务不再重复实现入口层职责。

只要这个分工保持住，系统复杂度就不会轻易失控。

## 8. 对我们这个学生团队来说，“先直连以后再收敛”往往比一开始就统一入口更贵

很多人会说：

- 现在服务少，先直连吧；
- 以后复杂了再加网关。

这话短期没错，但真实工程里，“以后再收”通常比“现在先收”更贵。  
因为到那时候你已经积累了：

- 大量写死地址；
- 多套错误处理；
- 多处 token 逻辑；
- 多种跨域和代理配置；
- 前端对后端内部结构的隐式依赖。

这些东西一旦铺开，再统一入口就会变成一次高成本迁移。

反而像 PaperFlow 这样，从一开始就尽量让前端只认 `/api/v1/...`，后面会省很多麻烦。

## 9. 最后

如果是类似的大学生团队项目，而且后端已经开始拆服务，建议尽早回答一个问题：

> 前端到底是在调用“一个产品的 API”，还是在调用“若干个后端进程的地址”？

对用户来说，答案显然应该是前者。  
而从工程角度看，越早把这个答案落实到：

- 相对路径；
- 网关入口；
- 统一鉴权；
- 统一错误语义；

后面系统越不容易失控。

对我们这个 PaperFlow 学生项目来说，坚持统一 API 入口，带来的收益早就不只是“好看”，而是实实在在地减少了前端、网关和业务服务之间互相牵扯的成本。
