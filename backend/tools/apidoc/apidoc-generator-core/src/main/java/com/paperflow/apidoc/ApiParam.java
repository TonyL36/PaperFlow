package com.paperflow.apidoc;

import java.util.Optional;

public record ApiParam(
    String in,
    String name,
    String type,
    boolean required,
    Optional<String> description
) {
  public ApiParam {
    if (in == null || in.isBlank()) {
      throw new IllegalArgumentException("in is required");
    }
    if (name == null || name.isBlank()) {
      throw new IllegalArgumentException("name is required");
    }
    if (type == null || type.isBlank()) {
      throw new IllegalArgumentException("type is required");
    }
    if (description == null) {
      description = Optional.empty();
    }
  }
}

