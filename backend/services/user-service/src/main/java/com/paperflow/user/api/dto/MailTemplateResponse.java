package com.paperflow.user.api.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record MailTemplateResponse(
    String type,
    String subjectTemplate,
    String bodyTemplate,
    List<String> placeholders,
    OffsetDateTime updatedAt
) {
}

