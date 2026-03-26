package com.paperflow.user.service;

import org.springframework.core.env.Environment;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class MailService {
  private final Environment env;
  private final JavaMailSender mailSender;
  private final MailTemplateService templates;

  public MailService(Environment env, JavaMailSender mailSender, MailTemplateService templates) {
    this.env = env;
    this.mailSender = mailSender;
    this.templates = templates;
  }

  public boolean isEnabled() {
    String enabled = env.getProperty("paperflow.mail.enabled", "true");
    return Boolean.parseBoolean(enabled);
  }

  public boolean isConfigured() {
    String host = env.getProperty("spring.mail.host", "");
    String username = env.getProperty("spring.mail.username", "");
    return isEnabled() && host != null && !host.isBlank() && username != null && !username.isBlank();
  }

  public void sendVerificationCode(String to, String templateType, String purpose, String code) {
    String from = env.getProperty("paperflow.mail.from", "");
    if (from == null || from.isBlank()) {
      from = env.getProperty("spring.mail.username", "");
    }
    SimpleMailMessage msg = new SimpleMailMessage();
    msg.setFrom(from);
    msg.setTo(to);
    msg.setSubject(templates.renderSubject(templateType, purpose));
    msg.setText(templates.renderBody(templateType, purpose, code, 10));
    mailSender.send(msg);
  }
}
