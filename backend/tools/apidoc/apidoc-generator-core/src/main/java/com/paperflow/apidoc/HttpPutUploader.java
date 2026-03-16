package com.paperflow.apidoc;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Optional;

public final class HttpPutUploader implements DocUploader {
  private final HttpClient client;
  private final URI uploadUrl;
  private final Optional<String> bearerToken;

  public HttpPutUploader(URI uploadUrl, Optional<String> bearerToken) {
    this.client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();
    this.uploadUrl = uploadUrl;
    this.bearerToken = bearerToken;
  }

  @Override
  public void upload(Path file) throws IOException, InterruptedException {
    byte[] bytes = Files.readAllBytes(file);
    HttpRequest.Builder b = HttpRequest.newBuilder()
        .uri(uploadUrl)
        .timeout(Duration.ofSeconds(30))
        .header("Content-Type", "text/markdown; charset=utf-8")
        .PUT(HttpRequest.BodyPublishers.ofByteArray(bytes));
    bearerToken.filter(t -> !t.isBlank()).ifPresent(t -> b.header("Authorization", "Bearer " + t));

    HttpResponse<String> resp = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
    int code = resp.statusCode();
    if (code < 200 || code >= 300) {
      throw new IOException("upload failed: status=" + code + " body=" + safeBody(resp.body()));
    }
  }

  private String safeBody(String s) {
    if (s == null) {
      return "";
    }
    String v = s.replaceAll("[\\r\\n]+", " ");
    if (v.length() > 500) {
      return v.substring(0, 500);
    }
    return v;
  }
}

