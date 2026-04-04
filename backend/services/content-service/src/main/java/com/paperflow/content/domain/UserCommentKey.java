package com.paperflow.content.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class UserCommentKey implements Serializable {
  @Column(name = "user_id", nullable = false, length = 64)
  private String userId;

  @Column(name = "comment_id", nullable = false, length = 64)
  private String commentId;

  public UserCommentKey() {
  }

  public UserCommentKey(String userId, String commentId) {
    this.userId = userId;
    this.commentId = commentId;
  }

  public String getUserId() {
    return userId;
  }

  public void setUserId(String userId) {
    this.userId = userId;
  }

  public String getCommentId() {
    return commentId;
  }

  public void setCommentId(String commentId) {
    this.commentId = commentId;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) {
      return true;
    }
    if (o == null || getClass() != o.getClass()) {
      return false;
    }
    UserCommentKey that = (UserCommentKey) o;
    return Objects.equals(userId, that.userId) && Objects.equals(commentId, that.commentId);
  }

  @Override
  public int hashCode() {
    return Objects.hash(userId, commentId);
  }
}
