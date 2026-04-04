package com.paperflow.content.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "pf_post_like")
public class PostLikeEntity {
  @EmbeddedId
  private UserPostKey id;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  public UserPostKey getId() {
    return id;
  }

  public void setId(UserPostKey id) {
    this.id = id;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }
}
