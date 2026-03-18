package com.paperflow.user.service;

import org.springframework.core.env.Environment;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class MailService {
  private final Environment env;
  private final JavaMailSender mailSender;

  public MailService(Environment env, JavaMailSender mailSender) {
    this.env = env;
    this.mailSender = mailSender;
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

  public void sendVerificationCode(String to, String purpose, String code) {
    String from = env.getProperty("paperflow.mail.from", "");
    if (from == null || from.isBlank()) {
      from = env.getProperty("spring.mail.username", "");
    }
    SimpleMailMessage msg = new SimpleMailMessage();
    msg.setFrom(from);
    msg.setTo(to);
    msg.setSubject("PaperFlow 验证码 - " + purpose);
    msg.setText("你的验证码是：" + code + "\n\n10 分钟内有效。\n\n如果不是你本人操作，请忽略本邮件。");
    mailSender.send(msg);
  }
}
