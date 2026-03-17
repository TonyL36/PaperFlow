package com.paperflow.user.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
    @NotBlank @Size(min = 1, max = 64) String displayName,
    @Size(max = 512) String avatarUrl,
    @Size(max = 500) String bio
) {
}
