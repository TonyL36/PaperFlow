package com.paperflow.content.repo;

import com.paperflow.content.domain.NotificationEntity;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<NotificationEntity, String> {
  @Query("select n from NotificationEntity n where n.recipientUserId=:userId order by n.createdAt desc")
  List<NotificationEntity> listByRecipient(@Param("userId") String userId, Pageable pageable);

  @Query("select count(n) from NotificationEntity n where n.recipientUserId=:userId and n.readAt is null")
  long countUnreadByRecipient(@Param("userId") String userId);

  @Modifying
  @Query("update NotificationEntity n set n.readAt=:readAt where n.recipientUserId=:userId and n.readAt is null")
  int markAllReadByRecipient(@Param("userId") String userId, @Param("readAt") java.time.OffsetDateTime readAt);
}
