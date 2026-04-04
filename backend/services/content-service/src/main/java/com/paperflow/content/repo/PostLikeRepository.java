package com.paperflow.content.repo;

import com.paperflow.content.domain.PostLikeEntity;
import com.paperflow.content.domain.UserPostKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostLikeRepository extends JpaRepository<PostLikeEntity, UserPostKey> {
  boolean existsByIdUserIdAndIdPostId(String userId, String postId);

  long countByIdPostId(String postId);

  @Query("select count(pl) from PostLikeEntity pl join PostEntity p on p.id = pl.id.postId where p.authorUserId = :userId")
  long countReceivedByAuthorUserId(@Param("userId") String userId);
}
