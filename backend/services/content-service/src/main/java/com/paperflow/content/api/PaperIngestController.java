package com.paperflow.content.api;

import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.PaperIngestRequest;
import com.paperflow.content.api.dto.PostResponse;
import com.paperflow.content.config.DemoIngestProperties;
import com.paperflow.content.domain.PostEntity;
import com.paperflow.content.repo.PostRepository;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping
public class PaperIngestController {
  private final DemoIngestProperties demoIngestProperties;
  private final PostRepository posts;

  public PaperIngestController(DemoIngestProperties demoIngestProperties, PostRepository posts) {
    this.demoIngestProperties = demoIngestProperties;
    this.posts = posts;
  }

  @PostMapping("/papers/ingest")
  public ResponseEntity<Envelope<PostResponse>> ingestByUser(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @Valid @RequestBody PaperIngestRequest req
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
    }
    PostEntity saved = upsert(req, userId);
    return ResponseEntity.status(201).body(Envelope.ok(
        safeRequestId(requestId),
        toDto(saved),
        List.of(new Link("self", "/api/v1/posts/" + saved.getId(), Optional.of("GET"), Optional.empty()))
    ));
  }

  @PostMapping("/internal/agent/papers")
  public ResponseEntity<Envelope<PostResponse>> ingestByAgent(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-Demo-Ingest-Token", required = false) String token,
      @Valid @RequestBody PaperIngestRequest req
  ) {
    if (!demoIngestProperties.isEnabled()) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Endpoint not enabled", java.util.Map.of()));
    }
    String expected = demoIngestProperties.getToken();
    if (expected != null && !expected.isBlank()) {
      if (token == null || token.isBlank() || !expected.equals(token)) {
        return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Forbidden", java.util.Map.of()));
      }
    }
    PostEntity saved = upsert(req, normalizeUserId(req.userId()));
    return ResponseEntity.status(201).body(Envelope.ok(
        safeRequestId(requestId),
        toDto(saved),
        List.of(new Link("self", "/api/v1/posts/" + saved.getId(), Optional.of("GET"), Optional.empty()))
    ));
  }

  private PostEntity upsert(PaperIngestRequest req, String authorUserId) {
    String postId = normalizePostId(req.postId());
    PostEntity existing = posts.findById(postId).orElse(null);
    if (existing != null) {
      existing.setTitle(req.title());
      existing.setSource(req.source());
      existing.setAuthorUserId(authorUserId);
      existing.setPublishedAt(req.publishedAt() == null ? existing.getPublishedAt() : req.publishedAt());
      existing.setContent(buildPostContent(req));
      return posts.save(existing);
    }
    PostEntity entity = new PostEntity();
    entity.setId(postId);
    entity.setTitle(req.title());
    entity.setSource(req.source());
    entity.setAuthorUserId(authorUserId);
    entity.setPublishedAt(req.publishedAt() == null ? OffsetDateTime.now() : req.publishedAt());
    entity.setContent(buildPostContent(req));
    return posts.save(entity);
  }

  private String buildPostContent(PaperIngestRequest req) {
    StringBuilder builder = new StringBuilder();
    builder.append(req.content().trim());
    if (req.paperId() != null && !req.paperId().isBlank()) {
      builder.append("\n\n## Paper ID\n").append(req.paperId().trim());
    }
    List<String> formatLines = new ArrayList<>();
    if (req.formats() != null) {
      for (PaperIngestRequest.PaperFormat f : req.formats()) {
        if (f == null || f.type() == null || f.url() == null) {
          continue;
        }
        String type = f.type().trim().toUpperCase(Locale.ROOT);
        String url = f.url().trim();
        if (type.isBlank() || url.isBlank()) {
          continue;
        }
        formatLines.add("- " + type + ": " + url);
      }
    }
    if (!formatLines.isEmpty()) {
      builder.append("\n\n## Formats\n").append(String.join("\n", formatLines));
    }
    List<String> highlightLines = new ArrayList<>();
    if (req.highlights() != null) {
      for (PaperIngestRequest.PaperHighlight h : req.highlights()) {
        if (h == null || h.snippet() == null || h.snippet().isBlank()) {
          continue;
        }
        String title = h.title() == null || h.title().isBlank() ? "高亮片段" : h.title().trim();
        String level = h.level() == null || h.level().isBlank() ? "" : "（" + h.level().trim() + "）";
        String page = h.page() == null ? "" : " 第" + h.page() + "页";
        highlightLines.add("- " + title + level + page + "：" + h.snippet().trim());
      }
    }
    if (!highlightLines.isEmpty()) {
      builder.append("\n\n## Highlights\n").append(String.join("\n", highlightLines));
    }
    if (req.tags() != null && !req.tags().isEmpty()) {
      List<String> tags = req.tags().stream().filter(it -> it != null && !it.isBlank()).map(String::trim).toList();
      if (!tags.isEmpty()) {
        builder.append("\n\n## Tags\n").append(String.join(" ", tags.stream().map(it -> "#" + it).toList()));
      }
    }
    String content = builder.toString().trim();
    if (content.length() <= 20000) {
      return content;
    }
    return content.substring(0, 20000);
  }

  private String normalizePostId(String raw) {
    if (raw == null || raw.isBlank()) {
      return "post_paper_" + UUID.randomUUID().toString().replace("-", "");
    }
    return raw.trim();
  }

  private String normalizeUserId(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    return raw.trim();
  }

  private PostResponse toDto(PostEntity p) {
    return new PostResponse(p.getId(), p.getTitle(), p.getContent(), p.getSource(), p.getPublishedAt(), p.getCommentModerationEnabled(), null, null, null, null);
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
