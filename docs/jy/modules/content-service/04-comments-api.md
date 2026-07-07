# 评论 API 详解

## 1. 背景与目标

### 与前序模块的关系

- 依赖网关的 X-User-Id（身份透传，用于评论创建、点赞、个人卡片）
- 依赖网关的 X-Request-Id
- 与 PostsController 共用类似的 Envelope 响应格式

### 为什么要做这些 API

- 登录用户可发表评论与回复评论
- 评论支持最多 5 层深度
- 支持评论点赞/取消点赞
- 支持评论用户卡片查询（昵称、发帖数、获赞数）
- 评论状态由帖子的 commentModerationEnabled 决定：true 则新评论是 PENDING，否则是 APPROVED

### 功能目标

1. GET /api/v1/comments：分页评论列表（树形结构）
2. POST /api/v1/comments：创建评论（需要登录）
3. POST /api/v1/comments/{commentId}/like：点赞（需要登录）
4. DELETE /api/v1/comments/{commentId}/like：取消点赞（需要登录）
5. GET /api/v1/comments/users/{userId}/card：公开用户评论卡片

---

## 2. 架构与流程设计

### 整体流程

```
GET /comments：
1. 检查帖子存在
2. 查询可见评论（APPROVED + 当前用户的 PENDING/REJECTED）
3. 组装树形结构（根评论分页，回复按时间升序）
4. 返回

POST /comments：
1. 检查登录
2. 内容校验（非空 <=2000 字符）
3. 检查帖子存在
4. 检查父评论存在（如果是回复）且深度 <=5
5. 根据帖子 commentModerationEnabled 设置状态
6. 保存评论
7. 如果是 APPROVED，触发被回复通知
8. 返回

POST /comments/{commentId}/like：
1. 检查登录
2. 检查评论存在
3. 幂等点赞
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 评论深度 | 最多 5 层 | 避免无限嵌套 |
| 评论列表可见性 | 所有人见 APPROVED + 自己的 PENDING/REJECTED | 兼顾公开+自己可见待审核 |
| 根评论排序 | 按时间倒序 | 新评论在前 |
| 回复排序 | 按时间升序 | 回复按顺序排列 |
| 通知时机 | 创建时 APPROVED 立即通知，审核通过时 PENDING→APPROVED 通知 | 避免重复通知 |

---

## 3. 核心代码详解

### 3.1 CommentsController 完整代码

**文件位置：** [CommentsController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/CommentsController.java#L37-L283)

```java
@RestController
@RequestMapping("/comments")
public class CommentsController {
  private final CommentRepository comments;
  private final PostRepository posts;
  private final CommentLikeRepository commentLikes;
  private final PostLikeRepository postLikes;
  private final NotificationService notifications;

