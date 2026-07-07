# 帖子查询与点赞 API 详解

## 1. 背景与目标

### 与前序模块的关系

- 依赖网关的 X-Request-Id（统一错误处理）
- 依赖网关的 X-User-Id（身份透传，用于个性化字段、点赞、足迹）

### 为什么要做这些 API

- 给 React SPA 提供“每日更新”页面的数据源
- 支持分页查询最近帖子（倒序）
- 支持按 postId 查询单条详情
- 支持帖子点赞/取消点赞
- 登录态下返回个性化字段（liked/favorited/lastViewedAt）

### 功能目标

1. GET /api/v1/posts：分页帖子列表
2. GET /api/v1/posts/{postId}：帖子详情（自动记录足迹）
3. POST /api/v1/posts/{postId}/like：点赞（需要登录）
4. DELETE /api/v1/posts/{postId}/like：取消点赞（需要登录）

---

## 2. 架构与流程设计

### 整体流程

```
GET /posts：
1. 从 X-User-Id 获取当前用户（可选）
2. 查询最近帖子，分页
3. 为每个帖子计算 liked 状态（如果登录）
4. 返回列表 + 分页元数据

GET /posts/{postId}：
1. 查询帖子是否存在
2. 若登录：
   a. upsert 足迹（更新 lastViewedAt）
   b. 计算 favorited 状态
3. 返回详情 + liked/favorited/lastViewedAt

POST /posts/{postId}/like：
1. 检查登录（X-User-Id 必须有）
2. 检查帖子是否存在
3. 幂等：已点赞则不重复创建
4. 返回成功

DELETE /posts/{postId}/like：
1. 检查登录
2. 删除点赞记录（不存在也返回成功）
```

### 关键决策点

| 问题 | 决策 | 理由 |
|------|------|------|
| 登录检查 | 检查 X-User-Id 是否存在 | 网关已经解析好了，直接用 |
| 点赞幂等 | 已存在则不重复创建 | 用户重复点击不会报错 |
| 足迹记录 | 访问详情时自动 upsert | 简化前端调用 |
| 分页 | 从 1 开始，服务端转 PageRequest.of(pn-1, ps) | 前端习惯从 1 开始 |
| 个性化字段 | 未登录为 null，登录后计算 | 统一字段结构 |

---

## 3. 核心代码详解

### 3.1 PostsController 完整代码

