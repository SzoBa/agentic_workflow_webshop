package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.support.IntegrationTest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * FA-21: a fiókadatok módosítása NEM írja át a korábbi rendeléseket.
 *
 * <p>A rendelés önálló bizonylat: a {@code customer} blokk és a tételek neve/ára a
 * LEADÁSKORI állapot másolata, nem a fiókra mutató hivatkozás (ADR-0001). Ez a teszt
 * azt méri, ami ebből kívülről látszik: a névváltás után a rendelés a régi nevet
 * mutatja, a fiók az újat, és a kettő ELTÉR.
 *
 * <p>Miért külön osztály: az {@link AccountApiTest} kizárólag a két új végpontot
 * méri, itt viszont a katalógus és a rendelés végpontja is előfeltétel.
 */
class AccountOrderSnapshotTest extends IntegrationTest {

    private static final String USERNAME = "regivasarlo";
    private static final String EMAIL = "regi@example.com";
    private static final String ADDRESS = "Régi utca 1";
    private static final String PASSWORD = "jelszo12345";

    /** B-2: regisztráció a publikus végponton. */
    private String register() {
        return post("/api/auth/register", Map.of(
                "username", USERNAME,
                "email", EMAIL,
                "address", ADDRESS,
                "password", PASSWORD))
                .getBody().get("token").asText();
    }

    /** Az első megvásárolható seed termék (a készletet az {@code available} mondja meg). */
    private JsonNode buyableProduct() {
        JsonNode page = get("/api/products").getBody();
        for (JsonNode item : page.get("items")) {
            if (item.get("available").asInt() > 0) {
                return item;
            }
        }
        throw new IllegalStateException("Az induló katalógusban nincs megvásárolható termék.");
    }

    @Test
    void profileChangeDoesNotRewritePastOrders() {
        String token = register();
        JsonNode product = buyableProduct();

        // A rendelés a fiók AKKORI adataival megy le — ugyanaz a név, e-mail és cím,
        // ami a fiókon van. Így a későbbi eltérés csak a szerkesztésből származhat.
        ResponseEntity<JsonNode> placed = post("/api/orders", Map.of(
                "items", List.of(Map.of("productId", product.get("id").asText(),
                        "quantity", 1)),
                "customer", Map.of("name", USERNAME, "email", EMAIL, "address", ADDRESS),
                "expectedTotal", product.get("price").asInt()), token);
        assertThat(placed.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        ResponseEntity<JsonNode> saved = put("/api/auth/me", Map.of(
                "username", "ujvasarlonev",
                "email", "uj@example.com",
                "address", "Új utca 2",
                "currentPassword", PASSWORD), token);
        assertThat(saved.getStatusCode()).isEqualTo(HttpStatus.OK);

        JsonNode order = get("/api/orders", token).getBody().get(0);
        JsonNode customer = order.get("customer");
        JsonNode me = get("/api/auth/me", token).getBody();

        // A rendelés a LEADÁSKORI értékeket mutatja…
        assertThat(customer.get("name").asText()).isEqualTo(USERNAME);
        assertThat(customer.get("email").asText()).isEqualTo(EMAIL);
        assertThat(customer.get("address").asText()).isEqualTo(ADDRESS);

        // …a fiók pedig a mostaniakat: a két értékkészlet ELTÉR.
        assertThat(me.get("username").asText()).isEqualTo("ujvasarlonev");
        assertThat(customer.get("name").asText()).isNotEqualTo(me.get("username").asText());
        assertThat(customer.get("email").asText()).isNotEqualTo(me.get("email").asText());
        assertThat(customer.get("address").asText()).isNotEqualTo(me.get("address").asText());

        // A rendelés attól még a felhasználóé marad (a userId snapshot, nem idegen kulcs).
        assertThat(order.get("userId").asText()).isEqualTo(me.get("id").asText());
    }
}
