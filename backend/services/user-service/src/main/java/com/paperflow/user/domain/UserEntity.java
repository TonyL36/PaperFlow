package com.paperflow.user.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "pf_user")
public class UserEntity {
  @Id
  @Column(name = "id", nullable = false, length = 64)
  private String id;

  @Column(name = "email", nullable = false, unique = true)
  private String email;

  @Column(name = "password_hash", nullable = false)
  private String passwordHash;

  @Column(name = "display_name", nullable = false)
  private String displayName;

  @Column(name = "roles", nullable = false)
  private String roles;

  @Column(name = "status", nullable = false)
  private String status;

  @Column(name = "avatar_url")
  private String avatarUrl;

  @Column(name = "bio")
  private String bio;

  @Column(name = "phone")
  private String phone;

  @Column(name = "email_verified_at")
  private OffsetDateTime emailVerifiedAt;

  @Column(name = "phone_verified_at")
  private OffsetDateTime phoneVerifiedAt;

  @Column(name = "qq_open_id")
  private String qqOpenId;

  @Column(name = "qq_nickname")
  private String qqNickname;

  @Column(name = "qq_bound_at")
  private OffsetDateTime qqBoundAt;

  @Column(name = "wechat_open_id")
  private String wechatOpenId;

  @Column(name = "wechat_nickname")
  private String wechatNickname;

  @Column(name = "wechat_bound_at")
  private OffsetDateTime wechatBoundAt;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "updated_at", nullable = false)
  private OffsetDateTime updatedAt;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
  }

  public String getDisplayName() {
    return displayName;
  }

  public void setDisplayName(String displayName) {
    this.displayName = displayName;
  }

  public String getRoles() {
    return roles;
  }

  public void setRoles(String roles) {
    this.roles = roles;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getAvatarUrl() {
    return avatarUrl;
  }

  public void setAvatarUrl(String avatarUrl) {
    this.avatarUrl = avatarUrl;
  }

  public String getBio() {
    return bio;
  }

  public void setBio(String bio) {
    this.bio = bio;
  }

  public String getPhone() {
    return phone;
  }

  public void setPhone(String phone) {
    this.phone = phone;
  }

  public OffsetDateTime getEmailVerifiedAt() {
    return emailVerifiedAt;
  }

  public void setEmailVerifiedAt(OffsetDateTime emailVerifiedAt) {
    this.emailVerifiedAt = emailVerifiedAt;
  }

  public OffsetDateTime getPhoneVerifiedAt() {
    return phoneVerifiedAt;
  }

  public void setPhoneVerifiedAt(OffsetDateTime phoneVerifiedAt) {
    this.phoneVerifiedAt = phoneVerifiedAt;
  }

  public String getQqOpenId() {
    return qqOpenId;
  }

  public void setQqOpenId(String qqOpenId) {
    this.qqOpenId = qqOpenId;
  }

  public String getQqNickname() {
    return qqNickname;
  }

  public void setQqNickname(String qqNickname) {
    this.qqNickname = qqNickname;
  }

  public OffsetDateTime getQqBoundAt() {
    return qqBoundAt;
  }

  public void setQqBoundAt(OffsetDateTime qqBoundAt) {
    this.qqBoundAt = qqBoundAt;
  }

  public String getWechatOpenId() {
    return wechatOpenId;
  }

  public void setWechatOpenId(String wechatOpenId) {
    this.wechatOpenId = wechatOpenId;
  }

  public String getWechatNickname() {
    return wechatNickname;
  }

  public void setWechatNickname(String wechatNickname) {
    this.wechatNickname = wechatNickname;
  }

  public OffsetDateTime getWechatBoundAt() {
    return wechatBoundAt;
  }

  public void setWechatBoundAt(OffsetDateTime wechatBoundAt) {
    this.wechatBoundAt = wechatBoundAt;
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
