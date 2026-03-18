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
