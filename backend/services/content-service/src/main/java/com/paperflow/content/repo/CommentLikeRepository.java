package com.paperflow.content.repo;

import com.paperflow.content.domain.CommentLikeEntity;
import com.paperflow.content.domain.UserCommentKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommentLikeRepository extends JpaRepository<CommentLikeEntity, UserCommentKey> {
  boolean existsByIdUserIdAndIdCommentId(String userId, String commentId);

  long countByIdCommentId(String commentId);

  @Query("select count(cl) from CommentLikeEntity cl join CommentEntity c on c.id = cl.id.commentId where c.userId = :userId")
  long countReceivedByCommentAuthorUserId(@Param("userId") String userId);
}
