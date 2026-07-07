# 后台用户管理功能详解

## 1. 背景与目标

### 与前序模块的关系

本模块依赖网关的 X-User-Roles 透传（来自 JWT 鉴权），用于判断当前用户是否是管理员。

### 为什么要做后台用户管理

- 管理员可以查看、搜索用户列表
- 管理员可以修改用户的显示名、角色、状态
- 管理员可以吊销特定用户的所有 Refresh Token

### 功能目标

1. 分页列出用户（支持搜索 q、按 status/role 筛选）
2. 获取单个用户详情
3. 部分更新用户（displayName/roles/status）
4. 吊销用户所有 Refresh Token

---

## 2. 架构与流程设计

### 整体流程

```
管理员操作流程：
1. 网关验证管理员的 Access Token，透传 X-User-Roles
2. 用户服务检查 X-User-Roles 是否包含 ADMIN
3. 执行相应操作（列表/获取/更新/吊销 Token）
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 权限判断 | 检查 X-User-Roles 是否包含 ADMIN | 简单、集中在网关鉴权 |
| 用户搜索 | users.search(...) | 封装查询逻辑到 Repository |
| 角色值 | 只允许 USER 和 ADMIN | 简化当前实现 |
| 用户状态 | 只允许 ACTIVE 和 DISABLED | 简化当前实现 |

---

## 3. 核心代码详解

### 3.1 后台用户管理 API

**文件位置：** [AdminUsersController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/src/main/java/com/paperflow/user/api/AdminUsersController.java#L24-L178)

```java
@RestController
@RequestMapping("/admin/users")
public class AdminUsersController {
  private final UserRepository users;
  private final RefreshTokenRepository refreshTokens;

