# 注册与登录功能详解

## 1. 背景与目标

### 与前序模块的关系

本模块是用户服务的核心入口功能，依赖于：
- 网关的 RequestId（错误响应时带上 requestId
- 网关的 JWT 鉴权会使用本模块签发的 Token
- 网关的身份透传会读取本模块放在 JWT 里的用户信息

### 为什么要做这样的设计

如果没有统一的认证体系：
- 多个服务各自处理登录/注册，代码重复
- 前端需要记住多个端口/URL，API 分散
- 密码安全、Token 管理难以统一控制

### 功能目标

1. **邮箱注册：邮箱唯一性检查、验证码确认，创建用户
2. **密码登录：密码 BCrypt 哈希比对，签发 Access Token（JWT）+ Refresh Token（HttpOnly Cookie）
3. **安全考量：密码不存明文，Refresh Token 存 sha256 哈希，JWT 短 TTL，刷新轮换
4. **调试友好：本地/非 H2/邮件未配置时，验证码直接返回 debugCode，方便本地开发调试

### 适用场景

- 新用户注册
- 老用户登录
- 本地/开发环境快速调试（debugCode 模式

---

## 2. 架构与流程设计

### 整体流程

```
注册流程：
1. SPA → 请求邮箱验证码 → 网关放行（公开接口 → 用户服务生成验证码 → 邮件/debugCode 返回
2. SPA → 邮箱 + 密码 + 验证码提交 → 网关放行 → 网关注用户服务验证验证码 → 创建用户 → 返回

登录流程：
1. SPA → 邮箱 + 密码提交 → 网关放行 → 用户服务验证密码 → issueTokens → Access Token（响应 body）+ Refresh Token（Cookie）
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|
| 验证码 | 决策 | 理由 |
| 验证码类型 | 6 位数字，10 分钟有效期 | 简单易输入，安全性平衡 |
| 验证码存储 | 哈希（BCrypt） | 不存明文验证码 |
| 密码存储 | BCrypt 哈希 | 抗彩虹表、慢哈希 |
| Refresh Token | sha256 存库，不存原始 | 降低泄露风险 |
| Access Token | JWT，含 userId/email/roles | 网关可直接鉴权并透传 |
| Refresh Token | HttpOnly Cookie，SameSite Lax | 防 XSS 窃取 |
| 轮换策略 | 刷新时旧 token 置 revoked，发新一对 | 降低长期泄露风险 |
| 本地调试 | H2/邮件未配置时，返回 debugCode | 方便本地快速注册登录 |

---

## 3. 核心代码详解

### 3.1 核心业务：AuthService

**文件位置：** [AuthService.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/service/AuthService.java#L1-L144)

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
      throw new ServiceException("AUTH_INVALID_CREDENTIALS", "Invalid credentials"));
    }
    if (!"ACTIVE".equalsIgnoreCase(u.getStatus())) {
      throw new ServiceException("AUTH_DISABLED", "Account disabled"));
    }

    return issueTokens(u);
  }

  @Transactional
  public Tokens refresh(String refreshTokenRaw) {
    if (refreshTokenRaw == null || refreshTokenRaw.isBlank()) {
      throw new ServiceException("AUTH_MISSING_REFRESH", "Missing refresh token"));
    }
    String hash = Hashing.sha256Hex(refreshTokenRaw);
    RefreshTokenEntity t = refreshTokens.findByTokenHash(hash)
        .orElseThrow(() -> new ServiceException("AUTH_INVALID_TOKEN", "Invalid refresh token"));
    if (t.isRevoked() || t.getExpiresAt().isBefore(OffsetDateTime.now())) {
      throw new ServiceException("AUTH_INVALID_TOKEN", "Invalid refresh token"));
    }

    UserEntity u = users.findById(t.getUserId())
        .orElseThrow(() -> new ServiceException("AUTH_INVALID_TOKEN", "Invalid refresh token"));
    if (!"ACTIVE".equalsIgnoreCase(u.getStatus())) {
      t.setRevoked(true);
      refreshTokens.save(t);
      throw new ServiceException("AUTH_DISABLED", "Account disabled"));
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
```

### 3.2 核心代码逐段解析

#### 3.2.1 用户注册

```java
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
```

| 代码 | 解释 |
|------|------|
| findByEmail 唯一性检查 | 邮箱全局唯一，同一邮箱不能重复注册 |
| passwordEncoder.encode | 密码 BCrypt 哈希，不存明文 |
| u.setId("u_" + ...) | 用户 ID 前缀 "u_" 开头，去掉 UUID 的 "-"，更美观 |
| setEmailVerifiedAt | 注册即验证通过，简化当前实现是因为有邮箱验证码，注册后直接验证通过 |

#### 3.2.2 登录验证

```java
@Transactional
public Tokens login(LoginRequest req) {
  UserEntity u = users.findByEmail(req.email().toLowerCase())
      .orElseThrow(() -> new ServiceException("AUTH_INVALID_CREDENTIALS", "Invalid credentials"));
  if (!passwordEncoder.matches(req.password(), u.getPasswordHash())) {
    throw new ServiceException("AUTH_INVALID_CREDENTIALS", "Invalid credentials"));
  }
  if (!"ACTIVE".equalsIgnoreCase(u.getStatus())) {
    throw new ServiceException("AUTH_DISABLED", "Account disabled"));
  }

  return issueTokens(u);
}
```

| 代码 | 解释 |
|------|------|
| passwordEncoder.matches | BCrypt 哈希比对密码，无需知道原始密码 |
| 先验证状态检查 | 账号禁用用户不能登录 |
| login 调用 issueTokens | 统一 Token 签发逻辑复用 |

#### 3.2.3 Token 签发

```java
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
```

