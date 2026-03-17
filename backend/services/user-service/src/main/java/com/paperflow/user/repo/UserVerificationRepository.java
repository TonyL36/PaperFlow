package com.paperflow.user.repo;

import com.paperflow.user.domain.UserVerificationEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserVerificationRepository extends JpaRepository<UserVerificationEntity, String> {
  Optional<UserVerificationEntity> findTopByUserIdAndTypeAndTargetAndConsumedAtIsNullOrderByCreatedAtDesc(String userId, String type, String target);

  Optional<UserVerificationEntity> findTopByUserIdAndTypeAndConsumedAtIsNullOrderByCreatedAtDesc(String userId, String type);
}
