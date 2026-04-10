# Spring Cloud Gateway 实战：JWT 鉴权与接口限流打通方案

## 1. 项目背景

PaperFlow 当前拆分为三个核心部分：

- 前端 React SPA
- `user-service` 负责登录、注册、刷新令牌
- `content-service` 负责帖子、评论、收藏、足迹、AI 阅读等业务

在这类前后端分离架构下，会出现一个直接问题：前端不应直接感知多个服务地址，后端也不应在每个服务中重复实现鉴权和限流逻辑。随着系统复杂度提高，接口治理成本会持续上升。

因此，JWT 鉴权、身份透传、限流与统一错误输出集中收口到 `api-gateway`：

- JWT 鉴权：谁能访问、谁不能访问，由网关先判断
- 身份透传：把用户身份写到请求头，交给下游业务服务使用
- 限流：匿名用户、登录用户、公共读接口、认证接口分别限流
- 统一错误：401、429 都返回统一 JSON 结构，前端好处理，后端也好排查

本文基于项目中的真实实现，重点说明如何把鉴权、身份透传和限流串成一条完整链路。

## 2. 模块落地结构

网关模块位于：

```text
backend/services/api-gateway
```

核心依赖如下：

- `spring-cloud-starter-gateway`：做响应式网关
- `jjwt`：做 JWT 解析和验签

对应的 Maven 依赖如下：

```xml
<dependency>
  <groupId>org.springframework.cloud</groupId>
  <artifactId>spring-cloud-starter-gateway</artifactId>
</dependency>

<dependency>
  <groupId>io.jsonwebtoken</groupId>
  <artifactId>jjwt-api</artifactId>
  <version>0.12.5</version>
</dependency>
<dependency>
  <groupId>io.jsonwebtoken</groupId>
  <artifactId>jjwt-impl</artifactId>
  <version>0.12.5</version>
  <scope>runtime</scope>
</dependency>
<dependency>
  <groupId>io.jsonwebtoken</groupId>
  <artifactId>jjwt-jackson</artifactId>
  <version>0.12.5</version>
  <scope>runtime</scope>
</dependency>
```

## 3. 整体实现思路

在这个项目里，JWT 鉴权和限流并不是两套完全独立的逻辑，而是一个前后衔接的链路：

```text
浏览器请求
   │
   ▼
RequestIdGlobalFilter
   │
   ▼
JwtAuthGlobalFilter
   │  ├─ 公开接口：直接放行
   │  ├─ 受保护接口：校验 Bearer Token
   │  └─ 校验成功：写入 X-User-Id / X-User-Roles / X-User-Email
   ▼
RateLimitGlobalFilter
   │  ├─ 已登录：按 userId 限流
   │  └─ 未登录：按 IP 限流
   ▼
路由转发到 user-service / content-service
```

这一顺序是链路设计的关键。限流层需要先拿到当前请求对应的用户身份；如果 JWT 鉴权尚未执行，限流层只能统一按 IP 维度计算，无法区分已登录用户与匿名请求。

当前三个过滤器的执行顺序如下：

- `RequestIdGlobalFilter#getOrder()` = `-1000`
- `JwtAuthGlobalFilter#getOrder()` = `-900`
- `RateLimitGlobalFilter#getOrder()` = `-800`

## 4. 路由与配置衔接方式

项目的 `application.yml` 中，将认证和限流配置统一挂在 `paperflow` 前缀下：

```yaml
paperflow:
  auth:
    jwtSecret: ${PF_JWT_SECRET:change-me-in-dev-change-me-in-dev-change-me}
    accessTokenTtlSeconds: ${PF_ACCESS_TTL:900}
  rate-limit:
    anonymousPerMinute: ${PF_RL_ANON_PER_MIN:30}
    authPerMinute: ${PF_RL_AUTH_PER_MIN:120}
    publicGetPerMinute: ${PF_RL_PUBLIC_PER_MIN:180}
    userPerMinute: ${PF_RL_USER_PER_MIN:120}
```

对应的本地环境变量样例如下：

```bat
set PF_JWT_SECRET=change-me-in-dev-change-me-in-dev-change-me
set PF_ACCESS_TTL=900
set PF_RL_ANON_PER_MIN=30
set PF_RL_AUTH_PER_MIN=120
set PF_RL_PUBLIC_PER_MIN=180
set PF_RL_USER_PER_MIN=120
```

