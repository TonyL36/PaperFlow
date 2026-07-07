# JWT 鉴权与身份透传功能详解

## 1. 背景与目标

### 与上一模块（RequestId）的关系

在 [RequestId 链路追踪](./01-request-id.md) 之后，我们需要在网关层做的第二件事就是鉴权。这两个功能是前后衔接的：
- RequestId 在 order=-1000 时先执行，把 `X-Request-Id` 放到 `exchange.attributes` 和请求/响应头里
- 本模块（JWT 鉴权）在 order=-900 时执行，也会用到 `exchange.attributes`（第79行会把 userId 存进去，给后面的限流过滤器用）
- 两个过滤器都属于“入口治理”，放在网关里统一处理，而不是分散到每个服务里

### 为什么要在网关层做鉴权

在前后端分离和微服务架构中，鉴权有几种常见的做法：
1. **每个服务自己做鉴权**：每个服务都要写一遍 JWT 解析、用户获取，代码重复，而且维护起来麻烦
2. **网关层统一鉴权**：网关负责鉴权和身份透传，下游只需要相信请求头里的身份信息，专注于业务逻辑

我们选择的是第二种方案，因为：
- 下游服务代码更干净
- 鉴权逻辑集中在一个地方，好修改和审计
- 性能更好：网关只做一次解析，下游不用再解析

### 功能目标

1. **统一入口鉴权**：SPA 只需要在请求头带 `Authorization: Bearer <accessToken>`，网关统一校验
2. **公开接口豁免**：登录、注册、刷新 Token、公开 GET 等接口，不需要 Token 也能访问
3. **可选登录态**：公开 GET 接口（如帖子列表）如果带了 Token，也会做校验并透传身份（用于足迹/收藏等）
4. **向下游透传身份**：把 `X-User-Id`、`X-User-Roles`、`X-User-Email` 放到请求头里，下游服务直接用
5. **统一错误格式**：401/403 都用统一的错误信封，方便前端处理

### 适用场景

- 普通用户登录后访问受保护接口
- 游客访问公开内容（帖子列表、评论列表）
- 登录用户访问公开内容时，系统能记录足迹/收藏
- 管理后台需要区分管理员/普通用户

---

## 2. 架构与流程设计

### 整体调用链路

```
浏览器/客户端
     |
     | (可选携带 Authorization: Bearer <token>)
     v
  +--------+
  | 网关   |  RequestIdGlobalFilter (-1000)  → 已完成
  |        |  JwtAuthGlobalFilter (-900)      → 当前模块
  |        |  RateLimitGlobalFilter (-800)    → 下一个模块
  +--------+
     |
     | (注入 X-User-Id / X-User-Roles / X-User-Email)
     v
+----------+   +----------+
| 用户服务 |   | 内容服务 |
+----------+   +----------+
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 执行顺序 | Order = -900，在 RequestId 之后，在限流之前 | RequestId 必须先有，后面错误返回时能带上；限流需要 userId（登录用户按用户限流） |
| 谁来做鉴权 | 网关统一做 | 下游不用重复写，逻辑集中 |
| 下游如何拿到身份 | 通过 `X-User-Id`、`X-User-Roles`、`X-User-Email` 请求头 | 简单直接，下游直接从请求头拿，不用再解析 JWT |
| 怎么判断接口是否需要登录 | 三类规则：认证公开接口、OAuth 回调、公开 GET + 可选登录 | 覆盖了常见场景，且支持可选登录态（用于足迹/收藏） |
| Token 存在哪里 | 请求头 `Authorization: Bearer <token>` | 标准做法，前后端都好处理 |

---

## 3. 核心代码详解

### 3.1 完整代码

**文件位置**：[JwtAuthGlobalFilter.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/JwtAuthGlobalFilter.java#L1-L117)

```java
package com.paperflow.gateway.filter;

