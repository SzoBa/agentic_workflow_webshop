package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import hu.webshop.support.IntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

/**
 * A bejelentkezés brute-force védelme (K-51).
 *
 * <p>Miért KÜLÖN osztály: a korlát IP-nként számol, és a tesztfuttató minden kérése
 * ugyanarról a hurok-címről jön — egy kimerített számláló a többi teszt
 * bejelentkezéseit is 429-cel buktatná. Itt EGY megbízható proxy van beállítva
 * ({@code TRUSTED_PROXY_HOPS=1}), így az {@code X-Forwarded-For} lánc adja a kulcsot,
 * és esetenként külön „kliens" használható. Ez egyben a proxy-fejléc kezelését is
 * lefedi.
 *
 * <p>Egy hop mellett a valódi kliens a lánc UTOLSÓ eleme (oda fűzi a proxy), ezért az
 * egyelemű fejléc önmagában is a kulcs. A lánc melyik elemét olvassuk — és miért nem a
 * bal szélsőt — azt a {@link ClientIpResolverTest} szögezi le.
 */
@TestPropertySource(properties = "webshop.trusted-proxy-hops=1")
class AuthRateLimitTest extends IntegrationTest {

    /** A {@link LoginAttemptService#MAX_ATTEMPTS} tükörképe. */
    private static final int MAX_ATTEMPTS = LoginAttemptService.MAX_ATTEMPTS;

    private static final String USERNAME = "korlatozott";
    private static final String PASSWORD = "jelszo12345";

    /**
     * @param forwardedFor a TELJES {@code X-Forwarded-For} lánc, ahogy a szerverhez
     *     megérkezik. Egyetlen cím esetén ez a proxy által odaírt valódi kliens; több
     *     elem esetén a bal oldali elemek a kliens által küldött (hamisítható) rész
     */
    private ResponseEntity<JsonNode> login(String forwardedFor, String username,
            String password) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Forwarded-For", forwardedFor);
        Object body = Map.of("username", username, "password", password);
        return rest.exchange("/api/auth/login", HttpMethod.POST,
                new HttpEntity<>(body, headers), JsonNode.class);
    }

    private void register() {
        post("/api/auth/register", Map.of(
                "username", USERNAME,
                "email", "korlatozott@example.com",
                "address", "Teszt utca 5",
                "password", PASSWORD));
    }

    @Test
    void k51_eleventhAttemptIsRateLimitedAfterTenFailures() {
        String ip = "10.0.0.1";
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            assertThat(login(ip, "nincsilyenfelhasznalo", "rosszjelszo").getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        ResponseEntity<JsonNode> blocked = login(ip, "nincsilyenfelhasznalo", "rosszjelszo");

        assertThat(blocked.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(blocked.getBody().get("error").asText())
                .isEqualTo(Messages.LOGIN_RATE_LIMITED);
    }

    /**
     * A zárolás a HELYES jelszót is elutasítja — különben a támadó a találat
     * pillanatában kicsúszna a korlát alól.
     */
    @Test
    void lockoutRejectsEvenTheCorrectPassword() {
        String ip = "10.0.0.2";
        register();
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            login(ip, USERNAME, "rosszjelszo");
        }

        assertThat(login(ip, USERNAME, PASSWORD).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void successfulLoginResetsTheCounter() {
        String ip = "10.0.0.3";
        register();
        for (int i = 0; i < MAX_ATTEMPTS - 1; i++) {
            assertThat(login(ip, USERNAME, "rosszjelszo").getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
        assertThat(login(ip, USERNAME, PASSWORD).getStatusCode()).isEqualTo(HttpStatus.OK);

        // Nullázás nélkül a számláló MAX_ATTEMPTS - 1-ről indulna: az első hiba még
        // 401 lenne, a MÁSODIK viszont már 429. Két egymást követő 401 tehát csak
        // akkor lehetséges, ha a siker valóban törölte a számlálót.
        assertThat(login(ip, USERNAME, "rosszjelszo").getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(login(ip, USERNAME, "rosszjelszo").getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void rateLimitIsSeparatePerIp() {
        String attacker = "10.0.0.4";
        String bystander = "10.0.0.5";
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            login(attacker, "nincsilyenfelhasznalo", "rosszjelszo");
        }

        assertThat(login(attacker, "nincsilyenfelhasznalo", "rosszjelszo").getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        // A másik kliens érintetlen: hibás jelszóra 401-et kap, nem 429-et.
        assertThat(login(bystander, "nincsilyenfelhasznalo", "rosszjelszo").getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void lockoutOfAnotherIpDoesNotBlockSuccessfulLogin() {
        String attacker = "10.0.0.6";
        String owner = "10.0.0.7";
        register();
        for (int i = 0; i <= MAX_ATTEMPTS; i++) {
            login(attacker, USERNAME, "rosszjelszo");
        }

        ResponseEntity<JsonNode> response = login(owner, USERNAME, PASSWORD);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("user").get("username").asText()).isEqualTo(USERNAME);
    }

    /**
     * PROXY MÖGÖTT sem lehet hamisított fejléccel friss számlálót szerezni.
     *
     * <p>A támadó azt teszi, amit egyedül tud: a saját kérésébe ír egy kitalált
     * elemet, ami a lánc BAL oldalára kerül — a proxy ezután a valódi címét fűzi a
     * JOBB végére. Minden kérés más hamisítást visz, a proxy által írt utolsó elem
     * viszont változatlan, tehát a kulcs is. Ha a bal szélső elemet olvasnánk (a
     * korábbi implementáció és a Spring {@code FRAMEWORK} strategy is ezt teszi),
     * mindegyik kérés külön sort kapna, és a 11. válasz is 401 lenne.
     */
    @Test
    void hamisitottForwardedForNemAdFrissSzamlaloKulcsot() {
        String realClient = "10.0.0.8";
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            assertThat(login("9.9.9." + i + ", " + realClient,
                    "nincsilyenfelhasznalo", "rosszjelszo").getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        ResponseEntity<JsonNode> blocked =
                login("9.9.9.199, " + realClient, "nincsilyenfelhasznalo", "rosszjelszo");

        assertThat(blocked.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(blocked.getBody().get("error").asText()).isEqualTo(Messages.LOGIN_RATE_LIMITED);
    }

    /**
     * A hamisított elem nem szivárog át kulcsként egy MÁSIK kliensre sem: a támadó
     * beírja az áldozat címét a lánc bal oldalára, de az áldozat így sem zárul ki.
     * Enélkül a védekezésből támadási felület lenne.
     */
    @Test
    void hamisitottFejleccelNemLehetMasKliensetKizarni() {
        String attacker = "10.0.0.9";
        String victim = "10.0.0.10";
        register();
        for (int i = 0; i <= MAX_ATTEMPTS; i++) {
            login(victim + ", " + attacker, USERNAME, "rosszjelszo");
        }

        // Az áldozat a SAJÁT proxy-láncával jön: érintetlen számláló, sikeres belépés.
        assertThat(login(victim, USERNAME, PASSWORD).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /**
     * Beállított proxy-hop mellett is van kulcs, ha a fejléc hiányzik: a socket távoli
     * címére esünk vissza. Enélkül a fejléc elhagyásával meg lehetne kerülni a korlátot.
     */
    @Test
    void withoutHeaderTheSocketAddressIsTheCountingKey() {
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            assertThat(post("/api/auth/login",
                    Map.of("username", "nincsilyenfelhasznalo", "password", "rosszjelszo"))
                    .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        assertThat(post("/api/auth/login",
                Map.of("username", "nincsilyenfelhasznalo", "password", "rosszjelszo"))
                .getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }
}
