package hu.webshop.repo;

import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Felhasználók. Az egyediséget adatbázis-index védi (I-1, I-2), nem alkalmazáslogika. */
public interface UserRepository extends JpaRepository<UserEntity, String> {

    /** Felhasználók beszúrási sorrendben (admin lista). */
    List<UserEntity> findAllByOrderBySeqAsc();

    /** A munkamenet-token LENYOMATÁHOZ tartozó felhasználó (ADR-0008). */
    Optional<UserEntity> findByTokenHash(String tokenHash);

    /** Bejelentkezéshez: a felhasználónév kis/nagybetűtől függetlenül illeszkedik. */
    Optional<UserEntity> findByUsernameIgnoreCase(String username);

    Optional<UserEntity> findByEmailIgnoreCase(String email);

    /** Az „legalább egy admin" invariáns (I-3) ellenőrzéséhez. */
    long countByRole(Role role);
}
