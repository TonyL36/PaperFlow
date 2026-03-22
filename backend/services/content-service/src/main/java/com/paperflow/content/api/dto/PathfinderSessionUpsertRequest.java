package com.paperflow.content.api.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record PathfinderSessionUpsertRequest(
    String goal,
    String model,
    JsonNode focus,
    JsonNode stages,
    JsonNode messages,
    String activeStageId
) {
}
