# OAuth 绑定与回调功能详解

## 1. 背景与目标

### 与前序模块的关系

本模块依赖前序的用户注册/登录、个人资料功能，同时网关会放行 OAuth 回调接口（公开，无需 Access Token）。

### 为什么要做 OAuth 绑定

- 用户可以绑定 QQ/微信等第三方账号，提升登录便利性
- 绑定过程需要安全的 state 机制，防止 CSRF
- 本地开发需要 mock 模式，不需要真实的第三方应用

### 功能目标

1. 支持邮箱绑定（带验证码确认）
2. 支持手机绑定（带验证码确认）
3. 支持 QQ OAuth 绑定（带 state 安全机制、mock 模式）
4. 支持微信 OAuth 绑定（类似 QQ）
5. 提供绑定状态查询接口

---

## 2. 架构与流程设计

### 整体流程

```
邮箱绑定流程：
1. 前端调用 POST /users/me/bind/email/request，获取验证码
2. 前端输入验证码，调用 POST /users/me/bind/email/confirm 确认绑定
3. 验证 state，更新用户邮箱、设置 emailVerifiedAt

QQ 绑定流程：
1. 前端调用 GET /oauth/qq/authorize，获取授权 URL（或 mock 回调 URL）
2. 用户在第三方授权后，回调到 GET /oauth/qq/callback
3. 验证 state，更新用户 qqOpenId/qqNickname/qqBoundAt

```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| state 机制 | HmacSHA256 签名 + 过期时间 + nonce | 防 CSRF、防重放 |
| mock 模式 | paperflow.qq.mock=true | 本地开发方便调试 |
| 邮箱/手机绑定前检查 | 是否已被其他用户使用 | 防止重复绑定 |
| 验证码存储 | BCrypt 哈希 | 不存明文 |

---

## 3. 核心代码详解

### 3.1 绑定状态查询、邮箱/手机绑定

