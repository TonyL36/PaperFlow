# 统一错误格式功能详解

## 1. 背景与目标

### 与前序模块的关系

这个模块虽然代码位置不直接在过滤器链路里，但被前三个模块都在用：
- [RequestId](./01-request-id.md) 往 exchange 里放 requestId，这个模块负责把它写到错误响应里
- [JWT 鉴权](./02-jwt-auth.md) 用它返回 401
- [限流](./03-rate-limit.md) 用它返回 429

为什么 RequestId 要最先执行？因为不管后面哪个环节出错，返回错误的时候都要带 requestId。

### 为什么要统一错误格式

如果没有统一错误格式，常见问题：
1. 前端处理错误很痛苦，一会儿是字符串一会儿是对象一会儿是 404 页面
2. 不同模块错误结构不一样，调试困难
3. 排障时很难把前端报错和后端日志关联起来

### 功能目标

1. **一致结构**：所有失败请求返回同一套 JSON 结构
2. **必带 requestId**：每一个错误都能和后端链路对齐
3. **网关级独立**：网关自己的错误（鉴权/限流/异常）不依赖下游
4. **字段顺序稳定**：用 LinkedHashMap 保证 JSON 字段输出顺序，便于阅读
5. **序列化兜底**：极端情况下也能返回可读的错误，避免空响应

### 错误格式示例

```json
{
  "requestId": "a4b9c...",
  "error": {
    "code": "AUTH_MISSING_TOKEN",
    "message": "Missing Authorization Bearer token",
    "details": {}
  }
}
```

---

## 2. 架构与流程设计

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 错误结构 | `{ requestId, error: { code, message, details? } }` | requestId 在外层，排障一眼能看到；error 里是具体信息 |
| 字段顺序 | LinkedHashMap | 保证 JSON 输出字段顺序稳定，方便阅读和调试 |
| requestId 来源 | 从 exchange.attributes 取 RequestIdGlobalFilter.ATTR | 由 RequestId 过滤器放进去，全局唯一 |
| 序列化兜底 | 硬编码最小 JSON | 避免极端情况序列化失败导致空响应 |
| 全局异常处理 | 自定义 ErrorWebExceptionHandler + Highest precedence | 兜底所有未捕获异常，统一返回 500 + SYS_INTERNAL_ERROR |

---

## 3. 核心代码详解

### 3.1 统一错误写出器

