package com.paperflow.user.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ConfirmCodeRequest(
    @NotBlank @Size(min = 4, max = 12) String code
) {
}

