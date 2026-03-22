package com.paperflow.content.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.PathfinderPlanGenerateRequest;
import com.paperflow.content.api.dto.PathfinderPlanGenerateResponse;
import com.paperflow.content.api.dto.PathfinderSessionResponse;
import com.paperflow.content.api.dto.PathfinderSessionUpsertRequest;
import com.paperflow.content.domain.PathfinderSessionEntity;
import com.paperflow.content.repo.PathfinderSessionRepository;
import com.paperflow.content.service.PathfinderPlanService;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/pathfinder/sessions")
public class PathfinderSessionsController {
  private static final String EMPTY_ARRAY = "[]";

  private final PathfinderSessionRepository sessions;
  private final ObjectMapper objectMapper;
  private final PathfinderPlanService planService;

  public PathfinderSessionsController(
      PathfinderSessionRepository sessions,
      ObjectMapper objectMapper,
      PathfinderPlanService planService
  ) {
    this.sessions = sessions;
    this.objectMapper = objectMapper;
    this.planService = planService;
  }

  @GetMapping
  public ResponseEntity<Envelope<Object>> list(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestParam(value = "page[number]", required = false, defaultValue = "1") int pageNumber,
      @RequestParam(value = "page[size]", required = false, defaultValue = "20") int pageSize
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", Map.of()));
    }
    int pn = Math.max(1, pageNumber);
    int ps = Math.min(200, Math.max(1, pageSize));
    List<PathfinderSessionResponse> items = sessions.findByUserIdOrderByUpdatedAtDesc(userId, PageRequest.of(pn - 1, ps)).stream()
        .map(this::toDto)
        .toList();
    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", items);
    data.put("page", java.util.Map.of("number", pn, "size", ps));
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/pathfinder/sessions?page[number]=" + pn + "&page[size]=" + ps, Optional.of("GET"), Optional.empty()))
    ));
  }

  @PutMapping("/{sessionId}")
  public ResponseEntity<Envelope<Object>> upsert(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @PathVariable("sessionId") String sessionId,
      @RequestBody PathfinderSessionUpsertRequest req
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", Map.of()));
    }
    if (req == null || req.goal() == null || req.goal().isBlank()) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "goal is required", Map.of()));
    }
    String model = planService.normalizeModel(req.model());
    PathfinderSessionEntity existingById = sessions.findById(sessionId).orElse(null);
    if (existingById != null && !userId.equals(existingById.getUserId())) {
      return ResponseEntity.status(409).body(Envelope.err(safeRequestId(requestId), "RES_CONFLICT", "Session id already exists", Map.of()));
    }
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    PathfinderSessionEntity entity = existingById == null ? new PathfinderSessionEntity() : existingById;
    if (existingById == null) {
      entity.setSessionId(sessionId);
      entity.setUserId(userId);
      entity.setCreatedAt(now);
      entity.setFavorited(false);
    }
    entity.setGoal(req.goal().trim());
    entity.setModelName(model);
    entity.setFocusJson(serializeJson(req.focus(), EMPTY_ARRAY));
    entity.setStagesJson(serializeJson(req.stages(), EMPTY_ARRAY));
    entity.setMessagesJson(serializeJson(req.messages(), EMPTY_ARRAY));
    entity.setActiveStageId(blankToNull(req.activeStageId()));
    entity.setUpdatedAt(now);
    sessions.save(entity);
    PathfinderSessionResponse data = toDto(entity);
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/pathfinder/sessions/" + sessionId, Optional.of("PUT"), Optional.empty()))
    ));
  }

  @PostMapping("/plan")
  public ResponseEntity<Envelope<Object>> generatePlan(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-User-Email", required = false) String userEmail,
      @RequestBody PathfinderPlanGenerateRequest req
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", Map.of()));
    }
    if (req == null || req.goal() == null || req.goal().isBlank()) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "goal is required", Map.of()));
    }
    var draft = planService.generate(req.goal(), req.model(), userEmail);
    PathfinderPlanGenerateResponse data = new PathfinderPlanGenerateResponse(
        draft.goal(),
        draft.model(),
        draft.focus(),
        draft.stages(),
        draft.assistantMessage()
    );
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/pathfinder/sessions/plan", Optional.of("POST"), Optional.empty()))
    ));
  }

  @PostMapping("/{sessionId}/favorite")
  public ResponseEntity<Envelope<Object>> favorite(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @PathVariable("sessionId") String sessionId
  ) {
    return setFavorite(requestId, userId, sessionId, true);
  }

  @DeleteMapping("/{sessionId}/favorite")
  public ResponseEntity<Envelope<Object>> unfavorite(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @PathVariable("sessionId") String sessionId
  ) {
    return setFavorite(requestId, userId, sessionId, false);
  }

  private ResponseEntity<Envelope<Object>> setFavorite(String requestId, String userId, String sessionId, boolean favorite) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", Map.of()));
    }
    PathfinderSessionEntity entity = sessions.findBySessionIdAndUserId(sessionId, userId).orElse(null);
    if (entity == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "Session not found", Map.of()));
    }
    entity.setFavorited(favorite);
    entity.setUpdatedAt(OffsetDateTime.now(ZoneOffset.UTC));
    sessions.save(entity);
    PathfinderSessionResponse data = toDto(entity);
    String method = favorite ? "POST" : "DELETE";
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/pathfinder/sessions/" + sessionId + "/favorite", Optional.of(method), Optional.empty()))
    ));
  }

  private PathfinderSessionResponse toDto(PathfinderSessionEntity entity) {
    return new PathfinderSessionResponse(
        entity.getSessionId(),
        entity.getGoal(),
        entity.getModelName(),
        parseJson(entity.getFocusJson()),
        parseJson(entity.getStagesJson()),
        parseJson(entity.getMessagesJson()),
        entity.getActiveStageId(),
        entity.isFavorited(),
        entity.getCreatedAt(),
        entity.getUpdatedAt()
    );
  }

  private JsonNode parseJson(String raw) {
    if (raw == null || raw.isBlank()) {
      return objectMapper.createArrayNode();
    }
    try {
      return objectMapper.readTree(raw);
    } catch (Exception e) {
      return objectMapper.createArrayNode();
    }
  }

  private String serializeJson(JsonNode value, String fallback) {
    JsonNode source = value == null ? parseJson(fallback) : value;
    try {
      return objectMapper.writeValueAsString(source);
    } catch (Exception e) {
      return fallback;
    }
  }

  private String blankToNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value;
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
