package com.paperflow.apidoc;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

public record DocConfig(
    String title,
    String apiVersion,
    Path sourceDir,
    Path outputFile,
    Optional<String> basePath,
    List<String> includePackages
) {
  public DocConfig {
    if (title == null || title.isBlank()) {
      throw new IllegalArgumentException("title is required");
    }
    if (apiVersion == null || apiVersion.isBlank()) {
      throw new IllegalArgumentException("apiVersion is required");
    }
    if (sourceDir == null) {
      throw new IllegalArgumentException("sourceDir is required");
    }
    if (outputFile == null) {
      throw new IllegalArgumentException("outputFile is required");
    }
    if (basePath == null) {
      basePath = Optional.empty();
    }
    if (includePackages == null) {
      includePackages = List.of();
    }
  }
}