这里的实现重点是避免把阈值写死在代码中。将阈值保留给环境变量后，压测、联调与环境切换阶段的调整成本会明显降低。

## 5. JWT 鉴权实现

### 5.1 哪些接口不需要登录

JWT 过滤器的第一步不是立即验签，而是先判断当前请求是否属于匿名放行范围。

核心代码逻辑如下：

```java
boolean isAuthPublic =
    path.equals("/api/v1/auth/register") ||
    path.equals("/api/v1/auth/register/email-code/request") ||
    path.equals("/api/v1/auth/login") ||
    path.equals("/api/v1/auth/refresh") ||
    path.equals("/api/v1/auth/password/request") ||
    path.equals("/api/v1/auth/password/confirm");

boolean isOauthCallback =
    path.equals("/api/v1/oauth/qq/callback") ||
    path.equals("/api/v1/oauth/wechat/callback");

boolean isPublic = method == HttpMethod.GET && (
    path.equals("/api/v1/posts") || path.startsWith("/api/v1/posts/") ||
    path.equals("/api/v1/comments") || path.startsWith("/api/v1/comments/") ||
    path.startsWith("/api/v1/public/users/avatars/") ||
    path.startsWith("/api/v1/public/papers/")
);
```

这一阶段需要明确一个边界：“只读接口”不等于“公开接口”。是否公开取决于业务语义，而不是请求方法本身。

当前开放的接口类别如下：

- 登录、注册、刷新令牌、找回密码
- OAuth 回调
- 帖子和评论的公开查询
- 用户头像、公开论文资源

其他接口，比如收藏、足迹、发评论、Pathfinder 会话、管理后台，还是必须带 Token。

### 5.2 可选登录态

当前实现中，公开 GET 接口支持匿名访问；如果请求同时携带 `Authorization: Bearer ...`，网关仍会执行校验并透传身份。

该设计带来以下效果：

- 没登录的用户可以看帖子列表和评论
- 已登录用户访问同一接口时，下游服务仍可识别用户身份
- 同一接口可以同时支持“是否已收藏”“是否记录足迹”等个性化能力

对应代码如下：

```java
if (isAuthPublic || isOauthCallback) {
  return chain.filter(exchange);
}
if (isPublic && !hasBearer) {
  return chain.filter(exchange);
}
```

这段逻辑的作用是区分“公开访问”与“必须匿名”两类语义，避免放行逻辑过度简化。

### 5.3 Token 缺失或非法时怎么处理

如果当前接口不属于放行范围，网关会要求必须携带 Bearer Token：

```java
if (auth == null || auth.isBlank() || !auth.startsWith("Bearer ")) {
  return writer.writeError(
      exchange,
      HttpStatus.UNAUTHORIZED,
      "AUTH_MISSING_TOKEN",
      "Missing Authorization Bearer token",
      Map.of()
  );
}
```

如果 Token 存在，但解析失败、签名错误、已过期或 `sub` 为空，则返回：

```java
return writer.writeError(
    exchange,
    HttpStatus.UNAUTHORIZED,
    "AUTH_INVALID_TOKEN",
    "Invalid or expired token",
    Map.of()
);
```

这里没有直接向前端暴露异常栈，而是统一收敛成固定错误码。这种做法更适合前后端联调，也更方便后续统一错误处理。

### 5.4 验签通过后，网关是怎么把身份传下去的

这一部分是整套方案的核心。下游服务不再重复解析 JWT，而是由网关统一完成解析并把身份写入请求头：

```java
Claims claims = Jwts.parser()
    .verifyWith(signingKey(props.getJwtSecret()))
    .build()
    .parseSignedClaims(token)
    .getPayload();

String userId = claims.getSubject();
exchange.getAttributes().put(RateLimitGlobalFilter.ATTR_USER_ID, userId);
String email = claims.get("email", String.class);
Object roles = claims.get("roles");

ServerHttpRequest mutated = exchange.getRequest().mutate()
    .headers(h -> {
      h.set("X-User-Id", userId);
      h.set("X-User-Roles", rolesStr);
      if (email != null && !email.isBlank()) {
        h.set("X-User-Email", email);
      }
    })
    .build();
```

其中一个关键细节如下：

```java
exchange.getAttributes().put(RateLimitGlobalFilter.ATTR_USER_ID, userId);
```

这一属性并不是给下游服务使用，而是提供给后续限流过滤器读取。也就是说，JWT 鉴权除了完成认证，还同步准备了限流所需的身份信息。

