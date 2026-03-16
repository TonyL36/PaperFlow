package com.paperflow.user.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public final class Hashing {
  private Hashing() {
  }

  public static String sha256Hex(String s) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      byte[] bytes = md.digest((s == null ? "" : s).getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder(bytes.length * 2);
      for (byte b : bytes) {
        sb.append(String.format("%02x", b));
      }
      return sb.toString();
    } catch (Exception e) {
      throw new IllegalStateException("sha256 failed", e);
    }
  }
}

