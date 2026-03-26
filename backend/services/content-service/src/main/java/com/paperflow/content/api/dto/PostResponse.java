package com.paperflow.content.api.dto;

import java.time.OffsetDateTime;

public record PostResponse(
    String postId,
    String title,
    String content,
    String source,
    OffsetDateTime publishedAt,
    Boolean commentModerationEnabled,
    Boolean favorited,
    OffsetDateTime lastViewedAt
) {
}
