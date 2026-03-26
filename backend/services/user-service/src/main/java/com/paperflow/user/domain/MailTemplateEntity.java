package com.paperflow.user.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "pf_mail_template")
public class MailTemplateEntity {
  @Id
  @Column(name = "template_type", nullable = false, length = 64)
  private String templateType;

  @Column(name = "subject_template", nullable = false, length = 255)
  private String subjectTemplate;

  @Column(name = "body_template", nullable = false, length = 4000)
  private String bodyTemplate;

  @Column(name = "updated_at", nullable = false)
  private OffsetDateTime updatedAt;

  public String getTemplateType() {
    return templateType;
  }

  public void setTemplateType(String templateType) {
    this.templateType = templateType;
  }

  public String getSubjectTemplate() {
    return subjectTemplate;
  }

  public void setSubjectTemplate(String subjectTemplate) {
    this.subjectTemplate = subjectTemplate;
  }

  public String getBodyTemplate() {
    return bodyTemplate;
  }

  public void setBodyTemplate(String bodyTemplate) {
    this.bodyTemplate = bodyTemplate;
  }

  public OffsetDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(OffsetDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }
}

