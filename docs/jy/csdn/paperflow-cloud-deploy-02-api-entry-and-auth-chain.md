# 从 API 入口到登录态链路，我们是怎么把前端、网关和身份信息接起来的

> 摘要：前后端分离项目做到一定阶段之后，最容易开始失控的往往不是页面，而是接口入口和登录态。前端到底该连哪个服务、登录后的 token 应该怎么续期、网关有没有把身份透传下去、为什么通知和 Pathfinder 总在登录态上出问题，这些问题本质上都不是孤立的。结合 PaperFlow 这次实践，我们把原来分散的“统一 API 入口”和“登录态链路排查”收成一篇，整理这条链是怎么一点点接起来的。文中只讨论结构、代码关系和排查逻辑，不涉及任何真实凭证或敏感部署信息。
>
> 标签：API 入口｜JWT｜登录态｜Spring Cloud Gateway｜React｜大学生项目

很多大学生团队做前后端分离项目时，前期都会自然地走一条路：

- 前端先连一个后端服务；
- 后来功能多了，再接第二个服务；
- 哪个接口在哪，就把地址写到前端里。

这条路一开始不是不能用。  
但服务一多，问题就会越来越明显：

- 前端开始记很多地址；
- 本地开发和部署环境的接口前缀不一致；
- token 逻辑分散在不同请求里；
- 登录态问题出现时，很难判断到底是哪一层断了。

PaperFlow 后来慢慢稳定下来，一个很关键的原因就是：  
我们把“接口入口”和“身份链路”尽量收成了一条完整链，而不是让每个模块各管各的。

## 1. 前端请求层一直在坚持一件事：只认相对 `/api`

PaperFlow 前端真正发请求的地方集中在：

```text
apps/paperflow-web/src/ui/data/http.ts
apps/paperflow-web/src/ui/data/api.ts
```

`http.ts` 里真正调用的是标准 `fetch`：

```ts
resp = await fetch(input, { ...init, headers, signal });
```

但这里真正重要的不是 `fetch` 本身，而是 `api.ts` 传进去的 `input` 基本都是统一的相对路径：

```ts
httpJson<AuthResp>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(req) });
httpJson<UserProfile>("/api/v1/users/me", { method: "GET", accessToken, signal });
httpJson<Paged<Post>>(`/api/v1/posts?page[number]=${pageNumber}&page[size]=${pageSize}`, { method: "GET", signal });
httpJson<Comment>("/api/v1/comments", { method: "POST", accessToken, body: JSON.stringify({...}) });
```

这意味着前端其实并不关心：

- 用户服务在哪个端口；
- 内容服务在哪个端口；
- 某个接口以后会不会被拆到别的服务；

它只认一件事：

```text
/api/v1/...
```

这看起来很普通，但其实是整个系统后来还能继续调整的基础。

## 2. 本地开发和生产部署，我们尽量让接口入口保持同一套语义

如果前端开发态和部署态认的不是同一套入口，后面排查登录态和接口问题会非常痛苦。

PaperFlow 里，本地开发的 `vite.config.ts` 是这样配的：

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

生产环境里，Nginx 也是类似的结构：

```nginx
location /api/ {
  proxy_pass http://<gateway-upstream>;
}
```

也就是说，无论在本地还是部署环境，前端看到的接口入口都没有变：

- 开发态：`/api/...` 由 Vite 代理到网关
- 部署态：`/api/...` 由 Nginx 代理到网关

这件事的意义特别大。  
因为它让前端层的心智模型一直是稳定的，不会出现：

- 本地打一套路径；
- 上线之后又切一套地址；
- 登录态问题一出现，就不知道该先看哪层。

## 3. 网关的价值不只是“少记几个地址”

很多人会把网关理解成一个“帮忙转发请求的东西”。  
但在 PaperFlow 里，它承担的其实不只是转发。

从代码上看，网关主要负责这几件事：

- 路由分发；
- 请求标识统一；
- JWT 校验；
- 身份透传；
- 限流。

例如 `application.yml` 里，路由边界是这样分的：

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

这说明前端看到的是一套统一入口，但网关内部其实已经把不同接口导向了不同服务。

## 4. 登录态链路的第一层，不是页面状态，而是 token 生命周期

很多人做完登录后，会自然地觉得“认证这件事结束了”。  
但 PaperFlow 这次做下来，我们发现真正麻烦的从来不是“能不能登录成功”，而是：

- token 登录后有没有被保存；
- token 过期时前端会不会自动续期；
- refresh 成功后旧请求会不会自动重放；
- 网关到底有没有把身份继续往下传。

前端登录状态入口在：

```text
apps/paperflow-web/src/ui/auth/AuthContext.tsx
```

这里最关键的不是 `login()` 本身，而是 token 的整个生命周期。

比如登录成功后，access token 会被存到本地：

```ts
const STORAGE_KEY = "paperflow.accessToken";
localStorage.setItem(STORAGE_KEY, accessToken);
```

应用初始化时，也不会盲信这个 token，而是会先解 JWT，看它有没有过期：

```ts
const payload = decodeJwtPayload(t);
const nowSec = Math.floor(Date.now() / 1000);
if (payload?.sub && (!payload.exp || payload.exp > nowSec)) {
  return { status: "authenticated", accessToken: t, userId: payload.sub, roles: payload.roles ?? [], displayName: "用户", avatarUrl: null };
}
```

如果本地 token 已经不可用，还会主动尝试 refresh：

```ts
if (!tokenValid) {
  void refreshAccessToken();
}
```

这说明前端的登录态不是“存一下就结束”，而是在持续维护一个有效身份。

## 5. 真正把登录态带到接口上的，是统一请求封装

