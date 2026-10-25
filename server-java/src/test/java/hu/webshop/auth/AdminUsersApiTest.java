package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.bootstrap.DataBootstrap;
import hu.webshop.common.Messages;
import hu.webshop.support.IntegrationTest;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Az admin felhasználó-végpontok tesztjei (K-45, K-48, K-49, K-70, K-71).
 *
 * <p>Minden előfeltétel publikus API-hívásokból épül: a seed adminnal való
 * bejelentkezés (B-1) és egy regisztráció (B-2).
 */
class AdminUsersApiTest extends IntegrationTest {

    private static final String CUSTOMER_USERNAME = "vevofelhasznalo";
    private static final String CUSTOMER_EMAIL = "vevo@example.com";
    private static final String CUSTOMER_PASSWORD = "jelszo12345";

    /** Szabályos szerkesztő törzs a regisztrált vevőhöz. */
    private static Map<String, Object> edit() {
        Map<String, Object> body = new HashMap<>();
        body.put("username", CUSTOMER_USERNAME);
        body.put("email", CUSTOMER_EMAIL);
        body.put("address", "Új cím 5.");
        return body;
    }

    private static Map<String, Object> editWith(String field, Object value) {
        Map<String, Object> body = edit();
        body.put(field, value);
        return body;
    }

    /** B-2: egyedi nevű regisztráció; a válaszban a fiók azonosítója és a tokenje. */
    private JsonNode registerCustomer() {
        return post("/api/auth/register", Map.of(
                "username", CUSTOMER_USERNAME,
                "email", CUSTOMER_EMAIL,
                "address", "Teszt utca 1",
                "password", CUSTOMER_PASSWORD)).getBody();
    }

    private String seedAdminId(String token) {
        for (JsonNode user : get("/api/admin/users", token).getBody()) {
            if (DataBootstrap.SEED_ADMIN_USERNAME.equals(user.get("username").asText())) {
                return user.get("id").asText();
            }
        }
        throw new AssertionError("A seed admin nem található a listában.");
    }

    private JsonNode findUser(String token, String id) {
        for (JsonNode user : get("/api/admin/users", token).getBody()) {
            if (id.equals(user.get("id").asText())) {
                return user;
            }
        }
        return null;
    }

    // --- Hozzáférés-vezérlés (K-70, K-71) ---

