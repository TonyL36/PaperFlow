package com.paperflow.gateway.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.paperflow.gateway.config.AuthProperties;
import com.paperflow.gateway.http.JsonResponseWriter;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

class JwtAuthGlobalFilterTest {
  @Test
  void allows_public_user_profile_without_bearer_token() {
    JwtAuthGlobalFilter filter = new JwtAuthGlobalFilter(new AuthProperties(), new JsonResponseWriter(new ObjectMapper()));
    MockServerHttpRequest request = MockServerHttpRequest.method(HttpMethod.GET, "/api/v1/public/users/u_demo").build();
    MockServerWebExchange exchange = MockServerWebExchange.from(request);
    AtomicBoolean continued = new AtomicBoolean(false);
    GatewayFilterChain chain = ex -> {
      continued.set(true);
      return Mono.empty();
    };

    filter.filter(exchange, chain).block();

    assertTrue(continued.get());
    assertEquals(200, exchange.getResponse().getStatusCode() == null ? 200 : exchange.getResponse().getStatusCode().value());
  }
}
