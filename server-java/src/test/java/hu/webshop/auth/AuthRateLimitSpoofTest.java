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

/**
 * A bejelentkezési korlát NEM kerülhető meg hamisított {@code X-Forwarded-For} fejléccel.
 *
 * <p>Ez a regressziós háló a korlát legfontosabb tulajdonsága körül. A számláló
 * IP-nként számol, tehát pontosan olyan jó, amilyen a kulcs, amivel indexeljük: ha a
 * kliens a kulcsot írhatja, kérésenként FRISS sort kap a {@code login_attempts}
 * táblában, a {@link LoginAttemptService#MAX_ATTEMPTS} plafon soha nem lép életbe, és
 * a jelszópróbálgatás korlátlan lesz. A számláló tartóssága (K-52) ilyenkor semmit
 * nem ér — egyetlen fejléc kiüti.
 *
 * <p>Miért NINCS itt {@code TRUSTED_PROXY_HOPS}: pont az ALAPÉRTELMEZETT telepítést
 * mérjük, ahol nincs megbízható proxy. Ilyenkor a fejlécre rá sem nézünk, a kulcs a
 * TCP-kapcsolat címe — amit a kliens nem tud meghamisítani. A proxy mögötti esetet az
 * {@link AuthRateLimitTest#hamisitottForwardedForNemAdFrissSzamlaloKulcsot()} fedi.
 *
 * <p>Mellékhatásként ez a beállítás azt is jelenti, hogy a kulcs itt a hurok-cím,
 * vagyis MINDEN eset kimeríti ugyanazt a számlálót. Ez azért nem gond, mert az
 * {@link IntegrationTest} minden teszt előtt üríti a {@code login_attempts} táblát.
 */
class AuthRateLimitSpoofTest extends IntegrationTest {

    private static final int MAX_ATTEMPTS = LoginAttemptService.MAX_ATTEMPTS;

    private static final Map<String, String> ROSSZ_BELEPES =
            Map.of("username", "nincsilyenfelhasznalo", "password", "rosszjelszo");

    /** Bejelentkezési kísérlet a megadott — kitalált — {@code X-Forwarded-For} értékkel. */
    private ResponseEntity<JsonNode> loginWithSpoofedIp(String spoofed) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Forwarded-For", spoofed);
        return rest.exchange("/api/auth/login", HttpMethod.POST,
                new HttpEntity<>(ROSSZ_BELEPES, headers), JsonNode.class);
    }

    /**
     * KÉRÉSENKÉNT MÁS hamisított IP — a támadó legkézenfekvőbb kerülési kísérlete.
     *
     * <p>Ha a fejlécnek hinnénk, mindegyik kérés külön kulcsot kapna, mindegyik
     * számláló 1-en állna, és a válasz a 11. kérésre is 401 lenne. A 429 tehát az a
     * megfigyelés, ami igazolja, hogy a kulcs NEM a fejlécből jön.
     */
    @Test
    void hamisitottForwardedForNemNullazzaASzamlalot() {
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            assertThat(loginWithSpoofedIp("10.0.0." + i).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        ResponseEntity<JsonNode> blocked = loginWithSpoofedIp("10.0.0.199");

        assertThat(blocked.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(blocked.getBody().get("error").asText()).isEqualTo(Messages.LOGIN_RATE_LIMITED);
    }

    /**
     * A már beállt zárolást sem lehet hamisított fejléccel LEVETNI: a támadó előbb
     * kimeríti a korlátot fejléc nélkül, majd megpróbál „új klienssé" válni.
     */
    @Test
    void aZarolastNemLehetHamisitottFejleccelFeloldani() {
        for (int i = 0; i <= MAX_ATTEMPTS; i++) {
            post("/api/auth/login", ROSSZ_BELEPES);
        }

        assertThat(loginWithSpoofedIp("198.51.100.42").getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    /**
     * Egy TÖBB elemű lánc küldése sem segít: a támadó megpróbálja utánozni azt az
     * alakot, amit egy szabályos proxy állítana elő, hogy a szerver „valódi kliensnek"
     * higgye a bal szélső elemet.
     */
    @Test
    void hamisitottLancSemAdFrissKulcsot() {
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            assertThat(loginWithSpoofedIp("9.9.9." + i + ", 10.0.0.5")
                    .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        assertThat(loginWithSpoofedIp("9.9.9.199, 10.0.0.5").getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }
}
