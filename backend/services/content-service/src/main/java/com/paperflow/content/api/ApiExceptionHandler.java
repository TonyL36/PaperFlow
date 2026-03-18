package com.paperflow.content.api;

import java.util.HashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestControllerAdvice
public class ApiExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Envelope<Object>> handleValidation(
      MethodArgumentNotValidException ex,
      @RequestHeader(value = "X-Request-Id", required = false) String requestId
  ) {
    Map<String, Object> details = new HashMap<>();
    details.put("fields", ex.getBindingResult().getFieldErrors().stream().map(this::fieldErr).toList());
    return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_VALIDATION_FAILED", "Validation failed", details));
  }

  private Map<String, Object> fieldErr(FieldError e) {
    Map<String, Object> m = new HashMap<>();
    m.put("field", e.getField());
    m.put("reason", e.getCode());
    return m;
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<Envelope<Object>> handleAny(
      Exception ex,
      @RequestHeader(value = "X-Request-Id", required = false) String requestId
  ) {
    log.error("Unhandled error", ex);
    return ResponseEntity.status(500).body(Envelope.err(safeRequestId(requestId), "SYS_INTERNAL_ERROR", "Internal error", Map.of()));
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}
