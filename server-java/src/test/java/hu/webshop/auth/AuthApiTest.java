package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import hu.webshop.support.IntegrationTest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * A hitelesítési végpontok konformancia-tesztjei (K-40…K-47, K-50, K-55).
 *
 * <p>Kizárólag HTTP-n keresztül dolgozik: minden előfeltétel publikus API-hívásokból
 * épül fel, ahogy a konformancia-katalógus előírja.
 */
class AuthApiTest extends IntegrationTest {

    private static Map<String, Object> registration() {
        Map<String, Object> body = new HashMap<>();
        body.put("username", "ujfelhasznalo");
        body.put("email", "uj@example.com");
        body.put("address", "Teszt utca 3");
        body.put("password", "jelszo123");
        return body;
    }

    /** A szabályos regisztrációs törzs egy módosított mezővel. */
    private static Map<String, Object> registrationWith(String field, Object value) {
        Map<String, Object> body = registration();
        body.put(field, value);
        return body;
    }

    private static String error(ResponseEntity<JsonNode> response) {
        return response.getBody().get("error").asText();
    }

    // --- Regisztráció ---

    @Test
    void registrationCreatesAccountAndReturnsToken() {
        ResponseEntity<JsonNode> response = post("/api/auth/register", registration());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        JsonNode body = response.getBody();
        assertThat(body.get("token").asText()).matches("^[0-9a-f]{64}$");

        JsonNode user = body.get("user");
        assertThat(user.get("id").asText()).isNotBlank();
        assertThat(user.get("username").asText()).isEqualTo("ujfelhasznalo");
        assertThat(user.get("email").asText()).isEqualTo("uj@example.com");
        assertThat(user.get("address").asText()).isEqualTo("Teszt utca 3");
        // Az új fiók szerepköre MINDIG customer.
        assertThat(user.get("role").asText()).isEqualTo("customer");
        // A publikus nézetben pontosan öt mező van — se hash, se token.
        assertThat(user.size()).isEqualTo(5);
    }

    @Test
    void roleCannotBeRequestedInRegistrationBody() {
        ResponseEntity<JsonNode> response =
                post("/api/auth/register", registrationWith("role", "admin"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().get("user").get("role").asText()).isEqualTo("customer");
    }

    @Test
    void k40_shortUsername() {
        ResponseEntity<JsonNode> response =
                post("/api/auth/register", registrationWith("username", "rovid"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.USERNAME_TOO_SHORT);
    }

    @Test
    void k41_tooLongUsername() {
        ResponseEntity<JsonNode> response =
                post("/api/auth/register", registrationWith("username", "a".repeat(51)));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.USERNAME_TOO_LONG);
    }

    @Test
    void k42_invalidEmail() {
        ResponseEntity<JsonNode> response =
                post("/api/auth/register", registrationWith("email", "nem-email"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.EMAIL_INVALID);
    }

    @Test
    void k43_whitespaceOnlyAddress() {
        ResponseEntity<JsonNode> response =
                post("/api/auth/register", registrationWith("address", "   "));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.ADDRESS_REQUIRED);
    }

    @Test
    void k44_shortPassword() {
        ResponseEntity<JsonNode> response =
                post("/api/auth/register", registrationWith("password", "1234567"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.PASSWORD_TOO_SHORT);
    }

    @Test
    void k46_usernameUniquenessIsCaseInsensitive() {
        Map<String, Object> first = registrationWith("username", "Teszt.Elek");
        assertThat(post("/api/auth/register", first).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);

        Map<String, Object> second = registrationWith("username", "teszt.elek");
        second.put("email", "masik@example.com");
        ResponseEntity<JsonNode> response = post("/api/auth/register", second);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.USERNAME_TAKEN);
    }

    @Test
    void emailUniquenessIsCaseInsensitive() {
        assertThat(post("/api/auth/register", registration()).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);

        Map<String, Object> second = registrationWith("username", "masikfelhasznalo");
        second.put("email", "UJ@Example.COM");
        ResponseEntity<JsonNode> response = post("/api/auth/register", second);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.EMAIL_TAKEN);
    }

    /**
     * K-47: két EGYIDEJŰ, azonos nevű regisztrációból pontosan egy sikerül. Ezt az
     * adatbázis egyedi indexe garantálja — előzetes ellenőrzésre nem lenne építhető.
     */
    @Test
    void k47_exactlyOneOfTwoConcurrentRegistrationsSucceeds() throws Exception {
        Map<String, Object> body = registrationWith("username", "parhuzamosnev");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> pending = new ArrayList<>();

        try {
            for (int i = 0; i < 2; i++) {
                pending.add(pool.submit(() -> {
                    start.await();
                    return post("/api/auth/register", body).getStatusCode().value();
                }));
            }
            start.countDown();

            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> future : pending) {
                statuses.add(future.get(60, TimeUnit.SECONDS));
            }
            assertThat(statuses).containsExactlyInAnyOrder(201, 400);
        } finally {
            pool.shutdownNow();
        }

