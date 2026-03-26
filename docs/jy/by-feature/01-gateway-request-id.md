# 01 网关：RequestId 注入与回传

## 功能目标

- 让前端/后端/日志可以用同一个 `requestId` 串起一次请求的完整链路
- 允许客户端自带 `X-Request-Id`（例如浏览器、反向代理、压测工具）
- 若客户端不提供，则由网关生成并回传给客户端，同时透传给下游服务

## 端到端行为

1. SPA 请求网关：可选携带 `X-Request-Id`
2. 网关：确保 `X-Request-Id` 存在（若缺失则生成 UUID）
3. 网关：把 `X-Request-Id` 写入响应头，客户端可记录
4. 网关：把 `X-Request-Id` 注入转发请求头，下游服务也能读取并写入自己的日志

## 关键代码原文 + 解读

代码位置：[RequestIdGlobalFilter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/filter/RequestIdGlobalFilter.java)

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
    exchange.getAttributes().put(ATTR, requestId);
    exchange.getResponse().getHeaders().set(HEADER, requestId);

    ServerHttpRequest mutated = exchange.getRequest().mutate().headers(h -> h.set(HEADER, requestId)).build();
    return chain.filter(exchange.mutate().request(mutated).build());
  }

  @Override
  public int getOrder() {
    return -1000;
  }
}
```

逐段解释：

- `implements GlobalFilter, Ordered`：这是 Spring Cloud Gateway 的全局过滤器接口；`Ordered` 控制多个过滤器执行顺序。
- `HEADER/ATTR`：
  - `HEADER` 是对外约定的请求 ID 头名；
  - `ATTR` 是网关内部在 `exchange` 上的属性键（方便后续过滤器或写响应时复用）。
- `String requestId = ...getFirst(HEADER)`：优先读取客户端传入的 requestId。
- `if (null/blank) UUID.randomUUID()`：保证 requestId 必然存在。
- `exchange.getAttributes().put(...)`：把 requestId 放到 exchange 上，后续可以从属性里取（例如错误归一化写 JSON body 时）。
- `exchange.getResponse().getHeaders().set(...)`：把 requestId 回传给客户端，便于浏览器控制台/网关日志/后端日志关联。
- `mutate().headers(h -> h.set(...))`：把 requestId 注入转发请求头，保证下游服务也能拿到同一个 requestId。
- `getOrder() = -1000`：让它尽量早执行，后续鉴权/限流/错误处理都能拿到 requestId。

## 常见坑与演进

- 多层代理重复覆盖：如果前面还有 Nginx/Ingress 也会写 `X-Request-Id`，建议统一由最外层生成，网关只“尊重已存在值”即可（当前实现符合）。
- requestId 合法性：生产可增加简单校验（长度/字符集），避免恶意超长头导致日志污染。
- 与 traceId 集成：后续接入 OpenTelemetry 时，可把 `requestId` 与 `traceId/spanId` 映射或合并。
