# Spring Cloud Gateway 实战：RequestId、JWT 鉴权与限流三件套

## 1. 项目背景

在网关层，最先需要收口的不是业务路由，而是三个入口治理基础能力：

- `X-Request-Id`：把一次请求从客户端、网关、下游服务串成同一条链路
- JWT 鉴权：把“谁能访问”统一前置到网关
- 限流：把恶意刷接口、误操作洪峰挡在业务服务外面

## 2. 模块落地结构

这三个能力组合后，才能形成一条完整链路：

```text
客户端请求
   │
   ▼
RequestIdGlobalFilter   (-1000)
   │
   ▼
JwtAuthGlobalFilter     (-900)
   │
   ▼
RateLimitGlobalFilter   (-800)
   │
   ▼
转发到下游服务
```

这一顺序的作用如下：

- `RequestId` 需要尽量最早注入，以便后续鉴权失败和限流失败继续携带同一个请求标识
- JWT 鉴权需要先于限流执行，因为限流需要判断当前请求是否属于已登录用户
- 限流需要发生在真正路由转发之前，避免无效流量进入下游

## 3. RequestId 注入与回传

在当前代码里，这一层对应的类是 `RequestIdGlobalFilter`。它的目标是保证一次请求进入网关后，无论客户端是否携带 `X-Request-Id`，网关都能确保该值存在，并同时回传给客户端、透传给下游。

对应行为如下：

1. 客户端可选携带 `X-Request-Id`
2. 网关若发现缺失，就生成一个 UUID
3. 网关把它写回响应头
4. 网关转发给下游时，也把同一个值放进请求头

核心实现如下：

```java
public final class RequestIdGlobalFilter implements GlobalFilter, Ordered {
  public static final String HEADER = "X-Request-Id";
  public static final String ATTR = "paperflow.requestId";

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
    String requestId = exchange.getRequest().getHeaders().getFirst(HEADER);
    if (requestId == null || requestId.isBlank()) {
      requestId = UUID.randomUUID().toString();
    }
    exchange.getAttributes().put(ATTR, requestId);
    exchange.getResponse().getHeaders().set(HEADER, requestId);

    ServerHttpRequest mutated = exchange.getRequest()
        .mutate()
        .headers(h -> h.set(HEADER, requestId))
        .build();
    return chain.filter(exchange.mutate().request(mutated).build());
  }

  @Override
  public int getOrder() {
    return -1000;
  }
}
```

结合当前实现，这一层有三个很明确的代码点：

- `HEADER = "X-Request-Id"` 与 `ATTR = "paperflow.requestId"` 分别对应对外请求头和网关内部属性
- `exchange.getAttributes().put(ATTR, requestId)` 与 `exchange.getResponse().getHeaders().set(HEADER, requestId)` 同时存在，说明这层既服务内部链路，也服务客户端排查
- `getOrder() = -1000` 保证它在 JWT 和限流之前执行

这一层建立后，后续无论返回 `401` 还是 `429`，都可以继续沿用同一个请求标识。

## 4. JWT 鉴权与身份透传

在当前代码里，这一层对应的类是 `JwtAuthGlobalFilter`。JWT 这一层不只是校验 Token，而是统一处理以下三类问题：

- 哪些接口可以匿名访问
- 哪些接口必须带 `Authorization: Bearer <token>`
- 验证通过后，如何把身份交给下游服务和后续过滤器

### 3.1 放行边界

基于当前实现，放行逻辑直接写在 `isAuthPublic`、`isOauthCallback` 和 `isPublic` 三个判断里，网关放行的接口主要有以下三类：

- 认证接口：`/api/v1/auth/register`、`/api/v1/auth/login`、`/api/v1/auth/refresh`
- OAuth 回调：`/api/v1/oauth/qq/callback`
- 公开查询：`GET /api/v1/posts...`、`GET /api/v1/comments...`

其余接口默认都要求 Bearer Token：

- token 缺失：返回 `401 AUTH_MISSING_TOKEN`
- token 无效或过期：返回 `401 AUTH_INVALID_TOKEN`
- token 合法：写入身份头并继续转发

这一实现中有一个关键细节：公开 GET 接口支持“可选登录态”。代码里对应的是：

```java
if (isAuthPublic || isOauthCallback) {
  return chain.filter(exchange);
}
if (isPublic && !hasBearer) {
  return chain.filter(exchange);
}
```

具体表现如下：

- 没带 `Authorization`，可以匿名访问帖子、评论查询
- 带了 `Authorization`，网关仍然会校验并透传身份

这样同一个公开接口就能同时支持匿名浏览和登录态个性化能力。

### 3.2 身份透传

JWT 校验通过后，网关不会让下游重复解析 Token，而是直接把身份放入请求头：

```text
X-User-Id
X-User-Roles
```

结合当前代码，`claims.getSubject()` 会作为 `userId` 写入 `X-User-Id`，`claims.get("roles")` 会被拼成字符串写入 `X-User-Roles`，`claims.get("email", String.class)` 则在非空时写入 `X-User-Email`。同时，`userId` 还会写入 `exchange attributes`，供后面的限流过滤器读取。

