package com.paperflow.user.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RequestEmailCodeRequest(
    @NotBlank @Email @Size(max = 255) String email
) {
}