**文件位置：** [UserBindingsController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/UserBindingsController.java#L32-L250)

```java
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

  @GetMapping
  public ResponseEntity<Envelope<Object>> status(...) {
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
    return ResponseEntity.ok(Envelope.ok(...));
  }

  @PostMapping("/email/request")
  public ResponseEntity<Envelope<Object>> requestEmail(...) {
    UserEntity u = requireUser(requestId, userId);
    String email = req.email().trim().toLowerCase();
    users.findByEmail(email).ifPresent(other -> {
      if (!other.getId().equals(u.getId())) {
        throw new IllegalArgumentException("EMAIL_IN_USE");
      }
    });
    String code = genCode();
    ...
    UserVerificationEntity v = new UserVerificationEntity();
    v.setId("ver_" + UUID.randomUUID().toString().replace("-", ""));
    v.setUserId(u.getId());
    v.setType(TYPE_EMAIL);
    v.setTarget(email);
    v.setCodeHash(passwordEncoder.encode(code));
    v.setCreatedAt(now);
    v.setExpiresAt(now.plusMinutes(10));
    verifications.save(v);
    ...
  }

  @PostMapping("/email/confirm")
  public ResponseEntity<Envelope<Object>> confirmEmail(...) {
    UserEntity u = requireUser(requestId, userId);
    UserVerificationEntity v = verifications.findTopByUserIdAndTypeAndConsumedAtIsNullOrderByCreatedAtDesc(u.getId(), TYPE_EMAIL).orElse(null);
    ...
    v.setConsumedAt(now);
    verifications.save(v);
    u.setEmail(v.getTarget());
    u.setEmailVerifiedAt(now);
    u.setUpdatedAt(now);
    users.save(u);
    ...
  }

  @PostMapping("/phone/request")
  public ResponseEntity<Envelope<Object>> requestPhone(...) {
    // 类似邮箱，只是类型 TYPE_PHONE，手机不发邮件
  }

  @PostMapping("/phone/confirm")
  public ResponseEntity<Envelope<Object>> confirmPhone(...) {
    // 类似邮箱确认，设置 phone、phoneVerifiedAt
  }
}
```

### 3.2 QQ OAuth 绑定

**文件位置：** [QqOauthController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/QqOauthController.java#L26-L219)

```java
@RestController
@RequestMapping("/oauth/qq")
public class QqOauthController {
  private final Environment env;
  private final UserRepository users;

  @GetMapping("/authorize")
  public ResponseEntity<Envelope<Object>> authorizeForBind(...) {
    if (userId == null || userId.isBlank()) {
      return 401;
    }
    long exp = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(10).toEpochSecond();
    String nonce = UUID.randomUUID().toString().replace("-", "");
    String state = signState(userId, exp, nonce);

    boolean mock = Boolean.parseBoolean(env.getProperty("paperflow.qq.mock", "true"));
    String authorizeUrl;
    if (mock) {
      String openid = "mock_" + sha1(userId).substring(0, 10);
      String nickname = "MockQQ";
      authorizeUrl = "/api/v1/oauth/qq/callback?code=" + urlEncode(openid) + "&state=" + urlEncode(state) + "&nickname=" + urlEncode(nickname);
    } else {
      String appId = env.getProperty("paperflow.qq.appId", "");
      String redirectUri = env.getProperty("paperflow.qq.redirectUri", "");
      authorizeUrl = "https://graph.qq.com/oauth2.0/authorize"
          + "?response_type=code"
          + "&client_id=" + urlEncode(appId)
          + "&redirect_uri=" + urlEncode(redirectUri)
          + "&state=" + urlEncode(state)
          + "&scope=get_user_info";
    }
    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("authorizeUrl", authorizeUrl);
    data.put("expiresAtEpochSeconds", exp);
    return ResponseEntity.ok(Envelope.ok(...));
  }

  @GetMapping("/callback")
  public ResponseEntity<Envelope<Object>> callback(...) {
    StatePayload p = verifyState(state);
    if (p == null) return 400;
    long now = OffsetDateTime.now(ZoneOffset.UTC).toEpochSecond();
    if (now > p.expEpochSeconds) return 400;

    String openId = code.trim();
    String nn = nickname == null ? null : nickname.trim();
    UserEntity u = users.findById(p.userId).orElse(null);
    if (u == null) return 404;

    users.findByQqOpenId(openId).ifPresent(other -> {
      if (!other.getId().equals(u.getId())) {
        throw new IllegalArgumentException("QQ_IN_USE");
      }
    });

    OffsetDateTime t = OffsetDateTime.now(ZoneOffset.UTC);
    u.setQqOpenId(openId);
    u.setQqNickname(nn);
    u.setQqBoundAt(t);
    u.setUpdatedAt(t);
    users.save(u);

    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("qqOpenId", u.getQqOpenId());
    data.put("qqNickname", u.getQqNickname());
    data.put("qqBoundAt", u.getQqBoundAt());
    return ResponseEntity.ok(Envelope.ok(...));
  }

  private record StatePayload(String userId, long expEpochSeconds, String nonce) {}

  private String signState(String userId, long expEpochSeconds, String nonce) {
    String payload = userId + "." + expEpochSeconds + "." + nonce;
    byte[] sig = hmac(payload.getBytes(StandardCharsets.UTF_8), stateSecretBytes());
    return base64Url(payload.getBytes(StandardCharsets.UTF_8)) + "." + base64Url(sig);
  }

  private StatePayload verifyState(String state) {
    if (state == null || state.isBlank()) return null;
    String[] parts = state.split("\\.");
    if (parts.length != 2) return null;
    byte[] payloadBytes = base64UrlDecode(parts[0]);
    byte[] sigBytes = base64UrlDecode(parts[1]);
    if (payloadBytes == null || sigBytes == null) return null;
    byte[] expected = hmac(payloadBytes, stateSecretBytes());
    if (!MessageDigest.isEqual(expected, sigBytes)) return null;
    String payload = new String(payloadBytes, StandardCharsets.UTF_8);
    String[] p = payload.split("\\.");
    if (p.length != 3) return null;
    try {
      String userId = p[0];
      long exp = Long.parseLong(p[1]);
      String nonce = p[2];
      if (userId.isBlank() || nonce.isBlank()) return null;
      return new StatePayload(userId, exp, nonce);
    } catch (Exception e) {
      return null;
    }
  }
}
```

### 3.3 核心代码逐段解析

#### 3.3.1 state 签名与验证

```java
private String signState(String userId, long expEpochSeconds, String nonce) {
  String payload = userId + "." + expEpochSeconds + "." + nonce;
  byte[] sig = hmac(payload.getBytes(StandardCharsets.UTF_8), stateSecretBytes());
  return base64Url(payload.getBytes(StandardCharsets.UTF_8)) + "." + base64Url(sig);
}

private StatePayload verifyState(String state) {
  String[] parts = state.split("\\.");
  if (parts.length != 2) return null;
  // 解析并验证签名
  ...
}
```

| 代码 | 解释 |
|------|------|
| payload 结构 | userId.exp.nonce |
| HmacSHA256 | 防篡改 |
| 10 分钟过期 | 防重放 |

#### 3.3.2 邮箱绑定确认

```java
@PostMapping("/email/confirm")
public ResponseEntity<Envelope<Object>> confirmEmail(...) {
  UserEntity u = requireUser(...);
  UserVerificationEntity v = verifications.findTopByUserIdAndTypeAndConsumedAtIsNullOrderByCreatedAtDesc(u.getId(), TYPE_EMAIL).orElse(null);
  // 检查过期、检查验证码
  v.setConsumedAt(now);
  u.setEmail(v.getTarget());
  u.setEmailVerifiedAt(now);
  users.save(u);
}
```

| 代码 | 解释 |
|------|------|
| consumedAt | 标记验证码已使用，防止重复验证 |
| findTopBy...OrderByCreatedAtDesc | 取最新的未使用的验证码 |

#### 3.3.3 QQ mock 模式

```java
boolean mock = Boolean.parseBoolean(env.getProperty("paperflow.qq.mock", "true"));
if (mock) {
  String openid = "mock_" + sha1(userId).substring(0, 10);
  String nickname = "MockQQ";
  authorizeUrl = "/api/v1/oauth/qq/callback?code=" + urlEncode(openid) + "&state=" + urlEncode(state) + "&nickname=" + urlEncode(nickname);
}
```

| 代码 | 解释 |
|------|------|
| mock=true | 本地开发直接跳回调，不需要真实 QQ 授权 |

---

## 4. 接口契约

### 查询绑定状态

```http
GET /api/v1/users/me/bind
Authorization: Bearer <accessToken>

响应：
{
  "requestId": "xxx",
  "data": {
    "email": "user@example.com",
    "emailVerified": true,
    "phone": null,
    "phoneVerified": false,
    "qqBound": true,
    "qqNickname": "MockQQ",
    "wechatBound": false,
    "wechatNickname": null
  }
}
```

### 请求邮箱验证码

```http
POST /api/v1/users/me/bind/email/request
Authorization: Bearer <accessToken>
{
  "email": "new@example.com"
}
```

### 确认邮箱绑定

```http
POST /api/v1/users/me/bind/email/confirm
Authorization: Bearer <accessToken>
{
  "code": "123456"
}
```

### QQ 授权跳转

```http
GET /api/v1/oauth/qq/authorize
Authorization: Bearer <accessToken>

响应：
{
  "requestId": "xxx",
  "data": {
    "authorizeUrl": "/api/v1/oauth/qq/callback?code=mock_...&state=...&nickname=MockQQ",
    "expiresAtEpochSeconds": 1234567890
  }
}
```

### QQ 回调

```http
GET /api/v1/oauth/qq/callback?code=...&state=...&nickname=...
（公开接口，无需 Authorization）

响应：
{
  "requestId": "xxx",
  "data": {
    "qqOpenId": "mock_...",
    "qqNickname": "MockQQ",
    "qqBoundAt": "2026-05-27T12:00:00Z"
  }
}
```

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 微信 OAuth 绑定实现与 QQ 类似（WechatOauthController.java）
- mock 模式下 code 直接作为 openId 使用
- 手机绑定当前只在 H2 下有 debugCode，真实手机需要短信网关

---

## 6. 常见问题与踩坑经验

### 6.1 为什么 state 需要签名和过期时间？

答：防 CSRF、防重放攻击，确保回调是真实的、来自我们自己的授权流程。

### 6.2 为什么 mock 模式默认开启？

答：方便本地开发调试，不需要真实的 QQ/微信应用 ID 和密钥。

---

## 7. 可演进方向

### 7.1 支持 OAuth 登录（不仅仅是绑定）

当前是绑定已有账号，可以新增 OAuth 直接注册/登录功能。

### 7.2 短信网关接入

手机绑定需要真实发送短信，接入短信网关（如阿里云 SMS）。

---

## 8. 小结

OAuth 绑定与回调模块详细介绍了：
1. 绑定状态查询
2. 邮箱/手机绑定（带验证码）
3. QQ/微信 OAuth 绑定（带 state 安全机制、mock 模式）
4. state 签名与验证（防篡改、防重放）

接下来可以继续看：[后台用户管理](./05-admin-user.md)

---

## 9. 页内导航

- 所属模块：[用户服务模块索引](./00-index.md)
- 上一篇：[个人资料管理功能详解](./03-profile.md)
- 下一篇：[后台用户管理功能详解](./05-admin-user.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
