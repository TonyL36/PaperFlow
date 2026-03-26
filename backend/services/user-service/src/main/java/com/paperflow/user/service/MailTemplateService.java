package com.paperflow.user.service;

import com.paperflow.user.domain.MailTemplateEntity;
import com.paperflow.user.repo.MailTemplateRepository;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class MailTemplateService {
  public static final String TYPE_REGISTER_VERIFICATION = "REGISTER_VERIFICATION";
  public static final String TYPE_PASSWORD_RESET_VERIFICATION = "PASSWORD_RESET_VERIFICATION";
  public static final String TYPE_BIND_EMAIL_VERIFICATION = "BIND_EMAIL_VERIFICATION";
  private static final String DEFAULT_BODY = "你的验证码是：{{code}}\n\n{{minutes}} 分钟内有效。\n\n如果不是你本人操作，请忽略本邮件。";
  private static final Map<String, String> DEFAULT_SUBJECTS = Map.of(
      TYPE_REGISTER_VERIFICATION, "PaperFlow 注册验证码",
      TYPE_PASSWORD_RESET_VERIFICATION, "PaperFlow 找回密码验证码",
      TYPE_BIND_EMAIL_VERIFICATION, "PaperFlow 绑定邮箱验证码"
  );
  private static final List<String> PLACEHOLDERS = List.of("{{purpose}}", "{{code}}", "{{minutes}}");
  private final MailTemplateRepository repo;

  public MailTemplateService(MailTemplateRepository repo) {
    this.repo = repo;
  }

  public MailTemplate getTemplate(String templateType) {
    String type = normalizeType(templateType);
    String defaultSubject = defaultSubject(type);
    MailTemplateEntity e = repo.findById(type).orElse(null);
    if (e == null) {
      return new MailTemplate(type, defaultSubject, DEFAULT_BODY, null);
    }
    return new MailTemplate(
        type,
        safeTemplate(e.getSubjectTemplate(), defaultSubject, 255),
        safeTemplate(e.getBodyTemplate(), DEFAULT_BODY, 4000),
        e.getUpdatedAt()
    );
  }

  public MailTemplate updateTemplate(String templateType, String subjectTemplate, String bodyTemplate) {
    String type = normalizeType(templateType);
    String subject = safeTemplate(subjectTemplate, defaultSubject(type), 255);
    String body = safeTemplate(bodyTemplate, DEFAULT_BODY, 4000);
    MailTemplateEntity e = repo.findById(type).orElseGet(MailTemplateEntity::new);
    e.setTemplateType(type);
    e.setSubjectTemplate(subject);
    e.setBodyTemplate(body);
    e.setUpdatedAt(OffsetDateTime.now());
    repo.save(e);
    return new MailTemplate(type, subject, body, e.getUpdatedAt());
  }

  public String renderSubject(String templateType, String purpose) {
    MailTemplate t = getTemplate(templateType);
    return render(t.subjectTemplate(), Map.of(
        "purpose", blankToDefault(purpose, "验证")
    ));
  }

  public String renderBody(String templateType, String purpose, String code, int minutes) {
    MailTemplate t = getTemplate(templateType);
    return render(t.bodyTemplate(), Map.of(
        "purpose", blankToDefault(purpose, "验证"),
        "code", blankToDefault(code, ""),
        "minutes", String.valueOf(Math.max(1, minutes))
    ));
  }

  public List<String> placeholders() {
    return PLACEHOLDERS;
  }

  private String safeTemplate(String input, String fallback, int maxLen) {
    String v = input == null ? "" : input.trim();
    if (v.isBlank()) {
      return fallback;
    }
    return v.length() > maxLen ? v.substring(0, maxLen) : v;
  }

  private String render(String template, Map<String, String> values) {
    String out = template == null ? "" : template;
    for (Map.Entry<String, String> e : values.entrySet()) {
      out = out.replace("{{" + e.getKey() + "}}", e.getValue());
    }
    return out;
  }

  private String blankToDefault(String input, String fallback) {
    String v = input == null ? "" : input.trim();
    return v.isBlank() ? fallback : v;
  }

  public String normalizeType(String templateType) {
    String t = templateType == null ? "" : templateType.trim().toUpperCase(Locale.ROOT);
    if (DEFAULT_SUBJECTS.containsKey(t)) {
      return t;
    }
    throw new IllegalArgumentException("UNSUPPORTED_TEMPLATE_TYPE");
  }

  private String defaultSubject(String type) {
    return DEFAULT_SUBJECTS.getOrDefault(type, "PaperFlow 验证码");
  }

  public Map<String, String> typeLabels() {
    Map<String, String> labels = new LinkedHashMap<>();
    labels.put(TYPE_REGISTER_VERIFICATION, "注册验证码");
    labels.put(TYPE_PASSWORD_RESET_VERIFICATION, "找回密码验证码");
    labels.put(TYPE_BIND_EMAIL_VERIFICATION, "绑定邮箱验证码");
    return labels;
  }

  public record MailTemplate(String type, String subjectTemplate, String bodyTemplate, OffsetDateTime updatedAt) {
    public String typeUpper() {
      return type == null ? "" : type.toUpperCase(Locale.ROOT);
    }
  }
}

