# 收藏与足迹 API 详解

## 1. 背景与目标

### 与前序模块的关系

- 依赖网关的 X-User-Id（身份透传，因为收藏和足迹都是用户相关）
- 与 PostsController 共用 PostResponse DTO 保持一致

### 为什么要做这些 API

- 收藏：用户可以收藏/取消收藏帖子，并查看收藏列表
- 足迹：用户查看最近浏览的帖子
- 所有操作都需要登录

### 功能目标

1. POST /api/v1/posts/{postId}/favorite：收藏（需要登录）
2. DELETE /api/v1/posts/{postId}/favorite：取消收藏（需要登录）
3. GET /api/v1/favorites：分页收藏列表（需要登录）
4. GET /api/v1/footprints：分页足迹列表（需要登录）

---

## 2. 架构与流程设计

### 整体流程

```
POST /posts/{postId}/favorite：
1. 检查登录
2. 检查帖子存在
3. 幂等：已收藏则不重复创建
4. 返回成功

DELETE /posts/{postId}/favorite：
1. 检查登录
2. 删除收藏记录（不存在也返回成功）

GET /favorites：
1. 检查登录
2. 按创建时间倒序查询收藏列表
3. 转换为 PostResponse
4. 返回带 totalItems/totalPages

GET /footprints：
1. 检查登录
2. 按 lastViewedAt 倒序查询足迹列表
3. 转换为 PostResponse
4. 返回带 totalItems/totalPages
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 收藏排序 | 按 createdAt 倒序 | 最近收藏的在前 |
| 足迹排序 | 按 lastViewedAt 倒序 | 最近浏览的在前 |
| 分页元数据 | 返回 totalItems/totalPages | 方便前端做完整分页 |
| 幂等 | 收藏/取消收藏都是幂等 | 用户重复操作不会报错 |

---

## 3. 核心代码详解

### 3.1 FavoritesController 完整代码

**文件位置：** [FavoritesController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/FavoritesController.java#L27-L159)

```java
@RestController
public class FavoritesController {
  private final PostRepository posts;
  private final PostFavoriteRepository favorites;
  private final PostFootprintRepository footprints;
  private final PostLikeRepository likes;

  @PostMapping("/posts/{postId}/favorite")
  public ResponseEntity<Envelope<Object>> favorite(...) { ... }

  @DeleteMapping("/posts/{postId}/favorite")
  public ResponseEntity<Envelope<Object>> unfavorite(...) { ... }

  @GetMapping("/favorites")
  public ResponseEntity<Envelope<Object>> listFavorites(...) { ... }

