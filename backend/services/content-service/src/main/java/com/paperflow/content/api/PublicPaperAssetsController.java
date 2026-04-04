package com.paperflow.content.api;

import com.paperflow.content.domain.PaperAssetEntity;
import com.paperflow.content.repo.PaperAssetRepository;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/public/papers")
public class PublicPaperAssetsController {
  private static final long MAX_BYTES = 32L * 1024L * 1024L;
  private static final Map<String, Object> DOWNLOAD_LOCKS = new ConcurrentHashMap<>();
  private final PaperAssetRepository paperAssets;
  private final Path cacheDir;

  public PublicPaperAssetsController(
      PaperAssetRepository paperAssets,
      @Value("${paperflow.papers.cache-dir:/var/lib/paperflow/pdf-cache}") String cacheDir) {
    this.paperAssets = paperAssets;
    this.cacheDir = Path.of(cacheDir);
  }

  @GetMapping("/pdf-proxy")
  public ResponseEntity<FileSystemResource> proxyPdf(@RequestParam("url") String sourceUrl) {
    URI source;
    try {
      source = URI.create(sourceUrl);
    } catch (Exception ignored) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
    }
    String scheme = source.getScheme() == null ? "" : source.getScheme().toLowerCase(Locale.ROOT);
    if (!"https".equals(scheme) || !isSafeHost(source)) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
    }
    String key = sha256(source.toString());
    Path cacheFile = cacheDir.resolve(key + ".pdf");
    try {
      Files.createDirectories(cacheDir);
      Optional<PaperAssetEntity> existing = paperAssets.findBySourceUrl(source.toString());
      if (existing.isPresent()) {
        Path fromDb = Path.of(existing.get().getStoragePath());
        if (isValidCachedFile(fromDb)) {
          return fileResponse(fromDb);
        }
      }
      if (!Files.exists(cacheFile) || Files.size(cacheFile) == 0L) {
        Object lock = DOWNLOAD_LOCKS.computeIfAbsent(key, k -> new Object());
        synchronized (lock) {
          if (!Files.exists(cacheFile) || Files.size(cacheFile) == 0L) {
            DownloadResult result = downloadToCache(source, cacheFile);
            if (!result.ok()) {
              return ResponseEntity.status(HttpStatus.BAD_GATEWAY).build();
            }
            upsertAsset(source.toString(), key, cacheFile, result.contentType(), result.sizeBytes(), result.fileSha256());
          }
        }
      }
      if (!isValidCachedFile(cacheFile)) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).build();
      }
      if (existing.isEmpty()) {
        upsertAsset(source.toString(), key, cacheFile, MediaType.APPLICATION_PDF_VALUE, Files.size(cacheFile), null);
      }
      return fileResponse(cacheFile);
    } catch (Exception ignored) {
      return ResponseEntity.status(HttpStatus.BAD_GATEWAY).build();
    }
  }

  private DownloadResult downloadToCache(URI source, Path cacheFile) {
    Path tempFile = cacheFile.resolveSibling(cacheFile.getFileName() + ".part");
    HttpURLConnection conn = null;
    try {
      conn = (HttpURLConnection) source.toURL().openConnection();
      conn.setInstanceFollowRedirects(true);
      conn.setConnectTimeout(10000);
      conn.setReadTimeout(30000);
      conn.setRequestProperty("Accept", "application/pdf,*/*");
      conn.setRequestProperty("User-Agent", "PaperFlow/1.0");
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) {
        return DownloadResult.fail();
      }
      String contentType = conn.getContentType() == null ? "" : conn.getContentType().toLowerCase(Locale.ROOT);
      if (!contentType.contains("pdf") && !source.getPath().toLowerCase(Locale.ROOT).endsWith(".pdf")) {
        return DownloadResult.fail();
      }
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      long total = 0L;
      try (var in = new BufferedInputStream(conn.getInputStream());
           var out = new BufferedOutputStream(Files.newOutputStream(tempFile, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE))) {
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) {
          total += n;
          if (total > MAX_BYTES) {
            Files.deleteIfExists(tempFile);
            return DownloadResult.fail();
          }
          digest.update(buf, 0, n);
          out.write(buf, 0, n);
        }
        out.flush();
      }
      if (total <= 0L) {
        Files.deleteIfExists(tempFile);
        return DownloadResult.fail();
      }
      Files.move(tempFile, cacheFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
      return DownloadResult.ok(contentType.contains("pdf") ? MediaType.APPLICATION_PDF_VALUE : contentType, total, hex(digest.digest()));
    } catch (Exception ignored) {
      try { Files.deleteIfExists(tempFile); } catch (IOException ignored2) {}
      return DownloadResult.fail();
    } finally {
      if (conn != null) {
        conn.disconnect();
      }
    }
  }

  private void upsertAsset(String sourceUrl, String id, Path cacheFile, String contentType, long sizeBytes, String fileSha256) {
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    PaperAssetEntity entity = paperAssets.findBySourceUrl(sourceUrl).orElseGet(PaperAssetEntity::new);
    if (entity.getId() == null || entity.getId().isBlank()) {
      entity.setId(id);
      entity.setCreatedAt(now);
    }
    entity.setSourceUrl(sourceUrl);
    entity.setStoragePath(cacheFile.toAbsolutePath().toString());
    entity.setContentType(contentType == null || contentType.isBlank() ? MediaType.APPLICATION_PDF_VALUE : contentType);
    entity.setSizeBytes(sizeBytes);
    entity.setFileSha256(fileSha256);
    entity.setUpdatedAt(now);
    paperAssets.save(entity);
  }

  private boolean isValidCachedFile(Path file) {
    try {
      return Files.exists(file) && Files.size(file) > 0L && Files.size(file) <= MAX_BYTES;
    } catch (Exception ignored) {
      return false;
    }
  }

  private ResponseEntity<FileSystemResource> fileResponse(Path file) throws IOException {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic())
        .lastModified(Files.getLastModifiedTime(file).toMillis())
        .contentType(MediaType.APPLICATION_PDF)
        .contentLength(Files.size(file))
        .body(new FileSystemResource(file));
  }

  private boolean isSafeHost(URI source) {
    String host = source.getHost() == null ? "" : source.getHost().trim();
    if (host.isBlank() || "localhost".equalsIgnoreCase(host)) {
      return false;
    }
    try {
      InetAddress[] addresses = InetAddress.getAllByName(host);
      if (addresses == null || addresses.length == 0) {
        return false;
      }
      for (InetAddress addr : addresses) {
        if (addr.isAnyLocalAddress() || addr.isLoopbackAddress() || addr.isLinkLocalAddress() || addr.isSiteLocalAddress()) {
          return false;
        }
      }
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }

  private String sha256(String value) {
    try {
      byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return hex(bytes);
    } catch (Exception ignored) {
      return Long.toHexString(System.currentTimeMillis());
    }
  }

  private String hex(byte[] bytes) {
    StringBuilder sb = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) {
      sb.append(String.format("%02x", b));
    }
    return sb.toString();
  }

  private record DownloadResult(boolean ok, String contentType, long sizeBytes, String fileSha256) {
    private static DownloadResult ok(String contentType, long sizeBytes, String fileSha256) {
      return new DownloadResult(true, contentType, sizeBytes, fileSha256);
    }

    private static DownloadResult fail() {
      return new DownloadResult(false, "", 0L, "");
    }
  }
}
