# 04 网关：错误归一化与统一 JSON Envelope

## 功能目标

- 所有失败请求都返回一致的 JSON 结构，便于前端统一处理
- 错误 body 必含 `requestId`，便于定位链路
- 网关级错误（鉴权/限流/未知异常）不依赖下游服务

## 关键代码原文 + 解读

### 4.1 统一 JSON 写出

代码位置：[JsonResponseWriter.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/http/JsonResponseWriter.java)

```java
package com.paperflow.gateway.http;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.paperflow.gateway.filter.RequestIdGlobalFilter;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public final class JsonResponseWriter {
  private final ObjectMapper objectMapper;

  public JsonResponseWriter(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public Mono<Void> writeError(ServerWebExchange exchange, HttpStatus status, String code, String message, Map<String, Object> details) {
    Map<String, Object> error = new LinkedHashMap<>();
    error.put("code", code);
    error.put("message", message);
    if (details != null && !details.isEmpty()) {
      error.put("details", details);
    }

    Map<String, Object> root = new LinkedHashMap<>();
    root.put("requestId", requestId(exchange));
    root.put("error", error);
    return write(exchange, status, root);
  }

  public Mono<Void> write(ServerWebExchange exchange, HttpStatus status, Object body) {
    exchange.getResponse().setStatusCode(status);
    exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);

    byte[] bytes;
    try {
      bytes = objectMapper.writeValueAsBytes(body);
    } catch (Exception e) {
      bytes = ("{\"requestId\":\"" + requestId(exchange) + "\",\"error\":{\"code\":\"SYS_INTERNAL_ERROR\",\"message\":\"serialization_failed\"}}")
          .getBytes(StandardCharsets.UTF_8);
    }

    DataBuffer buffer = exchange.getResponse().bufferFactory().wrap(bytes);
    return exchange.getResponse().writeWith(Mono.just(buffer));
  }

  private String requestId(ServerWebExchange exchange) {
    Object v = exchange.getAttributes().get(RequestIdGlobalFilter.ATTR);
    if (v == null) {
      return "";
    }
    return String.valueOf(v);
  }
}
```

逐段解释：

- `writeError(...)`：
  - 组装统一结构：`{ requestId, error: { code, message, details? } }`
  - 这里用 `LinkedHashMap` 是为了输出字段顺序稳定（便于阅读/调试）
- `write(...)`：
  - 设置 HTTP status + `application/json`
  - 使用 Jackson 序列化（Spring Boot 默认提供 `ObjectMapper` Bean）
  - 若序列化失败（理论上很少发生），返回一个最小可读错误 JSON，避免空响应
- `requestId(exchange)`：
  - 从 `RequestIdGlobalFilter` 写入的 exchange 属性里取 requestId
  - 这就是为什么 RequestId 过滤器要尽量早执行

### 4.2 兜底异常处理

代码位置：[GlobalErrorHandler.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/error/GlobalErrorHandler.java)

```java
package com.paperflow.gateway.error;

import com.paperflow.gateway.http.JsonResponseWriter;
import java.util.Map;
import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public final class GlobalErrorHandler implements ErrorWebExceptionHandler {
  private final JsonResponseWriter writer;

  public GlobalErrorHandler(JsonResponseWriter writer) {
    this.writer = writer;
  }

  @Override
  public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
    if (exchange.getResponse().isCommitted()) {
      return Mono.error(ex);
    }
    return writer.writeError(exchange, HttpStatus.INTERNAL_SERVER_ERROR, "SYS_INTERNAL_ERROR", "Internal error", Map.of());
  }
}
```

逐段解释：

- `ErrorWebExceptionHandler`：WebFlux（Gateway 基于 WebFlux）异常兜底处理。
- `@Order(HIGHEST_PRECEDENCE)`：尽量优先处理异常，避免被默认 handler 覆盖。
- `exchange.getResponse().isCommitted()`：如果响应已开始写出，不能再改 body，只能把异常继续抛给框架。
- 兜底错误码固定为 `SYS_INTERNAL_ERROR`，避免把内部异常细节暴露给外部（安全与稳定性）。

## 前端如何消费这套错误格式

- SPA 根据 `error.code` 做分支：
  - `AUTH_*`：触发登录/刷新 token
  - `RATE_LIMITED`：提示稍后再试
  - `REQ_VALIDATION_FAILED`：表单高亮
- 在报错弹窗/日志里展示 `requestId`，用于和服务端日志对齐排障
