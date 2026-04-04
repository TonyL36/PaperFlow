package com.paperflow.content.api;

import com.paperflow.content.api.Envelope.Link;
import com.paperflow.content.api.dto.AiChatRequest;
import com.paperflow.content.api.dto.AiChatResponse;
import com.paperflow.content.service.AiChatService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/ai")
public class AiChatController {
  private final AiChatService aiChatService;

  public AiChatController(AiChatService aiChatService) {
    this.aiChatService = aiChatService;
  }

  @PostMapping("/chat")
  public ResponseEntity<Envelope<Object>> chat(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-User-Email", required = false) String userEmail,
      @RequestBody AiChatRequest req
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_REQUIRED", "Login required", Map.of()));
    }
    if (req == null || req.userPrompt() == null || req.userPrompt().isBlank()) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID", "userPrompt is required", Map.of()));
    }
    var draft = aiChatService.chat(req.model(), userEmail, req.systemPrompt(), req.userPrompt());
    AiChatResponse data = new AiChatResponse(draft.model(), draft.assistantMessage());
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/ai/chat", Optional.of("POST"), Optional.empty()))
    ));
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
