# 分层限流功能详解

## 1. 背景与目标

### 与前序模块的关系

限流器在网关过滤器链路里的位置很重要：
- 必须在 [RequestId](./01-request-id.md) 之后（错误返回要带 RequestId）
- 必须在 [JWT 鉴权](./02-jwt-auth.md) 之后（需要从 `exchange.attributes` 里拿 `paperflow.userId`）
- Order = -800，在转发到下游之前执行

为什么顺序反过来是不行的：
- 如果先限流后鉴权，匿名请求浪费限流配额
- 如果先转发后限流，流量已经打到下游了，防不住雪崩

### 为什么要分层限流

如果不做限流，常见问题：
1. 恶意脚本狂刷，拖垮服务
2. 前端写错死循环，把自己搞挂
3. 某个热门内容突然大量访问，打垮数据库

### 功能目标

1. **分层策略**：
   - 未登录：按 IP 限流
   - 已登录：按 userId 限流
2. **四类阈值**：
   - 认证接口（更保守）
   - 公开 GET 接口（适度）
   - 匿名接口（普通）
   - 登录用户接口（宽松）
3. **友好提示**：返回 `X-RateLimit-* 头 + `Retry-After` + 统一错误信封
4. **可观测性**：通过响应头里能看到剩余配额

### 适用场景

- 防恶意刷接口
- 防误操作死循环
- 保护下游服务和数据库

---

## 2. 架构与流程设计

### 整体调用链路

```
浏览器/客户端
     |
     v
  +--------+
  | 网关   |  1. RequestId (-1000)
  |        |  2. JWT 鉴权 (-900)    → 往 exchange 放 userId
  |        |  3. 限流 (-800)          → 当前模块
  +--------+
     |
     v
  +----------+
  | 下游服务  |
  +----------+
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 执行顺序 | Order = -800，在鉴权后、转发前 | 需要拿 userId，且在转发前拦截 |
| 限流 Key | 未登录用 IP，已登录用 userId | 登录用户可以换 IP 登录用户更可控 |
| 窗口算法 | 固定窗口，分钟级 | 简单易实现，适合单实例开发 |
| 阈值分层 | 认证接口阈值最低，登录用户最高 | 认证接口最容易被刷 |
| 如何拿 IP | 优先 `X-Forwarded-For`，否则 RemoteAddress | 兼容有反向代理/负载均衡的场景 |
| 如何知道是谁 | 从 `exchange.attributes` 拿 | 由 JWT 鉴权放进去的 |

---

## 3. 核心代码详解

### 3.1 限流过滤器

