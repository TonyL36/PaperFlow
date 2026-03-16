package com.paperflow.user.api.dto;

import java.util.List;

public record UserProfileResponse(
    String userId,
    String email,
    String displayName,
    List<String> roles
) {
}

