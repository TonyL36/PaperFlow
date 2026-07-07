# 后台内容审核详解

## 1. 背景与目标

### 与前序模块的关系

- 依赖网关的 X-User-Roles（用于管理员权限检查）
- 依赖网关的 X-Request-Id
- 与用户服务的后台用户管理模块类似的权限检查方式
- 与评论 API 共用 NotificationService（审核通过时触发通知）

### 为什么要做这些功能

- 管理员可以查看待审核的评论
- 管理员可以审核通过/拒绝评论
- 管理员可以设置帖子是否需要评论审核
- 审核通过时触发被回复通知

### 功能目标

1. GET /api/v1/admin/comments：按状态分页评论列表（管理员）
2. PATCH /api/v1/admin/comments/{commentId}：更新评论状态（管理员）
3. PATCH /api/v1/admin/posts/{postId}/comment-moderation：更新帖子评论审核开关（管理员）

---

## 2. 架构与流程设计

### 整体流程

```
GET /admin/comments：
1. 检查 X-User-Roles 是否包含 ADMIN
2. 按 status 分页查询评论（默认 PENDING）
3. 返回

PATCH /admin/comments/{commentId}：
1. 检查管理员权限
2. 检查评论存在
3. 更新状态
4. 如果状态从非 APPROVED→APPROVED，触发被回复通知
5. 返回

PATCH /admin/posts/{postId}/comment-moderation：
1. 检查管理员权限
2. 检查帖子存在
3. 更新 commentModerationEnabled
4. 返回
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 权限检查 | 检查 X-User-Roles 是否包含 ADMIN | 与用户服务后台管理保持一致 |
| 通知时机 | PENDING→APPROVED 时触发，避免重复通知 | 创建时如果是 PENDING 不通知，审核通过才通知 |
| 默认状态 | 评论列表默认查 PENDING | 优先处理待审核评论 |

---

## 3. 核心代码详解

### 3.1 AdminController 完整代码

**文件位置：** [AdminController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/AdminController.java#L26-L146)

```java
@RestController
@RequestMapping("/admin")
public class AdminController {
  private final CommentRepository comments;
  private final PostRepository posts;
  private final NotificationService notifications;

  @GetMapping("/comments")
  public ResponseEntity<Envelope<Object>> listComments(...) { ... }
  @PatchMapping("/comments/{commentId}")
  public ResponseEntity<Envelope<CommentResponse>> updateCommentStatus(...) { ... }
  @PatchMapping("/posts/{postId}/comment-moderation")
  public ResponseEntity<Envelope<Object>> updatePostCommentModeration(...) { ... }
}
```

### 3.2 核心代码逐段解析

#### 3.2.1 评论列表（管理员）

```java
@GetMapping("/comments")
public ResponseEntity<Envelope<Object>> listComments(
    @RequestParam(value = "status", required = false, defaultValue = "PENDING") String status,
    ...) {
  if (!isAdmin(roles)) {
    return 403;
  }
  List<CommentResponse> items = comments.listByStatus(status, ...).stream().map(this::toDto).toList();
  ...
}
```

| 代码 | 解释 |
|------|------|
| isAdmin | 检查 X-User-Roles 是否包含 ADMIN |
| listByStatus | 按状态查询评论 |

#### 3.2.2 更新评论状态

```java
@PatchMapping("/comments/{commentId}")
public ResponseEntity<Envelope<CommentResponse>> updateCommentStatus(...) {
  if (!isAdmin(roles)) {
    return 403;
  }
  CommentEntity c = comments.findById(commentId).orElse(null);
  if (c == null) {
    return 404;
  }
  String before = c.getStatus();
  c.setStatus(req.status());
  comments.save(c);
  if (!"APPROVED".equals(before) && "APPROVED".equals(c.getStatus())) {
    notifications.notifyReplyIfNeeded(c);
  }
  return ResponseEntity.ok(...);
}
```

| 代码 | 解释 |
|------|------|
| before | 记录之前的状态 |
| !"APPROVED".equals(before) && "APPROVED".equals(status) | 审核通过时触发通知 |

#### 3.2.3 更新帖子评论审核开关

```java
@PatchMapping("/posts/{postId}/comment-moderation")
public ResponseEntity<Envelope<Object>> updatePostCommentModeration(...) {
  if (!isAdmin(roles)) {
    return 403;
  }
  PostEntity post = posts.findById(postId).orElse(null);
  if (post == null) {
    return 404;
  }
  post.setCommentModerationEnabled(req.commentModerationEnabled());
  posts.save(post);
  ...
}
```

| 代码 | 解释 |
|------|------|
| commentModerationEnabled | 决定该帖子新评论的默认状态 |

---

## 4. 接口契约

### 评论列表（管理员）

```http
GET /api/v1/admin/comments?status=PENDING&page[number]=1&page[size]=20
X-User-Roles: ...ADMIN...
```

### 更新评论状态

```http
PATCH /api/v1/admin/comments/c_xxx
X-User-Roles: ...ADMIN...
{
  "status": "APPROVED"
}
```

### 更新帖子评论审核开关

```http
PATCH /api/v1/admin/posts/post_xxx/comment-moderation
X-User-Roles: ...ADMIN...
{
  "commentModerationEnabled": true
}
```

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 只有管理员可以操作这些接口
- NotificationService 负责通知逻辑

---

## 6. 常见问题与踩坑经验

### 6.1 为什么审核通过才发通知？

答：
- 避免 PENDING 的评论通知被回复的用户，只有审核通过的评论才应该被看到和通知

---

## 7. 可演进方向

### 7.1 批量审核

支持批量审核通过/拒绝评论。

### 7.2 审核记录

记录评论的审核历史（谁在什么时候改了状态）。

---

## 8. 小结

后台内容审核模块详细介绍了：
1. 管理员权限检查
2. 按状态查询评论
3. 审核通过/拒绝评论（并触发通知）
4. 设置帖子评论审核开关

至此，content-service 的所有详细模块文档已完成！

---

## 9. 页内导航

- 所属模块：[内容服务模块索引](./00-index.md)
- 上一篇：[评论 API 详解](./04-comments-api.md)
- 下一篇：当前已是本模块最后一篇，建议回看 [模块索引](./00-index.md) 或继续阅读 [总览导航文档](../01-navigation-guide.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
