package com.paperflow.content.api.dto;

import java.time.OffsetDateTime;

public record NotificationResponse(
    String notificationId,
    String type,
    String title,
    String content,
    String actorUserId,
    String postId,
    String targetCommentId,
    OffsetDateTime createdAt,
    OffsetDateTime readAt
) {
}
