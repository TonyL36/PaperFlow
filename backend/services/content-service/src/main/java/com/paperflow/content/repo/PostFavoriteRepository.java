package com.paperflow.content.repo;

import com.paperflow.content.domain.PostFavoriteEntity;
import com.paperflow.content.domain.UserPostKey;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

public interface PostFavoriteRepository extends JpaRepository<PostFavoriteEntity, UserPostKey> {
  boolean existsByIdUserIdAndIdPostId(String userId, String postId);

  @EntityGraph(attributePaths = "post")
  List<PostFavoriteEntity> findByIdUserIdOrderByCreatedAtDesc(String userId, Pageable pageable);
}