  @GetMapping("/footprints")
  public ResponseEntity<Envelope<Object>> listFootprints(...) { ... }
}
```

### 3.2 核心代码逐段解析

#### 3.2.1 收藏

```java
@PostMapping("/posts/{postId}/favorite")
public ResponseEntity<Envelope<Object>> favorite(
    @RequestHeader(value = "X-Request-Id", required = false) String requestId,
    @RequestHeader(value = "X-User-Id", required = false) String userId,
    @PathVariable("postId") String postId
) {
  if (userId == null || userId.isBlank()) {
    return ResponseEntity.status(401).body(...);
  }
  if (!posts.existsById(postId)) {
    return ResponseEntity.status(404).body(...);
  }
  OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
  UserPostKey key = new UserPostKey(userId, postId);
  PostFavoriteEntity f = favorites.findById(key).orElse(null);
  if (f == null) {
    f = new PostFavoriteEntity();
    f.setId(key);
    f.setCreatedAt(now);
    favorites.save(f);
  }
  return ResponseEntity.ok(Envelope.ok(...));
}
```

| 代码 | 解释 |
|------|------|
| 先检查帖子存在 | 避免对不存在的帖子收藏 |
| 幂等 | 已存在则不重复 save |

#### 3.2.2 取消收藏

```java
@DeleteMapping("/posts/{postId}/favorite")
public ResponseEntity<Envelope<Object>> unfavorite(...) {
  if (userId == null || userId.isBlank()) {
    return ResponseEntity.status(401).body(...);
  }
  favorites.deleteById(new UserPostKey(userId, postId));
  return ResponseEntity.ok(Envelope.ok(...));
}
```

| 代码 | 解释 |
|------|------|
| deleteById | 不存在也不会报错 |

#### 3.2.3 收藏列表

```java
@GetMapping("/favorites")
public ResponseEntity<Envelope<Object>> listFavorites(...) {
  if (userId == null || userId.isBlank()) {
    return ResponseEntity.status(401).body(...);
  }
  int pn = Math.max(1, pageNumber);
  int ps = Math.min(200, Math.max(1, pageSize));
  List<PostResponse> items = favorites.findByIdUserIdOrderByCreatedAtDesc(userId, PageRequest.of(pn - 1, ps)).stream()
      .map(PostFavoriteEntity::getPost)
      .filter(java.util.Objects::nonNull)
      .map(p -> toDto(p, userId, true, null))
      .toList();
  long totalItems = favorites.countByIdUserId(userId);
  long totalPages = totalItems == 0 ? 0 : (long) Math.ceil((double) totalItems / ps);
  ...
}
```

| 代码 | 解释 |
|------|------|
| findByIdUserIdOrderByCreatedAtDesc | 最近收藏的在前 |
| filter(Objects::nonNull) | 帖子被删除的情况过滤掉 |
| toDto(p, userId, true, null) | favorited 固定为 true，因为是收藏列表 |
| totalItems/totalPages | 完整分页元数据 |

#### 3.2.4 足迹列表

```java
@GetMapping("/footprints")
public ResponseEntity<Envelope<Object>> listFootprints(...) {
  if (userId == null || userId.isBlank()) {
    return ResponseEntity.status(401).body(...);
  }
  int pn = Math.max(1, pageNumber);
  int ps = Math.min(200, Math.max(1, pageSize));
  List<PostResponse> items = footprints.findByIdUserIdOrderByLastViewedAtDesc(userId, PageRequest.of(pn - 1, ps)).stream()
      .map(fp -> toDto(fp.getPost(), userId, null, fp.getLastViewedAt()))
      .filter(java.util.Objects::nonNull)
      .toList();
  long totalItems = footprints.countByIdUserId(userId);
  long totalPages = totalItems == 0 ? 0 : (long) Math.ceil((double) totalItems / ps);
  ...
}
```

| 代码 | 解释 |
|------|------|
| findByIdUserIdOrderByLastViewedAtDesc | 最近浏览的在前 |
| toDto(p, userId, null, lastViewedAt) | lastViewedAt 从足迹中取 |

---

## 4. 接口契约

### 收藏

```http
POST /api/v1/posts/post_xxx/favorite
X-User-Id: u_xxx  # 必填

响应：200 OK
```

### 取消收藏

```http
DELETE /api/v1/posts/post_xxx/favorite
X-User-Id: u_xxx  # 必填

响应：200 OK
```

### 收藏列表

```http
GET /api/v1/favorites?page[number]=1&page[size]=20
X-User-Id: u_xxx  # 必填

响应：
{
  "requestId": "xxx",
  "data": {
    "items": [...],
    "page": {
      "number": 1,
      "size": 20,
      "totalItems": 100,
      "totalPages": 5
    }
  }
}
```

### 足迹列表

```http
GET /api/v1/footprints?page[number]=1&page[size]=20
X-User-Id: u_xxx  # 必填

响应：
{
  "requestId": "xxx",
  "data": {
    "items": [...],
    "page": {
      "number": 1,
      "size": 20,
      "totalItems": 100,
      "totalPages": 5
    }
  }
}
```

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 帖子被删除后，收藏/足迹记录还在，但列表会过滤掉
- 没有清空足迹/收藏数量限制

---

## 6. 常见问题与踩坑经验

### 6.1 为什么收藏列表的 favorited 固定为 true？

答：
- 因为是收藏列表，所以所有帖子都是已收藏的，不需要再查询

---

## 7. 可演进方向

### 7.1 清空足迹/收藏

支持清空足迹或清空收藏。

### 7.2 足迹/收藏数量限制

限制用户最多保留多少条足迹或收藏。

---

## 8. 小结

收藏与足迹 API 模块详细介绍了：
1. 收藏与取消收藏（幂等）
2. 收藏列表（按收藏时间倒序）
3. 足迹列表（按浏览时间倒序）
4. 完整分页元数据（totalItems/totalPages）

接下来我们看评论 API！

---

## 9. 页内导航

- 所属模块：[内容服务模块索引](./00-index.md)
- 上一篇：[帖子查询与点赞 API 详解](./02-posts-api.md)
- 下一篇：[评论 API 详解](./04-comments-api.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
