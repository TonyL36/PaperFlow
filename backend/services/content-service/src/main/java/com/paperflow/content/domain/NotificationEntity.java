package com.paperflow.content.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "pf_notification")
public class NotificationEntity {
  @Id
  @Column(length = 64, nullable = false)
  private String id;

  @Column(name = "recipient_user_id", length = 64, nullable = false)
  private String recipientUserId;

  @Column(name = "actor_user_id", length = 64, nullable = false)
  private String actorUserId;

  @Column(length = 32, nullable = false)
  private String type;

  @Column(length = 200, nullable = false)
  private String title;

  @Column(columnDefinition = "text", nullable = false)
  private String content;

  @Column(name = "post_id", length = 64, nullable = false)
  private String postId;

  @Column(name = "target_comment_id", length = 64, nullable = false)
  private String targetCommentId;

  @Column(name = "read_at")
  private OffsetDateTime readAt;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getRecipientUserId() {
    return recipientUserId;
  }

  public void setRecipientUserId(String recipientUserId) {
    this.recipientUserId = recipientUserId;
  }

  public String getActorUserId() {
    return actorUserId;
  }

  public void setActorUserId(String actorUserId) {
    this.actorUserId = actorUserId;
  }

  public String getType() {
    return type;
  }

  public void setType(String type) {
    this.type = type;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getContent() {
    return content;
  }

  public void setContent(String content) {
    this.content = content;
  }

  public String getPostId() {
    return postId;
  }

  public void setPostId(String postId) {
    this.postId = postId;
  }

  public String getTargetCommentId() {
    return targetCommentId;
  }

  public void setTargetCommentId(String targetCommentId) {
    this.targetCommentId = targetCommentId;
  }

  public OffsetDateTime getReadAt() {
    return readAt;
  }

  public void setReadAt(OffsetDateTime readAt) {
    this.readAt = readAt;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
