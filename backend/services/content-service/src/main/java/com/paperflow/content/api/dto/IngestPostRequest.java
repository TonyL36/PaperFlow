package com.paperflow.content.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

public record IngestPostRequest(
    String postId,
    @NotBlank @Size(min = 1, max = 255) String title,
    @NotBlank @Size(min = 1, max = 20000) String content,
    @NotBlank @Size(min = 1, max = 64) String source,
    OffsetDateTime publishedAt
) {
}
