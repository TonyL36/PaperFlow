# RequestId 链路追踪功能详解

## 1. 背景与目标

### 为什么需要 RequestId

在微服务架构中，一次完整的业务请求通常需要经过多个服务：
- 前端浏览器发出请求
- 网关层统一入口
- 转发到用户服务/内容服务
- 可能还需要调用其他服务

当出现问题时（如 500 错误、接口响应慢、业务逻辑异常），我们需要快速定位：
- 这个请求在不同服务中的日志如何对应
- 哪个环节最先出问题
- 错误的完整链路是什么

因此，我们需要一个统一的请求 ID，让它贯穿整个链路。

### 功能目标

1. **全链路串联**：同一个请求在前端、网关、后端服务、日志系统中，都使用相同的 ID
2. **客户端友好**：允许客户端自己携带 RequestId（例如浏览器扩展、压测工具）
3. **兜底生成**：如果客户端没有带，网关自动生成并回传
4. **下游透传**：网关把 RequestId 转发给下游，下游也能拿到并使用

### 适用场景

- 线上问题排查：用 RequestId 去 grep 网关、用户服务、内容服务的日志，还原完整链路
- 压测与性能分析：在压测时带上统一的 RequestId 前缀，事后可以筛选并分析特定批次的请求
- 前端错误监控：前端可以把回传的 RequestId 一起上报到监控系统，后端可以通过同一个 ID 查看当时的请求详情

---

## 2. 架构与流程设计

### 整体调用链路

```
浏览器/客户端
     |
     | (可选携带 X-Request-Id)
     v
  +--------+
  | 网关   |  RequestIdGlobalFilter（第一个执行）
  +--------+
     |
     | (注入 X-Request-Id)
     v
+----------+   +----------+
| 用户服务 |   | 内容服务 |
+----------+   +----------+
     |
     | (返回时带回 X-Request-Id)
     v
  浏览器/客户端
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 谁负责生成 RequestId | 网关兜底，也尊重客户端传入 | 避免每个服务都重复生成，同时给客户端灵活性 |
| 顺序放在哪里 | Order = -1000，第一个执行 | 确保后续的鉴权、限流、错误处理都能拿到 RequestId |
| 如何存到 Gateway 内部 | 放到 exchange.attributes，不是只放到请求头 | 方便后续过滤器（如错误返回时）直接获取，不用再去请求头里解析 |
| 是否回传给客户端 | 是，放到响应头 | 方便前端记录与上报 |

---

## 3. 核心代码详解

### 3.1 完整代码

**文件位置**：[RequestIdGlobalFilter.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/RequestIdGlobalFilter.java)

```java
package com.paperflow.gateway.filter;

