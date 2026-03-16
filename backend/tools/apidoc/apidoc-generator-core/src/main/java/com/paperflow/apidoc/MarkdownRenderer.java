package com.paperflow.apidoc;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public final class MarkdownRenderer {
  public String render(DocConfig config, List<Endpoint> endpoints) {
    Map<String, List<Endpoint>> byController = endpoints.stream()
        .collect(Collectors.groupingBy(Endpoint::controller, LinkedHashMap::new, Collectors.toList()));

    StringBuilder sb = new StringBuilder();
    sb.append("# ").append(config.title()).append("\n\n");
    sb.append("- API Version: ").append(config.apiVersion()).append("\n");
    sb.append("- Generated At: ").append(OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)).append("\n\n");

    sb.append("## Endpoints\n\n");
    sb.append("| Method | Path | Controller#Method |\n");
    sb.append("|---|---|---|\n");
    for (Endpoint e : endpoints) {
      sb.append("| ").append(e.httpMethod()).append(" | ").append(escapePipes(e.path())).append(" | ")
          .append(escapePipes(e.controller())).append("#").append(escapePipes(e.methodName()))
          .append(" |\n");
    }
    sb.append("\n");

    for (Map.Entry<String, List<Endpoint>> entry : byController.entrySet()) {
      sb.append("## ").append(entry.getKey()).append("\n\n");
      for (Endpoint e : entry.getValue()) {
        sb.append("### ").append(e.httpMethod()).append(" ").append(e.path()).append("\n\n");
        sb.append("- Handler: ").append(e.controller()).append("#").append(e.methodName()).append("\n");
        e.requestBodyType().ifPresent(t -> sb.append("- Request Body: `").append(t).append("`\n"));
        e.responseBodyType().ifPresent(t -> sb.append("- Response: `").append(t).append("`\n"));
        sb.append("\n");

        if (!e.params().isEmpty()) {
          sb.append("| In | Name | Type | Required |\n");
          sb.append("|---|---|---|---|\n");
          for (ApiParam p : e.params()) {
            sb.append("| ").append(p.in()).append(" | ").append(escapePipes(p.name())).append(" | `")
                .append(escapePipes(p.type())).append("` | ").append(p.required()).append(" |\n");
          }
          sb.append("\n");
        }
      }
    }

    return sb.toString();
  }

  private String escapePipes(String s) {
    if (s == null) {
      return "";
    }
    return s.replace("|", "\\|");
  }
}

