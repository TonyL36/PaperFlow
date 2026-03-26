package com.paperflow.user.api;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.Locale;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/public/users")
public class PublicUserAssetsController {
  @GetMapping("/avatars/{userId}")
  public ResponseEntity<?> getAvatar(
      @PathVariable("userId") String userId
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.notFound().build();
    }
    try {
      Path dir = Path.of(".dev", "uploads", "avatars");
      Path target = pickLatestAvatar(dir, userId);
      if (target == null) {
        return ResponseEntity.notFound().build();
      }
      byte[] bytes = Files.readAllBytes(target);
      String name = target.getFileName().toString().toLowerCase(Locale.ROOT);
      MediaType type = name.endsWith(".png")
          ? MediaType.IMAGE_PNG
          : name.endsWith(".webp") ? MediaType.parseMediaType("image/webp") : MediaType.IMAGE_JPEG;
      return ResponseEntity.ok()
          .contentType(type)
          .body(new ByteArrayResource(bytes));
    } catch (IOException e) {
      return ResponseEntity.notFound().build();
    }
  }

  private Path pickLatestAvatar(Path dir, String userId) throws IOException {
    Path[] candidates = new Path[] {
      dir.resolve(userId + ".png"),
      dir.resolve(userId + ".jpg"),
      dir.resolve(userId + ".jpeg"),
      dir.resolve(userId + ".webp")
    };
    Path latest = null;
    FileTime latestTime = null;
    for (Path candidate : candidates) {
      if (!Files.exists(candidate)) {
        continue;
      }
      FileTime time = Files.getLastModifiedTime(candidate);
      if (latest == null || latestTime == null || time.compareTo(latestTime) > 0) {
        latest = candidate;
        latestTime = time;
      }
    }
    return latest;
  }
}
