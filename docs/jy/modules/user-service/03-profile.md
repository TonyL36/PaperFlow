# 个人资料管理功能详解

## 1. 背景与目标

### 与前序模块的关系

本模块是用户服务的核心功能，依赖于：
- [注册与登录](./01-auth-register-login.md) 创建的用户数据
- [刷新 Token 与注销](./02-refresh-logout.md) 认证体系
- 网关的 JWT 鉴权，透传 X-User-Id

### 为什么要做个人资料管理

如果没有个人资料管理：
- 用户无法修改昵称、头像等基本信息
- 没有统一的接口获取当前登录用户信息
- 头像上传无文件大小/类型限制

### 功能目标

1. **获取当前用户资料：从网关传 X-User-Id，获取自己的完整资料
2. **更新基本资料：修改昵称、头像 URL、个人简介
3. **上传头像：支持上传图片文件，保存到本地，大小限制 2MB，格式为 png/jpg/webp
4. **头像公开访问：提供公开接口返回头像图片

---

## 2. 架构与流程设计

### 整体流程

```
获取个人资料：
1. 前端调用 GET /api/v1/users/me，带 Authorization
2. 网关鉴权，透传 X-User-Id
3. 用户服务查数据库，返回资料

更新个人资料：
1. 前端调用 PATCH /api/v1/users/me，带 JSON body
2. 网关鉴权，透传 X-User-Id
3. 用户服务更新数据库，返回更新后的资料

上传头像：
1. 前端调用 POST /api/v1/users/me/avatar，带 multipart/form-data
2. 网关鉴权，透传 X-User-Id
3. 用户服务保存到 .dev/uploads/avatars，删除旧头像
4. 更新用户表 avatarUrl 字段，返回更新后的资料
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 身份来源 | X-User-Id 透传 | 同其他模块，信任网关 |
| 资料修改 | PATCH，部分更新 | 只更新需要改的字段 |
| 头像上传 | 本地文件存储 | 当前简单实现，方便开发 |
| 头像大小 | ≤2MB | 防止过大文件 |
| 头像格式 | png/jpg/webp | 常用格式，兼容性好 |
| 旧头像处理 | 删除该用户的所有旧头像 | 避免堆积旧文件 |
| avatarUrl | 带上版本参数 v | 防止浏览器缓存 |

---

## 3. 核心代码详解

### 3.1 HTTP API：UsersController

**文件位置：** [UsersController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/UsersController.java#L28-L183)

#### 3.1.1 获取当前用户资料

```java
@GetMapping("/me")
public ResponseEntity<Envelope<UserProfileResponse>> me(
    @RequestHeader(value = "X-Request-Id", required = false) String requestId,
    @RequestHeader(value = "X-User-Id", required = false) String userId
) {
  if (userId == null || userId.isBlank()) {
    return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_MISSING_TOKEN", "Missing user identity", java.util.Map.of()));
  }
  UserEntity u = users.findById(userId)
      .orElse(null);
  if (u == null) {
    return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
  }
  UserProfileResponse profile = new UserProfileResponse(
      u.getId(),
      u.getEmail(),
      u.getDisplayName(),
      List.of(u.getRoles().split(",")),
      u.getStatus(),
      u.getAvatarUrl(),
      u.getBio(),
      u.getPhone(),
      u.getEmailVerifiedAt() != null,
      u.getPhoneVerifiedAt() != null,
      u.getQqOpenId() != null && !u.getQqOpenId().isBlank()
  );
  return ResponseEntity.ok(Envelope.ok(
      safeRequestId(requestId),
      profile,
      List.of(new Link("self", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
  ));
}
```

| 代码 | 解释 |
|------|------|
| @RequestHeader("X-User-Id") | 网关鉴权后透传的身份 |
| userId 判空 | 无身份返回 401 |
| 查数据库找用户 | 找不到返回 404 |
| 构造 UserProfileResponse | 把用户实体转为 DTO，带上邮箱/手机绑定状态、QQ 绑定状态 |
| Envelope.ok 包装 | 统一响应格式，带 requestId 和 links |

#### 3.1.2 更新基本资料

```java
@PatchMapping("/me")
public ResponseEntity<Envelope<UserProfileResponse>> updateMe(
    @RequestHeader(value = "X-Request-Id", required = false) String requestId,
    @RequestHeader(value = "X-User-Id", required = false) String userId,
    @Valid @RequestBody UpdateProfileRequest req
) {
  if (userId == null || userId.isBlank()) {
    return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_MISSING_TOKEN", "Missing user identity", java.util.Map.of()));
  }
  UserEntity u = users.findById(userId)
      .orElse(null);
  if (u == null) {
    return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
  }
  u.setDisplayName(req.displayName());
  u.setAvatarUrl(req.avatarUrl() == null || req.avatarUrl().isBlank() ? null : req.avatarUrl().trim());
  u.setBio(req.bio() == null || req.bio().isBlank() ? null : req.bio().trim());
  u.setUpdatedAt(OffsetDateTime.now());
  users.save(u);

  UserProfileResponse profile = new UserProfileResponse(
      u.getId(),
      u.getEmail(),
      u.getDisplayName(),
      List.of(u.getRoles().split(",")),
      u.getStatus(),
      u.getAvatarUrl(),
      u.getBio(),
      u.getPhone(),
      u.getEmailVerifiedAt() != null,
      u.getPhoneVerifiedAt() != null,
      u.getQqOpenId() != null && !u.getQqOpenId().isBlank()
  );
  return ResponseEntity.ok(Envelope.ok(
      safeRequestId(requestId),
      profile,
      List.of(new Link("self", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
  ));
}
```

| 代码 | 解释 |
|------|------|
| @PatchMapping | 部分更新，语义符合只修改部分字段 |
| @Valid @RequestBody UpdateProfileRequest | 验证输入 |
| setDisplayName/setAvatarUrl/setBio | 更新字段，空值转 null |
| save(u) | 保存 |
| 重新构造 profile 并返回 | 返回更新后的最新数据 |

#### 3.1.3 上传头像

```java
@PostMapping("/me/avatar")
public ResponseEntity<Envelope<UserProfileResponse>> uploadAvatar(
    @RequestHeader(value = "X-Request-Id", required = false) String requestId,
    @RequestHeader(value = "X-User-Id", required = false) String userId,
    @RequestParam("file") MultipartFile file
) {
  if (userId == null || userId.isBlank()) {
    return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_MISSING_TOKEN", "Missing user identity", java.util.Map.of()));
  }
  UserEntity u = users.findById(userId).orElse(null);
  if (u == null) {
    return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
  }
  if (file == null || file.isEmpty()) {
    return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "Avatar file is required", java.util.Map.of()));
  }
  if (file.getSize() > 2L * 1024L * 1024L) {
    return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "Avatar file too large", java.util.Map.of()));
  }
  String ext = resolveImageExt(file.getContentType(), file.getOriginalFilename());
  if (ext == null) {
    return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "Unsupported avatar image type", java.util.Map.of()));
  }
  try {
    Path dir = Path.of(".dev", "uploads", "avatars");
    Files.createDirectories(dir);
    Files.deleteIfExists(dir.resolve(userId + ".png"));
    Files.deleteIfExists(dir.resolve(userId + ".jpg"));
    Files.deleteIfExists(dir.resolve(userId + ".jpeg"));
    Files.deleteIfExists(dir.resolve(userId + ".webp"));
    Path dst = dir.resolve(userId + "." + ext);
    Files.copy(file.getInputStream(), dst, StandardCopyOption.REPLACE_EXISTING);
    u.setAvatarUrl("/api/v1/public/users/avatars/" + userId + "?v=" + System.currentTimeMillis());
    u.setUpdatedAt(OffsetDateTime.now());
    users.save(u);
    UserProfileResponse profile = new UserProfileResponse(
        u.getId(),
        u.getEmail(),
        u.getDisplayName(),
        List.of(u.getRoles().split(",")),
        u.getStatus(),
        u.getAvatarUrl(),
        u.getBio(),
        u.getPhone(),
        u.getEmailVerifiedAt() != null,
        u.getPhoneVerifiedAt() != null,
        u.getQqOpenId() != null && !u.getQqOpenId().isBlank()
    );
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        profile,
        List.of(new Link("self", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
    ));
  } catch (IOException e) {
    return ResponseEntity.status(500).body(Envelope.err(safeRequestId(requestId), "SYS_INTERNAL_ERROR", "Failed to save avatar", java.util.Map.of()));
  }
}

