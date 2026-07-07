# 通知和 Pathfinder 总在登录态上出问题时，我们怎么顺着身份链往下查

> 摘要：很多功能在开发阶段已经能跑，但一到线上就会冒出另一类问题：页面能打开，接口也像是在线，可一涉及通知、收藏、Pathfinder 这类登录态能力，就频繁出现 `401`、数据为空或者“偶尔又恢复正常”。PaperFlow 这类接口的可用性，本质上依赖一整条认证链路：前端 token 存储与刷新、统一请求封装、网关 JWT 校验、身份头透传、下游控制器按身份信息判权。本文结合项目里的真实实现，整理我们上线后是怎样顺着这条链一层层查问题的。文中只讨论链路结构和校验逻辑，不涉及任何真实凭证或可直接利用的部署信息。
>
> 标签：JWT｜登录态｜Spring Cloud Gateway｜React｜通知系统｜Pathfinder

很多人做完登录功能之后，会默认认为“认证这件事已经结束了”。  
先说明一下，这篇只会讲认证链怎么流转、问题怎么定位，不会放真实 token、凭证或者任何可直接利用的敏感信息。  
但在 PaperFlow 这套系统中继续往后实现时，我们逐渐发现，真正难的从来不是“能不能登录成功”，而是：

- 登录之后请求是不是一直带着正确 token；
- token 过期之后前端会不会自动续期；
- 网关到底有没有把用户身份透传下去；
- 下游接口是不是严格依赖统一身份头，而不是自己再猜一遍。

尤其是通知、收藏、评论点赞、Pathfinder 这类登录态接口，一旦链路里有一环松了，用户看到的体验就会很怪：

- 页面能开；
- 公共帖子列表也能看；
- 但一进“我的通知”或者 Pathfinder，就突然 `401`；
- 偶尔刷新几次又像是恢复了。

这类问题如果只盯着页面，很容易误判。  
在我们这个项目一路做下来的过程中，我们更愿意把它拆成一条完整的身份链路来看。

## 1. 前端登录态第一层，不是页面状态，而是 token 生命周期

PaperFlow 前端的登录状态入口在：

```text
apps/paperflow-web/src/ui/auth/AuthContext.tsx
```

这里最关键的不是 `login()` 本身，而是 token 的整个生命周期管理。

首先，登录成功后会把 access token 存到本地：

```ts
const STORAGE_KEY = "paperflow.accessToken";
...
localStorage.setItem(STORAGE_KEY, accessToken);
```

其次，应用初始化时并不会盲信本地 token，而是先解 JWT 看有没有过期：

```ts
const payload = decodeJwtPayload(t);
const nowSec = Math.floor(Date.now() / 1000);
if (payload?.sub && (!payload.exp || payload.exp > nowSec)) {
  return { status: "authenticated", accessToken: t, userId: payload.sub, roles: payload.roles ?? [], displayName: "用户", avatarUrl: null };
}
```

如果本地 token 不可用，还会主动尝试 refresh：

```ts
if (!tokenValid) {
  void refreshAccessToken();
}
```

再往后，它还会定时续期，并在页面重新可见时补一次 refresh：

```ts
const timer = window.setInterval(() => {
  void refreshAccessToken();
}, 10 * 60 * 1000);
```

这说明前端的登录态管理并不是“拿到 token 就完了”，而是在持续维护一个有效身份。

## 2. 真正把登录态带到接口上的，是统一请求封装

前端请求封装在：

```text
apps/paperflow-web/src/ui/data/http.ts
apps/paperflow-web/src/ui/data/api.ts
```

`http.ts` 里有两个关键头部注入：

```ts
if (init.accessToken) {
  headers.set("Authorization", `Bearer ${init.accessToken}`);
}
if (init.requestId) {
  headers.set("X-Request-Id", init.requestId);
}
```

这里的意义非常大。  
因为它意味着前端不是每个接口各写各的 token 逻辑，而是把“带认证头”这件事统一收在请求层。

而 `api.ts` 里，通知和 Pathfinder 这些登录态接口也都走同一套入口：

```ts
return httpJson<Paged<PathfinderSession>>(`/api/v1/pathfinder/sessions?page[number]=${pageNumber}&page[size]=${pageSize}`, {
  method: "GET",
  accessToken,
  signal
});
```

```ts
return httpJson<PathfinderGenerateResponse>("/api/v1/pathfinder/sessions/plan", {
  method: "POST",
  accessToken,
  body: JSON.stringify(req)
});
```

```ts
return httpJson<{ updated: number }>(`/api/v1/notifications/read-all`, {
  method: "POST",
  accessToken,
  body: JSON.stringify({})
});
```

也就是说，前端在这条链上负责的事情非常清楚：

- 统一打 `/api/v1/...`
- 需要登录时带 `Authorization`
- 不自己处理服务拆分细节

## 3. 401 之后为什么有时能自动恢复，本质上是请求层在做 refresh 重试

这个细节特别值得写出来，因为它直接关系到线上体验。

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

这意味着如果请求因为 token 失效返回 `401`，前端不会立刻宣布失败，而是会尝试：

