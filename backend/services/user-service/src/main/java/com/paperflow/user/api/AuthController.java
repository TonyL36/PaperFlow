package com.paperflow.user.api;

import com.paperflow.user.api.Envelope.Link;
import com.paperflow.user.api.dto.AuthResponse;
import com.paperflow.user.api.dto.LoginRequest;
import com.paperflow.user.api.dto.RegisterRequest;
import com.paperflow.user.api.dto.RequestEmailCodeRequest;
import com.paperflow.user.domain.VerificationEntity;
import com.paperflow.user.repo.RefreshTokenRepository;
import com.paperflow.user.repo.UserRepository;
import com.paperflow.user.repo.VerificationRepository;
import com.paperflow.user.service.AuthService;
import com.paperflow.user.service.MailService;
import com.paperflow.user.service.MailTemplateService;
import jakarta.validation.Valid;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.core.env.Environment;
import org.springframework.mail.MailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
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
  private final Environment env;
  private final UserRepository users;
  private final RefreshTokenRepository refreshTokens;
  private final VerificationRepository verifications;
  private final PasswordEncoder passwordEncoder;
  private final MailService mail;
  private final SecureRandom random = new SecureRandom();

  public AuthController(
      AuthService auth,
      Environment env,
      UserRepository users,
      RefreshTokenRepository refreshTokens,
      VerificationRepository verifications,
      PasswordEncoder passwordEncoder,
      MailService mail
  ) {
    this.auth = auth;
    this.env = env;
    this.users = users;
    this.refreshTokens = refreshTokens;
    this.verifications = verifications;
    this.passwordEncoder = passwordEncoder;
    this.mail = mail;
  }

  @PostMapping("/register/email-code/request")
  public ResponseEntity<Envelope<Object>> requestRegisterEmailCode(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @Valid @RequestBody RequestEmailCodeRequest req
  ) {
    String email = req.email().trim().toLowerCase();
    var data = new java.util.LinkedHashMap<String, Object>();
    if (users.findByEmail(email).isPresent()) {
      data.put("status", "ALREADY_REGISTERED");
      return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), data, List.of()));
    }
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    VerificationEntity pending = verifications.findTopByTypeAndTargetAndConsumedAtIsNullOrderByCreatedAtDesc("EMAIL_REGISTER", email).orElse(null);
    if (pending != null && now.isBefore(pending.getExpiresAt())) {
      data.put("status", "CODE_ALREADY_SENT");
      data.put("expiresAt", pending.getExpiresAt());
      return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), data, List.of()));
    }
    String code = genCode();
    boolean exposeDebugCode = isInMemoryH2() || !mail.isEnabled();
    VerificationEntity v = new VerificationEntity();
    v.setId("ver_" + UUID.randomUUID().toString().replace("-", ""));
    v.setType("EMAIL_REGISTER");
    v.setTarget(email);
    v.setCodeHash(passwordEncoder.encode(code));
    v.setCreatedAt(now);
    v.setExpiresAt(now.plusMinutes(10));
    verifications.save(v);
    if (mail.isEnabled()) {
      if (!mail.isConfigured()) {
        if (isAnyH2()) {
          data.put("delivery", "DEBUG_FALLBACK");
          exposeDebugCode = true;
        } else {
          throw new AuthService.ServiceException("SYS_MAIL_NOT_CONFIGURED", "Mail not configured");
        }
      } else {
        try {
          mail.sendVerificationCode(email, MailTemplateService.TYPE_REGISTER_VERIFICATION, "注册", code);
          data.put("delivery", "EMAIL");
        } catch (MailException e) {
          if (isAnyH2()) {
            data.put("delivery", "DEBUG_FALLBACK");
            exposeDebugCode = true;
          } else {
            throw new AuthService.ServiceException("SYS_EMAIL_SEND_FAILED", "Failed to send email");
          }
        }
      }
    } else {
      data.put("delivery", "DISABLED");
    }
    data.put("expiresAt", v.getExpiresAt());
    if (exposeDebugCode) {
      data.put("debugCode", code);
    }
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), data, List.of()));
  }

  @PostMapping("/register")
  public ResponseEntity<Envelope<Object>> register(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @Valid @RequestBody RegisterRequest req
  ) {
    String email = req.email().trim().toLowerCase();
    VerificationEntity v = verifications.findTopByTypeAndTargetAndConsumedAtIsNullOrderByCreatedAtDesc("EMAIL_REGISTER", email).orElse(null);
    if (v == null) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID_CODE", "No pending verification", java.util.Map.of()));
    }
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    if (now.isAfter(v.getExpiresAt())) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_CODE_EXPIRED", "Code expired", java.util.Map.of()));
    }
    if (!passwordEncoder.matches(req.code().trim(), v.getCodeHash())) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID_CODE", "Invalid code", java.util.Map.of()));
    }
    v.setConsumedAt(now);
    verifications.save(v);

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

  public record PasswordResetRequest(String email) {
  }

  public record PasswordResetConfirmRequest(String email, String code, String newPassword) {
  }

  @PostMapping("/password/request")
  public ResponseEntity<Envelope<Object>> requestPasswordReset(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestBody PasswordResetRequest req
  ) {
    String email = req == null || req.email() == null ? "" : req.email().trim().toLowerCase();
    var data = new java.util.LinkedHashMap<String, Object>();
    if (!email.isBlank() && users.findByEmail(email).isPresent()) {
      String code = genCode();
      OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
      boolean exposeDebugCode = isInMemoryH2() || !mail.isEnabled();
      VerificationEntity v = new VerificationEntity();
      v.setId("ver_" + UUID.randomUUID().toString().replace("-", ""));
      v.setType("PASSWORD_RESET");
      v.setTarget(email);
      v.setCodeHash(passwordEncoder.encode(code));
      v.setCreatedAt(now);
      v.setExpiresAt(now.plusMinutes(10));
      verifications.save(v);
      if (mail.isEnabled()) {
        if (!mail.isConfigured()) {
          if (isAnyH2()) {
            data.put("delivery", "DEBUG_FALLBACK");
            exposeDebugCode = true;
          } else {
            throw new AuthService.ServiceException("SYS_MAIL_NOT_CONFIGURED", "Mail not configured");
          }
        } else {
          try {
            mail.sendVerificationCode(email, MailTemplateService.TYPE_PASSWORD_RESET_VERIFICATION, "找回密码", code);
            data.put("delivery", "EMAIL");
          } catch (MailException e) {
            if (isAnyH2()) {
              data.put("delivery", "DEBUG_FALLBACK");
              exposeDebugCode = true;
            } else {
              throw new AuthService.ServiceException("SYS_EMAIL_SEND_FAILED", "Failed to send email");
            }
          }
        }
      } else {
        data.put("delivery", "DISABLED");
      }
      data.put("expiresAt", v.getExpiresAt());
      if (exposeDebugCode) {
        data.put("debugCode", code);
      }
    }
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), data, List.of()));
  }

  @PostMapping("/password/confirm")
  @Transactional
  public ResponseEntity<Envelope<Object>> confirmPasswordReset(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestBody PasswordResetConfirmRequest req
  ) {
    if (req == null) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "Invalid request", java.util.Map.of()));
    }
    String email = req.email() == null ? "" : req.email().trim().toLowerCase();
    String code = req.code() == null ? "" : req.code().trim();
    String newPassword = req.newPassword() == null ? "" : req.newPassword();
    if (email.isBlank() || code.isBlank() || newPassword.length() < 8) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_VALIDATION_FAILED", "Validation failed", java.util.Map.of()));
    }
    VerificationEntity v = verifications.findTopByTypeAndTargetAndConsumedAtIsNullOrderByCreatedAtDesc("PASSWORD_RESET", email).orElse(null);
    if (v == null) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID_CODE", "No pending verification", java.util.Map.of()));
    }
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    if (now.isAfter(v.getExpiresAt())) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_CODE_EXPIRED", "Code expired", java.util.Map.of()));
    }
    if (!passwordEncoder.matches(code, v.getCodeHash())) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID_CODE", "Invalid code", java.util.Map.of()));
    }
    var u = users.findByEmail(email).orElse(null);
    if (u == null) {
      return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of(), List.of()));
    }
    v.setConsumedAt(now);
    verifications.save(v);
    u.setPasswordHash(passwordEncoder.encode(newPassword));
    u.setUpdatedAt(now);
    users.save(u);
    refreshTokens.revokeAllForUser(u.getId());
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of(), List.of()));
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

  private String genCode() {
    int v = random.nextInt(1_000_000);
    return String.format("%06d", v);
  }

  private boolean isInMemoryH2() {
    String url = env.getProperty("spring.datasource.url", "");
    return url != null && url.contains("jdbc:h2:mem:");
  }

  private boolean isAnyH2() {
    String url = env.getProperty("spring.datasource.url", "");
    return url != null && url.contains("jdbc:h2:");
  }
}
