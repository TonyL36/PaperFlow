# 02 网关：JWT 鉴权与身份透传（X-User-Id / X-User-Roles）

## 功能目标

- SPA 只需要携带 `Authorization: Bearer <accessToken>` 访问受保护 API
- 网关完成：
  - JWT 校验（签名 + 过期）
  - 访问控制豁免（登录/刷新、公开帖子/评论查询）
  - 将用户身份透传给下游服务（`X-User-Id`、`X-User-Roles`），让下游服务专注业务
- 网关输出统一错误 Envelope（401/403）

## 端到端行为

1. 公共接口（无需登录）：
   - `GET /api/v1/posts...`
   - `GET /api/v1/comments...`
2. 认证接口（无需 access token）：
   - `/api/v1/auth/**`（注册、登录、refresh、logout）
3. 其他接口均要求 `Authorization: Bearer ...`：
   - token 缺失 → `401 AUTH_MISSING_TOKEN`
   - token 无效/过期 → `401 AUTH_INVALID_TOKEN`
   - token 合法 → 注入 `X-User-Id`、`X-User-Roles` 后转发

## 关键代码原文 + 解读

代码位置：[JwtAuthGlobalFilter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/JwtAuthGlobalFilter.java)

```java
package com.paperflow.gateway.filter;

import com.paperflow.gateway.config.AuthProperties;
import com.paperflow.gateway.http.JsonResponseWriter;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.List;
import java.util.Map;
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

    boolean isAuth = path.startsWith("/api/v1/auth/");
    boolean isPublic = method == HttpMethod.GET && (
        path.equals("/api/v1/posts") || path.startsWith("/api/v1/posts/") ||
        path.equals("/api/v1/comments") || path.startsWith("/api/v1/comments/")
    );
    if (isAuth || isPublic) {
      return chain.filter(exchange);
    }

    String auth = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
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

      Object roles = claims.get("roles");
      String rolesStr = roles instanceof List<?> l ? l.stream().map(String::valueOf).reduce((a, b) -> a + "," + b).orElse("") : String.valueOf(roles);

      ServerHttpRequest mutated = exchange.getRequest().mutate()
          .headers(h -> {
            h.set("X-User-Id", userId);
            if (rolesStr != null && !rolesStr.isBlank() && !"null".equals(rolesStr)) {
              h.set("X-User-Roles", rolesStr);
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

  private Key signingKey(String secret) {
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

逐段解释：

- `isAuth` / `isPublic`：
  - 认证相关接口不需要 access token，否则会出现“登录也要先登录”的死循环；
  - 帖子/评论的 GET 作为公开阅读入口，便于未登录用户访问“每日更新”页面。
- `Authorization Bearer` 检查：
  - 缺失或格式不对，直接网关返回 `401 AUTH_MISSING_TOKEN`；
  - 这里的“早失败”可以节省下游资源，也让错误语义统一。
- `Jwts.parser().verifyWith(...).parseSignedClaims(token)`：
  - 验签 + 解析 claims；
  - 过期/签名不匹配/格式错误都会抛异常，统一转 `AUTH_INVALID_TOKEN`。
- `claims.getSubject()`：
  - 以 `sub` 作为 userId；
  - 若 sub 为空，视为无效 token。
- `exchange.getAttributes().put(RateLimitGlobalFilter.ATTR_USER_ID, userId)`：
  - 把 userId 写入 exchange 属性；
  - 限流模块可以按“用户维度”计数，而不是按 IP。
- `X-User-Id` / `X-User-Roles`：
  - 下游服务读取这两个头即可获得调用者身份；
  - 这样下游服务不必重复做 JWT 解析（避免不同服务实现漂移）。
- `getOrder() = -900`：保证它在限流（-800）之前执行，让限流能拿到 userId。
- `signingKey`：为了适配 HMAC-SHA，需要 32 bytes；当 secret 太短时用零填充到 32 bytes（开发可用，生产建议直接配置足够长的随机 secret）。

## 安全注意事项与演进

- 生产建议启用：
  - 更严格的 secret 管理（KMS/密钥轮换）
  - refresh token 的专用域与 CSRF 防护（你现在的方案是 refresh 走 HttpOnly cookie）
  - 对 `/api/v1/admin/**` 增加更细权限策略（目前由内容服务按角色判断）
- 现在是“网关信任下游、下游信任网关”的模式：生产需要网关与下游网络隔离（仅允许网关访问下游），避免外部绕过网关直接打到服务端口。
