package com.paperflow.gateway.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "paperflow.rate-limit")
public class RateLimitProperties {
  private int anonymousPerMinute;
  private int userPerMinute;

  public int getAnonymousPerMinute() {
    return anonymousPerMinute;
  }

  public void setAnonymousPerMinute(int anonymousPerMinute) {
    this.anonymousPerMinute = anonymousPerMinute;
  }

  public int getUserPerMinute() {
    return userPerMinute;
  }

  public void setUserPerMinute(int userPerMinute) {
    this.userPerMinute = userPerMinute;
  }
}
