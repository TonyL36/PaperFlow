# 刷新 Token 与注销功能详解

## 1. 背景与目标

### 与前序模块的关系

本模块是用户服务核心认证体系的后续，依赖于：
- [注册与登录](./01-auth-register-login.md) 所签发的 Token 体系
- 网关的 JWT 鉴权与身份透传
- 网关的 RequestId（统一错误响应时带上

### 为什么要做 Token 刷新与注销

如果没有 Token 刷新：
- JWT Access Token 有效期不能太短，否则用户频繁登录，体验很差
- 但有效期太长，又增加泄露风险

如果没有统一注销：
- 用户退出后，Access Token 还能继续用直到过期
- Refresh Token 也还能继续换 Access Token

### 功能目标

1. **Token 刷新：浏览器自动带 HttpOnly Cookie PF_REFRESH 调用刷新，旧 refresh 置 revoked，返回新一对
2. **统一注销：网关传 X-User-Id，用户服务把该用户所有 refresh token 置 revoked，清除 PF_REFRESH Cookie
3. **安全考量：Refresh Token 轮换，旧的用一次就失效
4. **前端友好：自动刷新逻辑集成在前端 SDK 中，开发者无感

---

## 2. 架构与流程设计

### 整体流程

```
刷新流程：
1. 前端检测 Access Token 过期/即将过期
2. 自动调用 POST /api/v1/auth/refresh
3. 浏览器自动带 HttpOnly Cookie PF_REFRESH
4. 网关放行（公开接口 → 用户服务验证 refresh token
5. 旧 refresh 置 revoked → issueTokens 新一对 → 返回新 access + 新 refresh Cookie

注销流程：
1. 前端调用 POST /api/v1/auth/logout
2. 网关鉴权，带 X-User-Id
3. 用户服务把该用户所有 refresh token 置 revoked
4. 清除 PF_REFRESH Cookie
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 刷新时旧 token | 置 revoked，发新一对 | 降低泄露风险，泄露的旧 token 用一次就不能再用 |
| 注销方式 | 全量吊销该用户所有 refresh token | 当前没有设备/会话维度，简单实现 |
| Cookie 清除 | logout 响应中清除 PF_REFRESH Cookie | 前端不再有旧 refresh |
| Access Token 失效 | 当前无黑名单，等自然过期 | 简化当前实现，Access Token 短 TTL 折中 |

---

## 3. 核心代码详解

### 3.1 核心业务：AuthService 刷新与注销

**文件位置：** [AuthService.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/service/AuthService.java#L114-L143)

```java
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
```

### 3.2 核心代码逐段解析

#### 3.2.1 安全刷新 Token

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
| refreshTokenRaw 判空 | 没有 refresh token 时返回明确错误码 |
| Hashing.sha256Hex | 同 [注册与登录](./01-auth-register-login.md)，Refresh Token 存 sha256 |
| 检查 isRevoked 或过期 | 旧 token 已经用过或过期，不能再用 |
| 通过 token 关联 userId，再查用户 | 确保用户存在且状态正常 |
| 如果用户状态异常，先标记 token 再抛错 | 防止异常情况下旧 token 还能用 |
| t.setRevoked(true) | 使用过一次旧 token 就标记为已吊销，不能再用 |
| save 然后 issueTokens(u) | 返回新一对 token |

#### 3.2.2 统一注销

```java
@Transactional
public void logout(String userId) {
  if (userId == null || userId.isBlank()) {
    return;
  }
  refreshTokens.revokeAllForUser(userId);
}
```

| 代码 | 解释 |
|------|------|
| userId 判空 | 网关没有传 X-User-Id（即用户没登录），直接返回不抛错 |
| revokeAllForUser | 该用户所有 refresh token 全量置 revoked |

### 3.3 HTTP API：AuthController 刷新与注销

**文件位置：** [AuthController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/AuthController.java#L179-L209)

```java
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
```

#### 3.3.1 刷新接口详解

| 代码 | 解释 |
|------|------|
| @CookieValue("PF_REFRESH") | 从浏览器 HttpOnly Cookie 取 refresh token，前端 JS 读不到 |
| 调用 auth.refresh | 核心刷新逻辑 |
| 新 refresh 写回 Cookie | 替换旧 refresh cookie |
| accessToken 放 body | 前端内存持有 |

#### 3.3.2 注销接口详解

| 代码 | 解释 |
|------|------|
| @RequestHeader("X-User-Id") | 从网关透传的身份信息，网关鉴权后注入 |
| auth.logout(userId) | 全量吊销该用户所有 refresh token |
| clearRefreshCookie | 清除浏览器的 PF_REFRESH cookie（maxAge: 0 |

---

## 4. 接口契约

### 刷新 Token

```http
POST /api/v1/auth/refresh
Cookie: PF_REFRESH=...

响应：
{
  "requestId": "xxx",
  "data": {
    "accessToken": "eyJhbGci..."
  },
  "links": [
    { "rel": "me", "href": "/api/v1/users/me", "method": "GET" }
  ]
}

Set-Cookie: PF_REFRESH=...; HttpOnly; ...
```

### 注销

```http
POST /api/v1/auth/logout
Authorization: Bearer <accessToken>

响应：
{
  "requestId": "xxx",
  "data": {},
  "links": []
}

Set-Cookie: PF_REFRESH=; Max-Age=0; ...
```

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 当前 Access Token 无黑名单机制，注销后 Access Token 还能继续用直到过期
- 当前注销是全量吊销该用户所有 Refresh Token，没有单设备/会话维度
- Refresh Token 的设备/会话信息当前没有记录

---

## 6. 常见问题与踩坑经验

### 6.1 为什么刷新时要把旧 refresh token 置 revoked？

答：轮换策略，降低泄露风险，旧 refresh 泄露了，攻击者只能用一次就失效。

### 6.2 为什么注销后 Access Token 还能用？

答：当前没有 Access Token 黑名单机制，JWT 本身无状态，所以等自然过期。可以后续引入 Redis + JTI 黑名单。

### 6.3 为什么刷新接口是公开的（不需要 Authorization）？

答：通过 HttpOnly Cookie PF_REFRESH 来认证，不需要前端在 Authorization 里带。

---

## 7. 可演进方向

### 7.1 设备/会话维度的 Token

可以引入设备标识/会话标识，记录每个 Refresh Token 对应的设备/会话，支持单设备注销。

### 7.2 Access Token 黑名单（JTI）

可以引入 Redis，记录已注销/已过期 Access Token 的 JTI，网关验证时查黑名单，实现即时失效。

### 7.3 Refresh Token 安全加固

可以增加 Refresh Token 绑定 IP/UA，异常 IP/UA 时要求重新登录。

---

## 8. 小结

刷新 Token 与注销是用户认证体系的安全保障，本模块详细介绍了：
1. Refresh Token 轮换策略，旧用一次就失效
2. 注销全量吊销该用户所有 Refresh Token
3. HttpOnly Cookie SameSite Lax，配合 X-Forwarded-Proto 控制 secure
4. 前端自动刷新，开发者几乎无感
5. 注销后清除 PF_REFRESH Cookie

接下来可以继续看：[个人资料管理](./03-profile.md)

---

## 9. 页内导航

- 所属模块：[用户服务模块索引](./00-index.md)
- 上一篇：[注册与登录功能详解](./01-auth-register-login.md)
- 下一篇：[个人资料管理功能详解](./03-profile.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
