package com.paperflow.content.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "pf_post_footprint")
public class PostFootprintEntity {
  @EmbeddedId
  private UserPostKey id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "post_id", insertable = false, updatable = false)
  private PostEntity post;

  @Column(name = "last_viewed_at", nullable = false)
  private OffsetDateTime lastViewedAt;

  public UserPostKey getId() {
    return id;
  }

  public void setId(UserPostKey id) {
    this.id = id;
  }

  public PostEntity getPost() {
    return post;
  }

  public void setPost(PostEntity post) {
    this.post = post;
  }

  public OffsetDateTime getLastViewedAt() {
    return lastViewedAt;
  }

  public void setLastViewedAt(OffsetDateTime lastViewedAt) {
    this.lastViewedAt = lastViewedAt;
  }
}

