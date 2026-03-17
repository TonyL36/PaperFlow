package com.paperflow.user.api.dto;

import java.util.List;

public record UpdateUserRequest(
    String displayName,
    List<String> roles,
    String status
) {
}

