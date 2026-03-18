package com.paperflow.content.api;

import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.CommentResponse;
import com.paperflow.content.api.dto.CreateCommentRequest;
import com.paperflow.content.domain.CommentEntity;
import com.paperflow.content.repo.CommentRepository;
import com.paperflow.content.repo.PostRepository;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
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

  public CommentsController(CommentRepository comments, PostRepository posts) {
    this.comments = comments;
    this.posts = posts;
  }

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

  private CommentResponse toDto(CommentEntity c) {
    return new CommentResponse(c.getId(), c.getPostId(), c.getUserId(), c.getContent(), c.getStatus(), c.getCreatedAt());
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}

