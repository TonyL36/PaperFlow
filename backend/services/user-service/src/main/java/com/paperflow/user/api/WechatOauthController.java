package com.paperflow.user.api;

import com.paperflow.user.api.Envelope.Link;
import com.paperflow.user.domain.UserEntity;
import com.paperflow.user.repo.UserRepository;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.core.env.Environment;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/oauth/wechat")
public class WechatOauthController {
  private final Environment env;
  private final UserRepository users;

  public WechatOauthController(Environment env, UserRepository users) {
    this.env = env;
    this.users = users;
  }

  @GetMapping("/authorize")
  public ResponseEntity<Envelope<Object>> authorizeForBind(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Id", required = false) String userId
  ) {
    if (userId == null || userId.isBlank()) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(requestId), "AUTH_MISSING_TOKEN", "Missing user identity", java.util.Map.of()));
    }
    UserEntity u = users.findById(userId).orElse(null);
    if (u == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
    }

    long exp = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(10).toEpochSecond();
    String nonce = UUID.randomUUID().toString().replace("-", "");
    String state = signState(userId, exp, nonce);

    boolean mock = Boolean.parseBoolean(env.getProperty("paperflow.wechat.mock", "true"));
    String authorizeUrl;
    if (mock) {
      String openid = "mock_" + sha1(userId).substring(0, 10);
      String nickname = "MockWx";
      authorizeUrl = "/api/v1/oauth/wechat/callback?code=" + urlEncode(openid) + "&state=" + urlEncode(state) + "&nickname=" + urlEncode(nickname);
    } else {
      String appId = env.getProperty("paperflow.wechat.appId", "");
      String redirectUri = env.getProperty("paperflow.wechat.redirectUri", "");
      authorizeUrl = "https://open.weixin.qq.com/connect/qrconnect"
          + "?appid=" + urlEncode(appId)
          + "&redirect_uri=" + urlEncode(redirectUri)
          + "&response_type=code"
          + "&scope=snsapi_login"
          + "&state=" + urlEncode(state)
          + "#wechat_redirect";
    }

    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("authorizeUrl", authorizeUrl);
    data.put("expiresAtEpochSeconds", exp);
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("callback", "/api/v1/oauth/wechat/callback", Optional.of("GET"), Optional.empty()))
    ));
  }

  @GetMapping("/callback")
  public ResponseEntity<Envelope<Object>> callback(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestParam("code") String code,
      @RequestParam("state") String state,
      @RequestParam(value = "nickname", required = false) String nickname
  ) {
    StatePayload p = verifyState(state);
    if (p == null) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_INVALID_STATE", "Invalid state", java.util.Map.of()));
    }
    long now = OffsetDateTime.now(ZoneOffset.UTC).toEpochSecond();
    if (now > p.expEpochSeconds) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_STATE_EXPIRED", "State expired", java.util.Map.of()));
    }

    String openId = code.trim();
    String nn = nickname == null ? null : nickname.trim();
    if (nn != null && nn.isBlank()) {
      nn = null;
    }

    UserEntity u = users.findById(p.userId).orElse(null);
    if (u == null) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(requestId), "RES_NOT_FOUND", "User not found", java.util.Map.of()));
    }
    users.findByWechatOpenId(openId).ifPresent(other -> {
      if (!other.getId().equals(u.getId())) {
        throw new IllegalArgumentException("WECHAT_IN_USE");
      }
    });

    OffsetDateTime t = OffsetDateTime.now(ZoneOffset.UTC);
    u.setWechatOpenId(openId);
    u.setWechatNickname(nn);
    u.setWechatBoundAt(t);
    u.setUpdatedAt(t);
    users.save(u);

    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("wechatOpenId", u.getWechatOpenId());
    data.put("wechatNickname", u.getWechatNickname());
    data.put("wechatBoundAt", u.getWechatBoundAt());
    return ResponseEntity.ok(Envelope.ok(safeRequestId(requestId), data, List.of()));
  }

  private record StatePayload(String userId, long expEpochSeconds, String nonce) {
  }

  private String signState(String userId, long expEpochSeconds, String nonce) {
    String payload = userId + "." + expEpochSeconds + "." + nonce;
    byte[] sig = hmac(payload.getBytes(StandardCharsets.UTF_8), stateSecretBytes());
    return base64Url(payload.getBytes(StandardCharsets.UTF_8)) + "." + base64Url(sig);
  }

  private StatePayload verifyState(String state) {
    if (state == null || state.isBlank()) {
      return null;
    }
    String[] parts = state.split("\\.");
    if (parts.length != 2) {
      return null;
    }
    byte[] payloadBytes = base64UrlDecode(parts[0]);
    byte[] sigBytes = base64UrlDecode(parts[1]);
    if (payloadBytes == null || sigBytes == null) {
      return null;
    }
    byte[] expected = hmac(payloadBytes, stateSecretBytes());
    if (!MessageDigest.isEqual(expected, sigBytes)) {
      return null;
    }
    String payload = new String(payloadBytes, StandardCharsets.UTF_8);
    String[] p = payload.split("\\.");
    if (p.length != 3) {
      return null;
    }
    try {
      String userId = p[0];
      long exp = Long.parseLong(p[1]);
      String nonce = p[2];
      if (userId.isBlank() || nonce.isBlank()) {
        return null;
      }
      return new StatePayload(userId, exp, nonce);
    } catch (Exception e) {
      return null;
    }
  }

  private byte[] stateSecretBytes() {
    String secret = env.getProperty("paperflow.wechat.stateSecret", "change-me-wechat-state-secret");
    return secret.getBytes(StandardCharsets.UTF_8);
  }

  private byte[] hmac(byte[] data, byte[] secret) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret, "HmacSHA256"));
      return mac.doFinal(data);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private String base64Url(byte[] b) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
  }

  private byte[] base64UrlDecode(String s) {
    try {
      return Base64.getUrlDecoder().decode(s);
    } catch (Exception e) {
      return null;
    }
  }

  private String urlEncode(String s) {
    return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
  }

  private String sha1(String s) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-1");
      byte[] digest = md.digest((s == null ? "" : s).getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder();
      for (byte b : digest) {
        sb.append(String.format(Locale.ROOT, "%02x", b));
      }
      return sb.toString();
    } catch (Exception e) {
      return UUID.randomUUID().toString().replace("-", "");
    }
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}

