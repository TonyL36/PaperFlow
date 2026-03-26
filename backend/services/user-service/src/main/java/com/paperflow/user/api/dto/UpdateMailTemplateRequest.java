package com.paperflow.user.api.dto;

public record UpdateMailTemplateRequest(
    String subjectTemplate,
    String bodyTemplate
) {
}

