package com.paperflow.user.api.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record AdminUserResponse(
    String userId,
    String email,
    String displayName,
    List<String> roles,
    String status,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
}

