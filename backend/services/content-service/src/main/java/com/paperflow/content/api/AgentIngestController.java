package com.paperflow.content.api;

import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.IngestPostRequest;
import com.paperflow.content.api.dto.PostResponse;
import com.paperflow.content.config.DemoIngestProperties;
import com.paperflow.content.domain.PostEntity;
import com.paperflow.content.repo.PostRepository;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/agent")
public class AgentIngestController {
  private final DemoIngestProperties props;
  private final PostRepository posts;

  public AgentIngestController(DemoIngestProperties props, PostRepository posts) {
    this.props = props;
    this.posts = posts;
  }

  @PostMapping("/posts")
  public ResponseEntity<Envelope<PostResponse>> ingestPost(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-Demo-Ingest-Token", required = false) String token,
      @Valid @RequestBody IngestPostRequest req
  ) {
    if (!props.isEnabled()) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Endpoint not enabled", java.util.Map.of()));
    }
    String expected = props.getToken();
    if (expected != null && !expected.isBlank()) {
      if (token == null || token.isBlank() || !expected.equals(token)) {
        return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Forbidden", java.util.Map.of()));
      }
    }

    String postId = normalizePostId(req.postId());
    PostEntity existing = posts.findById(postId).orElse(null);
    if (existing != null) {
      return ResponseEntity.ok(Envelope.ok(
          safeRequestId(requestId),
          toDto(existing),
          List.of(new Link("self", "/api/v1/posts/" + existing.getId(), Optional.of("GET"), Optional.empty()))
      ));
    }

    PostEntity p = new PostEntity();
    p.setId(postId);
    p.setTitle(req.title());
    p.setContent(req.content());
    p.setSource(req.source());
    p.setPublishedAt(req.publishedAt() == null ? OffsetDateTime.now() : req.publishedAt());
    posts.save(p);

    return ResponseEntity.status(201).body(Envelope.ok(
        safeRequestId(requestId),
        toDto(p),
        List.of(new Link("self", "/api/v1/posts/" + p.getId(), Optional.of("GET"), Optional.empty()))
    ));
  }

  private String normalizePostId(String raw) {
    if (raw == null || raw.isBlank()) {
      return "post_demo_" + UUID.randomUUID().toString().replace("-", "");
    }
    return raw.trim();
  }

  private PostResponse toDto(PostEntity p) {
    return new PostResponse(p.getId(), p.getTitle(), p.getContent(), p.getSource(), p.getPublishedAt(), null, null);
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
