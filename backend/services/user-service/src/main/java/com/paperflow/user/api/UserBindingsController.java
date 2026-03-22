package com.paperflow.user.api;

import com.paperflow.user.api.Envelope.Link;
import com.paperflow.user.api.dto.BindEmailRequest;
import com.paperflow.user.api.dto.BindPhoneRequest;
import com.paperflow.user.api.dto.ConfirmCodeRequest;
import com.paperflow.user.domain.UserEntity;
import com.paperflow.user.domain.UserVerificationEntity;
import com.paperflow.user.repo.UserRepository;
import com.paperflow.user.repo.UserVerificationRepository;
import com.paperflow.user.service.AuthService;
import com.paperflow.user.service.MailService;
import jakarta.validation.Valid;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users/me/bind")
public class UserBindingsController {
  private static final String TYPE_EMAIL = "EMAIL_BIND";
  private static final String TYPE_PHONE = "PHONE_BIND";

  private final Environment env;
  private final UserRepository users;
  private final UserVerificationRepository verifications;
  private final PasswordEncoder passwordEncoder;
  private final MailService mail;
  private final SecureRandom random = new SecureRandom();

  public UserBindingsController(Environment env, UserRepository users, UserVerificationRepository verifications, PasswordEncoder passwordEncoder, MailService mail) {
    this.env = env;
    this.users = users;
    this.verifications = verifications;
    this.passwordEncoder = passwordEncoder;
    this.mail = mail;
  }

  @GetMapping
  public ResponseEntity<Envelope<Object>> status(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId
  ) {
    UserEntity u = requireUser(requestId, userId);
    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("email", u.getEmail());
    data.put("emailVerified", u.getEmailVerifiedAt() != null);
    data.put("phone", u.getPhone());
    data.put("phoneVerified", u.getPhoneVerifiedAt() != null);
    data.put("qqBound", u.getQqOpenId() != null && !u.getQqOpenId().isBlank());
    data.put("qqNickname", u.getQqNickname());
    data.put("wechatBound", u.getWechatOpenId() != null && !u.getWechatOpenId().isBlank());
    data.put("wechatNickname", u.getWechatNickname());
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/users/me/bind", Optional.of("GET"), Optional.empty()))
    ));
  }

  @PostMapping("/email/request")
  public ResponseEntity<Envelope<Object>> requestEmail(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @Valid @RequestBody BindEmailRequest req
  ) {
    UserEntity u = requireUser(requestId, userId);
    String email = req.email().trim().toLowerCase();
    users.findByEmail(email).ifPresent(other -> {
      if (!other.getId().equals(u.getId())) {
        throw new IllegalArgumentException("EMAIL_IN_USE");
      }
    });
    String code = genCode();
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    boolean exposeDebugCode = isInMemoryH2() || !mail.isEnabled();
    UserVerificationEntity v = new UserVerificationEntity();
    v.setId("ver_" + UUID.randomUUID().toString().replace("-", ""));
    v.setUserId(u.getId());
    v.setType(TYPE_EMAIL);
    v.setTarget(email);
    v.setCodeHash(passwordEncoder.encode(code));
    v.setCreatedAt(now);
    v.setExpiresAt(now.plusMinutes(10));
    verifications.save(v);

    var data = new java.util.LinkedHashMap<String, Object>();
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
          mail.sendVerificationCode(email, "绑定邮箱", code);
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

  @PostMapping("/email/confirm")
  public ResponseEntity<Envelope<Object>> confirmEmail(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @Valid @RequestBody ConfirmCodeRequest req
  ) {
    UserEntity u = requireUser(requestId, userId);
    UserVerificationEntity v = verifications.findTopByUserIdAndTypeAndConsumedAtIsNullOrderByCreatedAtDesc(u.getId(), TYPE_EMAIL).orElse(null);
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
    u.setEmail(v.getTarget());
    u.setEmailVerifiedAt(now);
    u.setUpdatedAt(now);
    users.save(u);
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of("email", u.getEmail(), "emailVerified", true), List.of()));
  }

  @PostMapping("/phone/request")
  public ResponseEntity<Envelope<Object>> requestPhone(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @Valid @RequestBody BindPhoneRequest req
  ) {
    UserEntity u = requireUser(requestId, userId);
    String phone = req.phone().trim();
    users.findByPhone(phone).ifPresent(other -> {
      if (!other.getId().equals(u.getId())) {
        throw new IllegalArgumentException("PHONE_IN_USE");
      }
    });
    String code = genCode();
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    UserVerificationEntity v = new UserVerificationEntity();
    v.setId("ver_" + UUID.randomUUID().toString().replace("-", ""));
    v.setUserId(u.getId());
    v.setType(TYPE_PHONE);
    v.setTarget(phone);
    v.setCodeHash(passwordEncoder.encode(code));
    v.setCreatedAt(now);
    v.setExpiresAt(now.plusMinutes(10));
    verifications.save(v);

    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("expiresAt", v.getExpiresAt());
    if (isInMemoryH2()) {
      data.put("debugCode", code);
    }
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), data, List.of()));
  }

  @PostMapping("/phone/confirm")
  public ResponseEntity<Envelope<Object>> confirmPhone(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @Valid @RequestBody ConfirmCodeRequest req
  ) {
    UserEntity u = requireUser(requestId, userId);
    UserVerificationEntity v = verifications.findTopByUserIdAndTypeAndConsumedAtIsNullOrderByCreatedAtDesc(u.getId(), TYPE_PHONE).orElse(null);
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
    u.setPhone(v.getTarget());
    u.setPhoneVerifiedAt(now);
    u.setUpdatedAt(now);
    users.save(u);
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of("phone", u.getPhone(), "phoneVerified", true), List.of()));
  }

  private String genCode() {
    int v = random.nextInt(1_000_000);
    return String.format("%06d", v);
  }

  private UserEntity requireUser(String requestId, String userId) {
    if (userId == null || userId.isBlank()) {
      throw new IllegalArgumentException("AUTH_MISSING");
    }
    UserEntity u = users.findById(userId).orElse(null);
    if (u == null) {
      throw new IllegalArgumentException("USER_NOT_FOUND");
    }
    return u;
  }

  private boolean isInMemoryH2() {
    String url = env.getProperty("spring.datasource.url", "");
    return url != null && url.contains("jdbc:h2:mem:");
  }

  private boolean isAnyH2() {
    String url = env.getProperty("spring.datasource.url", "");
    return url != null && url.contains("jdbc:h2:");
  }


  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