### 5.5 用户服务签发的 Token 和网关解析是对得上的

为了确认链路闭环，还需要回看 `user-service` 中的 Token 签发代码。实际签发逻辑如下：

```java
return Jwts.builder()
    .subject(userId)
    .claim("email", email)
    .claim("roles", roles)
    .id(UUID.randomUUID().toString())
    .issuedAt(Date.from(now))
    .expiration(Date.from(exp))
    .signWith(signingKey())
    .compact();
```

这意味着网关读取的核心字段均来自实际签发内容：

- `sub` 对应用户 ID
- `email` 用于邮箱相关业务透传
- `roles` 用于角色与权限能力判断

因此，网关鉴权实现必须同时核对“签发端”和“校验端”。如果 claim 名称不一致，整条链路会直接失效。

## 6. 限流与 JWT 的衔接方式

### 6.1 限流不是一刀切，而是分层

限流过滤器首先判断当前请求所属类别：

```java
boolean isAuth = path.startsWith("/api/v1/auth/");
boolean isPublic = method == HttpMethod.GET && (
    path.equals("/api/v1/posts") || path.startsWith("/api/v1/posts/") ||
    path.equals("/api/v1/comments") || path.startsWith("/api/v1/comments/") ||
    path.startsWith("/api/v1/public/papers/")
);

String userId = (String) exchange.getAttributes().get(ATTR_USER_ID);
int limit;
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

当前实现中，实际存在四档限流策略：

- 认证接口：`authPerMinute`
- 公开 GET：`publicGetPerMinute`
- 其他匿名请求：`anonymousPerMinute`
- 已登录用户：`userPerMinute`

这一分层用于区分高风险公开接口、普通公开读接口、匿名请求与已登录请求。登录、注册、刷新令牌等接口虽然公开，但风险更高，因此不应与普通帖子浏览共用同一阈值；已登录用户也不应长期受匿名阈值影响。

### 6.2 限流 Key 设计

网关限流时不会直接按接口名统计，而是先计算身份 Key：

```java
String key = userId == null ? "ip:" + clientIp(exchange) : "user:" + userId;
```

对应效果如下：

- 没登录时，按 IP 限流
- 登录后，按用户 ID 限流

这里的考虑是多名用户可能共用同一个出口 IP。如果登录用户仍按 IP 限流，会出现相互影响；切换为用户 ID 维度后，限流结果会更稳定。

### 6.3 为什么先采用内存版固定窗口

在当前阶段，优先目标是先把限流分类和链路跑通，再考虑分布式限流方案。

当前实现采用内存版固定窗口：

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

这一版实现适用于以下场景：

- 本地开发验证治理链路
- 单机部署的小型服务
- 先把功能跑通，再逐步升级

这一实现的优势如下：

- 代码量小，易于理解
- 不引入额外中间件
- 能先验证分类限流策略是否成立

这一实现的边界如下：

- 多实例部署时计数不共享
- 服务重启后窗口清空
- 固定窗口边界可能出现瞬时突刺

如果后续进入多节点部署阶段，应将这一层替换为 Redis 版或其他集中式限流方案，而不是继续依赖内存计数。

### 6.4 429 响应设计

限流命中后，除返回 429 外，还会补充以下响应头：

```java
exchange.getResponse().getHeaders().set("X-RateLimit-Limit", String.valueOf(limit));
exchange.getResponse().getHeaders().set("X-RateLimit-Remaining", String.valueOf(d.remaining()));

