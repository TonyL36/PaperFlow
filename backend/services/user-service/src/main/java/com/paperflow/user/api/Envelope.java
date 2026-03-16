package com.paperflow.user.api;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public record Envelope<T>(
    String requestId,
    Optional<T> data,
    Optional<ErrorBody> error,
    Optional<List<Link>> links
) {
  public static <T> Envelope<T> ok(String requestId, T data, List<Link> links) {
    return new Envelope<>(requestId, Optional.ofNullable(data), Optional.empty(), Optional.ofNullable(links));
  }

  public static <T> Envelope<T> err(String requestId, String code, String message, Map<String, Object> details) {
    return new Envelope<>(requestId, Optional.empty(), Optional.of(new ErrorBody(code, message, Optional.ofNullable(details))), Optional.empty());
  }

  public record ErrorBody(String code, String message, Optional<Map<String, Object>> details) {
  }

  public record Link(String rel, String href, Optional<String> method, Optional<String> type) {
    public Link {
      if (method == null) {
        method = Optional.empty();
      }
      if (type == null) {
        type = Optional.empty();
      }
    }
  }
}