  @GetMapping
  public ResponseEntity<Envelope<Object>> list(...) {
    if (!isAdmin(roles)) {
      return 403;
    }
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<AdminUserResponse> items = users.search(q, status, role, PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();
    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps));
    return ResponseEntity.ok(Envelope.ok(...));
  }

  @GetMapping("/{userId}")
  public ResponseEntity<Envelope<AdminUserResponse>> get(...) {
    if (!isAdmin(roles)) return 403;
    UserEntity u = users.findById(userId).orElse(null);
    if (u == null) return 404;
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), toDto(u), ...));
  }

  @PatchMapping("/{userId}")
  public ResponseEntity<Envelope<AdminUserResponse>> update(...) {
    if (!isAdmin(roles)) return 403;
    UserEntity u = users.findById(userId).orElse(null);
    if (u == null) return 404;
    if (req != null) {
      if (req.displayName() != null && !req.displayName().isBlank()) {
        u.setDisplayName(req.displayName().trim());
      }
      if (req.roles() != null) {
        String normalized = normalizeRoles(req.roles());
        if (normalized.isBlank()) {
          return ResponseEntity.status(400).body(Envelope.err(...));
        }
        u.setRoles(normalized);
      }
      if (req.status() != null && !req.status().isBlank()) {
        String s = req.status().trim().toUpperCase(Locale.ROOT);
        if (!s.equals("ACTIVE") && !s.equals("DISABLED")) {
          return ResponseEntity.status(400).body(Envelope.err(...));
        }
        u.setStatus(s);
      }
    }
    u.setUpdatedAt(java.time.OffsetDateTime.now());
    users.save(u);
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), toDto(u), ...));
  }

  @PostMapping("/{userId}/revoke-tokens")
  public ResponseEntity<Envelope<Object>> revokeTokens(...) {
    if (!isAdmin(roles)) return 403;
    if (users.existsById(userId)) {
      refreshTokens.revokeAllForUser(userId);
    }
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of(), List.of()));
  }

  private boolean isAdmin(String roles) {
    if (roles == null || roles.isBlank()) return false;
    for (String r : roles.split(",")) {
      if ("ADMIN".equalsIgnoreCase(r.trim())) {
        return true;
      }
    }
    return false;
  }

  private String normalizeRoles(List<String> roles) {
    if (roles == null) return "";
    java.util.LinkedHashSet<String> s = new java.util.LinkedHashSet<>();
    for (String r : roles) {
      if (r == null) continue;
      String t = r.trim().toUpperCase(Locale.ROOT);
      if (t.isBlank()) continue;
      if (!t.equals("USER") && !t.equals("ADMIN")) continue;
      s.add(t);
    }
    if (s.isEmpty()) return "";
    return String.join(",", s);
  }
}
```

### 3.2 核心代码逐段解析

#### 3.2.1 管理员权限检查

```java
private boolean isAdmin(String roles) {
  if (roles == null || roles.isBlank()) return false;
  for (String r : roles.split(",")) {
    if ("ADMIN".equalsIgnoreCase(r.trim())) {
      return true;
    }
  }
  return false;
}
```

| 代码 | 解释 |
|------|------|
| X-User-Roles | 网关从 JWT 中解析并透传 |
| 逗号分隔 | 支持多个角色 |

#### 3.2.2 用户列表与搜索

```java
@GetMapping
public ResponseEntity<Envelope<Object>> list(...) {
  ...
  List<AdminUserResponse> items = users.search(q, status, role, PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();
}
```

| 代码 | 解释 |
|------|------|
| PageRequest.of(pn - 1, ps) | Spring Data JPA 分页从 0 开始 |
| users.search(...) | Repository 封装的查询方法 |

#### 3.2.3 角色规范化

```java
private String normalizeRoles(List<String> roles) {
  ...
  if (!t.equals("USER") && !t.equals("ADMIN")) continue;
  ...
  return String.join(",", s);
}
```

| 代码 | 解释 |
|------|------|
| LinkedHashSet | 去重、保持顺序 |
| 只允许 USER/ADMIN | 简化当前实现 |

#### 3.2.4 吊销用户所有 Token

```java
@PostMapping("/{userId}/revoke-tokens")
public ResponseEntity<Envelope<Object>> revokeTokens(...) {
  if (!isAdmin(roles)) return 403;
  if (users.existsById(userId)) {
    refreshTokens.revokeAllForUser(userId);
  }
  return ResponseEntity.ok(Envelope.ok(...));
}
```

| 代码 | 解释 |
|------|------|
| revokeAllForUser | 该用户所有 Refresh Token 都标记为 revoked |
| existsById | 用户不存在也正常返回，避免信息泄露 |

---

## 4. 接口契约

### 用户列表

```http
GET /api/v1/admin/users?q=...&status=ACTIVE&role=USER&page[number]=1&page[size]=20
Authorization: Bearer <admin access token>

响应：
{
  "requestId": "xxx",
  "data": {
    "items": [
      {
        "id": "u_xxx",
        "email": "user@example.com",
        "displayName": "User",
        "roles": ["USER"],
        "status": "ACTIVE",
        "createdAt": "2026-05-27T12:00:00Z",
        "updatedAt": "2026-05-27T12:00:00Z"
      }
    ],
    "page": {
      "number": 1,
      "size": 20
    }
  }
}
```

### 获取单个用户

```http
GET /api/v1/admin/users/{userId}
Authorization: Bearer <admin access token>
```

### 更新用户

```http
PATCH /api/v1/admin/users/{userId}
Authorization: Bearer <admin access token>
{
  "displayName": "New Name",
  "roles": ["USER", "ADMIN"],
  "status": "ACTIVE"
}
```

### 吊销用户 Token

```http
POST /api/v1/admin/users/{userId}/revoke-tokens
Authorization: Bearer <admin access token>

响应：200 OK
```

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 角色只支持 USER 和 ADMIN
- 用户状态只支持 ACTIVE 和 DISABLED
- 搜索功能具体实现看 UserRepository.search

---

## 6. 常见问题与踩坑经验

### 6.1 为什么 PageRequest.of(pn - 1, ps)？

答：Spring Data JPA 的分页从 0 开始，前端通常从 1 开始。

---

## 7. 可演进方向

### 7.1 更丰富的角色/权限

可以引入 RBAC，支持更细粒度的权限控制。

### 7.2 审计日志

记录管理员操作的审计日志。

---

## 8. 小结

后台用户管理模块详细介绍了：
1. 管理员权限检查（X-User-Roles）
2. 用户列表、搜索、分页
3. 用户更新（displayName/roles/status）
4. 吊销用户 Token

用户服务的五个模块已经全部完成！接下来可以继续看内容服务或其他模块。

---

## 9. 页内导航

- 所属模块：[用户服务模块索引](./00-index.md)
- 上一篇：[OAuth 绑定与回调功能详解](./04-oauth-bindings.md)
- 下一篇：当前已是本模块最后一篇，建议回看 [模块索引](./00-index.md) 或继续阅读 [总览导航文档](../01-navigation-guide.md)
- 关联阅读：
  - [网关模块索引](../gateway/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [内容服务索引](../content-service/00-index.md)
