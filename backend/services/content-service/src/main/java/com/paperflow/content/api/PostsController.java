package com.paperflow.content.api;

import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.PostResponse;
import com.paperflow.content.domain.PostFootprintEntity;
import com.paperflow.content.domain.PostEntity;
import com.paperflow.content.domain.UserPostKey;
import com.paperflow.content.repo.PostFavoriteRepository;
import com.paperflow.content.repo.PostFootprintRepository;
import com.paperflow.content.repo.PostRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/posts")
public class PostsController {
  private final PostRepository posts;
  private final PostFootprintRepository footprints;
  private final PostFavoriteRepository favorites;

  public PostsController(PostRepository posts, PostFootprintRepository footprints, PostFavoriteRepository favorites) {
    this.posts = posts;
    this.footprints = footprints;
    this.favorites = favorites;
  }

  @GetMapping
  public ResponseEntity<Envelope<Object>> list(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
      @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
  ) {
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<PostResponse> items = posts.listRecent(PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();

    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps));

    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/posts?page[number]=" + pn + "&page[size]=" + ps, Optional.of("GET"), Optional.empty()))
    ));
  }

  @GetMapping("/{postId}")
  public ResponseEntity<Envelope<PostResponse>> get(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @PathVariable("postId") String postId
  ) {
    PostEntity p = posts.findById(postId).orElse(null);
    if (p == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Post not found", java.util.Map.of()));
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
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        toDto(p, favorited, lastViewedAt),
        List.of(new Link("self", "/api/v1/posts/" + postId, Optional.of("GET"), Optional.empty()))
    ));
  }

  private PostResponse toDto(PostEntity p) {
    return new PostResponse(p.getId(), p.getTitle(), p.getContent(), p.getSource(), p.getPublishedAt(), null, null);
  }

  private PostResponse toDto(PostEntity p, Boolean favorited, OffsetDateTime lastViewedAt) {
    return new PostResponse(p.getId(), p.getTitle(), p.getContent(), p.getSource(), p.getPublishedAt(), favorited, lastViewedAt);
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
