package com.paperflow.content.service;

import com.paperflow.content.domain.CommentEntity;
import com.paperflow.content.domain.NotificationEntity;
import com.paperflow.content.repo.CommentRepository;
import com.paperflow.content.repo.NotificationRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
  private final NotificationRepository notifications;
  private final CommentRepository comments;

  public NotificationService(NotificationRepository notifications, CommentRepository comments) {
    this.notifications = notifications;
    this.comments = comments;
  }

  @Transactional
  public void notifyReplyIfNeeded(CommentEntity comment) {
    if (comment == null) {
      return;
    }
    String parentId = comment.getParentCommentId();
    if (parentId == null || parentId.isBlank()) {
      return;
    }
    CommentEntity parent = comments.findById(parentId).orElse(null);
    if (parent == null) {
      return;
    }
    String recipient = parent.getUserId();
    String actor = comment.getUserId();
    if (recipient == null || recipient.isBlank() || actor == null || actor.isBlank()) {
      return;
    }
    if (recipient.equals(actor)) {
      return;
    }
    NotificationEntity n = new NotificationEntity();
    n.setId("n_" + UUID.randomUUID().toString().replace("-", ""));
    n.setRecipientUserId(recipient);
    n.setActorUserId(actor);
    n.setType("COMMENT_REPLY");
    n.setTitle("你收到一条新回复");
    n.setContent(preview(comment.getContent()));
    n.setPostId(comment.getPostId());
    n.setTargetCommentId(parentId);
    n.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
    notifications.save(n);
  }

  private String preview(String text) {
    if (text == null) {
      return "";
    }
    String normalized = text.replaceAll("\\s+", " ").trim();
    if (normalized.length() <= 120) {
      return normalized;
    }
    return normalized.substring(0, 120) + "…";
  }
}
