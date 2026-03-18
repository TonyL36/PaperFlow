# 03 网关：限流（匿名/IP 与 登录/用户）

## 功能目标

- 防止恶意刷接口/误操作导致服务雪崩
- 对不同身份分层：
  - 未登录：按 IP 限流
  - 已登录：按 userId 限流
- 对公共读接口与认证接口采用更保守的匿名限流策略
- 返回标准化错误：`429 RATE_LIMITED` + `Retry-After` + `X-RateLimit-*` 头

## 端到端行为

1. 客户端请求网关
2. 网关从 exchange 里取 userId（由 JWT 鉴权过滤器写入）
3. 选择限流 key：
   - `user:<userId>` 或 `ip:<clientIp>`
4. 固定窗口计数（每分钟窗口）
5. 若超限：
   - HTTP 429
   - body 使用统一错误 Envelope

## 关键代码原文 + 解读

### 3.1 限流过滤器（网关入口）

代码位置：[RateLimitGlobalFilter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/RateLimitGlobalFilter.java)

```java
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

  public RateLimitGlobalFilter(RateLimitProperties props, InMemoryFixedWindowRateLimiter limiter, JsonResponseWriter writer) {
    this.props = props;
    this.limiter = limiter;
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

    String userId = (String) exchange.getAttributes().get(ATTR_USER_ID);
    int limit = isAuth || isPublic || userId == null ? props.getAnonymousPerMinute() : props.getUserPerMinute();
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
```

逐段解释：

- `isAuth/isPublic`：认证接口和公开读接口都按匿名限流（更保守），避免被刷爆。
- `userId = exchange.getAttributes().get(...)`：从 exchange 里取 userId（由 JWT 鉴权过滤器写入）。
- `limit`：两档阈值：
  - 匿名阈值 `anonymousPerMinute`
  - 登录阈值 `userPerMinute`
- `key`：
  - 未登录：`ip:<clientIp>`
  - 登录：`user:<userId>`
- `X-RateLimit-*`：给前端/调试工具提供“限流剩余配额”的可观察性。
- 超限返回：
  - `Retry-After=60` 表示建议 60 秒后再试（与固定窗口分钟一致）
  - body 使用统一错误 Envelope（由 `JsonResponseWriter` 写出）
- `getOrder()=-800`：保证它在业务路由转发前执行；同时要晚于鉴权（-900），以便能拿到 userId。

### 3.2 固定窗口限流器（内存版）

代码位置：[InMemoryFixedWindowRateLimiter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/ratelimit/InMemoryFixedWindowRateLimiter.java)

```java
package com.paperflow.gateway.ratelimit;

import java.time.Clock;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public final class InMemoryFixedWindowRateLimiter {
  private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
  private final Clock clock;

  public InMemoryFixedWindowRateLimiter(Clock clock) {
    this.clock = clock;
  }

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

  private static final class Window {
    private long windowStartMillis;
    private final AtomicInteger used = new AtomicInteger(0);

    private Window(long windowStartMillis) {
      this.windowStartMillis = windowStartMillis;
    }
  }

  public record Decision(boolean allowed, int remaining) {
  }
}
```

逐段解释：

- 这是最小可运行实现，适合开发/单实例。
- `windowStart = now - (now % 60000)`：把时间归一化到“分钟窗口起点”。
- `computeIfAbsent(key, ...)`：每个 key（IP 或 user）对应一个窗口状态。
- `synchronized(w)`：窗口状态切换（跨分钟）与计数递增需要原子性；这里用对象锁保证一致。
- `remaining/allowed`：对外返回“是否允许”以及“剩余配额”。

## 演进方向（生产建议）

- 多实例网关：内存限流会失效（每个实例各算各的），生产应使用 Redis/Envoy 限流等集中式方案。
- 精细策略：按路径/方法分不同阈值（例如登录比查询更严格；写操作更严格）。
- 令牌桶/漏桶：固定窗口会产生“窗口边界突刺”（例如 00:59 和 01:00 各打满一次），需要更平滑的算法可换令牌桶。
