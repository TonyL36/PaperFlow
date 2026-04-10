package com.paperflow.content.api;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
    "paperflow.demo-ingest.enabled=true",
    "paperflow.demo-ingest.token=test-token"
})
@AutoConfigureMockMvc
public class EngagementAndCommentsIT {
  @Autowired
  MockMvc mvc;

  @Test
  void supports_post_comment_like_and_two_level_comments() throws Exception {
    String postId = "post_task13_" + System.nanoTime();
    String ingestBody = """
        {
          "postId": "%s",
          "title": "Task13 Post",
          "content": "Task13 Content",
          "source": "agent-demo",
          "publishedAt": "%s"
        }
        """.formatted(postId, OffsetDateTime.parse("2026-04-04T00:00:00Z"));
    mvc.perform(post("/internal/agent/posts")
            .header("X-Request-Id", "rid-ingest")
            .header("X-Demo-Ingest-Token", "test-token")
            .contentType(MediaType.APPLICATION_JSON)
            .content(ingestBody))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.postId", is(postId)));

    mvc.perform(patch("/admin/posts/" + postId + "/comment-moderation")
            .header("X-Request-Id", "rid-moderation")
            .header("X-User-Roles", "ADMIN")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"commentModerationEnabled": false}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.commentModerationEnabled", is(false)));

    MvcResult rootResult = mvc.perform(post("/comments")
            .header("X-Request-Id", "rid-comment-root")
            .header("X-User-Id", "u_task13_1")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"postId":"%s","content":"Root comment"}
                """.formatted(postId)))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.status", is("APPROVED")))
        .andReturn();
    String rootCommentId = JsonPath.read(rootResult.getResponse().getContentAsString(), "$.data.commentId");

    MvcResult replyResult = mvc.perform(post("/comments")
            .header("X-Request-Id", "rid-comment-reply")
            .header("X-User-Id", "u_task13_2")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"postId":"%s","content":"Reply comment","parentCommentId":"%s"}
                """.formatted(postId, rootCommentId)))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.parentCommentId", is(rootCommentId)))
        .andReturn();
    String replyCommentId = JsonPath.read(replyResult.getResponse().getContentAsString(), "$.data.commentId");

    mvc.perform(post("/comments")
            .header("X-Request-Id", "rid-comment-level3")
            .header("X-User-Id", "u_task13_3")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"postId":"%s","content":"Level3","parentCommentId":"%s"}
                """.formatted(postId, replyCommentId)))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.status", is("APPROVED")));

    mvc.perform(post("/posts/" + postId + "/like")
            .header("X-Request-Id", "rid-post-like")
            .header("X-User-Id", "u_task13_1"))
        .andExpect(status().isOk());

    mvc.perform(post("/comments/" + replyCommentId + "/like")
            .header("X-Request-Id", "rid-comment-like")
            .header("X-User-Id", "u_task13_1"))
        .andExpect(status().isOk());

    mvc.perform(get("/posts/" + postId)
            .header("X-Request-Id", "rid-post-get")
            .header("X-User-Id", "u_task13_1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.likeCount", is(1)))
        .andExpect(jsonPath("$.data.liked", is(true)));

    mvc.perform(get("/comments")
            .header("X-Request-Id", "rid-comments-list")
            .header("X-User-Id", "u_task13_1")
            .queryParam("postId", postId)
            .queryParam("page[number]", "1")
            .queryParam("page[size]", "20"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items", hasSize(1)))
        .andExpect(jsonPath("$.data.items[0].commentId", is(rootCommentId)))
        .andExpect(jsonPath("$.data.items[0].replies", hasSize(1)))
        .andExpect(jsonPath("$.data.items[0].replies[0].commentId", is(replyCommentId)))
        .andExpect(jsonPath("$.data.items[0].replies[0].parentCommentId", is(rootCommentId)))
        .andExpect(jsonPath("$.data.items[0].replies[0].likeCount", is(1)))
        .andExpect(jsonPath("$.data.items[0].replies[0].liked", is(true)));

    mvc.perform(get("/comments/users/u_task13_2/card")
            .header("X-Request-Id", "rid-user-card"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.userId", is("u_task13_2")))
        .andExpect(jsonPath("$.data.postCount", is(0)))
        .andExpect(jsonPath("$.data.receivedLikeCount", is(1)));

    mvc.perform(delete("/comments/" + replyCommentId + "/like")
            .header("X-Request-Id", "rid-comment-unlike")
            .header("X-User-Id", "u_task13_1"))
        .andExpect(status().isOk());

    mvc.perform(delete("/posts/" + postId + "/like")
            .header("X-Request-Id", "rid-post-unlike")
            .header("X-User-Id", "u_task13_1"))
        .andExpect(status().isOk());
  }

  @Test
  void shows_author_pending_comment_only_to_self() throws Exception {
    String postId = "post_task13_pending_" + System.nanoTime();
    String ingestBody = """
        {
          "postId": "%s",
          "title": "Task13 Pending Post",
          "content": "Task13 Pending Content",
          "source": "agent-demo",
          "publishedAt": "%s"
        }
        """.formatted(postId, OffsetDateTime.parse("2026-04-04T00:00:00Z"));
    mvc.perform(post("/internal/agent/posts")
            .header("X-Request-Id", "rid-ingest-pending")
            .header("X-Demo-Ingest-Token", "test-token")
            .contentType(MediaType.APPLICATION_JSON)
            .content(ingestBody))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.postId", is(postId)));

    mvc.perform(post("/comments")
            .header("X-Request-Id", "rid-comment-pending-self")
            .header("X-User-Id", "u_pending_author")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"postId":"%s","content":"  pending only for author  "}
                """.formatted(postId)))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.status", is("PENDING")))
        .andExpect(jsonPath("$.data.content", is("pending only for author")));

    mvc.perform(get("/comments")
            .header("X-Request-Id", "rid-comments-list-self")
            .header("X-User-Id", "u_pending_author")
            .queryParam("postId", postId)
            .queryParam("page[number]", "1")
            .queryParam("page[size]", "20"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items", hasSize(1)))
        .andExpect(jsonPath("$.data.items[0].status", is("PENDING")))
        .andExpect(jsonPath("$.data.items[0].userId", is("u_pending_author")));

    mvc.perform(get("/comments")
            .header("X-Request-Id", "rid-comments-list-other")
            .header("X-User-Id", "u_other_user")
            .queryParam("postId", postId)
            .queryParam("page[number]", "1")
            .queryParam("page[size]", "20"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items", hasSize(0)));
  }
}
