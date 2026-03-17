package com.paperflow.user.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BindPhoneRequest(
    @NotBlank @Size(min = 6, max = 32) String phone
) {
}

