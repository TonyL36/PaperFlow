package com.paperflow.content.api.dto;

public record AiChatResponse(
    String model,
    String assistantMessage
) {
}
