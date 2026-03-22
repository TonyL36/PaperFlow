package com.paperflow.content.api;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
public class PathfinderSessionsControllerIT {
  @Autowired
  MockMvc mvc;

  @Test
  void generate_plan_returns_selected_model() throws Exception {
    String body = """
        {
          "goal": "两周掌握RAG系统设计",
          "model": "glm-z1-flash"
        }
        """;

    mvc.perform(post("/pathfinder/sessions/plan")
            .header("X-Request-Id", "rid-plan")
            .header("X-User-Id", "u_demo")
            .header("X-User-Email", "alice@example.com")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.requestId", is("rid-plan")))
        .andExpect(jsonPath("$.data.model", is("glm-z1-flash")))
        .andExpect(jsonPath("$.data.goal", is("两周掌握RAG系统设计")));
  }

  @Test
  void upsert_session_persists_model_name() throws Exception {
    String sessionId = "PF_TEST_MODEL_" + System.nanoTime();
    String body = """
        {
          "goal": "学习向量检索",
          "model": "glm-4-flash",
          "focus": ["向量检索"],
          "stages": [],
          "messages": [],
          "activeStageId": null
        }
        """;

    mvc.perform(put("/pathfinder/sessions/" + sessionId)
            .header("X-Request-Id", "rid-upsert")
            .header("X-User-Id", "u_demo")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.requestId", is("rid-upsert")))
        .andExpect(jsonPath("$.data.sessionId", is(sessionId)))
        .andExpect(jsonPath("$.data.model", is("glm-4-flash")));
  }
}
