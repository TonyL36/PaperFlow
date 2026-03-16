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

