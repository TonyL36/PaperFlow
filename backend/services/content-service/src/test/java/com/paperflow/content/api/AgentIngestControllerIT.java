package com.paperflow.content.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
    "paperflow.demo-ingest.enabled=true",
    "paperflow.demo-ingest.token=test-token"
})
@AutoConfigureMockMvc
public class AgentIngestControllerIT {
  @Autowired
  MockMvc mvc;

  @Test
  void ingest_then_get_detail_and_list_contains_post() throws Exception {
    String postId = "post_demo_test_001";
    String body = """
        {
          "postId": "%s",
          "title": "Demo Post Title",
          "content": "Demo content for agent ingest test.",
          "source": "agent-demo",
          "publishedAt": "%s"
        }
        """.formatted(postId, OffsetDateTime.parse("2026-03-16T00:00:00Z"));

    mvc.perform(post("/api/v1/internal/agent/posts")
            .header("X-Request-Id", "rid-1")
            .header("X-Demo-Ingest-Token", "test-token")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.requestId", is("rid-1")))
        .andExpect(jsonPath("$.data.postId", is(postId)))
        .andExpect(jsonPath("$.data.title", is("Demo Post Title")))
        .andExpect(jsonPath("$.error", nullValue()));

    mvc.perform(post("/api/v1/internal/agent/posts")
            .header("X-Request-Id", "rid-2")
            .header("X-Demo-Ingest-Token", "test-token")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.requestId", is("rid-2")))
        .andExpect(jsonPath("$.data.postId", is(postId)))
        .andExpect(jsonPath("$.error", nullValue()));

    mvc.perform(post("/api/v1/internal/agent/posts")
            .header("X-Request-Id", "rid-2b")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.requestId", is("rid-2b")))
        .andExpect(jsonPath("$.error.code", is("AUTH_FORBIDDEN")));

    mvc.perform(get("/api/v1/posts/" + postId).header("X-Request-Id", "rid-3"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.requestId", is("rid-3")))
        .andExpect(jsonPath("$.data.postId", is(postId)))
        .andExpect(jsonPath("$.data.source", is("agent-demo")))
        .andExpect(jsonPath("$.error", nullValue()));

    mvc.perform(get("/api/v1/posts")
            .header("X-Request-Id", "rid-4")
            .queryParam("page[number]", "1")
            .queryParam("page[size]", "50"))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString(postId)));
  }
}
