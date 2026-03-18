package com.paperflow.apidoc;

import java.util.List;
import java.util.Optional;

public record Endpoint(
    String controller,
    String methodName,
    String httpMethod,
    String path,
    Optional<String> summary,
    List<ApiParam> params,
    Optional<String> requestBodyType,
    Optional<String> responseBodyType
) {
  public Endpoint {
    if (controller == null || controller.isBlank()) {
      throw new IllegalArgumentException("controller is required");
    }
    if (methodName == null || methodName.isBlank()) {
      throw new IllegalArgumentException("methodName is required");
    }
    if (httpMethod == null || httpMethod.isBlank()) {
      throw new IllegalArgumentException("httpMethod is required");
    }
    if (path == null || path.isBlank()) {
      throw new IllegalArgumentException("path is required");
    }
    if (summary == null) {
      summary = Optional.empty();
    }
    if (params == null) {
      params = List.of();
    }
    if (requestBodyType == null) {
      requestBodyType = Optional.empty();
    }
    if (responseBodyType == null) {
      responseBodyType = Optional.empty();
    }
  }
}

