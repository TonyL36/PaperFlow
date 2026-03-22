package com.paperflow.content.repo;

import com.paperflow.content.domain.PathfinderSessionEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PathfinderSessionRepository extends JpaRepository<PathfinderSessionEntity, String> {
  List<PathfinderSessionEntity> findByUserIdOrderByUpdatedAtDesc(String userId, Pageable pageable);

  Optional<PathfinderSessionEntity> findBySessionIdAndUserId(String sessionId, String userId);
}
