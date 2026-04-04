package com.paperflow.content.api;

import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.CommentResponse;
import com.paperflow.content.api.dto.CreateCommentRequest;
import com.paperflow.content.domain.CommentLikeEntity;
import com.paperflow.content.domain.CommentEntity;
import com.paperflow.content.domain.PostEntity;
import com.paperflow.content.domain.UserCommentKey;
import com.paperflow.content.repo.CommentLikeRepository;
import com.paperflow.content.repo.CommentRepository;
import com.paperflow.content.repo.PostLikeRepository;
import com.paperflow.content.repo.PostRepository;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/comments")
public class CommentsController {
  private final CommentRepository comments;
  private final PostRepository posts;
  private final CommentLikeRepository commentLikes;
  private final PostLikeRepository postLikes;

  public CommentsController(CommentRepository comments, PostRepository posts, CommentLikeRepository commentLikes, PostLikeRepository postLikes) {
    this.comments = comments;
    this.posts = posts;
    this.commentLikes = commentLikes;
    this.postLikes = postLikes;
  }

  @GetMapping
  public ResponseEntity<Envelope<Object>> list(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestParam("postId") String postId,
      @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
      @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
  ) {
    if (!posts.existsById(postId)) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Post not found", java.util.Map.of()));
    }
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<CommentEntity> roots = comments.listRootsByPost(postId, "APPROVED", PageRequest.of(pn - 1, ps));
    List<String> rootIds = roots.stream().map(CommentEntity::getId).toList();
    List<CommentEntity> replies = rootIds.isEmpty() ? List.of() : comments.listRepliesByPostAndParents(postId, "APPROVED", rootIds);
    Map<String, List<CommentEntity>> repliesByParent = new LinkedHashMap<>();
    for (CommentEntity reply : replies) {
      String parentId = reply.getParentCommentId();
      if (parentId == null || parentId.isBlank()) {
        continue;
      }
      repliesByParent.computeIfAbsent(parentId, ignored -> new ArrayList<>()).add(reply);
    }
    List<CommentResponse> items = roots.stream()
        .map(root -> toDto(root, userId, repliesByParent.getOrDefault(root.getId(), List.of())))
        .toList();

    var data = new LinkedHashMap<String, Object>();
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
    PostEntity post = posts.findById(req.postId()).orElse(null);
    if (post == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Post not found", java.util.Map.of()));
    }

    String parentCommentId = req.parentCommentId() == null || req.parentCommentId().isBlank() ? null : req.parentCommentId().trim();
    if (parentCommentId != null) {
      CommentEntity parent = comments.findById(parentCommentId).orElse(null);
      if (parent == null || !req.postId().equals(parent.getPostId())) {
        return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Parent comment not found", java.util.Map.of()));
      }
      if (parent.getParentCommentId() != null && !parent.getParentCommentId().isBlank()) {
        return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "Only two-level comments are supported", java.util.Map.of()));
      }
    }

    CommentEntity c = new CommentEntity();
    c.setId("c_" + UUID.randomUUID().toString().replace("-", ""));
    c.setPostId(req.postId());
    c.setUserId(userId);
    c.setContent(req.content());
    c.setParentCommentId(parentCommentId);
    c.setStatus(Boolean.FALSE.equals(post.getCommentModerationEnabled()) ? "APPROVED" : "PENDING");
    c.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
    comments.save(c);

    return ResponseEntity.status(201).body(Envelope.ok(
        safeRequestId(requestId),
        toLeafDto(c, userId),
        List.of(new Link("self", "/api/v1/comments?postId=" + req.postId(), Optional.of("GET"), Optional.empty()))
    ));
  }

  @PostMapping("/{commentId}/like")
  public ResponseEntity<Envelope<Object>> like(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @PathVariable("commentId") String commentId
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
    }
    if (!comments.existsById(commentId)) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Comment not found", java.util.Map.of()));
    }
    UserCommentKey key = new UserCommentKey(userId, commentId);
    CommentLikeEntity like = commentLikes.findById(key).orElse(null);
    if (like == null) {
      like = new CommentLikeEntity();
      like.setId(key);
      like.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
      commentLikes.save(like);
    }
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of(), List.of()));
  }

  @DeleteMapping("/{commentId}/like")
  public ResponseEntity<Envelope<Object>> unlike(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @PathVariable("commentId") String commentId
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
    }
    commentLikes.deleteById(new UserCommentKey(userId, commentId));
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of(), List.of()));
  }

  @GetMapping("/users/{userId}/card")
  public ResponseEntity<Envelope<Object>> userCard(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @PathVariable("userId") String userId
  ) {
    String normalized = userId == null ? "" : userId.trim();
    if (normalized.isBlank()) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "userId is required", java.util.Map.of()));
    }
    long postCount = posts.countByAuthorUserId(normalized);
    long receivedLikeCount = postLikes.countReceivedByAuthorUserId(normalized) + commentLikes.countReceivedByCommentAuthorUserId(normalized);
    var data = java.util.Map.of(
        "userId", normalized,
        "displayName", displayName(normalized),
        "postCount", postCount,
        "receivedLikeCount", receivedLikeCount
    );
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), data, List.of()));
  }

  private CommentResponse toDto(CommentEntity c, String userId, List<CommentEntity> replies) {
    List<CommentResponse> replyDtos = replies.stream().map(reply -> toLeafDto(reply, userId)).toList();
    return new CommentResponse(
        c.getId(),
        c.getPostId(),
        c.getUserId(),
        c.getContent(),
        c.getStatus(),
        c.getParentCommentId(),
        commentLikes.countByIdCommentId(c.getId()),
        liked(userId, c.getId()),
        replyDtos,
        c.getCreatedAt()
    );
  }

  private CommentResponse toLeafDto(CommentEntity c, String userId) {
    return new CommentResponse(
        c.getId(),
        c.getPostId(),
        c.getUserId(),
        c.getContent(),
        c.getStatus(),
        c.getParentCommentId(),
        commentLikes.countByIdCommentId(c.getId()),
        liked(userId, c.getId()),
        List.of(),
        c.getCreatedAt()
    );
  }

  private Boolean liked(String userId, String commentId) {
    if (userId == null || userId.isBlank()) {
      return null;
    }
    return commentLikes.existsByIdUserIdAndIdCommentId(userId, commentId);
  }

  private String displayName(String userId) {
    if (userId.startsWith("u_") && userId.length() > 2) {
      return userId.substring(2);
    }
    return userId;
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
