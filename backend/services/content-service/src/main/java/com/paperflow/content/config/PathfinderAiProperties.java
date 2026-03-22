package com.paperflow.content.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "paperflow.pathfinder.ai")
public class PathfinderAiProperties {
  private String endpoint = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
  private String apiKey = "";
  private String apiKeyPairs = "";
  private int timeoutMillis = 12000;

  public String getEndpoint() {
    return endpoint;
  }

  public void setEndpoint(String endpoint) {
    this.endpoint = endpoint;
  }

  public String getApiKeyPairs() {
    return apiKeyPairs;
  }

  public String getApiKey() {
    return apiKey;
  }

  public void setApiKey(String apiKey) {
    this.apiKey = apiKey;
  }

  public void setApiKeyPairs(String apiKeyPairs) {
    this.apiKeyPairs = apiKeyPairs;
  }

  public int getTimeoutMillis() {
    return timeoutMillis;
  }

  public void setTimeoutMillis(int timeoutMillis) {
    this.timeoutMillis = timeoutMillis;
  }
}
