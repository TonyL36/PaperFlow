package com.paperflow.content.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.paperflow.content.config.PathfinderAiProperties;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class AiChatService {
  private final PathfinderAiProperties props;
  private final PathfinderPlanService pathfinderPlanService;
  private final ObjectMapper objectMapper;
  private final HttpClient httpClient;

  public AiChatService(
      PathfinderAiProperties props,
      PathfinderPlanService pathfinderPlanService,
      ObjectMapper objectMapper
  ) {
    this.props = props;
    this.pathfinderPlanService = pathfinderPlanService;
    this.objectMapper = objectMapper;
    this.httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(Math.max(1000, props.getTimeoutMillis())))
        .build();
  }

  public ChatDraft chat(String model, String userEmail, String systemPrompt, String userPrompt) {
    String normalizedModel = pathfinderPlanService.normalizeModel(model);
    String normalizedSystemPrompt = systemPrompt == null || systemPrompt.isBlank() ? "你是 PaperFlow AI 助手。" : systemPrompt.trim();
    String normalizedUserPrompt = userPrompt == null ? "" : userPrompt.trim();
    if (normalizedUserPrompt.isBlank()) {
      throw new IllegalArgumentException("userPrompt is required");
    }
    String apiKey = pickApiKey(userEmail);
    if (apiKey == null || apiKey.isBlank()) {
      return new ChatDraft(normalizedModel, "AI 服务当前不可用，请稍后重试。");
    }
    try {
      return remoteChat(normalizedModel, normalizedSystemPrompt, normalizedUserPrompt, apiKey);
    } catch (Exception ignored) {
      return new ChatDraft(normalizedModel, "AI 服务当前不可用，请稍后重试。");
    }
  }

  private ChatDraft remoteChat(String model, String systemPrompt, String userPrompt, String apiKey) throws Exception {
    ObjectNode payload = objectMapper.createObjectNode();
    payload.put("model", model);
    payload.put("temperature", 0.3);
    ArrayNode messages = payload.putArray("messages");
    messages.addObject().put("role", "system").put("content", systemPrompt);
    messages.addObject().put("role", "user").put("content", userPrompt);

    HttpRequest req = HttpRequest.newBuilder(URI.create(props.getEndpoint()))
        .timeout(Duration.ofMillis(Math.max(1000, props.getTimeoutMillis())))
        .header("Content-Type", "application/json")
        .header("Authorization", "Bearer " + apiKey)
        .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
        .build();
    HttpResponse<String> response = httpClient.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    if (response.statusCode() >= 400) {
      throw new IllegalStateException("ai request failed");
    }
    JsonNode root = objectMapper.readTree(response.body());
    String content = root.at("/choices/0/message/content").asText("");
    if (content.isBlank()) {
      throw new IllegalStateException("empty ai response");
    }
    return new ChatDraft(model, content);
  }

  private String pickApiKey(String userEmail) {
    String shared = props.getApiKey();
    if (shared != null && !shared.isBlank()) {
      return shared.trim();
    }
    if (userEmail == null || userEmail.isBlank()) {
      return null;
    }
    Map<String, String> keys = parseKeyPairs(props.getApiKeyPairs());
    return keys.get(userEmail.trim().toLowerCase(Locale.ROOT));
  }

  private Map<String, String> parseKeyPairs(String pairs) {
    Map<String, String> result = new LinkedHashMap<>();
    if (pairs == null || pairs.isBlank()) {
      return result;
    }
    String[] entries = pairs.split("[;\\n]");
    for (String entry : entries) {
      String raw = entry == null ? "" : entry.trim();
      if (raw.isBlank()) {
        continue;
      }
      int idx = raw.indexOf('=');
      if (idx <= 0 || idx >= raw.length() - 1) {
        continue;
      }
      String email = raw.substring(0, idx).trim().toLowerCase(Locale.ROOT);
      String key = raw.substring(idx + 1).trim();
      if (!email.isBlank() && !key.isBlank()) {
        result.put(email, key);
      }
    }
    return result;
  }

  public record ChatDraft(String model, String assistantMessage) {
  }
}
