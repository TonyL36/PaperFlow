package com.paperflow.user.api;

import com.paperflow.user.api.Envelope.Link;
import com.paperflow.user.api.dto.UpdateProfileRequest;
import com.paperflow.user.api.dto.UserProfileResponse;
import com.paperflow.user.domain.UserEntity;
import com.paperflow.user.repo.UserRepository;
import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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
    UserProfileResponse profile = new UserProfileResponse(
        u.getId(),
        u.getEmail(),
        u.getDisplayName(),
        List.of(u.getRoles().split(",")),
        u.getStatus(),
        u.getAvatarUrl(),
        u.getBio(),
        u.getPhone(),
        u.getEmailVerifiedAt() != null,
        u.getPhoneVerifiedAt() != null,
        u.getQqOpenId() != null && !u.getQqOpenId().isBlank()
    );
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
    u.setAvatarUrl(req.avatarUrl() == null || req.avatarUrl().isBlank() ? null : req.avatarUrl().trim());
    u.setBio(req.bio() == null || req.bio().isBlank() ? null : req.bio().trim());
    u.setUpdatedAt(OffsetDateTime.now());
    users.save(u);

    UserProfileResponse profile = new UserProfileResponse(
        u.getId(),
        u.getEmail(),
        u.getDisplayName(),
        List.of(u.getRoles().split(",")),
        u.getStatus(),
        u.getAvatarUrl(),
        u.getBio(),
        u.getPhone(),
        u.getEmailVerifiedAt() != null,
        u.getPhoneVerifiedAt() != null,
        u.getQqOpenId() != null && !u.getQqOpenId().isBlank()
    );
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        profile,
        List.of(new Link("self", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
    ));
  }

  @PostMapping("/me/avatar")
  public ResponseEntity<Envelope<UserProfileResponse>> uploadAvatar(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestParam("file") MultipartFile file
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_MISSING_TOKEN", "Missing user identity", java.util.Map.of()));
    }
    UserEntity u = users.findById(userId).orElse(null);
    if (u == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
    }
    if (file == null || file.isEmpty()) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "Avatar file is required", java.util.Map.of()));
    }
    if (file.getSize() > 2L * 1024L * 1024L) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "Avatar file too large", java.util.Map.of()));
    }
    String ext = resolveImageExt(file.getContentType(), file.getOriginalFilename());
    if (ext == null) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "Unsupported avatar image type", java.util.Map.of()));
    }
    try {
      Path dir = Path.of(".dev", "uploads", "avatars");
      Files.createDirectories(dir);
      Files.deleteIfExists(dir.resolve(userId + ".png"));
      Files.deleteIfExists(dir.resolve(userId + ".jpg"));
      Files.deleteIfExists(dir.resolve(userId + ".jpeg"));
      Files.deleteIfExists(dir.resolve(userId + ".webp"));
      Path dst = dir.resolve(userId + "." + ext);
      Files.copy(file.getInputStream(), dst, StandardCopyOption.REPLACE_EXISTING);
      u.setAvatarUrl("/api/v1/public/users/avatars/" + userId + "?v=" + System.currentTimeMillis());
      u.setUpdatedAt(OffsetDateTime.now());
      users.save(u);
      UserProfileResponse profile = new UserProfileResponse(
          u.getId(),
          u.getEmail(),
          u.getDisplayName(),
          List.of(u.getRoles().split(",")),
          u.getStatus(),
          u.getAvatarUrl(),
          u.getBio(),
          u.getPhone(),
          u.getEmailVerifiedAt() != null,
          u.getPhoneVerifiedAt() != null,
          u.getQqOpenId() != null && !u.getQqOpenId().isBlank()
      );
      return ResponseEntity.ok(Envelope.ok(
          safeRequestId(requestId),
          profile,
          List.of(new Link("self", "/api/v1/users/me", Optional.of("GET"), Optional.empty()))
      ));
    } catch (IOException e) {
      return ResponseEntity.status(500).body(Envelope.err(safeRequestId(requestId), "SYS_INTERNAL_ERROR", "Failed to save avatar", java.util.Map.of()));
    }
  }

  private String resolveImageExt(String contentType, String name) {
    String ct = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);
    if ("image/png".equals(ct)) return "png";
    if ("image/jpeg".equals(ct)) return "jpg";
    if ("image/webp".equals(ct)) return "webp";
    String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
    if (n.endsWith(".png")) return "png";
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
    if (n.endsWith(".webp")) return "webp";
    return null;
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
