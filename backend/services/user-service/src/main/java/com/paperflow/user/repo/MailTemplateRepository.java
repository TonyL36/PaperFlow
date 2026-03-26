package com.paperflow.user.repo;

import com.paperflow.user.domain.MailTemplateEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MailTemplateRepository extends JpaRepository<MailTemplateEntity, String> {
}

