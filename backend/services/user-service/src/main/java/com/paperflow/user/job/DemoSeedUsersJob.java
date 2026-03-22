package com.paperflow.user.job;

import com.paperflow.user.domain.UserEntity;
import com.paperflow.user.repo.UserRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.boot.context.event.ApplicationReadyEvent;

@Component
public class DemoSeedUsersJob {
  private final Environment env;
  private final UserRepository users;
  private final PasswordEncoder passwordEncoder;

  public DemoSeedUsersJob(Environment env, UserRepository users, PasswordEncoder passwordEncoder) {
    this.env = env;
    this.users = users;
    this.passwordEncoder = passwordEncoder;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void seed() {
    String url = env.getProperty("spring.datasource.url", "");
    boolean isH2 = url != null && url.contains("jdbc:h2:");
    if (!isH2) {
      return;
    }

    seedIfMissing("user_demo_alice", "alice@example.com", "password123", "Alice", "USER");
    seedIfMissing("user_demo_admin", "admin@example.com", "admin12345", "Admin", "USER,ADMIN");
  }

  private void seedIfMissing(String id, String email, String password, String displayName, String roles) {
    if (users.existsById(id) || users.findByEmail(email).isPresent()) {
      return;
    }
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    UserEntity u = new UserEntity();
    u.setId(id);
    u.setEmail(email);
    u.setPasswordHash(passwordEncoder.encode(password));
    u.setDisplayName(displayName);
    u.setRoles(roles);
    u.setStatus("ACTIVE");
    u.setCreatedAt(now);
    u.setUpdatedAt(now);
    users.save(u);
  }
}
