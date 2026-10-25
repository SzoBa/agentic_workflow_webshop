package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import hu.webshop.support.IntegrationTest;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * A lejárt bejelentkezési számlálók takarítása (spec 7.2).
 *
 * <p>Amit ez a teszt őriz: a retenció NEM lóghat a sikeres bejelentkezésen. A
 * {@code login_attempts} táblába hitelesítés nélküli kérés is beszúr sort, kulcsonként
 * egyet — a támadó pedig épp az, aki sosem lép be sikeresen. Ha a takarítás csak a
 * boldog úton fut, nála soha nem fut le, és a tábla korlátlanul nő. Ezért ebben a
 * tesztben SEHOL nincs sikeres bejelentkezés: egyetlen sikertelen próbálkozásnak is el
 * kell takarítania a lejárt ablakokat.
 *
 * <p>A lejárt sor közvetlen beszúrással jön létre, mert az időben visszamenőleg
 * keletkezett ablakot HTTP-n nem lehet előállítani (ez teszi az esetet
 * környezetfüggővé). Az állítások viszont a tábla valódi tartalmát nézik.
 */
class AuthRateLimitPurgeTest extends IntegrationTest {

    private static final String REGI_KULCS = "203.0.113.10";
    private static final String FRISS_KULCS = "203.0.113.11";

    private void seedAttempt(String key, int count, Instant firstAt) {
        transactions.executeWithoutResult(status -> entityManager.createNativeQuery(
                        "insert into login_attempts (attempt_key, attempts, first_at)"
                                + " values (?1, ?2, ?3)")
                .setParameter(1, key)
                .setParameter(2, count)
                .setParameter(3, firstAt)
                .executeUpdate());
    }

    private boolean exists(String key) {
        Number count = inTransaction(() -> (Number) entityManager.createNativeQuery(
                        "select count(*) from login_attempts where attempt_key = ?1")
                .setParameter(1, key)
                .getSingleResult());
        return count.intValue() > 0;
    }

    @Test
    void aLejartAblakotEgySIKERTELENProbalkozasIsEltakaritja() {
        Instant now = Instant.now();
        seedAttempt(REGI_KULCS, 7, now.minus(LoginAttemptService.WINDOW).minusSeconds(300));
        seedAttempt(FRISS_KULCS, 2, now.minusSeconds(60));

        // Egyetlen sikertelen bejelentkezés — sikeres BELÉPÉS nincs a tesztben.
        post("/api/auth/login",
                Map.of("username", "nincsilyenfelhasznalo", "password", "rosszjelszo"));

        assertThat(exists(REGI_KULCS))
                .as("a lejárt ablak sorát a hibaútnak kell eltakarítania")
                .isFalse();
        assertThat(exists(FRISS_KULCS))
                .as("az AKTÍV ablak sora nem törölhető — az egy élő zárolást oldana fel")
                .isTrue();
    }
}
