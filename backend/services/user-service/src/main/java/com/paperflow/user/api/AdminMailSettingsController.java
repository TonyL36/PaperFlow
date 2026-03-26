package com.paperflow.user.api;

import com.paperflow.user.api.Envelope.Link;
import com.paperflow.user.api.dto.MailTemplateResponse;
import com.paperflow.user.api.dto.UpdateMailTemplateRequest;
import com.paperflow.user.service.MailTemplateService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/settings/mail-templates")
public class AdminMailSettingsController {
  private final MailTemplateService templates;

  public AdminMailSettingsController(MailTemplateService templates) {
    this.templates = templates;
  }

  @GetMapping("/types")
  public ResponseEntity<Envelope<Object>> listTypes(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", Map.of()));
    }
    var data = new java.util.LinkedHashMap<String, Object>();
    data.put("items", templates.typeLabels());
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/admin/settings/mail-templates/types", Optional.of("GET"), Optional.empty()))
    ));
  }

  @GetMapping("/{templateType}")
  public ResponseEntity<Envelope<MailTemplateResponse>> getTemplate(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles,
      @PathVariable("templateType") String templateType
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", Map.of()));
    }
    MailTemplateService.MailTemplate t;
    try {
      t = templates.getTemplate(templateType);
    } catch (IllegalArgumentException e) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_VALIDATION_FAILED", "unsupported template type", Map.of()));
    }
    MailTemplateResponse data = new MailTemplateResponse(
        t.typeUpper(),
        t.subjectTemplate(),
        t.bodyTemplate(),
        templates.placeholders(),
        t.updatedAt()
    );
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/admin/settings/mail-templates/" + t.typeUpper(), Optional.of("GET"), Optional.empty()))
    ));
  }

  @PutMapping("/{templateType}")
  public ResponseEntity<Envelope<MailTemplateResponse>> updateTemplate(
      @RequestHeader(value = "X-Request-Id", required = false) String requestId,
      @RequestHeader(value = "X-User-Roles", required = false) String roles,
      @PathVariable("templateType") String templateType,
      @RequestBody UpdateMailTemplateRequest req
  ) {
    if (!isAdmin(roles)) {
      return ResponseEntity.status(403).body(Envelope.err(safeRequestId(requestId), "AUTH_FORBIDDEN", "Admin required", Map.of()));
    }
    MailTemplateService.MailTemplate t;
    try {
      t = templates.updateTemplate(
          templateType,
          req == null ? null : req.subjectTemplate(),
          req == null ? null : req.bodyTemplate()
      );
    } catch (IllegalArgumentException e) {
      return ResponseEntity.status(400).body(Envelope.err(safeRequestId(requestId), "REQ_VALIDATION_FAILED", "unsupported template type", Map.of()));
    }
    MailTemplateResponse data = new MailTemplateResponse(
        t.typeUpper(),
        t.subjectTemplate(),
        t.bodyTemplate(),
        templates.placeholders(),
        t.updatedAt()
    );
    return ResponseEntity.ok(Envelope.ok(
        safeRequestId(requestId),
        data,
        List.of(new Link("self", "/api/v1/admin/settings/mail-templates/" + t.typeUpper(), Optional.of("PUT"), Optional.empty()))
    ));
  }

  private boolean isAdmin(String roles) {
    if (roles == null || roles.isBlank()) {
      return false;
    }
    for (String r : roles.split(",")) {
      if ("ADMIN".equalsIgnoreCase(r.trim())) {
        return true;
      }
    }
    return false;
  }

  private String safeRequestId(String requestId) {
    return requestId == null ? "" : requestId;
  }
}

