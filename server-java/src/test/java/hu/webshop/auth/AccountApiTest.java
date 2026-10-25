package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import hu.webshop.support.IntegrationTest;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * A saját fiókadatok szerkesztése ({@code PUT /api/auth/me}) és a jelszócsere
 * ({@code POST /api/auth/password}).
 *
 * <p>Kizárólag HTTP-n keresztül dolgozik: minden előfeltétel publikus API-hívásokból
 * épül fel. A találgatási korlát külön osztályban van
 * ({@link AccountRateLimitTest}), mert ott minden eset tíz sikertelen
 * jelszó-ellenőrzést futtat.
 */
class AccountApiTest extends IntegrationTest {

    private static final String USERNAME = "sajatfelhasznalo";
    private static final String EMAIL = "sajat@example.com";
    private static final String ADDRESS = "Teszt utca 7";
    private static final String PASSWORD = "jelszo12345";

    private static String error(ResponseEntity<JsonNode> response) {
        return response.getBody().get("error").asText();
    }

    /** Új fiók a publikus végponton; a válasz tokenjével dolgoznak az esetek. */
    private String register() {
        return post("/api/auth/register", Map.of(
                "username", USERNAME,
                "email", EMAIL,
                "address", ADDRESS,
                "password", PASSWORD))
                .getBody().get("token").asText();
    }

    /** A fiókadat-űrlap törzse; a {@code null} érték kihagyott mezőt jelent. */
    private static Map<String, Object> profile(String username, String email, String address,
            String currentPassword) {
        Map<String, Object> body = new HashMap<>();
        body.put("username", username);
        body.put("email", email);
        body.put("address", address);
        body.put("currentPassword", currentPassword);
        return body;
    }

    /** A szabályos fiókadat-törzs egy módosított mezővel. */
    private static Map<String, Object> profileWith(String field, Object value) {
        Map<String, Object> body = profile(USERNAME, EMAIL, ADDRESS, PASSWORD);
        body.put(field, value);
        return body;
    }

    private static Map<String, Object> passwordChange(String current, String next,
            String confirm) {
        Map<String, Object> body = new HashMap<>();
        body.put("currentPassword", current);
        body.put("newPassword", next);
        body.put("newPasswordConfirm", confirm);
        return body;
    }

    // --- Fiókadatok mentése ---