**文件位置：** [PostsController.java](file:///F:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/PostsController.java#L28-L174)

```java
@RestController
@RequestMapping("/posts")
public class PostsController {
  private final PostRepository posts;
  private final PostFootprintRepository footprints;
  private final PostFavoriteRepository favorites;
  private final PostLikeRepository likes;

  @GetMapping
  public ResponseEntity<Envelope<Object>> list(...) { ... }

  @GetMapping("/{postId}")
  public ResponseEntity<Envelope<PostResponse>> get(...) { ... }

  @PostMapping("/{postId}/like")
  public ResponseEntity<Envelope<Object>> like(...) { ... }

  @DeleteMapping("/{postId}/like")
  public ResponseEntity<Envelope<Object>> unlike(...) { ... }
}
```

### 3.2 核心代码逐段解析

#### 3.2.1 帖子列表

```java
@GetMapping
public ResponseEntity<Envelope<Object>> list(
    @RequestHeader(value = "X-Request-Id", required = false) String requestId,
    @RequestHeader(value = "X-User-Id", required = false) String userId,
    @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
    @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
) {
  int pn = Math.max(1, pageNumber);
  int ps = Math.min(200, Math.max(1, pageSize));
  List<PostResponse> items = posts.listRecent(PageRequest.of(pn - 1, ps)).stream().map(p -> toDto(p, userId)).toList();

  var data = new java.util.LinkedHashMap<String, Object>();
  data.put("items", items);
  data.put("page", java.util.Map.of("number", pn, "size", ps));

  return ResponseEntity.ok(Envelope.ok(...));
}
```

| 代码 | 解释 |
|------|------|
| X-User-Id | 可选，用于计算 liked 状态 |
| page[number]/page[size] | 分页参数，前端友好 |
| Math.min(200, ...) | 防止无界查询 |
| PageRequest.of(pn - 1, ps) | Spring Data JPA 分页从 0 开始 |

#### 3.2.2 帖子详情（含足迹）

```java
@GetMapping("/{postId}")
public ResponseEntity<Envelope<PostResponse>> get(
    @RequestHeader(value = "X-Request-Id", required = false) String requestId,
    @RequestHeader(value = "X-User-Id", required = false) String userId,
    @PathVariable("postId") String postId
) {
  PostEntity p = posts.findById(postId).orElse(null);
  if (p == null) {
    return ResponseEntity.status(404).body(...);
  }
  Boolean favorited = null;
  OffsetDateTime lastViewedAt = null;
  if (userId != null && !userId.isBlank()) {
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    lastViewedAt = now;
    UserPostKey key = new UserPostKey(userId, postId);
    PostFootprintEntity fp = footprints.findById(key).orElse(null);
    if (fp == null) {
      fp = new PostFootprintEntity();
      fp.setId(key);
    }
    fp.setLastViewedAt(now);
    footprints.save(fp);
    favorited = favorites.existsByIdUserIdAndIdPostId(userId, postId);
  }
  return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), toDto(p, userId, favorited, lastViewedAt), ...));
}
```

| 代码 | 解释 |
|------|------|
| UserPostKey | 复合主键（userId, postId） |
| upsert 足迹 | 存在则更新 lastViewedAt，不存在则创建 |
| favorited | 检查是否已收藏 |

#### 3.2.3 点赞

```java
@PostMapping("/{postId}/like")
public ResponseEntity<Envelope<Object>> like(
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
  PostLikeEntity like = likes.findById(key).orElse(null);
  if (like == null) {
    like = new PostLikeEntity();
    like.setId(key);
    like.setCreatedAt(now);
    likes.save(like);
  }
  return ResponseEntity.ok(Envelope.ok(...));
}
```

| 代码 | 解释 |
|------|------|
| 幂等 | 已存在的 like 不重复 save |
| 先检查帖子存在 | 避免对不存在的帖子点赞 |

#### 3.2.4 取消点赞

```java
@DeleteMapping("/{postId}/like")
public ResponseEntity<Envelope<Object>> unlike(...) {
  if (userId == null || userId.isBlank()) {
    return ResponseEntity.status(401).body(...);
  }
  likes.deleteById(new UserPostKey(userId, postId));
  return ResponseEntity.ok(Envelope.ok(...));
}
```

| 代码 | 解释 |
|------|------|
| deleteById | 不存在也不会报错，幂等 |

---

## 4. 接口契约

### 帖子列表

```http
GET /api/v1/posts?page[number]=1&page[size]=20
X-Request-Id: xxx
X-User-Id: u_xxx  # 可选

响应：
{
  "requestId": "xxx",
  "data": {
    "items": [
      {
        "id": "post_xxx",
        "title": "...",
        "content": "...",
        "source": "scheduler",
        "publishedAt": "2026-05-27T12:00:00Z",
        "commentModerationEnabled": true,
        "likeCount": 10,
        "liked": true,
        "favorited": null,  # 列表不返回
        "lastViewedAt": null  # 列表不返回
      }
    ],
    "page": {
      "number": 1,
      "size": 20
    }
  },
  "links": [...]
}
```

### 帖子详情

```http
GET /api/v1/posts/post_xxx
X-User-Id: u_xxx  # 可选

响应：
{
  "requestId": "xxx",
  "data": {
    "id": "post_xxx",
    ...,
    "liked": true,
    "favorited": true,  # 详情返回
    "lastViewedAt": "2026-05-27T12:00:00Z"  # 详情返回
  }
}
```

### 点赞

```http
POST /api/v1/posts/post_xxx/like
X-User-Id: u_xxx  # 必填

响应：200 OK
```

### 取消点赞

```http
DELETE /api/v1/posts/post_xxx/like
X-User-Id: u_xxx  # 必填

响应：200 OK
```

---

## 5. 边界与约束

### 5.1 当前实现的边界

- 分页元数据只有 number/size，没有 totalItems/totalPages
- 列表不支持过滤、排序
- likeCount 是实时 count，性能优化空间

---

## 6. 常见问题与踩坑经验

### 6.1 为什么列表不返回 favorited/lastViewedAt？

答：
- 列表查询量大，为每个帖子查询这两个字段性能较差
- 详情页面是更精准的场景，在详情中返回更合适

---

## 7. 可演进方向

### 7.1 增强分页元数据

增加 totalItems/totalPages。

### 7.2 支持过滤与排序

支持按日期范围、source 过滤，按点赞数排序等。

### 7.3 likeCount 缓存

考虑用 Redis 或本地缓存减少实时 count 查询。

---

## 8. 小结

帖子查询与点赞 API 模块详细介绍了：
1. 帖子列表与分页
2. 帖子详情与足迹自动记录
3. 点赞与取消点赞（幂等）
4. 个性化字段（liked/favorited/lastViewedAt）

接下来我们看收藏与足迹 API！

---

## 9. 页内导航

- 所属模块：[内容服务模块索引](./00-index.md)
- 上一篇：[每日帖子保底任务详解](./01-daily-post.md)
- 下一篇：[收藏与足迹 API 详解](./03-favorites-footprints.md)
- 关联阅读：
  - [用户服务索引](../user-service/00-index.md)
  - [前端模块索引](../frontend/00-index.md)
  - [Python Agent 模块索引](../python-agent/00-index.md)