**文件位置**：[JsonResponseWriter.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/http/JsonResponseWriter.java#L1-L60)

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

### 3.2 全局异常处理器

**文件位置**：[GlobalErrorHandler.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/api-gateway/src/main/java/com/paperflow/gateway/error/GlobalErrorHandler.java)

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

### 3.3 逐段解析

#### 3.3.1 组装错误结构

```java
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
```

| 代码段 | 解释 |
|--------|------|
| `LinkedHashMap` | 保证 JSON 字段顺序稳定，输出时 requestId 在前，error 在后，方便人眼扫 |
| `details` 可选 | 有就加，没有就不加，结构更干净 |
| `requestId` 从 exchange 取 | 由 [RequestId](./01-request-id.md) 放进去 |

#### 3.3.2 写响应（带序列化兜底）

```java
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
```

| 代码段 | 解释 |
|--------|------|
| `Content-Type: application/json` | 告诉前端这是 JSON |
| try-catch 兜底 | 如果序列化失败（几乎不会发生），硬编码返回一个最小 JSON，至少有 requestId 和错误码 |
| `DataBuffer` | WebFlux 响应输出用 DataBuffer，把 bytes 包进去 |

#### 3.3.3 取 requestId

```java
private String requestId(ServerWebExchange exchange) {
  Object v = exchange.getAttributes().get(RequestIdGlobalFilter.ATTR);
  if (v == null) {
    return "";
  }
  return String.valueOf(v);
}
```

| 代码段 | 解释 |
|--------|------|
| 从 attributes 取 | 由 [RequestId](./01-request-id.md) 放进去的 |
| 空字符串兜底 | 如果没取到（理论上不会发生），返回空字符串，避免 null |

#### 3.3.4 全局异常兜底

```java
@Order(Ordered.HIGHEST_PRECEDENCE)
public final class GlobalErrorHandler implements ErrorWebExceptionHandler {
  // ...
  @Override
  public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
    if (exchange.getResponse().isCommitted()) {
      return Mono.error(ex);
    }
    return writer.writeError(exchange, HttpStatus.INTERNAL_SERVER_ERROR, "SYS_INTERNAL_ERROR", "Internal error", Map.of());
  }
}
```

| 代码段 | 解释 |
|--------|------|
| `@Order(HIGHEST_PRECEDENCE)` | 尽量优先用我们自己的处理器，覆盖默认的 |
| `isCommitted()` | 如果响应已经开始写了，就不能再改了，继续抛给框架 |
| `SYS_INTERNAL_ERROR` | 统一内部错误码，不把异常细节暴露给外部（安全）|

---

## 4. 边界与约束

### 4.1 当前实现的边界

- 只负责网关级错误的统一格式（鉴权/限流/异常）
- 下游服务的错误由下游自己决定（不过建议下游也用类似结构，保持一致）
- 不做复杂的错误分类和翻译，只做结构封装
- 异常细节不暴露给外部（安全考虑）

---

## 5. 常见问题与踩坑经验

### 5.1 问题：为什么用 LinkedHashMap 而不是普通 HashMap？

**原因**：LinkedHashMap 保持插入顺序，JSON 输出时字段顺序稳定（requestId 在前，error 在后，code 在 message 前），方便调试和阅读。

### 5.2 问题：为什么不把异常堆栈写到 details 里？

**原因**：安全考虑，堆栈里可能有敏感信息（路径、类名、SQL），生产环境不应该暴露给外部。

### 5.3 问题：为什么还要有序列化兜底？

**原因**：理论上不会走到，但万一 ObjectMapper 配置有问题或者 body 里有循环引用，序列化会抛异常，此时至少能返回一个可读的错误 JSON，而不是空响应。

---

## 6. 可演进方向

### 6.1 错误码枚举

可以把错误码定义成枚举，避免拼写错误：
```java
public enum ErrorCode {
  AUTH_MISSING_TOKEN,
  AUTH_INVALID_TOKEN,
  RATE_LIMITED,
  SYS_INTERNAL_ERROR
  // ...
}
```

### 6.2 多语言支持

可以在 code 上绑定多语言消息，根据 Accept-Language 头返回对应语言。

### 6.3 监控和告警

可以在 writeError 里埋点，统计各类错误的发生率，触发告警。

---

## 7. 小结

统一错误格式是被前三个模块都依赖的基础设施，核心要点：

1. **结构一致**：`{ requestId, error: { code, message, details? } }`
2. **必带 requestId**：每一个错误都能和后端链路对齐
3. **字段顺序稳定**：LinkedHashMap 保证可读性
4. **序列化兜底**：极端情况也能返回可读的 JSON
5. **全局异常处理**：未捕获异常统一返回 500 + SYS_INTERNAL_ERROR
6. **安全第一**：不把异常细节暴露给外部

前端可以根据 `error.code` 做分支：
- AUTH_* → 触发登录/刷新 token
- RATE_LIMITED → 提示稍后再试
- 其他 → 通用提示或表单高亮

网关的五个模块中，我们完成了四个核心：
1. [RequestId](./01-request-id.md)
2. [JWT 鉴权](./02-jwt-auth.md)
3. [限流](./03-rate-limit.md)
4. [统一错误格式](./04-error-envelope.md)

接下来可以继续 [路由配置与重写](./05-routing-rewrite.md)。

---

## 9. 页内导航

- 所属模块：[网关模块索引](./00-index.md)
- 上一篇：[分层限流功能详解](./03-rate-limit.md)
- 下一篇：[路由配置与重写功能详解](./05-routing-rewrite.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
