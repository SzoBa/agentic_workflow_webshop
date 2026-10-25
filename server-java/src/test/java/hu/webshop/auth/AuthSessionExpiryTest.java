package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import hu.webshop.support.IntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

/**
 * A munkamenet lejárata és csúszó megújítása (K-53, K-54).
 *
 * <p>A konformancia-katalógus ezeket környezeti beavatkozást igénylő eseteknek
 * (⚙) jelöli: rövid {@code TOKEN_TTL_HOURS} kell hozzájuk. Itt 3 másodperc
 * (0,000833 óra) — elég rövid a gyors futáshoz, és elég hosszú ahhoz, hogy egy-két
 * HTTP körülfordulás ne csússzon bele a határba.
 */
@TestPropertySource(properties = "webshop.token-ttl-hours=0.000833333")
class AuthSessionExpiryTest extends IntegrationTest {

    /** A beállított élettartam ezredmásodpercben. */
    private static final long TTL_MS = 3_000;

    private String registerAndGetToken() {
        ResponseEntity<JsonNode> response = post("/api/auth/register", Map.of(
                "username", "lejaratteszt",
                "email", "lejarat@example.com",
                "address", "Teszt utca 7",
                "password", "jelszo12345"));
        return response.getBody().get("token").asText();
    }

    /** K-53: a lejárt token ugyanazt a 401-et kapja, mint az érvénytelen. */
    @Test
    void k53_unauthorizedForExpiredToken() throws Exception {
        String token = registerAndGetToken();

        Thread.sleep(TTL_MS + 500);

        ResponseEntity<JsonNode> response = get("/api/auth/me", token);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.AUTH_REQUIRED);
    }

    /**
     * K-54: az élettartam felénél több eltelt, egy hitelesített kérés
     * MEGHOSSZABBÍTJA a munkamenetet.
     *
     * <p>A bizonyíték a második kérés: az eredeti lejárat addigra már elmúlt, tehát
     * csak akkor kaphat 200-at, ha az első kérés valóban meghosszabbította (és ki is
     * írta) a lejáratot.
     */
    @Test
    void k54_authenticatedRequestExtendsTheSession() throws Exception {
        String token = registerAndGetToken();

        Thread.sleep(TTL_MS * 3 / 5);
        assertThat(get("/api/auth/me", token).getStatusCode()).isEqualTo(HttpStatus.OK);

        Thread.sleep(TTL_MS * 3 / 5);
        assertThat(get("/api/auth/me", token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
