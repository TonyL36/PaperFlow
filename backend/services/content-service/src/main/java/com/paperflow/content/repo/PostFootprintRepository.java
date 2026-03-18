package com.paperflow.content.repo;

import com.paperflow.content.domain.PostFootprintEntity;
import com.paperflow.content.domain.UserPostKey;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

public interface PostFootprintRepository extends JpaRepository<PostFootprintEntity, UserPostKey> {
  @EntityGraph(attributePaths = "post")
  List<PostFootprintEntity> findByIdUserIdOrderByLastViewedAtDesc(String userId, Pageable pageable);
}
