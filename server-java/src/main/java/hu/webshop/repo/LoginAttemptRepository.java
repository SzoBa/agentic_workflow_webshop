package hu.webshop.repo;

import hu.webshop.domain.LoginAttemptEntity;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Bejelentkezési próbálkozás-számlálók. */
public interface LoginAttemptRepository extends JpaRepository<LoginAttemptEntity, String> {

    /**
     * A lejárt ablakok takarítása — enélkül a tábla korlátlanul nőne.
     *
     * <p>A feltétel SZIGORÚAN kisebb, mert a {@code LoginAttemptService#isStale} is
     * szigorúan nagyobbat vizsgál: a pontosan a határon álló bejegyzés ott még AKTÍV
     * ablak. A {@code <=} egy zárolást oldana fel a takarítással.
     */
    @Modifying
    @Query("delete from LoginAttemptEntity a where a.firstAt < :threshold")
    int deleteExpired(@Param("threshold") Instant threshold);
}
