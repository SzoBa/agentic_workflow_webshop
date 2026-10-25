package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import hu.webshop.support.IntegrationTest;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * FA-09, FA-17: a jelenlegi jelszó találgatása a fiókadat-végpontokon korlátozott.
 *
 * <p>A fenyegetés az ELLOPOTT munkamenet: azzal a támadó tetszőleges sok jelszót
 * próbálhatna végig a {@code PUT /api/auth/me} és a {@code POST /api/auth/password}
 * hívásán, és a jelszóhoz kötött második kapu semmit nem érne.
 *
 * <p>A korlát és az ablak a bejelentkezésé ({@link LoginAttemptService#MAX_ATTEMPTS},
 * {@link LoginAttemptService#WINDOW}), a számlálás kulcsa viszont a FIÓK, nem a kliens
 * IP-címe — ide ugyanis csak érvényes tokennel lehet eljutni, IP-t pedig a támadó vált.
 * Ezért nincs szükség proxy-fejlécre sem, szemben az {@link AuthRateLimitTest}-tel.
 */
class AccountRateLimitTest extends IntegrationTest {

    /** A {@link LoginAttemptService#MAX_ATTEMPTS} tükörképe. */
    private static final int MAX_ATTEMPTS = LoginAttemptService.MAX_ATTEMPTS;

    private static final String USERNAME = "korlatozottfiok";
    private static final String EMAIL = "korlatozottfiok@example.com";
    private static final String ADDRESS = "Teszt utca 11";
    private static final String PASSWORD = "jelszo12345";

    private String register(String username, String email, String password) {
        return post("/api/auth/register", Map.of(
                "username", username,
                "email", email,
                "address", ADDRESS,
                "password", password))
                .getBody().get("token").asText();
    }

    private ResponseEntity<JsonNode> saveProfile(String token, String currentPassword) {
        Map<String, Object> body = new HashMap<>();
        body.put("username", USERNAME);
        body.put("email", EMAIL);
        body.put("address", ADDRESS);
        body.put("currentPassword", currentPassword);
        return put("/api/auth/me", body, token);
    }

    private ResponseEntity<JsonNode> changePassword(String token, String currentPassword) {
        return post("/api/auth/password", Map.of(
                "currentPassword", currentPassword,
                "newPassword", "ujjelszo123",
                "newPasswordConfirm", "ujjelszo123"), token);
    }

    /**
     * Tíz hibás jelszó után a tizenegyedik próbálkozás 429. A számláló a KÉT végpont
     * között közös: a mentésen elfogyasztott próbálkozások a jelszócserét is zárják.
     */
    @Test
    void eleventhGuessIsRateLimitedAcrossBothEndpoints() {
        String token = register(USERNAME, EMAIL, PASSWORD);
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            assertThat(saveProfile(token, "rosszjelszo" + i).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }

        ResponseEntity<JsonNode> blocked = changePassword(token, "rosszjelszo");

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
        String token = register(USERNAME, EMAIL, PASSWORD);
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            saveProfile(token, "rosszjelszo" + i);
        }

        assertThat(saveProfile(token, PASSWORD).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    /** A számláló FIÓKONKÉNT külön áll: a másik felhasználót nem érinti. */
    @Test
    void theCounterIsSeparatePerAccount() {
        String token = register(USERNAME, EMAIL, PASSWORD);
        String otherToken = register("masikkorlatozott", "masikkorlatozott@example.com",
                "jelszo54321");
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            saveProfile(token, "rosszjelszo" + i);
        }

        assertThat(saveProfile(token, PASSWORD).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        // A másik fiók hibás jelszóra 400-at kap, nem 429-et: a számlálója érintetlen.
        assertThat(changePassword(otherToken, "rosszjelszo").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    /**
     * A fiókadat-végpontok számlálója NEM közös a bejelentkezésével. Közös kulcson egy
     * sikeres fiókadat-mentés törölné a bejelentkezési számlálót is, azaz bárki a saját
     * helyes jelszavával nullázhatná a brute-force védelmet (K-51); fordítva pedig egy
     * elgépelt jelszó a bejelentkezésből is 429-et csinálna.
     */
    @Test
    void theAccountCounterDoesNotBlockLogin() {
        String token = register(USERNAME, EMAIL, PASSWORD);
        for (int i = 0; i <= MAX_ATTEMPTS; i++) {
            saveProfile(token, "rosszjelszo" + i);
        }

        assertThat(post("/api/auth/login", Map.of("username", USERNAME, "password", PASSWORD))
                .getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /**
     * Az elválasztás MÁSIK iránya: egy sikeres fiókadat-mentés {@code clear()}-je nem
     * törölheti a BEJELENTKEZÉSI számlálót. Közös kulcson bárki a saját, helyes
     * jelszavával nullázhatná a K-51 brute-force védelmet — elég lenne két rossz
     * bejelentkezés közé beszúrnia egy sikeres profilmentést.
     */
    @Test
    void anAccountSuccessDoesNotClearTheLoginCounter() {
        String token = register(USERNAME, EMAIL, PASSWORD);
        for (int i = 0; i < MAX_ATTEMPTS; i++) {
            assertThat(post("/api/auth/login",
                    Map.of("username", USERNAME, "password", "rosszjelszo" + i))
                    .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }

        // A saját, HELYES jelszavával végzett sikeres mentés — ez nullázza az
        // "account:" kulcsot, a bejelentkezés IP-kulcsát viszont nem érintheti.
        assertThat(saveProfile(token, PASSWORD).getStatusCode()).isEqualTo(HttpStatus.OK);

        assertThat(post("/api/auth/login", Map.of("username", USERNAME, "password", PASSWORD))
                .getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    /** Sikeres jelszó-ellenőrzés után a számláló nullázódik (a bejelentkezés mintájára). */
    @Test
    void successfulCheckResetsTheCounter() {
        String token = register(USERNAME, EMAIL, PASSWORD);
        for (int i = 0; i < MAX_ATTEMPTS - 1; i++) {
            assertThat(saveProfile(token, "rosszjelszo" + i).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }
        assertThat(saveProfile(token, PASSWORD).getStatusCode()).isEqualTo(HttpStatus.OK);

        // Nullázás nélkül a számláló MAX_ATTEMPTS - 1-ről indulna: az első hiba még
        // 400 lenne, a MÁSODIK viszont már 429. Két egymást követő 400 tehát csak
        // akkor lehetséges, ha a siker valóban törölte a számlálót.
        assertThat(saveProfile(token, "rosszjelszo").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(saveProfile(token, "rosszjelszo").getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
