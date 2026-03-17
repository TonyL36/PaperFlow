package com.paperflow.user.api;

import com.paperflow.user.api.Envelope.Link;
import com.paperflow.user.api.dto.AdminUserResponse;
import com.paperflow.user.api.dto.UpdateUserRequest;
import com.paperflow.user.domain.UserEntity;
import com.paperflow.user.repo.RefreshTokenRepository;
import com.paperflow.user.repo.UserRepository;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/users")
public class AdminUsersController {
  private final UserRepository users;
  private final RefreshTokenRepository refreshTokens;

  public AdminUsersController(UserRepository users, RefreshTokenRepository refreshTokens) {
    this.users = users;
    this.refreshTokens = refreshTokens;
  }

  @GetMapping
  public ResponseEntity<Envelope<Object>> list(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles,
      @RequestParam(value = "q", required = false) String q,
      @RequestParam(value = "status", required = false) String status,
      @RequestParam(value = "role", required = false) String role,
      @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
      @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", java.util.Map.of()));
    }
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<AdminUserResponse> items = users.search(q, status, role, PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();
    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps));
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/admin/users?page[number]=" + pn + "&page[size]=" + ps, Optional.of("GET"), Optional.empty()))
    ));
  }

  @GetMapping("/{userId}")
  public ResponseEntity<Envelope<AdminUserResponse>> get(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles,
      @PathVariable("userId") String userId
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", java.util.Map.of()));
    }
    UserEntity u = users.findById(userId).orElse(null);
    if (u == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
    }
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        toDto(u),
        List.of(new Link("self", "/api/v1/admin/users/" + userId, Optional.of("GET"), Optional.empty()))
    ));
  }

  @PatchMapping("/{userId}")
  public ResponseEntity<Envelope<AdminUserResponse>> update(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles,
      @PathVariable("userId") String userId,
      @RequestBody UpdateUserRequest req
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", java.util.Map.of()));
    }
    UserEntity u = users.findById(userId).orElse(null);
    if (u == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
    }
    if (req != null) {
      if (req.displayName() != null && !req.displayName().isBlank()) {
        u.setDisplayName(req.displayName().trim());
      }
      if (req.roles() != null) {
        String normalized = normalizeRoles(req.roles());
        if (normalized.isBlank()) {
          return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_VALIDATION_FAILED", "roles must not be empty", java.util.Map.of()));
        }
        u.setRoles(normalized);
      }
      if (req.status() != null && !req.status().isBlank()) {
        String s = req.status().trim().toUpperCase(Locale.ROOT);
        if (!s.equals("ACTIVE") && !s.equals("DISABLED")) {
          return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_VALIDATION_FAILED", "invalid status", java.util.Map.of()));
        }
        u.setStatus(s);
      }
    }
    u.setUpdatedAt(java.time.OffsetDateTime.now());
    users.save(u);
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        toDto(u),
        List.of(new Link("self", "/api/v1/admin/users/" + userId, Optional.of("PATCH"), Optional.empty()))
    ));
  }

  @PostMapping("/{userId}/revoke-tokens")
  public ResponseEntity<Envelope<Object>> revokeTokens(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles,
      @PathVariable("userId") String userId
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", java.util.Map.of()));
    }
    if (users.existsById(userId)) {
      refreshTokens.revokeAllForUser(userId);
    }
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of(), List.of()));
  }

  private AdminUserResponse toDto(UserEntity u) {
    List<String> roles = List.of((u.getRoles() == null ? "" : u.getRoles()).split(",")).stream().map(String::trim).filter(s -> !s.isBlank()).toList();
    return new AdminUserResponse(u.getId(), u.getEmail(), u.getDisplayName(), roles, u.getStatus(), u.getCreatedAt(), u.getUpdatedAt());
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

  private String normalizeRoles(List<String> roles) {
    if (roles == null) {
      return "";
    }
    java.util.LinkedHashSet<String> s = new java.util.LinkedHashSet<>();
    for (String r : roles) {
      if (r == null) continue;
      String t = r.trim().toUpperCase(Locale.ROOT);
      if (t.isBlank()) continue;
      if (!t.equals("USER") && !t.equals("ADMIN")) {
        continue;
      }
      s.add(t);
    }
    if (s.isEmpty()) {
      return "";
    }
    return String.join(",", s);
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}

