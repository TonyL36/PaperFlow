package com.paperflow.content.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateCommentRequest(
    @NotBlank String postId,
    @NotBlank @Size(min = 1, max = 2000) String content
) {
}

