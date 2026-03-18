package com.paperflow.apidoc;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

public final class ApiDocGenerator {
  private final ControllerScanner scanner;
  private final MarkdownRenderer renderer;

  public ApiDocGenerator() {
    this(new ControllerScanner(), new MarkdownRenderer());
  }

  public ApiDocGenerator(ControllerScanner scanner, MarkdownRenderer renderer) {
    this.scanner = scanner;
    this.renderer = renderer;
  }

  public Path generate(DocConfig config) throws IOException {
    List<Endpoint> endpoints = scanner.scan(config);
    String md = renderer.render(config, endpoints);

    Path out = config.outputFile().toAbsolutePath().normalize();
    Files.createDirectories(out.getParent());
    Files.writeString(out, md, StandardCharsets.UTF_8);
    return out;
  }
}

