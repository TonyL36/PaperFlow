package com.paperflow.content.api.dto;

import java.time.OffsetDateTime;

public record CommentResponse(
    String commentId,
    String postId,
    String userId,
    String content,
    String status,
    String parentCommentId,
    Long likeCount,
    Boolean liked,
    java.util.List<CommentResponse> replies,
    OffsetDateTime createdAt
) {
}