这一步带来的效果如下：

- 下游服务不必重复进行 JWT 解析
- 限流逻辑不必再次读取 Token
- 身份信息统一在网关收口，职责边界更清晰

从职责关系上看，JWT 过滤器并不是孤立模块，而是整个网关三件套的中间枢纽。

## 5. 限流

限流的目标不是简单拦截请求，而是根据当前身份做分层控制。

在当前代码里，这一层对应的类是 `RateLimitGlobalFilter`。现有实现采用以下两种 Key：

- 未登录：按 `ip:<clientIp>` 限流
- 已登录：按 `user:<userId>` 限流

对应的过滤器核心逻辑如下：

```java
String userId = (String) exchange.getAttributes().get(ATTR_USER_ID);
int limit = isAuth || isPublic || userId == null
    ? props.getAnonymousPerMinute()
    : props.getUserPerMinute();
String key = userId == null ? "ip:" + clientIp(exchange) : "user:" + userId;

InMemoryFixedWindowRateLimiter.Decision d = limiter.tryConsume(key, limit);
exchange.getResponse().getHeaders().set("X-RateLimit-Limit", String.valueOf(limit));
exchange.getResponse().getHeaders().set("X-RateLimit-Remaining", String.valueOf(d.remaining()));

if (!d.allowed()) {
  exchange.getResponse().getHeaders().set("Retry-After", "60");
  return writer.writeError(exchange, HttpStatus.TOO_MANY_REQUESTS,
      "RATE_LIMITED", "Too many requests", Map.of());
}
```

这段代码说明当前限流并不是简单两档，而是根据 `isAuth`、`isPublic`、`userId == null` 三个条件分出了认证接口、公开 GET、匿名请求、已登录请求四类路径。

这一部分有两个关键实现决策需要单独说明。

### 4.1 登录用户切换到 userId 维度

如果登录后仍然按 IP 限流，会出现以下两个问题：

- 多个用户共用同一个出口 IP 时会互相影响
- 用户已经完成认证，却仍然被匿名阈值束缚，体验会比较差

因此，JWT 过滤器先把 `userId` 写入 `exchange`，限流再优先按用户维度统计，从而完成链路闭环。

### 4.2 内存版固定窗口的使用原因

当前实现采用单机内存版固定窗口限流器，对应类是 `InMemoryFixedWindowRateLimiter`：

```java
public Decision tryConsume(String key, int limitPerMinute) {
  long now = clock.millis();
  long windowStart = now - (now % 60_000L);
  Window w = windows.computeIfAbsent(key, k -> new Window(windowStart));
  int used;
  synchronized (w) {
    if (w.windowStartMillis != windowStart) {
      w.windowStartMillis = windowStart;
      w.used.set(0);
    }
    used = w.used.incrementAndGet();
  }
  int remaining = Math.max(0, limitPerMinute - used);
  boolean allowed = used <= limitPerMinute;
  return new Decision(allowed, remaining);
}
```

这一版本的优势如下：

- 代码量少，易于验证思路
- 不依赖 Redis，开发阶段接入成本低
- 能快速把“匿名按 IP、登录按用户”的策略跑通

这一版本的边界如下：

- 只适合开发环境或单实例场景
- 多实例时计数不会共享
- 固定窗口存在边界突刺问题

因此，这一步更接近最小可用版本，先验证策略，再决定是否升级成集中式限流。

## 6. 三件套的协同关系

结合当前代码，这三部分单独看都不复杂，难点在于它们必须互相配合：

- `RequestIdGlobalFilter` 先把 `X-Request-Id` 写入请求头、响应头和 `exchange`
- `JwtAuthGlobalFilter` 再判断放行边界，成功后写入 `X-User-Id`、`X-User-Roles` 和 `paperflow.userId`
- `RateLimitGlobalFilter` 最后基于 `paperflow.userId` 决定使用 IP 还是 userId 做统计

最终效果如下：

- 客户端拿得到 `X-Request-Id`
- 下游拿得到 `X-User-Id`、`X-User-Roles`
- 超限时客户端拿得到 `429 RATE_LIMITED`、`Retry-After` 和 `X-RateLimit-*`

这说明网关不仅承担转发职责，还在入口完成了最基础的一层请求治理。

## 7. 实践结论

如果要在 Spring Cloud Gateway 中落地这三部分能力，推荐按以下顺序推进：

1. 先补 `RequestId`，把链路打通
2. 再做 JWT 放行边界和身份透传
3. 最后让限流读取鉴权结果，按身份分层

这套实现的价值主要体现在以下三点：

- 顺序清楚：谁先执行、谁依赖谁，边界明确
- 成本可控：全部采用最小可运行实现，适合快速落地
- 后续可演进：后续无论接日志、统一错误还是分布式限流，入口骨架已经稳定

对于一个网关入口来说，先把 RequestId、JWT、Rate Limit 这三件套建立起来，后续治理能力才具备继续叠加的基础。