    @Test
    void k70_unauthorizedWithoutTokenOnEveryEndpoint() {
        assertThat(get("/api/admin/users").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(put("/api/admin/users/barmi", edit(), null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(delete("/api/admin/users/barmi", null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void k71_forbiddenWithCustomerTokenOnEveryEndpoint() {
        String token = registerCustomer().get("token").asText();

        assertThat(get("/api/admin/users", token).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(put("/api/admin/users/barmi", edit(), token).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(delete("/api/admin/users/barmi", token).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        // A 403 előtt a 401 dől el: előbb „ki vagy?", utána „szabad-e?".
        assertThat(get("/api/admin/users", token).getBody().get("error").asText())
                .isEqualTo(Messages.ADMIN_REQUIRED);
    }

    // --- Listázás ---

    @Test
    void listReturnsAdminViewWithoutSecrets() {
        String token = adminToken();
        registerCustomer();

        ResponseEntity<JsonNode> response = get("/api/admin/users", token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().isArray()).isTrue();
        assertThat(response.getBody().size()).isEqualTo(2);
        for (JsonNode user : response.getBody()) {
            // id, username, email, address, role, createdAt — és semmi más.
            assertThat(user.size()).isEqualTo(6);
            assertThat(user.hasNonNull("createdAt")).isTrue();
            assertThat(user.has("passwordHash")).isFalse();
            assertThat(user.has("token")).isFalse();
        }
    }

    // --- Szerkesztés ---

    @Test
    void editIsPersisted() {
        String token = adminToken();
        String id = registerCustomer().get("user").get("id").asText();

        ResponseEntity<JsonNode> response = put("/api/admin/users/" + id, edit(), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("address").asText()).isEqualTo("Új cím 5.");
        assertThat(findUser(token, id).get("address").asText()).isEqualTo("Új cím 5.");
    }

    @Test
    void roleCanBeChanged() {
        String token = adminToken();
        String id = registerCustomer().get("user").get("id").asText();

        ResponseEntity<JsonNode> response =
                put("/api/admin/users/" + id, editWith("role", "admin"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("role").asText()).isEqualTo("admin");
    }

    @Test
    void notFoundForUnknownId() {
        ResponseEntity<JsonNode> response =
                put("/api/admin/users/nincs-ilyen", edit(), adminToken());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.USER_NOT_FOUND);
    }

    /** A jelszó az admin felületen NEM módosítható — a törzsben küldött mezők nem hatnak. */
    @Test
    void passwordCannotBeChangedByEditing() {
        String token = adminToken();
        String id = registerCustomer().get("user").get("id").asText();

        Map<String, Object> body = edit();
        body.put("password", "uj-jelszo-12345");
        body.put("passwordHash", "hamisitott");
        assertThat(put("/api/admin/users/" + id, body, token).getStatusCode())
                .isEqualTo(HttpStatus.OK);

        // A régi jelszóval továbbra is be lehet lépni.
        assertThat(post("/api/auth/login",
                Map.of("username", CUSTOMER_USERNAME, "password", CUSTOMER_PASSWORD))
                .getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // --- Validáció (K-45) és egyediség ---

    @Test
    void k45_editAppliesTheSameValidation() {
        String token = adminToken();
        String id = registerCustomer().get("user").get("id").asText();

        ResponseEntity<JsonNode> tooShort =
                put("/api/admin/users/" + id, editWith("username", "rovid"), token);
        assertThat(tooShort.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(tooShort.getBody().get("error").asText())
                .isEqualTo(Messages.USERNAME_TOO_SHORT);

        ResponseEntity<JsonNode> badEmail =
                put("/api/admin/users/" + id, editWith("email", "nem-email"), token);
        assertThat(badEmail.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(badEmail.getBody().get("error").asText()).isEqualTo(Messages.EMAIL_INVALID);

        ResponseEntity<JsonNode> blankAddress =
                put("/api/admin/users/" + id, editWith("address", "   "), token);
        assertThat(blankAddress.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(blankAddress.getBody().get("error").asText())
                .isEqualTo(Messages.ADDRESS_REQUIRED);
    }

    @Test
    void badRequestForInvalidRole() {
        String token = adminToken();
        String id = registerCustomer().get("user").get("id").asText();

        ResponseEntity<JsonNode> response =
                put("/api/admin/users/" + id, editWith("role", "foadmin"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.ROLE_INVALID);
    }

    @Test
    void otherUsersNameAndEmailAreTaken() {
        String token = adminToken();
        String id = registerCustomer().get("user").get("id").asText();

        ResponseEntity<JsonNode> takenName = put("/api/admin/users/" + id,
                editWith("username", DataBootstrap.SEED_ADMIN_USERNAME.toUpperCase()), token);
        assertThat(takenName.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(takenName.getBody().get("error").asText()).isEqualTo(Messages.USERNAME_TAKEN);

        ResponseEntity<JsonNode> takenEmail = put("/api/admin/users/" + id,
                editWith("email", DataBootstrap.SEED_ADMIN_EMAIL.toUpperCase()), token);
        assertThat(takenEmail.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(takenEmail.getBody().get("error").asText()).isEqualTo(Messages.EMAIL_TAKEN);
    }

    /** Az egyediség vizsgálata a SZERKESZTETT felhasználót kihagyja. */
    @Test
    void keepingOwnUnchangedNameSucceeds() {
        String token = adminToken();
        String id = registerCustomer().get("user").get("id").asText();

        assertThat(put("/api/admin/users/" + id, edit(), token).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    // --- Az utolsó admin védelme (I-3) ---

    @Test
    void k49_lastAdminCannotBeDemoted() {
        String token = adminToken();
        String adminId = seedAdminId(token);

        ResponseEntity<JsonNode> response = put("/api/admin/users/" + adminId, Map.of(
                "username", DataBootstrap.SEED_ADMIN_USERNAME,
                "email", DataBootstrap.SEED_ADMIN_EMAIL,
                "address", "Adminisztrátori cím",
                "role", "customer"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.LAST_ADMIN_ROLE);
        assertThat(findUser(token, adminId).get("role").asText()).isEqualTo("admin");
    }

    @Test
    void k48_lastAdminCannotBeDeleted() {
        String token = adminToken();
        String adminId = seedAdminId(token);

        ResponseEntity<JsonNode> response = delete("/api/admin/users/" + adminId, token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.LAST_ADMIN_DELETE);
        assertThat(findUser(token, adminId) != null).isTrue();
    }

    /** A védelem a SZEREPKÖR megszűnése ellen véd, nem a szerkesztés ellen. */
    @Test
    void lastAdminOtherFieldsAreEditable() {
        String token = adminToken();
        String adminId = seedAdminId(token);

        ResponseEntity<JsonNode> response = put("/api/admin/users/" + adminId, Map.of(
                "username", DataBootstrap.SEED_ADMIN_USERNAME,
                "email", DataBootstrap.SEED_ADMIN_EMAIL,
                "address", "Új admin cím",
                "role", "admin"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("address").asText()).isEqualTo("Új admin cím");
    }

    @Test
    void bothOperationsSucceedWithTwoAdmins() {
        String token = adminToken();
        String adminId = seedAdminId(token);
        String secondId = registerCustomer().get("user").get("id").asText();

        // A második admin megteremtése.
        assertThat(put("/api/admin/users/" + secondId, editWith("role", "admin"), token)
                .getStatusCode()).isEqualTo(HttpStatus.OK);

        // Lefokozás: sikeres, mert marad még egy admin.
        assertThat(put("/api/admin/users/" + adminId, Map.of(
                "username", DataBootstrap.SEED_ADMIN_USERNAME,
                "email", DataBootstrap.SEED_ADMIN_EMAIL,
                "address", "Adminisztrátori cím",
                "role", "customer"), token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    // --- Törlés ---

    @Test
    void userCanBeDeleted() {
        String token = adminToken();
        String id = registerCustomer().get("user").get("id").asText();

        ResponseEntity<JsonNode> response = delete("/api/admin/users/" + id, token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("ok").asBoolean()).isTrue();
        assertThat(findUser(token, id) == null).isTrue();
    }

    @Test
    void notFoundWhenDeletingUnknownId() {
        ResponseEntity<JsonNode> response =
                delete("/api/admin/users/nincs-ilyen", adminToken());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.USER_NOT_FOUND);
    }
}
