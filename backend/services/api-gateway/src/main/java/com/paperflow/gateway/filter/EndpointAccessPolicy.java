package com.paperflow.gateway.filter;

import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;

@Component
public final class EndpointAccessPolicy {
  public EndpointAccessDecision decide(String path, HttpMethod method) {
    if (path == null || path.isBlank()) {
      return new EndpointAccessDecision(true, EndpointAccessBucket.PROTECTED);
    }
    if (isAuthRoute(path) || isOauthRoute(path)) {
      return new EndpointAccessDecision(false, EndpointAccessBucket.AUTH);
    }
    if (isPublicGetRoute(path, method)) {
      return new EndpointAccessDecision(false, EndpointAccessBucket.PUBLIC_GET);
    }
    return new EndpointAccessDecision(true, EndpointAccessBucket.PROTECTED);
  }

  private boolean isAuthRoute(String path) {
    return path.equals("/api/v1/auth/register") ||
        path.equals("/api/v1/auth/register/email-code/request") ||
        path.equals("/api/v1/auth/login") ||
        path.equals("/api/v1/auth/refresh") ||
        path.equals("/api/v1/auth/password/request") ||
        path.equals("/api/v1/auth/password/confirm");
  }

  private boolean isOauthRoute(String path) {
    return path.equals("/api/v1/oauth/qq/callback") ||
        path.equals("/api/v1/oauth/wechat/callback");
  }

  private boolean isPublicGetRoute(String path, HttpMethod method) {
    return method == HttpMethod.GET && (
        path.equals("/api/v1/posts") ||
        path.startsWith("/api/v1/posts/") ||
        path.equals("/api/v1/comments") ||
        path.startsWith("/api/v1/comments/") ||
        path.startsWith("/api/v1/public/users/") ||
        path.startsWith("/api/v1/public/papers/")
    );
  }
}

record EndpointAccessDecision(boolean authRequired, EndpointAccessBucket bucket) {
}

enum EndpointAccessBucket {
  AUTH,
  PUBLIC_GET,
  PROTECTED
}
