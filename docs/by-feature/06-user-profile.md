# 06 用户服务：获取/更新个人资料（/users/me）

## 功能目标

- 已登录用户可以查看自己的 profile
- 已登录用户可以更新自己的 displayName
- 与网关协作：用户身份由网关注入 `X-User-Id`，用户服务读取该头作为“当前用户”

## 端到端调用

1. SPA 请求网关：
   - `GET /api/v1/users/me`（带 `Authorization: Bearer ...`）
   - `PATCH /api/v1/users/me`（带 `Authorization` + JSON body）
2. 网关：
   - 校验 JWT
   - 注入 `X-User-Id` / `X-User-Roles`
3. 用户服务：
   - 只读 `X-User-Id` 定位用户记录并返回

## 关键代码原文 + 解读

代码位置：[UsersController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/UsersController.java)

```java
@RestController
@RequestMapping("/users")
public class UsersController {
  private final UserRepository users;

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
    UserProfileResponse profile = new UserProfileResponse(u.getId(), u.getEmail(), u.getDisplayName(), List.of(u.getRoles().split(",")));
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        profile,
        List.of(new Link("self", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
    ));
  }

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
    u.setUpdatedAt(OffsetDateTime.now());
    users.save(u);

    UserProfileResponse profile = new UserProfileResponse(u.getId(), u.getEmail(), u.getDisplayName(), List.of(u.getRoles().split(",")));
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        profile,
        List.of(new Link("self", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
    ));
  }
}
```

逐段解释：

- `X-User-Id`：
  - 由网关从 JWT `sub` 解析后注入；
  - 用户服务用它作为“当前用户”的唯一依据（这要求：服务端口不要暴露给公网，避免绕过网关伪造头）。
- `me` 查询：
  - userId 缺失 → 401；
  - user 不存在 → 404；
  - 返回 `UserProfileResponse`，同时把 roles 字符串 split 成数组。
- `updateMe` 更新：
  - 只允许更新 `displayName`（避免把“改邮箱、改角色”开放给普通用户）；
  - 更新 `updatedAt`，并保存。
- 返回 `links`（HATEOAS 的最小实践）：
  - 单资源响应提供 `self`；
  - link 使用相对路径，利于多环境。

## 演进方向

- 加入字段选择（`fields[user]=...`）与 include（`include=roles`）以优化 SPA 带宽
- 抽出权限模型：如 `ADMIN` 才能管理用户角色
- 对更新增加乐观锁（ETag/If-Match）
