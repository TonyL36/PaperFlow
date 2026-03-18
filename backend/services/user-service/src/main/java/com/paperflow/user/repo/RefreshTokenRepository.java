package com.paperflow.user.repo;

import com.paperflow.user.domain.RefreshTokenEntity;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshTokenEntity, String> {
  Optional<RefreshTokenEntity> findByTokenHash(String tokenHash);

  @Modifying
  @Query("update RefreshTokenEntity t set t.revoked=true where t.userId=:userId")
  int revokeAllForUser(@Param("userId") String userId);

  @Modifying
  @Query("delete from RefreshTokenEntity t where t.expiresAt < :now")
  int deleteExpired(@Param("now") OffsetDateTime now);
}

