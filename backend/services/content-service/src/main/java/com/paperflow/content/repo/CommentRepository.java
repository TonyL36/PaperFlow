package com.paperflow.content.repo;

import com.paperflow.content.domain.CommentEntity;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommentRepository extends JpaRepository<CommentEntity, String> {
  @Query("select c from CommentEntity c where c.postId=:postId and c.status=:status order by c.createdAt desc")
  List<CommentEntity> listByPost(@Param("postId") String postId, @Param("status") String status, Pageable pageable);

  @Query("select c from CommentEntity c where c.postId=:postId and c.status=:status and c.parentCommentId is null order by c.createdAt desc")
  List<CommentEntity> listRootsByPost(@Param("postId") String postId, @Param("status") String status, Pageable pageable);

  @Query("select c from CommentEntity c where c.postId=:postId and c.status=:status and c.parentCommentId in :parentIds order by c.createdAt asc")
  List<CommentEntity> listRepliesByPostAndParents(@Param("postId") String postId, @Param("status") String status, @Param("parentIds") List<String> parentIds);

  @Query("select c from CommentEntity c where c.postId=:postId and c.status=:status order by c.createdAt asc")
  List<CommentEntity> listByPostAndStatus(@Param("postId") String postId, @Param("status") String status);

  @Query("""
      select c
      from CommentEntity c
      where c.postId=:postId
        and (
          c.status='APPROVED'
          or (:userId is not null and :userId <> '' and c.userId=:userId)
        )
      order by c.createdAt asc
      """)
  List<CommentEntity> listVisibleByPostForUser(@Param("postId") String postId, @Param("userId") String userId);

  @Query("select c from CommentEntity c where c.status=:status order by c.createdAt desc")
  List<CommentEntity> listByStatus(@Param("status") String status, Pageable pageable);
}
