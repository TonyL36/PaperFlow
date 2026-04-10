# 05 用户服务：注册 / 登录 / Refresh / 注销

## 功能目标

- 注册：创建用户（email 唯一）
- 登录：校验密码，签发 access token（JWT），并下发 refresh token（HttpOnly Cookie）
- Refresh：用 refresh token 轮换签发新的 access token + refresh token
- 注销：吊销用户所有 refresh token（使 refresh 失效）

## 端到端调用（从 SPA 视角）

1. 注册：`POST /api/v1/auth/register`
2. 登录：`POST /api/v1/auth/login`
   - 响应 body：`accessToken`
   - 响应头：`Set-Cookie: PF_REFRESH=...; HttpOnly; ...`
3. accessToken 过期或临近过期：SPA 自动调用 `POST /api/v1/auth/refresh` 获取新 accessToken（浏览器自动携带 cookie）
4. 注销：`POST /api/v1/auth/logout`（网关注入 `X-User-Id` 后，下游吊销 refresh token）

前端当前已接入自动续期链路：

- 启动时若本地 accessToken 已过期，先尝试 refresh
- 请求返回 401 且错误为 token 失效时，自动 refresh 一次并重放原请求
- 已登录状态下定时 refresh，并在页面回到前台时触发 refresh

## 关键代码原文 + 解读

### 5.1 核心业务：AuthService

代码位置：[AuthService.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/service/AuthService.java)

```java
@Service
public class AuthService {
  private final UserRepository users;
  private final RefreshTokenRepository refreshTokens;
  private final PasswordEncoder passwordEncoder;
  private final TokenService tokenService;
  private final AuthProperties props;
  private final SecureRandom secureRandom = new SecureRandom();

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
}
```

逐段解释（关键点）：

- 注册：
  - `findByEmail` 做唯一性检查，不让重复注册；
  - `passwordEncoder.encode(...)` 生成 BCrypt 哈希（不存明文密码）；
  - `roles` 先给默认 `USER`，后续可扩展为多角色（如 `ADMIN`）。
- 登录：
  - 先通过 email 找用户；
  - `passwordEncoder.matches` 校验密码；
  - 成功后统一走 `issueTokens` 签发 token。
- Refresh：
  - refresh token 不直接存库，存的是 `sha256(refreshRaw)`；
  - 先查 hash，再检查 revoked/过期；
  - “轮换策略”：把旧 refresh 标记 revoked，然后签发新的一对 token（降低 refresh 泄露风险）。
- Logout：
  - 直接把该用户所有 refresh token 置 revoked；
  - access token（JWT）无法“强制作废”（除非引入黑名单/短 TTL + jti 校验），这里采用短 TTL + refresh 轮换的折中。

### 5.2 JWT 签发：TokenService

代码位置：[TokenService.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/service/TokenService.java)

```java
@Service
public class TokenService {
  private final AuthProperties props;

  public String mintAccessToken(String userId, List<String> roles) {
    Instant now = Instant.now();
    Instant exp = now.plusSeconds(props.getAccessTokenTtlSeconds());
    return Jwts.builder()
        .subject(userId)
        .claim("roles", roles)
        .id(UUID.randomUUID().toString())
        .issuedAt(Date.from(now))
        .expiration(Date.from(exp))
        .signWith(signingKey())
        .compact();
  }
}
```

解释：

- `subject(userId)` → JWT 的 `sub`
- `claim("roles", roles)` → 网关可读出角色并透传给下游服务（管理端鉴权最小闭环）
- `expiration` → access token TTL（当前默认 14400 秒，即 4 小时）

### 5.3 HTTP API：AuthController

代码位置：[AuthController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/AuthController.java)

```java
@RestController
@RequestMapping("/auth")
public class AuthController {
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
}
```

解释：

- 登录响应分两部分：
  - body：给 SPA 的 `accessToken`（前端放内存或短期存储）
  - cookie：`PF_REFRESH`（HttpOnly，前端 JS 读不到，降低 XSS 风险）
- `X-Forwarded-Proto`：用于判断 `secure` cookie（https 才启用），真实生产通常由反向代理注入。

## 演进方向

- 引入 refresh token 的“设备/会话维度”（例如一个用户多设备独立注销）
- access token 黑名单：用 `jti` + Redis 实现“即时注销”
- 密码策略：增加更严格的强度校验与登录失败次数限制