if (!d.allowed()) {
  exchange.getResponse().getHeaders().set("Retry-After", "60");
  return writer.writeError(
      exchange,
      HttpStatus.TOO_MANY_REQUESTS,
      "RATE_LIMITED",
      "Too many requests",
      Map.of()
  );
}
```

这些响应头的作用如下：

- `X-RateLimit-Limit`：本分钟总额度
- `X-RateLimit-Remaining`：剩余额度
- `Retry-After: 60`：建议 60 秒后重试

对于前端联调和问题排查来说，这些信息可以明确说明失败原因与可重试时间，便于区分限流命中与服务异常。

## 7. 统一错误响应

网关不直接返回默认异常页，而是统一输出 JSON Envelope：

```json
{
  "requestId": "6f0f1b0f-3f0e-4e56-b5db-7d3a3b3cc001",
  "error": {
    "code": "AUTH_INVALID_TOKEN",
    "message": "Invalid or expired token"
  }
}
```

或者限流时：

```json
{
  "requestId": "6f0f1b0f-3f0e-4e56-b5db-7d3a3b3cc001",
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests"
  }
}
```

`requestId` 由前一个过滤器提前写入，因此鉴权和限流出错时也会被保留。这一字段有助于快速定位具体失败请求。

## 8. 实现过程中的几个关键问题

### 8.1 `logout` 没有放进公开接口

退出登录接口没有放入公开接口列表。原因是退出登录时，下游服务通常仍需要识别当前退出用户，因此仍需保留 `X-User-Id`。

### 8.2 公开接口和可选登录态不要混淆

如果将公开接口统一直接放行，则带 Token 的公开请求不会再进入身份注入逻辑。这样虽然页面可以访问，但收藏、足迹、点赞等个性化状态可能无法返回。

### 8.3 `X-Forwarded-For` 只取第一个 IP

项目里取客户端 IP 的逻辑是：

```java
String xff = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
if (xff != null && !xff.isBlank()) {
  int idx = xff.indexOf(',');
  return idx > 0 ? xff.substring(0, idx).trim() : xff.trim();
}
```

这是因为代理链中的第一个 IP 通常代表真实客户端。如果这一细节处理不当，限流 Key 会出现混乱。

### 8.4 Secret 不足 32 字节时做了补齐，但这不是最佳安全方案

项目里 JWT 密钥做了一个“长度不足 32 字节则补齐”的处理：

```java
byte[] bytes = (secret == null ? "" : secret).getBytes(StandardCharsets.UTF_8);
if (bytes.length < 32) {
  byte[] padded = new byte[32];
  System.arraycopy(bytes, 0, padded, 0, bytes.length);
  bytes = padded;
}
return Keys.hmacShaKeyFor(bytes);
```

这一处理用于避免开发环境因密钥过短直接报错；但在正式环境中，仍应采用以下做法：

- 使用足够长、随机性足够强的真实密钥
- 不依赖这种补齐兜底
- 做密钥轮换和更严格的配置管理

## 9. 复现顺序建议

### 第一步：先统一 Token 签发和解析规则

至少需要先约定以下字段：

- `sub` 放用户 ID
- `roles` 放角色列表
- 如有需要，额外放 `email`

### 第二步：在网关层区分三类接口

- 认证公开接口
- 公开读接口
- 受保护接口

### 第三步：JWT 成功后写两份身份信息

- 一份写到请求头里，给下游服务用
- 一份写到 `exchange attributes`，给限流器用

### 第四步：先做最小可用限流

不必一开始就引入 Redis。可以先验证以下四个维度是否满足当前需求：

- auth 接口
- public GET 接口
- anonymous
- authenticated user

### 第五步：统一 401 和 429 的输出格式

这一步可以直接降低前端联调成本。

## 10. 开发实现结论

本次实现中的关键经验如下：

- 不要让每个服务自己做 JWT 校验，统一放网关更容易维护
- 限流不要只按 IP 做，登录用户最好切到 userId 维度
- 公开接口最好支持“可选登录态”，这样前端体验会完整很多

这套方案的优势如下：

- 实现成本不高
- 对前后端分离很友好
- 可以快速落地到现有前后端分离项目
- 代码结构清晰，便于继续扩展和调试

这套方案的边界如下：

- 现在的限流还是单机内存版
- 管理端权限主要依赖下游角色校验
- 生产环境还需要更强的密钥管理和网络隔离

对于当前这种前后端分离服务架构，这已经是一条相对完整的落地路径。

## 11. 关键实现模块

从实现拆分来看，这套方案主要由以下几个模块组成：

- JWT 鉴权过滤器：负责接口放行判断、Bearer Token 校验和身份注入
- 限流过滤器：负责请求分类、限流阈值选择和 429 响应输出
- 固定窗口限流器：负责单机内存计数与窗口切换
- 统一错误写出组件：负责 401、429 等错误的统一 JSON 输出
- 网关配置模块：负责 JWT 密钥、过期时间和限流阈值配置
- Token 签发模块：负责在登录成功后生成网关可解析的 JWT

## 12. 总结

以学生做项目的视角来看，JWT 鉴权和限流最好不要拆开理解。更容易落地的做法是先在网关识别请求身份，再根据身份决定请求能够以什么频率进入系统。

从当前实现结果来看，只要能够明确接口边界、过滤器顺序、身份透传和错误格式这四个关键点，Spring Cloud Gateway 就能够较稳定地承担统一入口职责。
