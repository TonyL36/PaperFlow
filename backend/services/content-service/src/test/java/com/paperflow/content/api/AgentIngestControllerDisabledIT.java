package com.paperflow.content.api;

import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
    "paperflow.demo-ingest.enabled=false"
})
@AutoConfigureMockMvc
public class AgentIngestControllerDisabledIT {
  @Autowired
  MockMvc mvc;

  @Test
  void ingest_endpoint_disabled_returns_404() throws Exception {
    String body = """
        {
          "postId": "post_demo_test_disabled",
          "title": "Demo Post Title",
          "content": "Demo content.",
          "source": "agent-demo"
        }
        """;

    mvc.perform(post("/api/v1/internal/agent/posts")
            .header("X-Request-Id", "rid-x")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.requestId", is("rid-x")))
        .andExpect(jsonPath("$.error.code", is("RES_NOT_FOUND")));
  }
}

