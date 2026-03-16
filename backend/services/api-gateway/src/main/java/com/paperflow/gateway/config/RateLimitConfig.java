package com.paperflow.gateway.config;

import com.paperflow.gateway.ratelimit.InMemoryFixedWindowRateLimiter;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RateLimitConfig {
  @Bean
  public InMemoryFixedWindowRateLimiter inMemoryFixedWindowRateLimiter() {
    return new InMemoryFixedWindowRateLimiter(Clock.systemUTC());
  }
}