    /** FA-01, FA-15: a mentés után tényleg a beírt adatok látszanak. */
    @Test
    void savesProfileAndReturnsThePublicUserShape() {
        String token = register();

        ResponseEntity<JsonNode> response = put("/api/auth/me",
                profile("ujfelhasznalonev", "uj@example.com", "Új utca 1", PASSWORD), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode user = response.getBody();
        assertThat(user.get("username").asText()).isEqualTo("ujfelhasznalonev");
        assertThat(user.get("email").asText()).isEqualTo("uj@example.com");
        assertThat(user.get("address").asText()).isEqualTo("Új utca 1");
        assertThat(user.get("role").asText()).isEqualTo("customer");
        assertThat(user.get("id").asText()).isNotBlank();
        // A publikus nézet öt mezős: se hash, se token. A fiókadat nem hitelesítő
        // adat, ezért a válasz SZÁNDÉKOSAN nem hoz új munkamenetet.
        assertThat(user.size()).isEqualTo(5);
        assertThat(user.has("token")).isFalse();

        JsonNode me = get("/api/auth/me", token).getBody();
        assertThat(me.get("username").asText()).isEqualTo("ujfelhasznalonev");
        assertThat(me.get("email").asText()).isEqualTo("uj@example.com");
        assertThat(me.get("address").asText()).isEqualTo("Új utca 1");
    }

    /** A mentés nem érinti a munkamenetet: a token a művelet után is használható. */
    @Test
    void profileSaveKeepsTheSession() {
        String token = register();

        assertThat(put("/api/auth/me", profileWith("address", "Másik utca 2"), token)
                .getStatusCode()).isEqualTo(HttpStatus.OK);

        assertThat(get("/api/auth/me", token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /**
     * FA-04, FA-23: a szerepkört senki nem állíthatja magának, és a beküldött
     * {@code role} NÉMÁN pattan le — 200-at ad, nem 400-at (a mező itt nem érvénytelen
     * bemenet, hanem egyáltalán nem bemenet; szándékos eltérés a
     * {@code PUT /api/admin/users/{id}}-tól).
     *
     * <p>A harmadik állítás a lényegi: UGYANAZZAL a tokennel az admin névtér 403 —
     * a szerepkör tehát nem csak a válaszban maradt customer, hanem a jogosultságban is.
     */
    @Test
    void roleInBodyIsIgnored() {
        String token = register();

        ResponseEntity<JsonNode> response =
                put("/api/auth/me", profileWith("role", "admin"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("role").asText()).isEqualTo("customer");
        assertThat(get("/api/auth/me", token).getBody().get("role").asText())
                .isEqualTo("customer");

        // A megszerzett szerepkör a jogosultságon mérve is customer maradt.
        ResponseEntity<JsonNode> adminCall = get("/api/admin/users", token);
        assertThat(adminCall.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(error(adminCall)).isEqualTo(Messages.ADMIN_REQUIRED);

        // A tárolt szerepkör sem változott: az admin lista is customert mutat.
        for (JsonNode user : get("/api/admin/users", adminToken()).getBody()) {
            if (USERNAME.equals(user.get("username").asText())) {
                assertThat(user.get("role").asText()).isEqualTo("customer");
            }
        }
    }

    /** FA-03: más nevét és e-mailjét nem lehet elvenni. */
    @Test
    void rejectsUsernameOrEmailTakenByAnother() {
        String token = register();
        post("/api/auth/register", Map.of(
                "username", "masikfelhasznalo",
                "email", "masik@example.com",
                "address", "Másik utca 9",
                "password", "jelszo54321"));

        ResponseEntity<JsonNode> name =
                put("/api/auth/me", profileWith("username", "masikfelhasznalo"), token);
        assertThat(name.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(name)).isEqualTo(Messages.USERNAME_TAKEN);

        ResponseEntity<JsonNode> email =
                put("/api/auth/me", profileWith("email", "masik@example.com"), token);
        assertThat(email.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(email)).isEqualTo(Messages.EMAIL_TAKEN);

        // A saját adatai érintetlenek maradtak.
        JsonNode me = get("/api/auth/me", token).getBody();
        assertThat(me.get("username").asText()).isEqualTo(USERNAME);
        assertThat(me.get("email").asText()).isEqualTo(EMAIL);
    }

    /**
     * Az egyediség KIS/NAGYBETŰTŐL FÜGGETLEN: az egyediséget végső soron az adatbázis
     * {@code LOWER()}-es indexe dönti el (I-1, I-2), ezért a más e-mailjének „más
     * betűzéssel" elvétele ugyanúgy 400. Csupa kisbetűs összehasonlítás nélkül itt két
     * fiók kerülne ütközésbe az indexen, és a válasz 500 lenne.
     */
    @Test
    void rejectsAnotherUsersEmailInDifferentCase() {
        String token = register();
        post("/api/auth/register", Map.of(
                "username", "masikfelhasznalo",
                "email", "masik@example.com",
                "address", "Másik utca 9",
                "password", "jelszo54321"));

        ResponseEntity<JsonNode> email =
                put("/api/auth/me", profileWith("email", "MaSiK@Example.COM"), token);
        assertThat(email.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(email)).isEqualTo(Messages.EMAIL_TAKEN);

        ResponseEntity<JsonNode> name =
                put("/api/auth/me", profileWith("username", "MasikFelhasznalo"), token);
        assertThat(name.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(name)).isEqualTo(Messages.USERNAME_TAKEN);

        // A saját adatai érintetlenek maradtak.
        JsonNode me = get("/api/auth/me", token).getBody();
        assertThat(me.get("email").asText()).isEqualTo(EMAIL);
    }

    /**
     * A saját, VÁLTOZATLAN nevének megtartása nem ütközés — enélkül a cím
     * módosítása is elbukna a névfoglaltságon.
     */
    @Test
    void keepingTheOwnUnchangedNameIsNotACollision() {
        String token = register();

        ResponseEntity<JsonNode> response =
                put("/api/auth/me", profileWith("address", "Harmadik utca 3"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("address").asText()).isEqualTo("Harmadik utca 3");
    }

    /** FA-02: a validáció a regisztrációé, saját szabály nélkül (K-45). */
    @Test
    void validatesProfileFieldsLikeRegistration() {
        String token = register();

        ResponseEntity<JsonNode> shortName =
                put("/api/auth/me", profileWith("username", "rovid"), token);
        assertThat(shortName.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(shortName)).isEqualTo(Messages.USERNAME_TOO_SHORT);

        ResponseEntity<JsonNode> longName =
                put("/api/auth/me", profileWith("username", "a".repeat(51)), token);
        assertThat(error(longName)).isEqualTo(Messages.USERNAME_TOO_LONG);

        ResponseEntity<JsonNode> badEmail =
                put("/api/auth/me", profileWith("email", "nem-email"), token);
        assertThat(error(badEmail)).isEqualTo(Messages.EMAIL_INVALID);

        ResponseEntity<JsonNode> blankAddress =
                put("/api/auth/me", profileWith("address", "   "), token);
        assertThat(error(blankAddress)).isEqualTo(Messages.ADDRESS_REQUIRED);
    }

    /**
     * FA-22: hibás jelenlegi jelszóra 400, NEM 401. A 401 ezeken a végpontokon a
     * munkamenet lejártát jelentené, amire a kliens kilépteti a felhasználót — egy
     * elgépelt jelszó viszont mezőhiba. A fiókadatok érintetlenek maradnak, és a
     * munkamenet is él.
     */
    @Test
    void rejectsWrongCurrentPasswordOnProfileSave() {
        String token = register();

        ResponseEntity<JsonNode> response = put("/api/auth/me",
                profile("ujfelhasznalonev", "uj@example.com", "Új utca 1", "rosszjelszo"),
                token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo("A jelenlegi jelszó hibás.");
        assertThat(error(response)).isEqualTo(Messages.CURRENT_PASSWORD_INVALID);
        assertThat(get("/api/auth/me", token).getBody().get("username").asText())
                .isEqualTo(USERNAME);
        // A munkamenet ÉL: a felhasználó javíthat és újrapróbálhat.
        assertThat(get("/api/auth/me", token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /**
     * FA-22: a hibás jelszó ELFEDI a mezőhibákat. Egyszerre rossz jelszó és rossz
     * e-mail: a válasz kizárólag a jelszóról szól — akit nem tudunk hitelesíteni, az
     * ne kapjon visszajelzést arról, mi van a fiókon.
     */
    @Test
    void wrongCurrentPasswordHidesFieldErrors() {
        String token = register();

        ResponseEntity<JsonNode> response = put("/api/auth/me",
                profile(USERNAME, "nem-email", ADDRESS, "rosszjelszo"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo("A jelenlegi jelszó hibás.");
        assertThat(error(response)).isNotEqualTo(Messages.EMAIL_INVALID);
        // A hibás jelszó nem munkamenet-hiba: a token utána is működik.
        assertThat(get("/api/auth/me", token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /**
     * A hibás jelszó a MENTÉST is megállítja: a hibás e-mail sem íródott ki, és a
     * szabályos mezők sem.
     */
    @Test
    void wrongCurrentPasswordWritesNothing() {
        String token = register();

        put("/api/auth/me", profile("ujfelhasznalonev", "uj@example.com", "Új utca 1",
                "rosszjelszo"), token);

        JsonNode me = get("/api/auth/me", token).getBody();
        assertThat(me.get("username").asText()).isEqualTo(USERNAME);
        assertThat(me.get("email").asText()).isEqualTo(EMAIL);
        assertThat(me.get("address").asText()).isEqualTo(ADDRESS);
    }

    /** A hiányzó jelenlegi jelszó ugyanaz az eset, mint a hibás. */
    @Test
    void rejectsMissingCurrentPasswordOnProfileSave() {
        String token = register();
        Map<String, Object> body = profile(USERNAME, EMAIL, "Új utca 1", null);

        ResponseEntity<JsonNode> response = put("/api/auth/me", body, token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo("A jelenlegi jelszó hibás.");
    }

    // --- Jelszócsere ---

    /** FA-05, FA-06, FA-07, FA-16: csere, tokenrotáció, az új jelszóval belépés. */
    @Test
    void changesPasswordAndRotatesTheToken() {
        String token = register();

        ResponseEntity<JsonNode> response = post("/api/auth/password",
                passwordChange(PASSWORD, "ujjelszo123", "ujjelszo123"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        String newToken = response.getBody().get("token").asText();
        assertThat(newToken).matches("^[0-9a-f]{64}$").isNotEqualTo(token);
        assertThat(response.getBody().get("user").get("username").asText()).isEqualTo(USERNAME);
        assertThat(response.getBody().get("user").size()).isEqualTo(5);

        // A RÉGI token azonnal érvénytelen, az új viszont működik: a felhasználó
        // nem esik ki, de a korábban megszerzett munkamenet ki van zárva (I-6).
        assertThat(get("/api/auth/me", token).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(get("/api/auth/me", newToken).getStatusCode()).isEqualTo(HttpStatus.OK);

        // Belépni ezután csak az ÚJ jelszóval lehet.
        assertThat(post("/api/auth/login", Map.of("username", USERNAME, "password", PASSWORD))
                .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        ResponseEntity<JsonNode> login = post("/api/auth/login",
                Map.of("username", USERNAME, "password", "ujjelszo123"));
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /** A csere válasza sem szivárogtat jelszóadatot (K-55). */
    @Test
    void passwordChangeResponseDoesNotLeakSecrets() {
        String token = register();

        String payload = post("/api/auth/password",
                passwordChange(PASSWORD, "ujjelszo123", "ujjelszo123"), token)
                .getBody().toString();

        for (String forbidden : List.of("passwordHash", "password_hash", "$2a$", "$2b$",
                "ujjelszo123")) {
            assertThat(payload).doesNotContain(forbidden);
        }
    }

    @Test
    void rejectsConfirmationMismatch() {
        String token = register();

        ResponseEntity<JsonNode> response = post("/api/auth/password",
                passwordChange(PASSWORD, "ujjelszo123", "ujjelszo124"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        // Szó szerint is: a konstansra asszertálva egy szövegmódosítás nem törne el
        // egyetlen tesztet sem, pedig a hibaüzenet szerződés.
        assertThat(error(response)).isEqualTo("A két jelszó nem egyezik.");
        assertThat(error(response)).isEqualTo(Messages.PASSWORD_CONFIRM_MISMATCH);
    }

    /** Az új jelszó hosszára a regisztráció szabálya vonatkozik. */
    @Test
    void rejectsTooShortNewPassword() {
        String token = register();

        ResponseEntity<JsonNode> response = post("/api/auth/password",
                passwordChange(PASSWORD, "1234567", "1234567"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.PASSWORD_TOO_SHORT);
    }

    @Test
    void rejectsNewPasswordIdenticalToTheCurrentOne() {
        String token = register();

        ResponseEntity<JsonNode> response = post("/api/auth/password",
                passwordChange(PASSWORD, PASSWORD, PASSWORD), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo("Az új jelszó nem egyezhet meg a jelenlegivel.");
        assertThat(error(response)).isEqualTo(Messages.PASSWORD_SAME_AS_OLD);
    }

    /**
     * FA-22: hibás jelenlegi jelszóval a csere elbukik 400-zal (nem 401), és a régi
     * jelszó marad érvényben.
     */
    @Test
    void rejectsWrongCurrentPasswordOnPasswordChange() {
        String token = register();

        ResponseEntity<JsonNode> response = post("/api/auth/password",
                passwordChange("rosszjelszo", "ujjelszo123", "ujjelszo123"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo("A jelenlegi jelszó hibás.");
        assertThat(error(response)).isEqualTo(Messages.CURRENT_PASSWORD_INVALID);
        // Sem a jelszó, sem a munkamenet nem változott.
        assertThat(get("/api/auth/me", token).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(post("/api/auth/login", Map.of("username", USERNAME, "password", PASSWORD))
                .getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // --- Jogosultság ---

    /**
     * FA-08: mindkét végpont hitelesítést igényel.
     *
     * <p>Hogy a 401-et tényleg az {@code AuthInterceptor} adja — és nem a
     * {@code CurrentUserArgumentResolver} vésztartaléka, ami ugyanezt a választ adja —,
     * azt a POZITÍV esetek igazolják: érvényes tokennel mindkét végpont 200-at ad, a
     * belépett felhasználót viszont KIZÁRÓLAG az interceptor teszi a kérésre. Ha a
     * {@code WebConfig} mintái közül kimaradna az útvonal, a hitelesített hívás is
     * 401-re futna, és a mentés/jelszócsere esetei bukának.
     */
    @Test
    void bothEndpointsRequireAuthentication() {
        register();

        ResponseEntity<JsonNode> profileWithoutToken = exchange(HttpMethod.PUT, "/api/auth/me",
                profileWith("address", "Betörő utca 1"), null);
        assertThat(profileWithoutToken.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(error(profileWithoutToken)).isEqualTo(Messages.AUTH_REQUIRED);

        ResponseEntity<JsonNode> passwordWithoutToken = post("/api/auth/password",
                passwordChange(PASSWORD, "ujjelszo123", "ujjelszo123"));
        assertThat(passwordWithoutToken.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(error(passwordWithoutToken)).isEqualTo(Messages.AUTH_REQUIRED);

        // Ismeretlen token sem elég.
        assertThat(exchange(HttpMethod.PUT, "/api/auth/me",
                profileWith("address", "Betörő utca 1"), "nincs-ilyen-token")
                .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(post("/api/auth/password",
                passwordChange(PASSWORD, "ujjelszo123", "ujjelszo123"), "nincs-ilyen-token")
                .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        // A hitelesítetlen kérés nem is írt: a fiók adatai és jelszava változatlan.
        ResponseEntity<JsonNode> login = post("/api/auth/login",
                Map.of("username", USERNAME, "password", PASSWORD));
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(login.getBody().get("user").get("address").asText()).isEqualTo(ADDRESS);
    }

    /** A módosított fiók MINDIG a tokené: a törzsben küldött azonosító nem számít. */
    @Test
    void editsTheTokenOwnerNotTheAccountNamedInTheBody() {
        String token = register();
        String otherId = post("/api/auth/register", Map.of(
                "username", "masikfelhasznalo",
                "email", "masik@example.com",
                "address", "Másik utca 9",
                "password", "jelszo54321"))
                .getBody().get("user").get("id").asText();

        ResponseEntity<JsonNode> response =
                put("/api/auth/me", profileWith("id", otherId), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("id").asText()).isNotEqualTo(otherId);
        assertThat(response.getBody().get("username").asText()).isEqualTo(USERNAME);
    }
}
