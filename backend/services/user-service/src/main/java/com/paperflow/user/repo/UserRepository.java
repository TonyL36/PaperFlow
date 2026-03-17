package com.paperflow.user.repo;

import com.paperflow.user.domain.UserEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<UserEntity, String> {
  Optional<UserEntity> findByEmail(String email);
  Optional<UserEntity> findByPhone(String phone);
  Optional<UserEntity> findByQqOpenId(String qqOpenId);
  Optional<UserEntity> findByWechatOpenId(String wechatOpenId);

  @Query("""
      select u from UserEntity u
      where (:q is null or :q = '' or lower(u.email) like lower(concat('%', :q, '%')) or lower(u.displayName) like lower(concat('%', :q, '%')))
        and (:status is null or :status = '' or lower(u.status) = lower(:status))
        and (:role is null or :role = '' or lower(u.roles) like lower(concat('%', :role, '%')))
      order by u.createdAt desc
      """)
  List<UserEntity> search(@Param("q") String q, @Param("status") String status, @Param("role") String role, Pageable pageable);
}
