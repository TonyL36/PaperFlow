package com.paperflow.user.repo;

import com.paperflow.user.domain.VerificationEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VerificationRepository extends JpaRepository<VerificationEntity, String> {
  Optional<VerificationEntity> findTopByTypeAndTargetAndConsumedAtIsNullOrderByCreatedAtDesc(String type, String target);
}

