package com.paperflow.user.api;

import com.paperflow.user.service.AuthService.ServiceException;
import java.util.HashMap;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(ServiceException.class)
  public ResponseEntity<Envelope<Object>> handleService(
      ServiceException ex,
      HttpServletRequest req
  ) {
    HttpStatus status = mapStatus(ex.code());
    return ResponseEntity.status(status).body(Envelope.err(safeRequestId(req), ex.code(), ex.getMessage(), Map.of()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Envelope<Object>> handleValidation(
      MethodArgumentNotValidException ex,
      HttpServletRequest req
  ) {
    Map<String, Object> details = new HashMap<>();
    details.put("fields", ex.getBindingResult().getFieldErrors().stream().map(this::fieldErr).toList());
    return ResponseEntity.status(400).body(Envelope.err(safeRequestId(req), "REQ_VALIDATION_FAILED", "Validation failed", details));
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Envelope<Object>> handleIllegalArgument(
      IllegalArgumentException ex,
      HttpServletRequest req
  ) {
    String msg = ex.getMessage();
    if ("AUTH_MISSING".equals(msg)) {
      return ResponseEntity.status(401).body(Envelope.err(safeRequestId(req), "AUTH_MISSING_TOKEN", "Missing user identity", Map.of()));
    }
    if ("USER_NOT_FOUND".equals(msg)) {
      return ResponseEntity.status(404).body(Envelope.err(safeRequestId(req), "RES_NOT_FOUND", "User not found", Map.of()));
    }
    if ("EMAIL_IN_USE".equals(msg)) {
      return ResponseEntity.status(409).body(Envelope.err(safeRequestId(req), "RES_CONFLICT", "Email already in use", Map.of()));
    }
    if ("PHONE_IN_USE".equals(msg)) {
      return ResponseEntity.status(409).body(Envelope.err(safeRequestId(req), "RES_CONFLICT", "Phone already in use", Map.of()));
    }
    if ("QQ_IN_USE".equals(msg)) {
      return ResponseEntity.status(409).body(Envelope.err(safeRequestId(req), "RES_CONFLICT", "QQ already bound", Map.of()));
    }
    if ("WECHAT_IN_USE".equals(msg)) {
      return ResponseEntity.status(409).body(Envelope.err(safeRequestId(req), "RES_CONFLICT", "WeChat already bound", Map.of()));
    }
    return ResponseEntity.status(400).body(Envelope.err(safeRequestId(req), "REQ_INVALID", "Invalid request", Map.of()));
  }

  @ExceptionHandler({MultipartException.class, MaxUploadSizeExceededException.class})
  public ResponseEntity<Envelope<Object>> handleMultipartError(
      Exception ex,
      HttpServletRequest req
  ) {
    return ResponseEntity.status(400).body(Envelope.err(safeRequestId(req), "REQ_INVALID", "Invalid upload request", Map.of()));
  }

  private Map<String, Object> fieldErr(FieldError e) {
    Map<String, Object> m = new HashMap<>();
    m.put("field", e.getField());
    m.put("reason", e.getCode());
    return m;
  }

  private HttpStatus mapStatus(String code) {
    if (code == null) {
      return HttpStatus.BAD_REQUEST;
    }
    if (code.startsWith("SYS_")) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
    if (code.equals("AUTH_FORBIDDEN") || code.equals("AUTH_DISABLED")) {
      return HttpStatus.FORBIDDEN;
    }
    if (code.startsWith("AUTH_")) {
      return HttpStatus.UNAUTHORIZED;
    }
    if (code.equals("RES_CONFLICT")) {
      return HttpStatus.CONFLICT;
    }
    return HttpStatus.BAD_REQUEST;
  }

  private String safeRequestId(HttpServletRequest req) {
    if (req == null) {
      return "";
    }
    String requestId = req.getHeader("X-Request-Id");
    return requestId == null ? "" : requestId;
  }
}
