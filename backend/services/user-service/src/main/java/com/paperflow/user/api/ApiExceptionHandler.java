package com.paperflow.user.api;

import com.paperflow.user.service.AuthService.ServiceException;
import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(ServiceException.class)
  public ResponseEntity<Envelope<Object>> handleService(
      ServiceException ex,
      @RequestHeader(value = "X-Request-Id", required = false) String requestId
  ) {
    HttpStatus status = mapStatus(ex.code());
    return ResponseEntity.status(status).body(Envelope.err(safeRequestId(requestId), ex.code(), ex.getMessage(), Map.of()));
  }

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

  private HttpStatus mapStatus(String code) {
    if (code == null) {
      return HttpStatus.BAD_REQUEST;
    }
    if (code.startsWith("AUTH_")) {
      return HttpStatus.UNAUTHORIZED;
    }
    if (code.equals("RES_CONFLICT")) {
      return HttpStatus.CONFLICT;
    }
    return HttpStatus.BAD_REQUEST;
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}

