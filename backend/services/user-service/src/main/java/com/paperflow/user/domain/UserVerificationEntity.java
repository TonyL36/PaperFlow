package com.paperflow.user.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "pf_user_verification")
public class UserVerificationEntity {
  @Id
  @Column(name = "id", nullable = false, length = 64)
  private String id;

  @Column(name = "user_id", nullable = false, length = 64)
  private String userId;

  @Column(name = "type", nullable = false, length = 32)
  private String type;

  @Column(name = "target", nullable = false, length = 255)
  private String target;

  @Column(name = "code_hash", nullable = false, length = 255)
  private String codeHash;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;

  @Column(name = "consumed_at")
  private OffsetDateTime consumedAt;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getUserId() {
    return userId;
  }

  public void setUserId(String userId) {
    this.userId = userId;
  }

  public String getType() {
    return type;
  }

  public void setType(String type) {
    this.type = type;
  }

  public String getTarget() {
    return target;
  }

  public void setTarget(String target) {
    this.target = target;
  }

  public String getCodeHash() {
    return codeHash;
  }

  public void setCodeHash(String codeHash) {
    this.codeHash = codeHash;
  }

  public OffsetDateTime getExpiresAt() {
    return expiresAt;
  }

  public void setExpiresAt(OffsetDateTime expiresAt) {
    this.expiresAt = expiresAt;
  }

  public OffsetDateTime getConsumedAt() {
    return consumedAt;
  }

  public void setConsumedAt(OffsetDateTime consumedAt) {
    this.consumedAt = consumedAt;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}

