package hu.webshop.review;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.support.IntegrationTest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Az értékelés-tesztek közös előfeltételei.
 *
 * <p>Minden előfeltétel KIZÁRÓLAG publikus API-hívásokból épül (a konformancia-katalógus
 * B-2…B-4 lépései): nincs adatbázis-írás és nincs teszt-hátsóajtó, így a tesztek
 * ugyanazt a felületet használják, mint a valódi kliens.
 */
abstract class ReviewTestSupport extends IntegrationTest {

    /** A seed katalógus első terméke (DataBootstrap) — aktív, bőséges készlettel. */
    protected static final String SEED_PRODUCT_ID = "p1";
    protected static final int SEED_PRODUCT_PRICE = 4990;

    /** B-2: új vásárló regisztrálása, a tokenjével. */
    protected String registerCustomer(String username) {
        ResponseEntity<JsonNode> response = post("/api/auth/register", Map.of(
                "username", username,
                "email", username + "@example.com",
                "address", "Teszt utca 1.",
                "password", "jelszo1234"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getBody().get("token").asText();
    }

    /** A tokenhez tartozó felhasználó azonosítója — az {@code author} ellenőrzéséhez. */
    protected String userId(String token) {
        ResponseEntity<JsonNode> response = get("/api/auth/me", token);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody().get("id").asText();
    }

    /**
     * B-4: „ellenőrzött vásárló" — a friss vásárló megrendeli a terméket, majd az admin
     * kiszállítottra állítja a rendelést. Enélkül minden értékelés-beküldés 403 lenne.
     */
    protected String verifiedBuyer(String username, String adminToken) {
        String token = registerCustomer(username);

        ResponseEntity<JsonNode> order = post("/api/orders", Map.of(
                "items", List.of(Map.of("productId", SEED_PRODUCT_ID, "quantity", 1)),
                "customer", Map.of(
                        "name", "Teszt Vevő",
                        "email", username + "@example.com",
                        "address", "Teszt utca 1."),
                "expectedTotal", SEED_PRODUCT_PRICE), token);
        assertThat(order.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        String orderId = order.getBody().get("id").asText();
        ResponseEntity<JsonNode> delivered = patch("/api/admin/orders/" + orderId + "/status",
                Map.of("status", "delivered"), adminToken);
        assertThat(delivered.getStatusCode()).isEqualTo(HttpStatus.OK);

        return token;
    }

    /** Érvényes értékelés beküldése; a létrejött értékelés azonosítóját adja vissza. */
    protected String submitReview(String token, int rating) {
        ResponseEntity<JsonNode> response = post("/api/reviews", Map.of(
                "productId", SEED_PRODUCT_ID, "rating", rating), token);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return response.getBody().get("id").asText();
    }

    /** Moderációs státuszváltás adminként. */
    protected ResponseEntity<JsonNode> moderate(String adminToken, String reviewId, String status) {
        return patch("/api/admin/reviews/" + reviewId, Map.of("status", status), adminToken);
    }

    /**
     * Egy lépésben: új ellenőrzött vásárló, beküldött értékelés, majd moderálás.
     * A legtöbb publikus lista-eset ilyen, egymástól független szerzőjű értékelésekből áll
     * (egy felhasználó egy terméket csak egyszer értékelhet — I-4).
     */
    protected String reviewWithStatus(String username, String adminToken, int rating,
            String status) {
        String reviewId = submitReview(verifiedBuyer(username, adminToken), rating);
        assertThat(moderate(adminToken, reviewId, status).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        return reviewId;
    }

    /**
     * Rövid várakozás, hogy a következő időbélyeg biztosan másik ezredmásodpercre essen.
     * A szerződés ezredmásodperc pontosságú időbélyegeket ír elő, a sorrend- és
     * {@code updatedAt}-állítások enélkül időzítésfüggők (flaky) lennének.
     */
    protected void tick() {
        try {
            Thread.sleep(5);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
