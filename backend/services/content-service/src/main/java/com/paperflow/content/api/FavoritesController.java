package com.paperflow.content.api;

import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.PostResponse;
import com.paperflow.content.domain.PostFavoriteEntity;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FavoritesController {
  private final PostRepository posts;
  private final PostFavoriteRepository favorites;
  private final PostFootprintRepository footprints;

  public FavoritesController(PostRepository posts, PostFavoriteRepository favorites, PostFootprintRepository footprints) {
    this.posts = posts;
    this.favorites = favorites;
    this.footprints = footprints;
  }

  @PostMapping("/posts/{postId}/favorite")
  public ResponseEntity<Envelope<Object>> favorite(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @PathVariable("postId") String postId
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
    }
    if (!posts.existsById(postId)) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Post not found", java.util.Map.of()));
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
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of(), List.of()));
  }

  @DeleteMapping("/posts/{postId}/favorite")
  public ResponseEntity<Envelope<Object>> unfavorite(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @PathVariable("postId") String postId
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
    }
    favorites.deleteById(new UserPostKey(userId, postId));
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of(), List.of()));
  }

  @GetMapping("/favorites")
  public ResponseEntity<Envelope<Object>> listFavorites(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
      @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
    }
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<PostResponse> items = favorites.findByIdUserIdOrderByCreatedAtDesc(userId, PageRequest.of(pn - 1, ps)).stream()
        .map(PostFavoriteEntity::getPost)
        .filter(java.util.Objects::nonNull)
        .map(p -> toDto(p, true, null))
        .toList();
    long totalItems = favorites.countByIdUserId(userId);
    long totalPages = totalItems == 0 ? 0 : (long) Math.ceil((double) totalItems / ps);

    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps, "totalItems", totalItems, "totalPages", totalPages));
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/favorites?page[number]=" + pn + "&page[size]=" + ps, Optional.of("GET"), Optional.empty()))
    ));
  }

  @GetMapping("/footprints")
  public ResponseEntity<Envelope<Object>> listFootprints(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
      @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
    }
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<PostResponse> items = footprints.findByIdUserIdOrderByLastViewedAtDesc(userId, PageRequest.of(pn - 1, ps)).stream()
        .map(fp -> toDto(fp.getPost(), null, fp.getLastViewedAt()))
        .filter(java.util.Objects::nonNull)
        .toList();
    long totalItems = footprints.countByIdUserId(userId);
    long totalPages = totalItems == 0 ? 0 : (long) Math.ceil((double) totalItems / ps);

    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps, "totalItems", totalItems, "totalPages", totalPages));
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/footprints?page[number]=" + pn + "&page[size]=" + ps, Optional.of("GET"), Optional.empty()))
    ));
  }

  private PostResponse toDto(PostEntity p, Boolean favorited, OffsetDateTime lastViewedAt) {
    if (p == null) {
      return null;
    }
    return new PostResponse(p.getId(), p.getTitle(), p.getContent(), p.getSource(), p.getPublishedAt(), p.getCommentModerationEnabled(), favorited, lastViewedAt);
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
