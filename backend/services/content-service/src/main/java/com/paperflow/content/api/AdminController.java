package com.paperflow.content.api;

import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.CommentResponse;
import com.paperflow.content.api.dto.UpdateCommentStatusRequest;
import com.paperflow.content.api.dto.UpdatePostCommentModerationRequest;
import com.paperflow.content.domain.CommentEntity;
import com.paperflow.content.domain.PostEntity;
import com.paperflow.content.repo.CommentRepository;
import com.paperflow.content.repo.PostRepository;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin")
public class AdminController {
  private final CommentRepository comments;
  private final PostRepository posts;

  public AdminController(CommentRepository comments, PostRepository posts) {
    this.comments = comments;
    this.posts = posts;
  }

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
      @PathVariable("commentId") String commentId,
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

  @PatchMapping("/posts/{postId}/comment-moderation")
  public ResponseEntity<Envelope<Object>> updatePostCommentModeration(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles,
      @PathVariable("postId") String postId,
      @Valid @RequestBody UpdatePostCommentModerationRequest req
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", java.util.Map.of()));
    }
    PostEntity post = posts.findById(postId).orElse(null);
    if (post == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Post not found", java.util.Map.of()));
    }
    post.setCommentModerationEnabled(req.commentModerationEnabled());
    posts.save(post);
    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("postId", post.getId());
    data.put("commentModerationEnabled", post.getCommentModerationEnabled());
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/admin/posts/" + postId + "/comment-moderation", Optional.of("PATCH"), Optional.empty()))
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

  private CommentResponse toDto(CommentEntity c) {
    return new CommentResponse(
        c.getId(),
        c.getPostId(),
        c.getUserId(),
        c.getContent(),
        c.getStatus(),
        c.getParentCommentId(),
        null,
        null,
        List.of(),
        c.getCreatedAt()
    );
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