- 调 refresh；
- 拿到新 token；
- 用新 token 自动重放原请求。

所以线上如果出现“刚进页面 401，一秒后又好了”，这通常不是玄学，而是这套 refresh 重试逻辑在起作用。

也正因为如此，排查登录态问题不能只看最终页面表现，还要区分：

- 是第一次请求就没带 token；
- 还是 token 过期但 refresh 成功了；
- 还是 refresh 也失败了。

## 4. 网关这一层，真正把 token 变成了下游可用身份

前端把 `Authorization` 带上之后，下一步就交给 `api-gateway`。

网关的 `JwtAuthGlobalFilter` 做的事情很明确：

```java
if (auth == null || auth.isBlank() || !auth.startsWith("Bearer ")) {
  return writer.writeError(exchange, HttpStatus.UNAUTHORIZED, "AUTH_MISSING_TOKEN", "Missing Authorization Bearer token", Map.of());
}
```

校验通过后，会从 JWT 里解出用户身份，并写到请求头：

```java
String userId = claims.getSubject();
...
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

因为从这一层开始，下游服务就不再自己解析 JWT，而是直接依赖：

- 用户标识
- 角色信息
- 邮箱信息

这能把认证入口统一收口，避免每个业务服务再重复造一套认证逻辑。

## 5. Pathfinder 和通知接口，本质上都在验证同一件事：`X-User-Id` 到底有没有下来

以 `PathfinderSessionsController` 为例，几乎所有核心接口第一句都在判断：

```java
if (userId == null || userId.isBlank()) {
  return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", Map.of()));
}
```

对应的入参就是：

```java
@RequestHeader(value = "X-User-Id", required = false) String userId
```

通知接口也是同样结构：

```java
@RequestHeader(value = "X-User-Id", required = false) String userId
...
if (userId == null || userId.isBlank()) {
  return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
}
```

这说明 Pathfinder、通知、收藏、点赞这类“必须登录”的接口，并不是各自设计一套权限判断，而是在统一依赖同一类身份头。

所以当这些接口线上异常时，我们会先看一个核心问题：

> 下游没拿到身份信息，到底是前端没带 token，还是网关没透传，还是 token 本身无效？

## 6. 为什么这条链路特别适合拿来做上线验收

因为它横跨了完整系统：

- 前端登录态存储
- token 刷新
- 统一请求封装
- Nginx / Vite 代理
- 网关鉴权
- 身份头透传
- 下游业务 Controller 判权

只要你拿 Pathfinder 或通知做一次真验收，实际上就在验证整个登录态链路是不是闭环。

比如我们会优先做这种测试：

1. 未登录打开通知页，预期进入登录流程或拿到明确未登录反馈  
2. 登录后读取 `/api/v1/notifications`，预期能返回 `items + unreadCount`  
3. 调 `/api/v1/notifications/read-all`，预期返回 `updated`  
4. 登录后调用 `/api/v1/pathfinder/sessions/plan`，预期返回生成结果  
5. 再让 token 过期或失效，观察 refresh 是否能自动续上

这组测试比单纯“能不能登录成功”更接近真实线上状态。

## 7. 这类问题为什么很容易被误判成“后端偶发 bug”

因为它表面上非常像接口不稳定：

- 有时通知能读出来；
- 有时 Pathfinder 又报 `401`；
- 再刷新几次又像是恢复了。

但这类现象很多时候并不是后端逻辑在抖，而是身份链路中某一段不稳定：

- token 刚过期；
- refresh 接口短时失败；
- 某次请求没有把 access token 带上；
- 网关拦截了，但前端只展示成通用错误；
- 下游其实只是按 `X-User-Id` 正常拒绝了匿名请求。

所以在我们这个项目一路做下来的过程中，我们不再把这类问题一概叫“接口偶发异常”。  
更准确的说法其实是：

> 登录态链路不够稳定或不够可解释。

## 8. 对我们这个学生团队来说，验登录态不是单测某个接口，而是在验整条身份主线

这也是为什么我们会把通知和 Pathfinder 当作上线验收点。

它们不是最复杂的功能，但特别能说明问题：

- 通知接口要验证“登录后才能看自己的数据”
- `read-all` 要验证“写操作也绑定到当前身份”
- Pathfinder 不只要登录，还要把用户上下文带到计划生成流程里

这几步一旦通了，基本可以证明：

- 前端 token 生命周期没断；
- 网关鉴权和身份透传没断；
- 下游服务的登录态控制没断。

## 9. 最后

如果是类似的大学生前后端分离项目，就不要只把“登录成功”当成认证完成。  
真正决定线上体验的，其实是下面这条链：

- token 有没有保存好；
- 过期后能不能刷新；
- 请求层有没有统一带 token；
- 网关有没有把用户身份稳定透传；
- 下游接口是不是只认统一身份头。

对我们这个 PaperFlow 学生项目来说，通知和 Pathfinder 正好就是两块很好的试金石。  
它们能把“登录态到底有没有真的跑通”这件事，测得比单纯登录页准确得多。