**文件位置**：[RateLimitGlobalFilter.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/RateLimitGlobalFilter.java#L1-L84)

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

### 3.2 限流器实现

**文件位置**：[InMemoryFixedWindowRateLimiter.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/ratelimit/InMemoryFixedWindowRateLimiter.java#L1-L43)

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

### 3.3 逐段解析

#### 3.3.1 类定义与依赖

```java
@Component
public final class RateLimitGlobalFilter implements GlobalFilter, Ordered {
  public static final String ATTR_USER_ID = "paperflow.userId";
```

| 代码段 | 解释 |
|--------|------|
| `@Component` | Spring 扫描注入 |
| `ATTR_USER_ID` | 和 [JWT 鉴权](./02-jwt-auth.md) 约定的 Attribute 名字，用来从 exchange 里取 userId |

#### 3.3.2 判断接口类型

```java
boolean isAuth = path.startsWith("/api/v1/auth/");
boolean isPublic = method == HttpMethod.GET && (
    path.equals("/api/v1/posts") || path.startsWith("/api/v1/posts/") ||
    path.equals("/api/v1/comments") || path.startsWith("/api/v1/comments/") ||
    path.startsWith("/api/v1/public/papers/")
);
```

| 代码段 | 解释 |
|--------|------|
| `isAuth` | 认证接口（登录、注册、刷新等）|
| `isPublic` | 公开 GET 接口（帖子、评论、论文等 |

#### 3.3.3 选阈值和限流 Key

```java
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
String key = userId == null ? "ip:" + clientIp(exchange) : "user:" + userId;
```

| 代码段 | 解释 |
|--------|------|
| `exchange.getAttributes().get(ATTR_USER_ID) | 从 JWT 鉴权放进去的，只有登录用户才有 |
| 阈值选择 | 四类阈值从低到高：认证接口 → 公开 GET → 匿名 → 登录用户 |
| `key` | 未登录用 `ip:<clientIp>`，已登录用 `user:<userId>` |

#### 3.3.4 调用限流器、写响应头

```java
InMemoryFixedWindowRateLimiter.Decision d = limiter.tryConsume(key, limit);
exchange.getResponse().getHeaders().set("X-RateLimit-Limit", String.valueOf(limit));
exchange.getResponse().getHeaders().set("X-RateLimit-Remaining", String.valueOf(d.remaining()));
```

| 代码段 | 解释 |
|--------|------|
| `tryConsume` | 尝试消费配额 |
| `X-RateLimit-Limit` / `X-RateLimit-Remaining` | 给前端/调试工具看的 |

#### 3.3.5 超限或放行

```java
if (!d.allowed()) {
  exchange.getResponse().getHeaders().set("Retry-After", "60");
  return writer.writeError(exchange, HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many requests", Map.of());
}
return chain.filter(exchange);
```

| 代码段 | 解释 |
|--------|------|
| `Retry-After: 60` | 建议 60 秒后再试（因为窗口是分钟级）|
| `writer.writeError(...)` | 返回统一错误，带 RequestId |

#### 3.3.6 获取客户端 IP

```java
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
```

| 代码段 | 解释 |
|--------|------|
| `X-Forwarded-For` | 反向代理/负载均衡加的头，取第一个（真实客户端）|
| 兜底 | 没有 `X-Forwarded-For` 就用 RemoteAddress |

#### 3.3.7 限流器核心逻辑

```java
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
```

| 代码段 | 解释 |
|--------|------|
| `windowStart = now - (now % 60_000)` | 归一化到分钟窗口起点（比如 12:34:56 → 12:34:00）|
| `computeIfAbsent` | 每个 key（IP/user）对应一个 Window |
| `synchronized(w)` | 窗口切换和计数需要原子性 |
| `AtomicInteger` | 并发安全计数 |

---

## 4. 边界与约束

### 4.1 当前实现的边界

- **单实例**：内存限流只在单实例内有效，多实例网关各算各的
- **固定窗口**：有“窗口边界突刺”问题（00:59 和 01:00 各打满）
- **不持久化**：重启后限流状态清零
- **Clock 可注入**：方便测试，可以传 MockClock

### 4.2 生产环境注意

生产环境不能用内存限流，因为：
1. 多实例网关，流量分散到不同实例
2. 每个实例各算各的，总限流是 单实例 × 实例数
3. 需要用 Redis 限流（如 Redis + 令牌桶/漏桶）

---

## 5. 常见问题与踩坑经验

### 5.1 问题：为什么不直接用 RemoteAddress 而看 X-Forwarded-For？

**原因**：如果有反向代理/负载均衡（如 Nginx），RemoteAddress 是代理的 IP，不是真实客户端 IP，所以优先 X-Forwarded-For。

**注意**：如果 X-Forwarded-For 头客户端可以伪造，生产环境要配置反向代理只允许可信代理加这个头。

### 5.2 问题：固定窗口有“窗口边界突刺”怎么办？

**现象**：00:59:00-00:59:59 打满一次，01:00:00-01:00:59 又能再打满一次，实际在 00:59:00-01:00:59 这 2 分钟里可能在 1 分钟窗口突刺。

**解决**：可以换成：
- 滑动窗口（更平滑）
- 令牌桶（更均匀）
- 漏桶（恒定输出）

当前实现为了简单，用固定窗口。

### 5.3 问题：为什么同步块锁 Window 而不是整个方法？

**原因**：
- 锁 Window，不同 key 之间不互斥，并发更好
- 只需要保证同一 key 同一时刻只有一个线程在更新窗口和计数

---

## 6. 可演进方向

### 6.1 多实例支持

生产建议：
- 用 Redis + Lua 脚本原子操作
- 或者用 Envoy 等 Sidecar 限流
- 或者用 Spring Cloud Gateway 的 RedisRateLimiter

### 6.2 更精细策略

可以：
- 按路径/方法分不同阈值
- 按 IP 白名单/黑名单
- 按时间动态调整阈值

### 6.3 更平滑的算法

可以换成：
- 令牌桶
- 漏桶
- 滑动窗口

---

## 7. 小结

限流是网关的第三个入口治理能力（RequestId → JWT → 限流），核心要点：

1. **顺序重要**：在 JWT 鉴权之后，拿到 userId 才好限流
2. **四类阈值**：认证接口最保守，登录用户最宽松
3. **Key 选择**：未登录按 IP，已登录按 userId
4. **兼容反向代理**：优先 X-Forwarded-For
5. **简单可用**：单实例够用，生产要换 Redis
6. **友好提示**：X-RateLimit-* 头 + Retry-After + 统一错误

这三个网关模块完成后，我们有了：
- 可观测性（RequestId）
- 身份识别（JWT）
- 流量控制（限流）

接下来可以看 [统一错误格式](./04-error-envelope.md)，它被前三个模块都在用。

---

## 9. 页内导航

- 所属模块：[网关模块索引](./00-index.md)
- 上一篇：[JWT 鉴权与身份透传功能详解](./02-jwt-auth.md)
- 下一篇：[统一错误格式功能详解](./04-error-envelope.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
