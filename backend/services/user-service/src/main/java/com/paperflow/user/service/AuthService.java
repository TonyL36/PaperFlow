package com.paperflow.user.service;

import com.paperflow.user.api.dto.LoginRequest;
import com.paperflow.user.api.dto.RegisterRequest;
import com.paperflow.user.config.AuthProperties;
import com.paperflow.user.domain.RefreshTokenEntity;
import com.paperflow.user.domain.UserEntity;
import com.paperflow.user.repo.RefreshTokenRepository;
import com.paperflow.user.repo.UserRepository;
import com.paperflow.user.util.Hashing;
import jakarta.transaction.Transactional;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
  private final UserRepository users;
  private final RefreshTokenRepository refreshTokens;
  private final PasswordEncoder passwordEncoder;
  private final TokenService tokenService;
  private final AuthProperties props;
  private final SecureRandom secureRandom = new SecureRandom();

  public AuthService(UserRepository users, RefreshTokenRepository refreshTokens, PasswordEncoder passwordEncoder, TokenService tokenService, AuthProperties props) {
    this.users = users;
    this.refreshTokens = refreshTokens;
    this.passwordEncoder = passwordEncoder;
    this.tokenService = tokenService;
    this.props = props;
  }

  @Transactional
  public UserEntity register(RegisterRequest req) {
    users.findByEmail(req.email()).ifPresent(u -> {
      throw new ServiceException("RES_CONFLICT", "Email already registered");
    });

    OffsetDateTime now = OffsetDateTime.now();
    UserEntity u = new UserEntity();
    u.setId("u_" + UUID.randomUUID().toString().replace("-", ""));
    u.setEmail(req.email().toLowerCase());
    u.setPasswordHash(passwordEncoder.encode(req.password()));
    u.setDisplayName(req.displayName());
    u.setRoles("USER");
    u.setStatus("ACTIVE");
    u.setEmailVerifiedAt(now);
    u.setCreatedAt(now);
    u.setUpdatedAt(now);
    return users.save(u);
  }

  @Transactional
  public Tokens login(LoginRequest req) {
    UserEntity u = users.findByEmail(req.email().toLowerCase())
        .orElseThrow(() -> new ServiceException("AUTH_INVALID_CREDENTIALS", "Invalid credentials"));
    if (!passwordEncoder.matches(req.password(), u.getPasswordHash())) {
      throw new ServiceException("AUTH_INVALID_CREDENTIALS", "Invalid credentials");
    }
    if (!"ACTIVE".equalsIgnoreCase(u.getStatus())) {
      throw new ServiceException("AUTH_DISABLED", "Account disabled");
    }

    return issueTokens(u);
  }

  @Transactional
  public Tokens refresh(String refreshTokenRaw) {
    if (refreshTokenRaw == null || refreshTokenRaw.isBlank()) {
      throw new ServiceException("AUTH_MISSING_REFRESH", "Missing refresh token");
    }
    String hash = Hashing.sha256Hex(refreshTokenRaw);
    RefreshTokenEntity t = refreshTokens.findByTokenHash(hash)
        .orElseThrow(() -> new ServiceException("AUTH_INVALID_TOKEN", "Invalid refresh token"));
    if (t.isRevoked() || t.getExpiresAt().isBefore(OffsetDateTime.now())) {
      throw new ServiceException("AUTH_INVALID_TOKEN", "Invalid refresh token");
    }

    UserEntity u = users.findById(t.getUserId())
        .orElseThrow(() -> new ServiceException("AUTH_INVALID_TOKEN", "Invalid refresh token"));
    if (!"ACTIVE".equalsIgnoreCase(u.getStatus())) {
      t.setRevoked(true);
      refreshTokens.save(t);
      throw new ServiceException("AUTH_DISABLED", "Account disabled");
    }
    t.setRevoked(true);
    refreshTokens.save(t);
    return issueTokens(u);
  }

  @Transactional
  public void logout(String userId) {
    if (userId == null || userId.isBlank()) {
      return;
    }
    refreshTokens.revokeAllForUser(userId);
  }

  private Tokens issueTokens(UserEntity u) {
    List<String> roles = List.of(u.getRoles().split(","));
    String access = tokenService.mintAccessToken(u.getId(), u.getEmail(), roles);
    String refreshRaw = mintRefreshTokenRaw();
    String hash = Hashing.sha256Hex(refreshRaw);

    OffsetDateTime now = OffsetDateTime.now();
    RefreshTokenEntity t = new RefreshTokenEntity();
    t.setId("rt_" + UUID.randomUUID().toString().replace("-", ""));
    t.setUserId(u.getId());
    t.setTokenHash(hash);
    t.setCreatedAt(now);
    t.setExpiresAt(now.plusSeconds(props.getRefreshTokenTtlSeconds()));
    t.setRevoked(false);
    refreshTokens.save(t);

    return new Tokens(access, refreshRaw, u.getId(), roles);
  }

  private String mintRefreshTokenRaw() {
    byte[] bytes = new byte[32];
    secureRandom.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  public record Tokens(String accessToken, String refreshToken, String userId, List<String> roles) {
  }

  public static final class ServiceException extends RuntimeException {
    private final String code;

    public ServiceException(String code, String message) {
      super(message);
      this.code = code;
    }

    public String code() {
      return code;
    }
  }
}
