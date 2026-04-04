package com.paperflow.content.api.dto;

public record AiChatRequest(
    String model,
    String systemPrompt,
    String userPrompt
) {
}
