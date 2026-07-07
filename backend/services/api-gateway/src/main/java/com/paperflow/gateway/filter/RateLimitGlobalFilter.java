package com.paperflow.gateway.filter;

import com.paperflow.gateway.config.RateLimitProperties;
import com.paperflow.gateway.http.JsonResponseWriter;
import com.paperflow.gateway.ratelimit.InMemoryFixedWindowRateLimiter;
import java.net.InetSocketAddress;
import java.util.Map;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public final class RateLimitGlobalFilter implements GlobalFilter, Ordered {
  public static final String ATTR_USER_ID = "paperflow.userId";

  private final RateLimitProperties props;
  private final InMemoryFixedWindowRateLimiter limiter;
  private final JsonResponseWriter writer;
  private final EndpointAccessPolicy accessPolicy;

  public RateLimitGlobalFilter(
      RateLimitProperties props,
      InMemoryFixedWindowRateLimiter limiter,
      JsonResponseWriter writer,
      EndpointAccessPolicy accessPolicy
  ) {
    this.props = props;
    this.limiter = limiter;
    this.writer = writer;
    this.accessPolicy = accessPolicy;
  }

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
    String path = exchange.getRequest().getURI().getPath();
    HttpMethod method = exchange.getRequest().getMethod();
    EndpointAccessDecision decision = accessPolicy.decide(path, method);

    String userId = (String) exchange.getAttributes().get(ATTR_USER_ID);
    int limit;
    if (decision.bucket() == EndpointAccessBucket.AUTH) {
      limit = props.getAuthPerMinute();
    } else if (decision.bucket() == EndpointAccessBucket.PUBLIC_GET) {
      limit = props.getPublicGetPerMinute();
    } else if (userId == null) {
      limit = props.getAnonymousPerMinute();
    } else {
      limit = props.getUserPerMinute();
    }
    String key = userId == null ? "ip:" + clientIp(exchange) : "user:" + userId;

    InMemoryFixedWindowRateLimiter.Decision d = limiter.tryConsume(key, limit);
    exchange.getResponse().getHeaders().set("X-RateLimit-Limit", String.valueOf(limit));
    exchange.getResponse().getHeaders().set("X-RateLimit-Remaining", String.valueOf(d.remaining()));

    if (!d.allowed()) {
      exchange.getResponse().getHeaders().set("Retry-After", "60");
      return writer.writeError(exchange, HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many requests", Map.of());
    }
    return chain.filter(exchange);
  }

  @Override
  public int getOrder() {
    return -800;
  }

  private String clientIp(ServerWebExchange exchange) {
    String xff = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
    if (xff != null && !xff.isBlank()) {
      int idx = xff.indexOf(',');
      return idx > 0 ? xff.substring(0, idx).trim() : xff.trim();
    }
    InetSocketAddress addr = exchange.getRequest().getRemoteAddress();
    if (addr == null || addr.getAddress() == null) {
      return "unknown";
    }
    return addr.getAddress().getHostAddress();
  }
}
