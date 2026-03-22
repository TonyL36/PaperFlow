package com.paperflow.content.api.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;

public record PathfinderSessionResponse(
    String sessionId,
    String goal,
    String model,
    JsonNode focus,
    JsonNode stages,
    JsonNode messages,
    String activeStageId,
    boolean favorited,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {
}