  @GetMapping
  public ResponseEntity<Envelope<Object>> list(...) { ... }
  @PostMapping
  public ResponseEntity<Envelope<CommentResponse>> create(...) { ... }
  @PostMapping("/{commentId}/like")
  public ResponseEntity<Envelope<Object>> like(...) { ... }
  @DeleteMapping("/{commentId}/like")
  public ResponseEntity<Envelope<Object>> unlike(...) { ... }
  @GetMapping("/users/{userId}/card")
  public ResponseEntity<Envelope<Object>> userCard(...) { ... }
}
```

### 3.2 核心代码逐段解析

#### 3.2.1 评论列表

```java
@GetMapping
public ResponseEntity<Envelope<Object>> list(
    @RequestParam("postId") String postId,
    ...) {
  if (!posts.existsById(postId)) {
    return 404;
  }
  List<CommentEntity> visible = comments.listVisibleByPostForUser(postId, normalizedUserId);
  Map<String, CommentEntity> byId = ...;
  Map<String, List<CommentEntity>> childrenByParent = ...;
  List<CommentEntity> roots = ...;
  roots.sort(Comparator.comparing(CommentEntity::getCreatedAt).reversed());
  childrenByParent.values().forEach(children -> children.sort(Comparator.comparing(CommentEntity::getCreatedAt)));
  ...
}
```

| 代码 | 解释 |
|------|------|
| listVisibleByPostForUser | 查询可见评论 |
| byId | 便于查找父评论 |
| childrenByParent | 按父评论分组 |
| roots.sort(...) | 根评论倒序 |
| children.sort(...) | 回复升序 |

#### 3.2.2 创建评论

```java
@PostMapping
public ResponseEntity<Envelope<CommentResponse>> create(...) {
  if (userId == null || userId.isBlank()) {
    return 401;
  }
  String normalizedContent = req.content().trim();
  if (normalizedContent.isBlank()) {
    return 400;
  }
  if (normalizedContent.length() > 2000) {
    return 400;
  }
  PostEntity post = posts.findById(req.postId()).orElse(null);
  if (post == null) {
    return 404;
  }
  String parentCommentId = ...;
  if (parentCommentId != null) {
    CommentEntity parent = comments.findById(parentCommentId).orElse(null);
    if (parent == null || !req.postId().equals(parent.getPostId())) {
      return 404;
    }
    if (commentDepth(parent) >= 5) {
      return 400;
    }
  }
  CommentEntity c = new CommentEntity();
  String status = Boolean.FALSE.equals(post.getCommentModerationEnabled()) ? "APPROVED" : "PENDING";
  c.setStatus(status);
  comments.save(c);
  if ("APPROVED".equals(status)) {
    notifications.notifyReplyIfNeeded(c);
  }
  return 201;
}
```

| 代码 | 解释 |
|------|------|
| commentModerationEnabled | 决定新评论状态 |
| notifyReplyIfNeeded | 被回复通知 |
| commentDepth | 计算评论深度 |

#### 3.2.3 评论点赞/取消点赞

```java
@PostMapping("/{commentId}/like")
public ResponseEntity<Envelope<Object>> like(...) {
  if (userId == null || userId.isBlank()) {
    return 401;
  }
  if (!comments.existsById(commentId)) {
    return 404;
  }
  UserCommentKey key = new UserCommentKey(userId, commentId);
  CommentLikeEntity like = commentLikes.findById(key).orElse(null);
  if (like == null) {
    like = new CommentLikeEntity();
    like.setId(key);
    like.setCreatedAt(...);
    commentLikes.save(like);
  }
  return 200;
}
```

| 代码 | 解释 |
|------|------|
| UserCommentKey | 复合主键（userId+commentId） |

#### 3.2.4 用户卡片

```java
@GetMapping("/users/{userId}/card")
public ResponseEntity<Envelope<Object>> userCard(...) {
  long postCount = posts.countByAuthorUserId(normalized);
  long receivedLikeCount = postLikes.countReceivedByAuthorUserId(normalized) + commentLikes.countReceivedByCommentAuthorUserId(normalized);
  ...
}
```

| 代码 | 解释 |
|------|------|
| countByAuthorUserId | 发帖数 |
| countReceivedByCommentAuthorUserId | 评论获赞数 |

---

## 4. 接口契约

### 评论列表

```http
GET /api/v1/comments?postId=post_xxx&page[number]=1&page[size]=20
X-User-Id: u_xxx  # 可选

响应：
{
  "requestId": "xxx",
  "data": {
    "items": [
      {
        "id": "c_xxx",
        "content": "xxx",
        "status": "APPROVED",
        "replyDtos": [...]
      }
    ]
  }
}
```

### 创建评论

```http
POST /api/v1/comments
X-User-Id: u_xxx
{
  "postId": "post_xxx",
  "content": "xxx",
  "parentCommentId": "c_yyy"  # 可选
}

响应：201 Created
```

### 评论点赞/取消点赞

```http
POST /api/v1/comments/c_xxx/like  # 点赞
DELETE /api/v1/comments/c_xxx/like  # 取消点赞
X-User-Id: u_xxx  # 必填

响应：200 OK
```

### 用户卡片

```http
GET /api/v1/comments/users/u_xxx/card
响应：
{
  "requestId": "xxx",
  "data": {
    "userId": "u_xxx",
    "displayName": "xxx",
    "postCount": 10,
    "receivedLikeCount": 100
  }
}
```

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 评论最多 5 层深度
- 评论内容最多 2000 字符
- 通知功能由 NotificationService 处理

---

## 6. 常见问题与踩坑经验

### 6.1 为什么评论列表是树形结构？

答：
- 评论列表是嵌套回复的评论更清晰，用户体验更好

---

## 7. 可演进方向

### 7.1 评论编辑/删除

支持用户编辑/删除自己的评论。

### 7.2 @提及用户

支持评论中 @ 其他用户并触发通知。

---

## 8. 小结

评论 API 模块详细介绍了：
1. 评论列表（树形结构，分页）
2. 创建评论（内容校验、深度限制、审核状态）
3. 评论点赞/取消点赞
4. 用户卡片（发帖数、获赞数）

接下来我们看后台内容审核模块！

---

## 9. 页内导航

- 所属模块：[内容服务模块索引](./00-index.md)
- 上一篇：[收藏与足迹 API 详解](./03-favorites-footprints.md)
- 下一篇：[后台内容审核详解](./05-admin-moderation.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