import com.paperflow.gateway.config.AuthProperties;
import com.paperflow.gateway.http.JsonResponseWriter;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import javax.crypto.SecretKey;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public final class JwtAuthGlobalFilter implements GlobalFilter, Ordered {
  private final AuthProperties props;
  private final JsonResponseWriter writer;

  public JwtAuthGlobalFilter(AuthProperties props, JsonResponseWriter writer) {
    this.props = props;
    this.writer = writer;
  }

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
    String path = exchange.getRequest().getURI().getPath();
    HttpMethod method = exchange.getRequest().getMethod();

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
    String auth = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
    boolean hasBearer = auth != null && !auth.isBlank() && auth.startsWith("Bearer ");

    if (isAuthPublic || isOauthCallback) {
      return chain.filter(exchange);
    }
    if (isPublic && !hasBearer) {
      return chain.filter(exchange);
    }

    if (auth == null || auth.isBlank() || !auth.startsWith("Bearer ")) {
      return writer.writeError(exchange, HttpStatus.UNAUTHORIZED, "AUTH_MISSING_TOKEN", "Missing Authorization Bearer token", Map.of());
    }
    String token = auth.substring("Bearer ".length()).trim();
    try {
      Claims claims = Jwts.parser()
          .verifyWith(signingKey(props.getJwtSecret()))
          .build()
          .parseSignedClaims(token)
          .getPayload();

      String userId = claims.getSubject();
      if (userId == null || userId.isBlank()) {
        return writer.writeError(exchange, HttpStatus.UNAUTHORIZED, "AUTH_INVALID_TOKEN", "Invalid token", Map.of());
      }
      exchange.getAttributes().put(RateLimitGlobalFilter.ATTR_USER_ID, userId);
      String email = claims.get("email", String.class);

      Object roles = claims.get("roles");
      String rolesStr = roles instanceof List<?> l ? l.stream().map(String::valueOf).reduce((a, b) -> a + "," + b).orElse("") : String.valueOf(roles);

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

      return chain.filter(exchange.mutate().request(mutated).build());
    } catch (Exception e) {
      return writer.writeError(exchange, HttpStatus.UNAUTHORIZED, "AUTH_INVALID_TOKEN", "Invalid or expired token", Map.of());
    }
  }

  @Override
  public int getOrder() {
    return -900;
  }

  private SecretKey signingKey(String secret) {
    byte[] bytes = (secret == null ? "" : secret).getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
      byte[] padded = new byte[32];
      System.arraycopy(bytes, 0, padded, 0, bytes.length);
      bytes = padded;
    }
    return Keys.hmacShaKeyFor(bytes);
  }
}
```

### 3.2 逐段解析

#### 3.2.1 类定义与依赖注入

```java
@Component
public final class JwtAuthGlobalFilter implements GlobalFilter, Ordered {
  private final AuthProperties props;
  private final JsonResponseWriter writer;

