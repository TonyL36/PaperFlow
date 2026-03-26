package com.paperflow.content.api.dto;

import jakarta.validation.constraints.NotNull;

public record UpdatePostCommentModerationRequest(
    @NotNull Boolean commentModerationEnabled
) {
}