import java.util.UUID;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public final class RequestIdGlobalFilter implements GlobalFilter, Ordered {
  public static final String HEADER = "X-Request-Id";
  public static final String ATTR = "paperflow.requestId";

  @Override
  public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
    String requestId = exchange.getRequest().getHeaders().getFirst(HEADER);
    if (requestId == null || requestId.isBlank()) {
      requestId = UUID.randomUUID().toString();
    }
    final String rid = requestId;
    exchange.getAttributes().put(ATTR, rid);
    exchange.getResponse().getHeaders().set(HEADER, rid);

    ServerHttpRequest mutated = exchange.getRequest().mutate().headers(h -> h.set(HEADER, rid)).build();
    return chain.filter(exchange.mutate().request(mutated).build());
  }

  @Override
  public int getOrder() {
    return -1000;
  }
}
```

### 3.2 逐段解析

#### 3.2.1 类定义与常量

```java
@Component
public final class RequestIdGlobalFilter implements GlobalFilter, Ordered {
  public static final String HEADER = "X-Request-Id";
  public static final String ATTR = "paperflow.requestId";
```

| 代码段 | 解释 |
|--------|------|
| `@Component` | 让 Spring 扫描并注入为 Bean，自动生效 |
| `GlobalFilter` | Spring Cloud Gateway 的全局过滤器接口，对所有路由生效 |
| `Ordered` | 用于控制过滤器之间的执行顺序 |
| `HEADER = "X-Request-Id"` | 对外约定的请求头名称，与外部系统保持一致（如 Nginx/ELK 常用这个） |
| `ATTR = "paperflow.requestId"` | Gateway 内部属性名，避免与其他属性冲突 |

#### 3.2.2 获取或生成 RequestId

```java
String requestId = exchange.getRequest().getHeaders().getFirst(HEADER);
if (requestId == null || requestId.isBlank()) {
  requestId = UUID.randomUUID().toString();
}
```

| 代码段 | 解释 |
|--------|------|
| `exchange.getRequest().getHeaders().getFirst(HEADER)` | 从请求头里读取客户端传入的 RequestId，用 `getFirst` 因为我们只需要一个 |
| `if (null || isBlank())` | 判空不仅是 null，还包括空字符串，更健壮 |
| `UUID.randomUUID().toString()` | 标准做法，生成 36 字符的 UUID，全球唯一 |

#### 3.2.3 保存到内部属性与响应头

```java
final String rid = requestId;
exchange.getAttributes().put(ATTR, rid);
exchange.getResponse().getHeaders().set(HEADER, rid);
```

| 代码段 | 解释 |
|--------|------|
| `final String rid` | 在 lambda 中使用变量需要 final（或 effectively final），所以这里显式声明一下 |
| `exchange.getAttributes().put(ATTR, rid)` | 放到 Gateway 内部上下文里，后续过滤器不用再去解析请求头，直接从 `exchange.attributes` 取 |
| `exchange.getResponse().getHeaders().set(HEADER, rid)` | 放到响应头回传给前端，方便前端记录/监控 |

#### 3.2.4 修改转发请求并继续

```java
ServerHttpRequest mutated = exchange.getRequest().mutate().headers(h -> h.set(HEADER, rid)).build();
return chain.filter(exchange.mutate().request(mutated).build());
```

| 代码段 | 解释 |
|--------|------|
| `exchange.getRequest().mutate()` | Spring WebFlux 的 `ServerHttpRequest` 是不可变的，所以要用 `mutate()` 来创建修改后的副本 |
| `.headers(h -> h.set(HEADER, rid))` | 把 RequestId 设置到转发给下游的请求头里 |
| `.build()` | 构造出修改后的新请求 |
| `exchange.mutate().request(mutated).build()` | 构造新的 exchange 并替换掉 request |
| `return chain.filter(...)` | 把新的 exchange 传给下一个过滤器，继续执行 |

#### 3.2.5 控制执行顺序

```java
@Override
public int getOrder() {
  return -1000;
}
```

| 代码段 | 解释 |
|--------|------|
| `return -1000` | Ordered 的值越小，优先级越高，执行越早。-1000 足够靠前，保证鉴权/限流/错误处理都能拿到 RequestId |

---

## 4. 边界与约束

### 4.1 只负责生成与透传，不做验证

- 当前实现：只要有值就直接用，不检查长度、字符集、格式
- 为什么：因为不同外部系统的 RequestId 格式可能不一样，太严格会导致兼容性问题
- 后续演进建议：如果担心恶意超长值，可以加一个简单的长度限制（比如最多 64/128 字符）

### 4.2 尊重客户端传入的值，不覆盖

- 如果前面还有 Nginx 或其他网关已经生成 `X-Request-Id`，当前实现会保留原样
- 优点：链路 ID 从最外层开始，更完整
- 注意点：如果有多层网关，要约定清楚哪一层负责兜底，避免 ID 混乱

### 4.3 只在响应头返回，不在响应体返回

- 当前实现：只在 `X-Request-Id` 响应头返回
- 优点：不影响业务响应体格式
- 前端如何拿：可以在拦截器里统一读取并记录到日志/监控系统

---

## 5. 常见问题与踩坑经验

### 5.1 问题：为什么要同时放到 exchange.attributes 和请求头里？

**原因**：
- 放到请求头：主要是给下游服务用的
- 放到 exchange.attributes：主要是给 Gateway 内部其他过滤器用的，比如错误返回时要把 RequestId 放到 JSON body 里

如果只放请求头，每次用的时候还要重新解析请求头，代码会比较啰嗦。

### 5.2 问题：为什么不修改响应体的 JSON，只在响应头？

**原因**：
- 网关是通用层，不应该随便修改下游业务的响应体格式
- 只加响应头是最安全的做法，不侵入业务
- 如果确实需要在 JSON body 里也带上 RequestId，可以通过统一错误处理来做（参考 [04-error-envelope.md](./04-error-envelope.md)）

### 5.3 问题：单机 UUID 会不会重复？

**不用担心**：
- UUID v4 的标准实现是基于随机数的，在实际工程环境中几乎不可能重复（概率低于 1e-36）
- 如果是分布式环境，只要网关之间是各自独立生成的，也不会有冲突

### 5.4 问题：如果服务重启或部署，会不会影响已有的 RequestId？

**不会**：
- RequestId 是每次请求生成的，只存在于一次请求的链路里
- 服务重启不影响已有的历史请求 ID

---

## 6. 可演进方向

### 6.1 简单的 RequestId 格式校验

比如限制长度和字符集：

```java
if (requestId != null && !requestId.isBlank()) {
  // 简单限制：只允许字母、数字、连字符、下划线，长度不超过 128
  if (!requestId.matches("^[a-zA-Z0-9-_]{1,128}$")) {
    requestId = UUID.randomUUID().toString();
  }
}
```

### 6.2 与 OpenTelemetry/Tracing 集成

如果后续接入 OpenTelemetry/Sleuth，可以把 RequestId 与 traceId/spanId 做映射或合并：
- 优先使用 traceId 作为 RequestId（如果有）
- 或者把 RequestId 放到 trace 的 tag 里
- 这样链路追踪系统和业务日志就能更方便地关联起来

### 6.3 采样与日志聚合

后续可以：
- 按比例采样一些请求，在网关里打全链路日志
- 把 RequestId 作为 key，把网关、用户服务、内容服务的日志聚合在一起展示
- 接入 ELK/Loki 时，把 `X-Request-Id` 作为索引的关键字段

---

## 7. 小结

RequestId 看起来是个小功能，但在微服务架构里是不可或缺的基础设施：
1. **顺序最重要**：Order=-1000，第一个执行
2. **透传给下游**：下游才能拿到并记录到自己的日志里
3. **回传给前端**：方便前端监控与问题上报
4. **存到 exchange.attributes**：Gateway 内部后续过滤器用起来方便

这个实现是最小可用的，没有过度设计，但已经能解决大部分实际问题。

---

## 9. 页内导航

- 所属模块：[网关模块索引](./00-index.md)
- 上一篇：当前已是本模块第一篇，建议先回看 [模块索引](./00-index.md)
- 下一篇：[JWT 鉴权与身份透传功能详解](./02-jwt-auth.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