前端请求封装里，有两个特别关键的头部注入：

```ts
if (init.accessToken) {
  headers.set("Authorization", `Bearer ${init.accessToken}`);
}
if (init.requestId) {
  headers.set("X-Request-Id", init.requestId);
}
```

这意味着前端不是每个接口各写各的 token 逻辑，而是把“带认证头”这件事统一收在请求层。

通知和 Pathfinder 这些登录态接口也都走同一套入口：

```ts
return httpJson<Paged<PathfinderSession>>(`/api/v1/pathfinder/sessions?page[number]=${pageNumber}&page[size]=${pageSize}`, {
  method: "GET",
  accessToken,
  signal
});
```

```ts
return httpJson<{ updated: number }>(`/api/v1/notifications/read-all`, {
  method: "POST",
  accessToken,
  body: JSON.stringify({})
});
```

也就是说，前端在这条链上负责的事情其实很清楚：

- 统一打 `/api/v1/...`
- 需要登录时带 `Authorization`
- 不自己处理服务拆分细节

## 6. 为什么有时 401 会自己恢复，本质上是请求层在做 refresh 重试

这个细节特别值得单独写出来，因为它非常容易被误判成“线上偶发 bug”。

`http.ts` 里有一段逻辑：

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

它的意思其实很直接：

- 请求先打出去；
- 如果因为 token 失效返回了 `401`；
- 前端会先尝试 refresh；
- 刷新成功后，再用新 token 自动重放原请求。

所以线上如果出现“刚进页面报 401，过一秒又恢复”的情况，很多时候不是玄学，而是这套重试逻辑在起作用。

也正因为如此，排查登录态问题不能只看最终页面现象，还得区分：

- 是第一次请求就没带 token；
- 还是 token 过期但 refresh 成功了；
- 还是 refresh 本身也失败了。

## 7. 网关这一层，真正把 token 变成了下游能用的身份信息

前端把 `Authorization` 带上之后，下一步就交给网关。

`JwtAuthGlobalFilter` 先会做统一校验：

```java
if (auth == null || auth.isBlank() || !auth.startsWith("Bearer ")) {
  return writer.writeError(exchange, HttpStatus.UNAUTHORIZED, "AUTH_MISSING_TOKEN", "Missing Authorization Bearer token", Map.of());
}
```

校验通过后，再从 JWT 里解出身份，并写到请求头里：

```java
ServerHttpRequest mutated = exchange.getRequest().mutate()
    .headers(h -> {
      h.set("X-User-Id", userId);
      if (rolesStr != null && !rolesStr.isBlank() && !"null".equals(rolesStr)) {
        h.set("X-User-Roles", rolesStr);
      }
      if (email != null && !email.isBlank()) {
        h.set("X-User-Email", email);
      }
    })
    .build();
```

这一步是整条链里的分水岭。  
因为从这里开始，下游服务就不再自己解析 JWT，而是直接依赖：

- 用户标识；
- 角色信息；
- 邮箱信息。

这能把认证入口统一收口，避免每个业务服务都重复造一套认证逻辑。

## 8. 通知和 Pathfinder 很适合拿来验这条链是不是闭环

通知、收藏、Pathfinder 这类接口之所以总容易暴露问题，就是因为它们天然依赖这整条身份链。

以 `PathfinderSessionsController` 为例，接口一开始就会判断：

```java
if (userId == null || userId.isBlank()) {
  return ResponseEntity.status(401).body(Envelope.err(...));
}
```

它依赖的其实就是：

```java
@RequestHeader(value = "X-User-Id", required = false) String userId
```

通知接口也是同样的结构：

```java
@RequestHeader(value = "X-User-Id", required = false) String userId
if (userId == null || userId.isBlank()) {
  return ResponseEntity.status(401).body(Envelope.err(...));
}
```

这说明这些“必须登录”的接口，并不是各自设计一套权限判断，而是在统一依赖同一类身份头。

所以当这些接口线上异常时，我们会先问一个核心问题：

> 下游没拿到身份信息，到底是前端没带 token，还是网关没透传，还是 token 本身无效？

## 9. 这条链路为什么特别适合做上线验收

因为它横跨了整个系统：

- 前端登录态存储；
- token 刷新；
- 统一请求封装；
- Vite / Nginx 代理；
- 网关鉴权；
- 身份头透传；
- 下游 Controller 判权。

只要你拿通知页或者 Pathfinder 做一次真正的验收，实际上就在验证这整条登录态链路是不是闭环。

我们现在比较常用的一组检查方式是：

1. 未登录打开通知页，预期进入登录流程或拿到明确未登录反馈  
2. 登录后读取 `/api/v1/notifications`，预期能返回列表  
3. 调 `/api/v1/notifications/read-all`，预期返回已更新数量  
4. 登录后调用 `/api/v1/pathfinder/sessions/plan`，预期能返回生成结果  
5. 再让 token 过期或失效，观察 refresh 是否能自动续上

这组测试比单纯“能不能登录成功”更接近真实线上状态。

## 10. 最后

回头看这次整条链路，我们觉得最重要的不是“技术名词很多”，而是前端、网关和下游服务终于开始各司其职：

- 前端负责统一调用 `/api/v1/...`，并在需要时带 token；
- 请求层负责 refresh 和重试；
- 网关负责统一鉴权、身份透传和限流；
- 下游服务只依赖统一身份头做业务判断。

对学生团队来说，这种设计最大的好处不是显得多复杂，而是出问题的时候更容易顺着链路往下查。  
只要接口入口、token 生命周期、网关透传和下游判权这几层都能说清楚，登录态问题就不会一直像“偶发玄学”。
