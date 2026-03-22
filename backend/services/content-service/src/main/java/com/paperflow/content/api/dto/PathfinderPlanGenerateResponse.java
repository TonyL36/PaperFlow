package com.paperflow.content.api.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record PathfinderPlanGenerateResponse(
    String goal,
    String model,
    JsonNode focus,
    JsonNode stages,
    String assistantMessage
) {
}