| 代码 | 解释 |
|------|------|
| roles.split(",") | 支持多个角色（当前默认只有 USER） |
| mintAccessToken | 调用 TokenService 生成 JWT |
| Hashing.sha256Hex | Refresh Token 存 sha256 哈希存库，不存原始 |
| rt_ 开头 | Refresh Token ID 前缀标识 |
| setRevoked(false) | 初始状态未吊销 |

#### 3.2.4 安全刷新 Token

```java
@Transactional
public Tokens refresh(String refreshTokenRaw) {
  if (refreshTokenRaw == null || refreshTokenRaw.isBlank()) {
    throw new ServiceException("AUTH_MISSING_REFRESH", "Missing refresh token"));
  }
  String hash = Hashing.sha256Hex(refreshTokenRaw);
  RefreshTokenEntity t = refreshTokens.findByTokenHash(hash)
      .orElseThrow(() -> new ServiceException("AUTH_INVALID_TOKEN", "Invalid refresh token"));
  if (t.isRevoked() || t.getExpiresAt().isBefore(OffsetDateTime.now())) {
    throw new ServiceException("AUTH_INVALID_TOKEN", "Invalid refresh token"));
  }

  UserEntity u = users.findById(t.getUserId())
      .orElseThrow(() -> new ServiceException("AUTH_INVALID_TOKEN", "Invalid refresh token"));
  if (!"ACTIVE".equalsIgnoreCase(u.getStatus())) {
    t.setRevoked(true);
    refreshTokens.save(t);
    throw new ServiceException("AUTH_DISABLED", "Account disabled"));
  }
  t.setRevoked(true);
  refreshTokens.save(t);
  return issueTokens(u);
}
```

| 代码 | 解释 |
|------|------|
| 通过 sha256 查库 | 不存原始 refresh token，降低泄露风险 |
| 检查 isRevoked 或过期 | 旧 refresh 不能再用 |
| 刷新时旧 refresh 置 revoked，发新 | 轮换策略，降低长期泄露风险 |

### 3.3 HTTP API：AuthController

**文件位置：** [AuthController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/AuthController.java#L1-L347)

登录关键部分：

```java
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
```

| 代码 | 解释 |
|------|------|
| HttpOnly Cookie | JS 读不到，防 XSS 窃取 refresh |
| SameSite Lax | 一定程度防 CSRF |
| 路径仅 /api/v1/auth/refresh | Cookie 作用范围最小化 |
| maxAge 30 天 | Refresh Token 有效期 |
| secure 由 X-Forwarded-Proto 决定 | https 才设 secure |

---

## 4. 接口契约

### 注册邮箱验证码请求

```http
POST /api/v1/auth/register/email-code/request
{
  "email": "user@example.com"
}

响应：
{
  "requestId": "xxx",
  "data": {
    "status": "CODE_ALREADY_SENT",
    "expiresAt": "2026-05-27T12:00:00Z",
    "debugCode": "123456"
  },
  "links": []
}
```

### 注册

```http
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "mysecret",
  "displayName": "My Name",
  "code": "123456"
}
```

### 登录

```http
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "mysecret"
}

响应：
{
  "requestId": "xxx",
  "data": {
    "accessToken": "eyJhbGci..."
  },
  "links": [
    { "rel": "me", "href": "/api/v1/users/me", "method": "GET" },
    { "rel": "refresh", "href": "/api/v1/auth/refresh", "method": "POST" }
  ]
}
```

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 当前没有登录失败次数限制
- 当前 Access Token 没有黑名单机制，无法即时失效
- 一个 refresh 是全量吊销，无法单设备/会话
- 邮箱没有真实验证是当前简化实现，注册直接验证通过
- 本地开发环境邮件未配置时，直接返回 debugCode，生产环境必须开启邮件服务

---

## 6. 常见问题与踩坑经验

### 6.1 为什么邮箱转小写？

答：防止邮箱大小写重复注册，统一处理，避免 user@Example.com 和 User@example.com 注册为两个不同用户

### 6.2 为什么 Refresh Token 存 sha256？

答：降低泄露风险，万一数据库拖库，攻击者无法直接使用 refresh token，还需猜原始值

### 6.3 为什么 Refresh Token 刷新时要把旧的置 revoked？

答：降低长期泄露风险，refresh 泄露后风险是短期有效，刷新一次旧失效

---

## 7. 可演进方向

### 7.1 登录失败次数限制与验证码

可以增加登录失败次数限制，短期锁定账号，要求输入验证码

### 7.2 多设备/会话维度的 Refresh Token

可以增加设备标识/会话标识，支持单设备注销，而不是全量吊销

### 7.3 Access Token 黑名单

可以引入 Redis 黑名单机制（通过 JTI，实现即时注销

### 7.4 密码强度检查

可以引入密码强度检查、过期提醒、密码重置

---

## 8. 小结

注册与登录是用户服务的核心入口功能，本模块详细介绍了：
1. 邮箱验证码注册、密码 BCrypt 哈希
2. Access Token（JWT）+ Refresh Token（HttpOnly Cookie）安全组合
3. Refresh Token 存 sha256 哈希存库，刷新时旧 token 置 revoked，轮换策略
4. 本地调试友好，H2/未开启邮件服务时，返回 debugCode
5. 前端登录后 accessToken 内存，refreshToken Cookie HttpOnly SameSite Lax，XSS/CSRF 防护考虑

接下来可以继续看：[刷新 Token 与注销](./02-refresh-logout.md](./02-refresh-logout.md)

---

## 9. 页内导航

- 所属模块：[用户服务模块索引](./00-index.md)
- 上一篇：当前已是本模块第一篇，建议先回看 [模块索引](./00-index.md)
- 下一篇：[刷新 Token 与注销功能详解](./02-refresh-logout.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
