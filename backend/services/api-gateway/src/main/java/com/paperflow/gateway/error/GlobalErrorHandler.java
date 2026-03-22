package com.paperflow.gateway.error;

import com.paperflow.gateway.http.JsonResponseWriter;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
  private static final Logger log = LoggerFactory.getLogger(GlobalErrorHandler.class);
  private final JsonResponseWriter writer;

  public GlobalErrorHandler(JsonResponseWriter writer) {
    this.writer = writer;
  }

  @Override
  public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
    if (exchange.getResponse().isCommitted()) {
      return Mono.error(ex);
    }
    log.error("gateway_unhandled_exception path={}", exchange.getRequest().getURI().getPath(), ex);
    return writer.writeError(exchange, HttpStatus.INTERNAL_SERVER_ERROR, "SYS_INTERNAL_ERROR", "Internal error", Map.of());
  }
}
