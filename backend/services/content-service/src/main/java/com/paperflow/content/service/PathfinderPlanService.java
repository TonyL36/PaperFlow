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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class PathfinderPlanService {
  public static final String MODEL_GLM_4_FLASH = "glm-4-flash";
  public static final String MODEL_GLM_Z1_FLASH = "glm-z1-flash";

  private final PathfinderAiProperties props;
  private final ObjectMapper objectMapper;
  private final HttpClient httpClient;

  public PathfinderPlanService(PathfinderAiProperties props, ObjectMapper objectMapper) {
    this.props = props;
    this.objectMapper = objectMapper;
    this.httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(Math.max(1000, props.getTimeoutMillis())))
        .build();
  }

  public PlanDraft generate(String goal, String model, String userEmail) {
    String normalizedGoal = goal == null ? "" : goal.trim();
    if (normalizedGoal.isBlank()) {
      throw new IllegalArgumentException("goal is required");
    }
    String normalizedModel = normalizeModel(model);
    String apiKey = pickApiKey(userEmail);
    if (apiKey == null || apiKey.isBlank()) {
      return fallbackPlan(normalizedGoal, normalizedModel);
    }
    try {
      return remotePlan(normalizedGoal, normalizedModel, apiKey);
    } catch (Exception e) {
      return fallbackPlan(normalizedGoal, normalizedModel);
    }
  }

  public String normalizeModel(String model) {
    if (MODEL_GLM_Z1_FLASH.equalsIgnoreCase(model)) {
      return MODEL_GLM_Z1_FLASH;
    }
    return MODEL_GLM_4_FLASH;
  }

  private PlanDraft remotePlan(String goal, String model, String apiKey) throws Exception {
    ObjectNode payload = objectMapper.createObjectNode();
    payload.put("model", model);
    payload.put("temperature", 0.3);
    ObjectNode responseFormat = payload.putObject("response_format");
    responseFormat.put("type", "json_object");
    ArrayNode messages = payload.putArray("messages");
    messages.addObject()
        .put("role", "system")
        .put(
            "content",
            "你是PaperFlow学习路径助手。请只输出JSON对象，结构为{focus:string[],assistantMessage:string,stages:Stage[]}。"
                + "Stage结构为{id,title,objective,etaDays:number,status:\"locked\",readings:[{id,title,done:false}]}"
                + "，必须输出4个阶段，每阶段3个readings。");
    messages.addObject()
        .put("role", "user")
        .put("content", "学习目标：" + goal);

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
    JsonNode parsed = objectMapper.readTree(content);
    JsonNode focus = ensureFocus(parsed.get("focus"), goal);
    JsonNode stages = ensureStages(parsed.get("stages"), goal, model);
    String assistantMessage = parsed.path("assistantMessage").asText(defaultAssistantMessage(goal, model, stages.size()));
    return new PlanDraft(goal, model, focus, stages, assistantMessage);
  }

  private PlanDraft fallbackPlan(String goal, String model) {
    JsonNode focus = fallbackFocus(goal);
    JsonNode stages = fallbackStages(goal, model, focus);
    String assistantMessage = defaultAssistantMessage(goal, model, stages.size());
    return new PlanDraft(goal, model, focus, stages, assistantMessage);
  }

  private JsonNode ensureFocus(JsonNode focusNode, String goal) {
    if (focusNode != null && focusNode.isArray() && focusNode.size() > 0) {
      return focusNode;
    }
    return fallbackFocus(goal);
  }

  private JsonNode ensureStages(JsonNode stagesNode, String goal, String model) {
    if (stagesNode != null && stagesNode.isArray() && stagesNode.size() > 0) {
      return recalculateStatuses((ArrayNode) stagesNode.deepCopy());
    }
    return fallbackStages(goal, model, fallbackFocus(goal));
  }

  private ArrayNode fallbackFocus(String goal) {
    String compact = goal.replaceAll("[，。,.]", " ").replaceAll("\\s+", " ").trim();
    List<String> list = new ArrayList<>();
    if (!compact.isBlank()) {
      for (String part : compact.split(" ")) {
        if (!part.isBlank()) {
          list.add(part);
        }
        if (list.size() >= 4) {
          break;
        }
      }
    }
    if (list.isEmpty()) {
      list = List.of("学习目标", "关键概念", "系统设计", "项目实战");
    } else if (list.size() < 4) {
      list.add("关键概念");
      list.add("系统设计");
      list.add("项目实战");
      list = list.subList(0, 4);
    }
    ArrayNode focus = objectMapper.createArrayNode();
    list.forEach(focus::add);
    return focus;
  }

  private ArrayNode fallbackStages(String goal, String model, JsonNode focus) {
    String[] stageTitles = MODEL_GLM_Z1_FLASH.equals(model)
        ? new String[] {"问题拆解", "推理链路", "方案验证", "成果固化"}
        : new String[] {"基础地图", "核心突破", "综合实战", "复盘进阶"};
    ArrayNode stages = objectMapper.createArrayNode();
    for (int i = 0; i < stageTitles.length; i++) {
      String topic = focus.path(i % Math.max(1, focus.size())).asText("核心概念");
      ObjectNode stage = stages.addObject();
      stage.put("id", "s" + (i + 1));
      stage.put("title", "第 " + (i + 1) + " 关 · " + stageTitles[i]);
      stage.put("objective", "围绕「" + topic + "」推进「" + goal + "」并沉淀可复用输出。");
      stage.put("etaDays", i == 0 ? 2 : i == 1 ? 3 : i == 2 ? 4 : 2);
      stage.put("status", "locked");
      ArrayNode readings = stage.putArray("readings");
      readings.addObject().put("id", "s" + (i + 1) + "_r1").put("title", topic + " 导读与术语卡片").put("done", i == 0);
      readings.addObject().put("id", "s" + (i + 1) + "_r2").put("title", topic + " 案例拆解与关键流程").put("done", false);
      readings.addObject().put("id", "s" + (i + 1) + "_r3").put("title", topic + " 练习题与自测清单").put("done", false);
    }
    return recalculateStatuses(stages);
  }

  private ArrayNode recalculateStatuses(ArrayNode stages) {
    boolean shouldUnlock = true;
    for (JsonNode node : stages) {
      if (!(node instanceof ObjectNode stage)) {
        continue;
      }
      if (!shouldUnlock) {
        stage.put("status", "locked");
        continue;
      }
      JsonNode readings = stage.path("readings");
      int total = readings.isArray() ? readings.size() : 0;
      int done = 0;
      if (readings.isArray()) {
        for (JsonNode r : readings) {
          if (r.path("done").asBoolean(false)) {
            done++;
          }
        }
      }
      if (total > 0 && done == total) {
        stage.put("status", "done");
        continue;
      }
      stage.put("status", "in_progress");
      shouldUnlock = false;
    }
    return stages;
  }

  private String defaultAssistantMessage(String goal, String model, int stageCount) {
    return "已为你生成「" + goal + "」的 " + stageCount + " 阶段闯关路径，当前模型：" + model + "。";
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

  public record PlanDraft(String goal, String model, JsonNode focus, JsonNode stages, String assistantMessage) {
  }
}
