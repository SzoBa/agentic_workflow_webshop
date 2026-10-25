package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.bootstrap.DataBootstrap;
import hu.webshop.support.IntegrationTest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * K-57: a tárolóban a KIADOTT token nem szerepel, csak a lenyomata (ADR-0008).
 *
 * <p>A munkamenet-token bemutatóra szóló hitelesítő adat: aki elolvassa, az jelszó
 * ismerete nélkül lesz bárki. Nyersen tárolva egy adatbázis-mentés, egy naplóba került
 * lekérdezés vagy egy csak olvasható replika elég a teljes felhasználói kör
 * átvételéhez — pont az a kockázat, ami miatt a jelszót sem tároljuk.
 *
 * <p>Ezért néz ez a teszt KÖZVETLENÜL az adatbázisba: HTTP-n a különbség nem látszik
 * (ez teszi az esetet környezetfüggővé), a nyers és a hash-elt tárolás ugyanúgy
 * viselkedik kívülről. A lenyomatot a teszt önállóan számolja ki, nem a
 * {@code SessionService}-t hívja — különben a saját megvalósítását igazolná.
 */
class SessionTokenStorageTest extends IntegrationTest {

    private static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new AssertionError(ex);
        }
    }

    private String storedTokenHash(String username) {
        return inTransaction(() -> (String) entityManager.createNativeQuery(
                        "select token_hash from users where username = ?1")
                .setParameter(1, username)
                .getSingleResult());
    }

    @Test
    void aTaroltErtekAKiadottTokenLenyomata() {
        ResponseEntity<JsonNode> registered = post("/api/auth/register", Map.of(
                "username", "tokentarolo",
                "email", "tokentarolo@example.com",
                "address", "Teszt utca 1",
                "password", "jelszo12345"));
        String token = registered.getBody().get("token").asText();

        String stored = storedTokenHash("tokentarolo");

        assertThat(stored)
                .as("a kiadott token nem kerülhet nyersen a tárolóba")
                .isNotEqualTo(token)
                .isEqualTo(sha256Hex(token));
        // A kiadott token viszont továbbra is működik: a lenyomat a tárolás módja,
        // nem a szerződés megváltoztatása.
        assertThat(get("/api/auth/me", token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void aBejelentkezesUtanIsALenyomatTarolodik() {
        String token = adminToken();

        String stored = storedTokenHash(DataBootstrap.SEED_ADMIN_USERNAME);

        assertThat(stored).isNotEqualTo(token).isEqualTo(sha256Hex(token));
        assertThat(get("/api/auth/me", token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /** Kijelentkezés után a mező kiürül — a lenyomat sem marad ott. */
    @Test
    void kijelentkezesUtanNincsTaroltLenyomat() {
        String token = adminToken();

        assertThat(post("/api/auth/logout", null, token).getStatusCode())
                .isEqualTo(HttpStatus.OK);

        assertThat(storedTokenHash(DataBootstrap.SEED_ADMIN_USERNAME))
                .isNull();
        assertThat(get("/api/auth/me", token).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
