package com.paperflow.gateway.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.paperflow.gateway.config.RateLimitProperties;
import com.paperflow.gateway.http.JsonResponseWriter;
import com.paperflow.gateway.ratelimit.InMemoryFixedWindowRateLimiter;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpMethod;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

class RateLimitGlobalFilterTest {
  @Test
  void uses_public_bucket_for_public_user_profile_requests() {
    RateLimitGlobalFilter filter = new RateLimitGlobalFilter(rateLimitProperties(), limiter(), new JsonResponseWriter(new ObjectMapper()), new EndpointAccessPolicy());
    MockServerHttpRequest request = MockServerHttpRequest.method(HttpMethod.GET, "/api/v1/public/users/u_demo").build();
    MockServerWebExchange exchange = MockServerWebExchange.from(request);
    AtomicBoolean continued = new AtomicBoolean(false);
    GatewayFilterChain chain = ex -> {
      continued.set(true);
      return Mono.empty();
    };

    filter.filter(exchange, chain).block();

    assertTrue(continued.get());
    assertEquals("180", exchange.getResponse().getHeaders().getFirst("X-RateLimit-Limit"));
    assertEquals("179", exchange.getResponse().getHeaders().getFirst("X-RateLimit-Remaining"));
  }

  @Test
  void uses_auth_bucket_for_oauth_callback_requests() {
    RateLimitGlobalFilter filter = new RateLimitGlobalFilter(rateLimitProperties(), limiter(), new JsonResponseWriter(new ObjectMapper()), new EndpointAccessPolicy());
    MockServerHttpRequest request = MockServerHttpRequest.method(HttpMethod.GET, "/api/v1/oauth/qq/callback").build();
    MockServerWebExchange exchange = MockServerWebExchange.from(request);
    AtomicBoolean continued = new AtomicBoolean(false);
    GatewayFilterChain chain = ex -> {
      continued.set(true);
      return Mono.empty();
    };

    filter.filter(exchange, chain).block();

    assertTrue(continued.get());
    assertEquals("120", exchange.getResponse().getHeaders().getFirst("X-RateLimit-Limit"));
    assertEquals("119", exchange.getResponse().getHeaders().getFirst("X-RateLimit-Remaining"));
  }

  private RateLimitProperties rateLimitProperties() {
    RateLimitProperties props = new RateLimitProperties();
    props.setAnonymousPerMinute(30);
    props.setAuthPerMinute(120);
    props.setPublicGetPerMinute(180);
    props.setUserPerMinute(240);
    return props;
  }

  private InMemoryFixedWindowRateLimiter limiter() {
    return new InMemoryFixedWindowRateLimiter(Clock.fixed(Instant.parse("2026-07-07T14:00:00Z"), ZoneOffset.UTC));
  }
}
