package com.paperflow.content.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;

public record PaperIngestRequest(
    String postId,
    String userId,
    @NotBlank @Size(min = 1, max = 255) String title,
    @NotBlank @Size(min = 1, max = 64) String source,
    @NotBlank @Size(min = 1, max = 20000) String content,
    String paperId,
    @Valid List<PaperFormat> formats,
    @Valid List<PaperHighlight> highlights,
    List<String> tags,
    OffsetDateTime publishedAt
) {
  public record PaperFormat(
      @NotBlank @Size(min = 1, max = 16) String type,
      @NotBlank @Size(min = 1, max = 2048) String url
  ) {
  }

  public record PaperHighlight(
      String highlightId,
      Integer page,
      @Size(max = 32) String level,
      @Size(max = 255) String title,
      @NotBlank @Size(min = 1, max = 4000) String snippet
  ) {
  }
}
