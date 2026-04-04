package com.paperflow.content.repo;

import com.paperflow.content.domain.PaperAssetEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaperAssetRepository extends JpaRepository<PaperAssetEntity, String> {
  Optional<PaperAssetEntity> findBySourceUrl(String sourceUrl);
}
