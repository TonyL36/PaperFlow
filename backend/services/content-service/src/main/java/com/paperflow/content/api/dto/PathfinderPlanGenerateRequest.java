package com.paperflow.content.api.dto;

public record PathfinderPlanGenerateRequest(
    String goal,
    String model
) {
}