private String resolveImageExt(String contentType, String name) {
  String ct = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);
  if ("image/png".equals(ct)) return "png";
  if ("image/jpeg".equals(ct)) return "jpg";
  if ("image/webp".equals(ct)) return "webp";
  String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
  if (n.endsWith(".png")) return "png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
  if (n.endsWith(".webp")) return "webp";
  return null;
}
```

| 代码 | 解释 |
|------|------|
| @RequestParam("file") MultipartFile | 接收上传文件 |
| file.isEmpty() 检查 | 不能为空 |
| file.getSize() 2MB 限制 | 防止大文件 |
| resolveImageExt | 根据 Content-Type 或文件名后缀判断图片格式 |
| Path.of(".dev", "uploads", "avatars") | 保存位置：本地 .dev 目录下 |
| deleteIfExists | 删除该用户旧头像的四个可能后缀 |
| Files.copy | 保存新头像，REPLACE_EXISTING |
| setAvatarUrl 带 ?v= | 防止浏览器缓存 |
| setUpdatedAt | 更新时间戳 |
| save 后返回 profile | 返回更新后的最新数据 |
| 异常捕获返回 500 | 保存失败友好提示 |

---

## 4. 接口契约

### 获取当前用户资料

```http
GET /api/v1/users/me
Authorization: Bearer <accessToken>

