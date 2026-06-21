package com.paperflow.user.api;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.paperflow.user.domain.UserEntity;
import com.paperflow.user.repo.UserRepository;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class PublicUserAssetsControllerIT {
  @Autowired
  MockMvc mvc;

  @Autowired
  UserRepository users;

  @Test
  void returns_public_profile_with_display_name_and_avatar_url() throws Exception {
    String userId = "u_public_profile_" + System.nanoTime();
    UserEntity user = new UserEntity();
    user.setId(userId);
    user.setEmail(userId + "@example.com");
    user.setPasswordHash("hash");
    user.setDisplayName("测试昵称");
    user.setRoles("USER");
    user.setStatus("ACTIVE");
    user.setAvatarUrl("/api/v1/public/users/avatars/" + userId + "?v=1");
    user.setCreatedAt(OffsetDateTime.now());
    user.setUpdatedAt(OffsetDateTime.now());
    users.save(user);

    mvc.perform(get("/public/users/" + userId)
            .header("X-Request-Id", "rid-public-user"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.userId", is(userId)))
        .andExpect(jsonPath("$.data.displayName", is("测试昵称")))
        .andExpect(jsonPath("$.data.avatarUrl", is("/api/v1/public/users/avatars/" + userId + "?v=1")));
  }

  @Test
  void returns_public_profile_when_avatar_url_is_null() throws Exception {
    String userId = "u_public_profile_null_avatar_" + System.nanoTime();
    UserEntity user = new UserEntity();
    user.setId(userId);
    user.setEmail(userId + "@example.com");
    user.setPasswordHash("hash");
    user.setDisplayName("无头像用户");
    user.setRoles("USER");
    user.setStatus("ACTIVE");
    user.setAvatarUrl(null);
    user.setCreatedAt(OffsetDateTime.now());
    user.setUpdatedAt(OffsetDateTime.now());
    users.save(user);

    mvc.perform(get("/public/users/" + userId)
            .header("X-Request-Id", "rid-public-user-null-avatar"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.userId", is(userId)))
        .andExpect(jsonPath("$.data.displayName", is("无头像用户")))
        .andExpect(jsonPath("$.data.avatarUrl").doesNotExist());
  }
}