        // ...és pontosan EGY fiók jött létre ezzel a névvel.
        JsonNode users = get("/api/admin/users", adminToken()).getBody();
        long matching = 0;
        for (JsonNode user : users) {
            if ("parhuzamosnev".equals(user.get("username").asText())) {
                matching++;
            }
        }
        assertThat(matching).isEqualTo(1);
    }

    // --- Bejelentkezés, /me, /logout ---

    @Test
    void fullFlowRegisterLoginMeLogout() {
        post("/api/auth/register", registration());

        ResponseEntity<JsonNode> login = post("/api/auth/login",
                Map.of("username", "ujfelhasznalo", "password", "jelszo123"));
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        String token = login.getBody().get("token").asText();
        assertThat(token).matches("^[0-9a-f]{64}$");

        ResponseEntity<JsonNode> me = get("/api/auth/me", token);
        assertThat(me.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(me.getBody().get("username").asText()).isEqualTo("ujfelhasznalo");

        ResponseEntity<JsonNode> logout = post("/api/auth/logout", null, token);
        assertThat(logout.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(logout.getBody().get("ok").asBoolean()).isTrue();

        // Kijelentkezés után a token már érvénytelen.
        ResponseEntity<JsonNode> after = get("/api/auth/me", token);
        assertThat(after.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(error(after)).isEqualTo(Messages.AUTH_REQUIRED);
    }

    @Test
    void usernameMatchesCaseInsensitively() {
        post("/api/auth/register", registration());

        ResponseEntity<JsonNode> login = post("/api/auth/login",
                Map.of("username", "UJFELHASZNALO", "password", "jelszo123"));

        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /** I-6: az új bejelentkezés érvényteleníti a korábbi munkamenetet. */
    @Test
    void newLoginInvalidatesPreviousToken() {
        String first = post("/api/auth/register", registration()).getBody().get("token").asText();

        String second = post("/api/auth/login",
                Map.of("username", "ujfelhasznalo", "password", "jelszo123"))
                .getBody().get("token").asText();

        assertThat(second).isNotEqualTo(first);
        assertThat(get("/api/auth/me", first).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(get("/api/auth/me", second).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /**
     * K-50: az ismeretlen név és a rossz jelszó válasza MEGKÜLÖNBÖZTETHETETLEN —
     * ugyanaz a státusz és ugyanaz a törzs.
     */
    @Test
    void k50_unknownUsernameAndWrongPasswordGiveIdenticalResponse() {
        post("/api/auth/register", registration());

        ResponseEntity<JsonNode> unknownUser = post("/api/auth/login",
                Map.of("username", "nincsilyenfelhasznalo", "password", "jelszo123"));
        ResponseEntity<JsonNode> wrongPassword = post("/api/auth/login",
                Map.of("username", "ujfelhasznalo", "password", "rosszjelszo1"));

        assertThat(unknownUser.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(wrongPassword.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(unknownUser.getBody().toString())
                .isEqualTo(wrongPassword.getBody().toString());
        assertThat(error(unknownUser)).isEqualTo(Messages.LOGIN_FAILED);
    }

    @Test
    void protectedEndpointUnauthorizedWithoutToken() {
        assertThat(get("/api/auth/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(post("/api/auth/logout", null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(get("/api/auth/me", "nincs-ilyen-token").getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    /**
     * K-55: jelszóhash, só és más felhasználó tokenje SEMMILYEN válaszban nem
     * jelenik meg. A nyers JSON-t is átvizsgáljuk, nem csak a várt mezőket.
     */
    @Test
    void k55_responsesDoNotLeakSecrets() {
        ResponseEntity<JsonNode> registered = post("/api/auth/register", registration());
        String token = registered.getBody().get("token").asText();

        List<String> payloads = List.of(
                registered.getBody().toString(),
                get("/api/auth/me", token).getBody().toString(),
                get("/api/admin/users", adminToken()).getBody().toString());

        for (String payload : payloads) {
            assertThat(payload).doesNotContain("passwordHash");
            assertThat(payload).doesNotContain("password_hash");
            assertThat(payload).doesNotContain("passwordSalt");
            // A BCrypt hash felismerhető előtagja — semmilyen alakban nem kerülhet ki.
            assertThat(payload).doesNotContain("$2a$");
            assertThat(payload).doesNotContain("$2b$");
        }

        // Az admin lista a saját tokenjét sem tartalmazza.
        assertThat(get("/api/admin/users", adminToken()).getBody().toString())
                .doesNotContain(token);
    }

    @Test
    void loggedInUserProfile() {
        String token = post("/api/auth/register", registration()).getBody().get("token").asText();

        JsonNode me = get("/api/auth/me", token).getBody();

        assertThat(me.size()).isEqualTo(5);
        assertThat(me.get("username").asText()).isEqualTo("ujfelhasznalo");
        assertThat(me.get("role").asText()).isEqualTo("customer");
    }
}
