package com.paperflow.content.repo;

import com.paperflow.content.domain.PostEntity;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PostRepository extends JpaRepository<PostEntity, String> {
  @Query("select p from PostEntity p order by p.publishedAt desc, p.id desc")
  List<PostEntity> listRecent(Pageable pageable);

  boolean existsByPublishedAtBetween(OffsetDateTime start, OffsetDateTime end);

  boolean existsBySourceAndPublishedAtBetween(String source, OffsetDateTime start, OffsetDateTime end);

  long countByAuthorUserId(String authorUserId);
}
