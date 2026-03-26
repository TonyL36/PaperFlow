# 09 内容服务：评论 API（创建 / 展示）

## 功能目标

- 登录用户可以发表评论
- 未登录用户可以查看“已审核通过”的评论（公开展示）
- 支持分页查询评论列表
- 评论默认进入 `PENDING`，等待管理员审核

## API 概览

- `GET /api/v1/comments?postId=...&page[number]=1&page[size]=20`（公开，只返回 APPROVED）
- `POST /api/v1/comments`（需要登录，创建后为 PENDING）

## 关键代码原文 + 解读

代码位置：[CommentsController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/CommentsController.java)

```java
@RestController
@RequestMapping("/comments")
public class CommentsController {
  @GetMapping
  public ResponseEntity<Envelope<Object>> list(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestParam("postId") String postId,
      @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
      @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
  ) {
    if (!posts.existsById(postId)) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Post not found", java.util.Map.of()));
    }
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<CommentResponse> items = comments.listByPost(postId, "APPROVED", PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();

    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps));

    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/comments?postId=" + postId + "&page[number]=" + pn + "&page[size]=" + ps, Optional.of("GET"), Optional.empty()))
    ));
  }

  @PostMapping
  public ResponseEntity<Envelope<CommentResponse>> create(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @Valid @RequestBody CreateCommentRequest req
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_MISSING_TOKEN", "Missing user identity", java.util.Map.of()));
    }
    if (!posts.existsById(req.postId())) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Post not found", java.util.Map.of()));
    }

    CommentEntity c = new CommentEntity();
    c.setId("c_" + UUID.randomUUID().toString().replace("-", ""));
    c.setPostId(req.postId());
    c.setUserId(userId);
    c.setContent(req.content());
    c.setStatus("PENDING");
    c.setCreatedAt(OffsetDateTime.now());
    comments.save(c);

    return ResponseEntity.status(201).body(Envelope.ok(
        safeRequestId(requestId),
        toDto(c),
        List.of(new Link("self", "/api/v1/comments?postId=" + req.postId(), Optional.of("GET"), Optional.empty()))
    ));
  }
}
```

逐段解释：

- 评论展示（GET）：
  - 必须带 `postId`，先校验帖子存在，避免“孤儿评论”查询
  - 只查询 `APPROVED` 状态，保证公开页面不会直接暴露待审核内容
  - 分页策略同 posts
- 评论创建（POST）：
  - `X-User-Id` 来自网关（JWT → userId）
  - 缺失 userId 返回 401（意味着调用者未登录或绕过网关）
  - 创建后 `status=PENDING`，交给管理端审批
- 这套设计给前端一个稳定心智：
  - 发表评论 ≠ 立即公开
  - 展示区只有 APPROVED

## 演进方向

- 反垃圾：同 IP / 同用户频率限制（可在网关做更细粒度策略）
- 审计：记录 userAgent/ip（注意脱敏与合规）
- 富文本安全：对评论内容做过滤/转义
