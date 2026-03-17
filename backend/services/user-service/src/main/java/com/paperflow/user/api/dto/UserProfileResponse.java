package com.paperflow.user.api.dto;

import java.util.List;

public record UserProfileResponse(
    String userId,
    String email,
    String displayName,
    List<String> roles,
    String status,
    String avatarUrl,
    String bio,
    String phone,
    boolean emailVerified,
    boolean phoneVerified,
    boolean qqBound
) {
}
