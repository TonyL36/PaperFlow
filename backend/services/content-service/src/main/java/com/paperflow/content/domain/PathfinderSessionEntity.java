package com.paperflow.content.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "pf_pathfinder_session")
public class PathfinderSessionEntity {
  @Id
  @Column(name = "session_id", nullable = false, length = 64)
  private String sessionId;

  @Column(name = "user_id", nullable = false, length = 64)
  private String userId;

  @Column(name = "goal", nullable = false, columnDefinition = "text")
  private String goal;

  @Column(name = "model_name", nullable = false, length = 64)
  private String modelName;

  @Column(name = "focus_json", nullable = false, columnDefinition = "text")
  private String focusJson;

  @Column(name = "stages_json", nullable = false, columnDefinition = "text")
  private String stagesJson;

  @Column(name = "messages_json", nullable = false, columnDefinition = "text")
  private String messagesJson;

  @Column(name = "active_stage_id", length = 64)
  private String activeStageId;

  @Column(name = "favorited", nullable = false)
  private boolean favorited;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "updated_at", nullable = false)
  private OffsetDateTime updatedAt;

  public String getSessionId() {
    return sessionId;
  }

  public void setSessionId(String sessionId) {
    this.sessionId = sessionId;
  }

  public String getUserId() {
    return userId;
  }

  public void setUserId(String userId) {
    this.userId = userId;
  }

  public String getGoal() {
    return goal;
  }

  public void setGoal(String goal) {
    this.goal = goal;
  }

  public String getModelName() {
    return modelName;
  }

  public void setModelName(String modelName) {
    this.modelName = modelName;
  }

  public String getFocusJson() {
    return focusJson;
  }

  public void setFocusJson(String focusJson) {
    this.focusJson = focusJson;
  }

  public String getStagesJson() {
    return stagesJson;
  }

  public void setStagesJson(String stagesJson) {
    this.stagesJson = stagesJson;
  }

  public String getMessagesJson() {
    return messagesJson;
  }

  public void setMessagesJson(String messagesJson) {
    this.messagesJson = messagesJson;
  }

  public String getActiveStageId() {
    return activeStageId;
  }

  public void setActiveStageId(String activeStageId) {
    this.activeStageId = activeStageId;
  }

  public boolean isFavorited() {
    return favorited;
  }

  public void setFavorited(boolean favorited) {
    this.favorited = favorited;
  }

  public OffsetDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(OffsetDateTime createdAt) {
    this.createdAt = createdAt;
  }

  public OffsetDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(OffsetDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }
}
