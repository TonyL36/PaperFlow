package com.paperflow.gateway.ratelimit;

import java.time.Clock;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public final class InMemoryFixedWindowRateLimiter {
  private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
  private final Clock clock;

  public InMemoryFixedWindowRateLimiter(Clock clock) {
    this.clock = clock;
  }

  public Decision tryConsume(String key, int limitPerMinute) {
    long now = clock.millis();
    long windowStart = now - (now % 60_000L);
    Window w = windows.computeIfAbsent(key, k -> new Window(windowStart));
    int used;
    synchronized (w) {
      if (w.windowStartMillis != windowStart) {
        w.windowStartMillis = windowStart;
        w.used.set(0);
      }
      used = w.used.incrementAndGet();
    }
    int remaining = Math.max(0, limitPerMinute - used);
    boolean allowed = used <= limitPerMinute;
    return new Decision(allowed, remaining);
  }

  private static final class Window {
    private long windowStartMillis;
    private final AtomicInteger used = new AtomicInteger(0);

    private Window(long windowStartMillis) {
      this.windowStartMillis = windowStartMillis;
    }
  }

  public record Decision(boolean allowed, int remaining) {
  }
}

