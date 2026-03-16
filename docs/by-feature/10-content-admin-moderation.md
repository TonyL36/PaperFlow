# 10 内容服务：评论管理（审核 / 驳回）

## 功能目标

- 提供最小可运行“管理闭环”：
  - 管理员查看待审核评论列表
  - 管理员将评论置为 `APPROVED` 或 `REJECTED`
- 管理权限判定最小化：
  - 网关从 JWT 解析 `roles` 并注入 `X-User-Roles`
  - 内容服务按 `ADMIN` 角色判断

## API 概览

- `GET /api/v1/admin/comments?status=PENDING&page[number]=1&page[size]=20`（需要 ADMIN）
- `PATCH /api/v1/admin/comments/{commentId}`（需要 ADMIN）

## 关键代码原文 + 解读

代码位置：[AdminController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/AdminController.java)

```java
@RestController
@RequestMapping("/admin")
public class AdminController {
  @GetMapping("/comments")
  public ResponseEntity<Envelope<Object>> listComments(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles,
      @RequestParam(value = "status", required = false, defaultValue = "PENDING") String status,
      @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
      @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", java.util.Map.of()));
    }
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<CommentResponse> items = comments.listByStatus(status, PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();
    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps));
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/admin/comments?status=" + status, Optional.of("GET"), Optional.empty()))
    ));
  }

  @PatchMapping("/comments/{commentId}")
  public ResponseEntity<Envelope<CommentResponse>> updateCommentStatus(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles,
      @PathVariable String commentId,
      @Valid @RequestBody UpdateCommentStatusRequest req
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", java.util.Map.of()));
    }
    CommentEntity c = comments.findById(commentId).orElse(null);
    if (c == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Comment not found", java.util.Map.of()));
    }
    c.setStatus(req.status());
    comments.save(c);
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        toDto(c),
        List.of(new Link("self", "/api/v1/admin/comments/" + commentId, Optional.of("PATCH"), Optional.empty()))
    ));
  }

  private boolean isAdmin(String roles) {
    if (roles == null || roles.isBlank()) {
      return false;
    }
    for (String r : roles.split(",")) {
      if ("ADMIN".equalsIgnoreCase(r.trim())) {
        return true;
      }
    }
    return false;
  }
}
```

逐段解释：

- 权限检查：`isAdmin(roles)`
  - `roles` 来自网关注入的 `X-User-Roles`
  - 这里用字符串 split 判断 `ADMIN`
  - 若不满足：返回 `403 AUTH_FORBIDDEN`
- 列表接口：
  - `status` 默认 `PENDING`，前端管理页默认就能看到待审列表
  - 分页策略同 posts/comments
- 更新接口：
  - 先查 comment 是否存在，不存在返回 `404`
  - 再更新状态为 `APPROVED` 或 `REJECTED`（由 DTO 校验约束）

## 演进方向

- 更严格的权限模型：把角色/权限迁移到用户服务并由网关统一鉴权策略控制
- 审核审计：记录审核人、审核时间、原因（合规需求）
- 管理端 UI：React 增加 `/admin/comments` 页面（列表 + 快捷审核按钮）
