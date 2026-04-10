package com.paperflow.content.api;

import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.NotificationResponse;
import com.paperflow.content.domain.NotificationEntity;
import com.paperflow.content.repo.NotificationRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/notifications")
public class NotificationsController {
  private final NotificationRepository notifications;

  public NotificationsController(NotificationRepository notifications) {
    this.notifications = notifications;
  }

  @GetMapping
  public ResponseEntity<Envelope<Object>> list(
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
    List<NotificationResponse> items = notifications.listByRecipient(userId, PageRequest.of(pn - 1, ps)).stream().map(this::toDto).toList();
    long unreadCount = notifications.countUnreadByRecipient(userId);
    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps));
    data.put("unreadCount", unreadCount);
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/notifications?page[number]=" + pn + "&page[size]=" + ps, Optional.of("GET"), Optional.empty()))
    ));
  }

  @PostMapping("/{notificationId}/read")
  @Transactional
  public ResponseEntity<Envelope<Object>> markRead(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @PathVariable("notificationId") String notificationId
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
    }
    NotificationEntity n = notifications.findById(notificationId).orElse(null);
    if (n == null || !userId.equals(n.getRecipientUserId())) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Notification not found", java.util.Map.of()));
    }
    if (n.getReadAt() == null) {
      n.setReadAt(OffsetDateTime.now(ZoneOffset.UTC));
      notifications.save(n);
    }
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of(), List.of()));
  }

  @PostMapping("/read-all")
  @Transactional
  public ResponseEntity<Envelope<Object>> markAllRead(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", java.util.Map.of()));
    }
    int updated = notifications.markAllReadByRecipient(userId, OffsetDateTime.now(ZoneOffset.UTC));
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), java.util.Map.of("updated", updated), List.of()));
  }

  private NotificationResponse toDto(NotificationEntity n) {
    return new NotificationResponse(
        n.getId(),
        n.getType(),
        n.getTitle(),
        n.getContent(),
        n.getActorUserId(),
        n.getPostId(),
        n.getTargetCommentId(),
        n.getCreatedAt(),
        n.getReadAt()
    );
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
