package com.paperflow.user.api;

import com.paperflow.user.api.Envelope.Link;
import com.paperflow.user.api.dto.AuthResponse;
import com.paperflow.user.api.dto.LoginRequest;
import com.paperflow.user.api.dto.RegisterRequest;
import com.paperflow.user.service.AuthService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {
  private final AuthService auth;

  public AuthController(AuthService auth) {
    this.auth = auth;
  }

  @PostMapping("/register")
  public ResponseEntity<Envelope<Object>> register(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @Valid @RequestBody RegisterRequest req
  ) {
    var u = auth.register(req);
    Envelope<Object> body = Envelope.<Object>ok(
        safeRequestId(requestId),
        new java.util.LinkedHashMap<>(java.util.Map.of(
            "userId", u.getId(),
            "email", u.getEmail(),
            "displayName", u.getDisplayName()
        )),
        List.of(new Link("login", "/api/v1/auth/login", Optional.of("POST"), Optional.empty()))
    );
    return ResponseEntity.status(201).body(body);
  }

  @PostMapping("/login")
  public ResponseEntity<Envelope<AuthResponse>> login(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @Valid @RequestBody LoginRequest req,
      @RequestHeader(value = "X-Forwarded-Proto", required = false) String forwardedProto
  ) {
    var tokens = auth.login(req);
    ResponseCookie cookie = refreshCookie(tokens.refreshToken(), forwardedProto);
    var body = Envelope.ok(
        safeRequestId(requestId),
        new AuthResponse(tokens.accessToken()),
        List.of(
            new Link("me", "/api/v1/users/me", Optional.of("GET"), Optional.empty()),
            new Link("refresh", "/api/v1/auth/refresh", Optional.of("POST"), Optional.empty())
        )
    );
    return ResponseEntity.ok()
        .header(HttpHeaders.SET_COOKIE, cookie.toString())
        .body(body);
  }

  @PostMapping("/refresh")
  public ResponseEntity<Envelope<AuthResponse>> refresh(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @CookieValue(value = "PF_REFRESH", required = false) String refreshToken,
      @RequestHeader(value = "X-Forwarded-Proto", required = false) String forwardedProto
  ) {
    var tokens = auth.refresh(refreshToken);
    ResponseCookie cookie = refreshCookie(tokens.refreshToken(), forwardedProto);
    var body = Envelope.ok(
        safeRequestId(requestId),
        new AuthResponse(tokens.accessToken()),
        List.of(new Link("me", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
    );
    return ResponseEntity.ok()
        .header(HttpHeaders.SET_COOKIE, cookie.toString())
        .body(body);
  }

  @PostMapping("/logout")
  public ResponseEntity<Envelope<Object>> logout(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Forwarded-Proto", required = false) String forwardedProto
  ) {
    auth.logout(userId);
    ResponseCookie cookie = clearRefreshCookie(forwardedProto);
    Envelope<Object> body = Envelope.<Object>ok(safeRequestId(requestId), java.util.Map.of(), List.of());
    return ResponseEntity.ok()
        .header(HttpHeaders.SET_COOKIE, cookie.toString())
        .body(body);
  }

  private ResponseCookie refreshCookie(String refreshToken, String forwardedProto) {
    boolean secure = "https".equalsIgnoreCase(forwardedProto);
    return ResponseCookie.from("PF_REFRESH", refreshToken)
        .httpOnly(true)
        .secure(secure)
        .sameSite("Lax")
        .path("/api/v1/auth/refresh")
        .maxAge(60L * 60L * 24L * 30L)
        .build();
  }

  private ResponseCookie clearRefreshCookie(String forwardedProto) {
    boolean secure = "https".equalsIgnoreCase(forwardedProto);
    return ResponseCookie.from("PF_REFRESH", "")
        .httpOnly(true)
        .secure(secure)
        .sameSite("Lax")
        .path("/api/v1/auth/refresh")
        .maxAge(0)
        .build();
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
