package com.paperflow.user.service;

import com.paperflow.user.config.AuthProperties;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
  private final AuthProperties props;

  public TokenService(AuthProperties props) {
    this.props = props;
  }

  public String mintAccessToken(String userId, String email, List<String> roles) {
    Instant now = Instant.now();
    Instant exp = now.plusSeconds(props.getAccessTokenTtlSeconds());
    return Jwts.builder()
        .subject(userId)
        .claim("email", email)
        .claim("roles", roles)
        .id(UUID.randomUUID().toString())
        .issuedAt(Date.from(now))
        .expiration(Date.from(exp))
        .signWith(signingKey())
        .compact();
  }

  private Key signingKey() {
    byte[] bytes = (props.getJwtSecret() == null ? "" : props.getJwtSecret()).getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
      byte[] padded = new byte[32];
      System.arraycopy(bytes, 0, padded, 0, bytes.length);
      bytes = padded;
    }
    return Keys.hmacShaKeyFor(bytes);
  }
}
