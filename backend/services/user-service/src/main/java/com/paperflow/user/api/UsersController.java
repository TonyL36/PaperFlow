package com.paperflow.user.api;

import com.paperflow.user.api.Envelope.Link;
import com.paperflow.user.api.dto.UpdateProfileRequest;
import com.paperflow.user.api.dto.UserProfileResponse;
import com.paperflow.user.domain.UserEntity;
import com.paperflow.user.repo.UserRepository;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users")
public class UsersController {
  private final UserRepository users;

  public UsersController(UserRepository users) {
    this.users = users;
  }

  @GetMapping("/me")
  public ResponseEntity<Envelope<UserProfileResponse>> me(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_MISSING_TOKEN", "Missing user identity", java.util.Map.of()));
    }
    UserEntity u = users.findById(userId)
        .orElse(null);
    if (u == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
    }
    UserProfileResponse profile = new UserProfileResponse(u.getId(), u.getEmail(), u.getDisplayName(), List.of(u.getRoles().split(",")));
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        profile,
        List.of(new Link("self", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
    ));
  }

  @PatchMapping("/me")
  public ResponseEntity<Envelope<UserProfileResponse>> updateMe(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @Valid @RequestBody UpdateProfileRequest req
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_MISSING_TOKEN", "Missing user identity", java.util.Map.of()));
    }
    UserEntity u = users.findById(userId)
        .orElse(null);
    if (u == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
    }
    u.setDisplayName(req.displayName());
    u.setUpdatedAt(OffsetDateTime.now());
    users.save(u);

    UserProfileResponse profile = new UserProfileResponse(u.getId(), u.getEmail(), u.getDisplayName(), List.of(u.getRoles().split(",")));
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        profile,
        List.of(new Link("self", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
    ));
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}

