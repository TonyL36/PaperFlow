package com.paperflow.gateway.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpMethod;

class EndpointAccessPolicyTest {
  private final EndpointAccessPolicy policy = new EndpointAccessPolicy();

  @ParameterizedTest
  @CsvSource({
      "GET,/api/v1/posts,false,PUBLIC_GET",
      "GET,/api/v1/posts/post-1,false,PUBLIC_GET",
      "GET,/api/v1/comments,false,PUBLIC_GET",
      "GET,/api/v1/public/users/u_demo,false,PUBLIC_GET",
      "GET,/api/v1/public/users/avatars/u_demo,false,PUBLIC_GET",
      "GET,/api/v1/public/papers/p_demo,false,PUBLIC_GET",
      "GET,/api/v1/oauth/qq/callback,false,AUTH",
      "POST,/api/v1/auth/login,false,AUTH",
      "GET,/api/v1/notifications,true,PROTECTED",
      "POST,/api/v1/comments,true,PROTECTED"
  })
  void classifies_routes_consistently(String method, String path, boolean authRequired, String bucket) {
    EndpointAccessDecision decision = policy.decide(path, HttpMethod.valueOf(method));

    assertEquals(authRequired, decision.authRequired());
    assertEquals(EndpointAccessBucket.valueOf(bucket), decision.bucket());
  }
}
