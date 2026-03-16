package com.paperflow.content.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record UpdateCommentStatusRequest(
    @NotBlank @Pattern(regexp = "APPROVED|REJECTED") String status
) {
}