响应：
{
  "requestId": "xxx",
  "data": {
    "id": "u_xxx",
    "email": "user@example.com",
    "displayName": "My Name",
    "roles": ["USER"],
    "status": "ACTIVE",
    "avatarUrl": "/api/v1/public/users/avatars/u_xxx?v=123456789",
    "bio": "Hello world!",
    "phone": null,
    "emailVerified": true,
    "phoneVerified": false,
    "qqBound": false
  },
  "links": [
    { "rel": "self", "href": "/api/v1/users/me", "method": "GET" }
  ]
}
```

### 更新基本资料

```http
PATCH /api/v1/users/me
Authorization: Bearer <accessToken>
{
  "displayName": "New Name",
  "avatarUrl": null,
  "bio": "New bio"
}

响应同 GET /api/v1/users/me
```

### 上传头像

```http
POST /api/v1/users/me/avatar
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file=<binary>

响应同 GET /api/v1/users/me
```

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 头像存储在本地文件系统，多实例/容器化环境不共享
- 没有图片压缩、格式统一转换
- 没有内容审核
- 当前没有限制更新频率

---

## 6. 常见问题与踩坑经验

### 6.1 为什么头像 URL 带 v= 参数？

答：防止浏览器缓存，每次上传头像后 v 是新的时间戳，强制浏览器重新获取。

### 6.2 为什么上传头像时删除旧头像的四个可能后缀？

答：用户可能之前上传过不同格式的头像（比如先 png 又 jpg），避免多个旧文件堆积。

---

## 7. 可演进方向

### 7.1 云存储头像

可以引入云存储（如 OSS/COS/S3），本地存储改为上传到云。

### 7.2 图片压缩、格式统一

可以引入图片处理库（如 ImageIO/Thumbnailator），统一转换格式、压缩大小。

### 7.3 头像审核

可以接入内容审核 API，过滤违规头像。

---

## 8. 小结

个人资料管理是用户服务的基础功能，本模块详细介绍了：
1. 获取当前用户资料，从网关透传 X-User-Id
2. 部分更新个人资料（PATCH）
3. 头像上传、大小/格式限制、本地存储、防缓存处理
4. 返回绑定状态（邮箱/手机/QQ）

接下来可以继续看：[OAuth 绑定与回调](./04-oauth-bindings.md)

---

## 9. 页内导航

- 所属模块：[用户服务模块索引](./00-index.md)
- 上一篇：[刷新 Token 与注销功能详解](./02-refresh-logout.md)
- 下一篇：[OAuth 绑定与回调功能详解](./04-oauth-bindings.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