  public JwtAuthGlobalFilter(AuthProperties props, JsonResponseWriter writer) {
    this.props = props;
    this.writer = writer;
  }
```

| 代码段 | 解释 |
|--------|------|
| `@Component` | 让 Spring 扫描并注入为 Bean，自动生效 |
| `GlobalFilter` | Spring Cloud Gateway 的全局过滤器接口，对所有路由生效 |
| `Ordered` | 用于控制过滤器之间的执行顺序 |
| `AuthProperties props` | 注入配置，里面包含 JWT Secret 等参数 |
| `JsonResponseWriter writer` | 注入统一错误写回工具，和 RequestId 共用同一个 |

#### 3.2.2 接口豁免规则判断

```java
String path = exchange.getRequest().getURI().getPath();
HttpMethod method = exchange.getRequest().getMethod();

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

| 代码段 | 解释 |
|--------|------|
| `isAuthPublic` | 认证相关公开接口：注册、登录、刷新 Token、找回密码等 |
| `isOauthCallback` | OAuth 回调接口：QQ/微信回调时，用户还没登录，所以要公开 |
| `isPublic` | 公开 GET 接口：帖子、评论、头像、论文等只读接口 |

这里有一个设计细节：**`logout` 不在 `isAuthPublic` 里面**。这是有意的，因为 `logout` 需要知道是谁在注销，所以还是要求带 `Authorization` 头，下游也能拿到 `X-User-Id` 做后续清理。

#### 3.2.3 公开接口直接放行

```java
if (isAuthPublic || isOauthCallback) {
  return chain.filter(exchange);
}
if (isPublic && !hasBearer) {
  return chain.filter(exchange);
}
```

| 代码段 | 解释 |
|--------|------|
| `isAuthPublic \|\| isOauthCallback` | 认证公开接口或 OAuth 回调，直接放行，不做校验 |
| `isPublic && !hasBearer` | 公开 GET 接口且没带 Token，也直接放行（游客模式） |

注意：这里的 `!hasBearer` 只是说没带 Token，但如果带了 Token（`hasBearer == true`），就会走到下面的校验逻辑，校验成功后透传身份，用于记录足迹/收藏等。这就是“可选登录态”。

#### 3.2.4 Token 缺失返回 401

```java
if (auth == null || auth.isBlank()) {
  return writer.writeError(exchange, HttpStatus.UNAUTHORIZED, "AUTH_MISSING_TOKEN", "Missing Authorization Bearer token", Map.of());
}
```

| 代码段 | 解释 |
|--------|------|
| `auth == null \|\| auth.isBlank()` | 请求头里没有 `Authorization` |
| `writer.writeError(...)` | 用统一错误写回工具返回 401，错误码 `AUTH_MISSING_TOKEN` |

这里会用到 [RequestId](./01-request-id.md) 模块的东西：`writer.writeError` 会从 `exchange.attributes` 里拿到 `paperflow.requestId`，放到错误响应里。

#### 3.2.5 提取并解析 Token

```java
String token = auth.substring("Bearer ".length()).trim();
try {
  Claims claims = Jwts.parser()
      .verifyWith(signingKey(props.getJwtSecret()))
      .build()
      .parseSignedClaims(token)
      .getPayload();
```

| 代码段 | 解释 |
|--------|------|
| `auth.substring("Bearer ".length())` | 把 `Bearer ` 前缀去掉，拿到真正的 Token 字符串 |
| `Jwts.parser()...parseSignedClaims(token)` | 用 JJWT 库解析和校验 Token 签名 |
| `signingKey(props.getJwtSecret())` | 构建签名密钥，见后面的 `signingKey()` 方法 |

#### 3.2.6 从 Claims 拿用户信息并放到 exchange

```java
String userId = claims.getSubject();
if (userId == null || userId.isBlank()) {
  return writer.writeError(exchange, HttpStatus.UNAUTHORIZED, "AUTH_INVALID_TOKEN", "Invalid token", Map.of());
}
exchange.getAttributes().put(RateLimitGlobalFilter.ATTR_USER_ID, userId);
String email = claims.get("email", String.class);

Object roles = claims.get("roles");
String rolesStr = roles instanceof List<?> l ? l.stream().map(String::valueOf).reduce((a, b) -> a + "," + b).orElse("") : String.valueOf(roles);
```

| 代码段 | 解释 |
|--------|------|
| `claims.getSubject()` | 拿到 userId（JWT 的 subject 字段） |
| `exchange.getAttributes().put(RateLimitGlobalFilter.ATTR_USER_ID, userId)` | **重要**：把 userId 放到 `exchange.attributes` 里，给后面的 [RateLimitGlobalFilter](./03-rate-limit.md) 用（登录用户按 userId 限流） |
| `claims.get("email", String.class)` | 拿到 email（可选字段） |
| `roles` 处理 | 如果 roles 是 List，就用逗号拼成字符串；否则直接转 String |

这里又是和其他模块的联系：**和限流模块配合**，限流器会从 `exchange.attributes` 里拿 `ATTR_USER_ID`，如果存在就按登录用户限流，否则按 IP。

#### 3.2.7 把身份写到请求头并透传给下游

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

return chain.filter(exchange.mutate().request(mutated).build());
```

| 代码段 | 解释 |
|--------|------|
| `exchange.getRequest().mutate()` | 和 [RequestId](./01-request-id.md) 一样，因为 `ServerHttpRequest` 是不可变的，需要 mutate 来创建修改后的副本 |
| `h.set("X-User-Id", userId)` | 把 userId 写到请求头里，下游直接从这个头拿用户 ID |
| `X-User-Roles` / `X-User-Email` | 只有非空才写，避免下游拿到空字符串产生困惑 |
| `exchange.mutate().request(mutated).build()` | 构建新的 exchange 并替换 request |
| `chain.filter(...)` | 传给下一个过滤器（通常是限流器） |

#### 3.2.8 签名密钥构建（兼容短密钥）

```java
private SecretKey signingKey(String secret) {
  byte[] bytes = (secret == null ? "" : secret).getBytes(StandardCharsets.UTF_8);
  if (bytes.length < 32) {
    byte[] padded = new byte[32];
    System.arraycopy(bytes, 0, padded, 0, bytes.length);
    bytes = padded;
  }
  return Keys.hmacShaKeyFor(bytes);
}
```

| 代码段 | 解释 |
|--------|------|
| `StandardCharsets.UTF_8` | 用 UTF-8 编码，避免乱码 |
| `if (bytes.length < 32)` | JJWT 的 HS256 要求密钥至少 32 字节，不够的话补 0 到 32 字节 |
| `Keys.hmacShaKeyFor(bytes)` | 构建 HMAC-SHA 密钥 |

这是一个**兼容性设计**：开发/演示环境可能随便用个短密钥，生产环境应该用足够安全的长密钥。

#### 3.2.9 控制执行顺序

```java
@Override
public int getOrder() {
  return -900;
}
```

| 代码段 | 解释 |
|--------|------|
| `return -900` | 在 RequestId（-1000）之后，在限流（-800）之前执行 |

顺序很重要：
1. RequestId 先有，后面错误返回时能带上 RequestId
2. 鉴权先做，拿到 userId 后给限流器用
3. 限流在转发之前做，避免无效流量打到下游

---

## 4. 边界与约束

### 4.1 当前实现的边界

- **只做签名和过期校验**：不做更复杂的权限控制（如“只有作者才能编辑”），更细的权限由下游服务自己做
- **可选登录态只有公开 GET 有**：POST/PUT/DELETE 接口如果没带 Token，直接返回 401
- **密钥安全**：当前用配置里的 `jwt-secret`，生产环境建议用 KMS/密钥轮换
- **Refresh Token**：当前刷新逻辑主要在用户服务，网关只负责放行 `/api/v1/auth/refresh` 接口
- **“网关信任下游、下游信任网关”**：生产环境必须在网络层限制，只允许网关访问下游服务端口，防止外部绕过网关直接调用

### 4.2 下游服务如何使用身份信息

下游服务（用户服务/内容服务）不需要再解析 JWT，只需要：
1. 从请求头拿 `X-User-Id`、`X-User-Roles`
2. 相信这些头是真实的（因为只有网关能加，且外部无法直接调用下游）

---

## 5. 常见问题与踩坑经验

### 5.1 问题：为什么要把 userId 放到 exchange.attributes 里，而不只用请求头？

**原因**：
- 请求头是给下游服务用的
- `exchange.attributes` 是给 Gateway 内部后续过滤器用的（比如限流器）
- 如果只放请求头，限流器还要再解析请求头，代码啰嗦且有重复

这和 [RequestId](./01-request-id.md) 的设计思路一致：既放请求头，也放 exchange 属性，各有各的用途。

### 5.2 问题：为什么公开 GET 接口还要支持可选登录态？

**原因**：
- 游客想看内容，不需要登录
- 登录用户看内容时，系统想记录足迹、显示该用户是否已点赞/收藏
- 这就是“可选登录态”：登录更好，但不强制

### 5.3 问题：签名密钥不够 32 字节怎么办？

**当前实现**：自动补 0 到 32 字节（见 `signingKey()` 方法）
**建议**：生产环境还是用安全的长密钥（至少 32 字节随机字符串），不要依赖补 0 的兼容逻辑

### 5.4 问题：为什么 logout 不在公开接口列表里？

**原因**：
- `logout` 需要知道是谁在注销
- 下游可能需要做清理（如删除 refresh token 记录）
- 所以要求带 Token，下游能拿到 `X-User-Id`

---

## 6. 可演进方向

### 6.1 更细粒度的权限控制

当前网关只区分“需要登录/不需要登录”，后续可以：
- 在网关层加上路由级权限（如 `/api/v1/admin/**` 必须有 `ADMIN` 角色）
- 或者下游自己做更细的权限控制

### 6.2 密钥管理

后续可以：
- 用 KMS（如阿里云 KMS、HashiCorp Vault）管理密钥
- 支持密钥轮换
- 用非对称密钥（RS256）替代 HMAC-SHA，这样网关只需要公钥验签，不需要知道签名私钥

### 6.3 Token 黑名单/主动注销

当前实现里，Token 一旦签发，在过期前都能用。后续可以：
- 加 Token 黑名单（用 Redis 存储）
- 主动注销时把 Token 加入黑名单
- 网关校验时先查黑名单

---

## 7. 小结

JWT 鉴权与身份透传是在 [RequestId](./01-request-id.md) 之后的第二个网关过滤器（order=-900），核心要点：

1. **顺序重要**：在 RequestId 之后，在限流之前
2. **三类接口豁免**：认证公开、OAuth 回调、公开 GET + 可选登录态
3. **双向透传**：既把身份放到请求头给下游，也把 userId 放到 `exchange.attributes` 给限流器用
4. **统一错误**：用同一套错误信封，和 RequestId 配合良好
5. **下游信任网关**：下游不用解析 JWT，直接从请求头拿身份

这一模块完成后，网关层的“入口治理”就有了两个基础能力：**可观测性（RequestId）** + **身份识别（JWT 鉴权）**。接下来就可以做 [限流](./03-rate-limit.md) 了，这也是需要和 JWT 鉴权配合的模块。

---

## 9. 页内导航

- 所属模块：[网关模块索引](./00-index.md)
- 上一篇：[RequestId 链路追踪功能详解](./01-request-id.md)
- 下一篇：[分层限流功能详解](./03-rate-limit.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
