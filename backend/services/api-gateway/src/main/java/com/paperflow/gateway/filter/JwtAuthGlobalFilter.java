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
        path.startsWith("/api/v1/public/users/avatars/")
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
