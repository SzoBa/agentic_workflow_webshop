package hu.webshop.review;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Az értékelés-moderáció admin oldala: {@code GET /api/admin/reviews} és
 * {@code PATCH /api/admin/reviews/:id}.
 *
 * <p>Konformancia: K-68, K-69.
 */
class AdminReviewApiTest extends ReviewTestSupport {

    // --- Hozzáférés ---

    @Test
    @DisplayName("401 token nélkül, 403 customer tokennel — mindkét admin végponton")
    void requiresAdminRole() {
        String admin = adminToken();
        String reviewId = submitReview(verifiedBuyer("moderaciovevo", admin), 5);
        String customer = registerCustomer("nemadminfelh");

        assertThat(get("/api/admin/reviews").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(get("/api/admin/reviews", customer).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(moderate(customer, reviewId, "approved").getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    // --- Moderációs lista ---

    @Test
    @DisplayName("Az admin MINDEN státuszt lát, a szerzővel együtt — a moderáláshoz kell")
    void listsEveryStatusWithAuthor() {
        String admin = adminToken();
        String authorToken = verifiedBuyer("listavevoegy", admin);
        String authorId = userId(authorToken);
        submitReview(authorToken, 5);
        reviewWithStatus("listavevoketto", admin, 4, "approved");
        reviewWithStatus("listavevoharom", admin, 1, "removed");

        ResponseEntity<JsonNode> response = get("/api/admin/reviews", admin);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ids(response.getBody())).hasSize(3);
        assertThat(response.getBody().toString()).contains(authorId);
        response.getBody().forEach(review -> assertThat(review.has("author")).isTrue());
    }

    @Test
    @DisplayName("A lista státusz szerint szűrhető; üres és ismeretlen érték eltérően viselkedik")
    void filtersByStatus() {
        String admin = adminToken();
        String pending = submitReview(verifiedBuyer("szurovevoegy", admin), 5);
        String approved = reviewWithStatus("szurovevoketto", admin, 4, "approved");

        assertThat(ids(get("/api/admin/reviews?status=pending", admin).getBody()))
                .containsExactly(pending);
        assertThat(ids(get("/api/admin/reviews?status=approved", admin).getBody()))
                .containsExactly(approved);
        // Üres érték: nincs szűrés.
        assertThat(ids(get("/api/admin/reviews?status=", admin).getBody()))
                .containsExactlyInAnyOrder(pending, approved);
        // Ismeretlen érték: egyetlen értékelésre sem illik.
        assertThat(ids(get("/api/admin/reviews?status=torolve", admin).getBody())).isEmpty();
    }

    @Test
    @DisplayName("A moderációs listán a legújabb áll elöl — az adminnak a friss beküldés a sürgős")
    void listsNewestFirst() {
        String admin = adminToken();
        String older = submitReview(verifiedBuyer("sorrendvevoegy", admin), 5);
        tick();
        String newer = submitReview(verifiedBuyer("sorrendvevoketto", admin), 4);

        assertThat(ids(get("/api/admin/reviews", admin).getBody())).containsExactly(newer, older);
    }

    // --- Státuszváltás ---

    @Test
    @DisplayName("K-69: 200 — az updatedAt megváltozik, a createdAt nem")
    void moderationUpdatesOnlyUpdatedAt() {
        String admin = adminToken();
        ResponseEntity<JsonNode> created = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID, "rating", 5),
                verifiedBuyer("idobelyegvevo", admin));
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        String reviewId = created.getBody().get("id").asText();
        String originalCreatedAt = created.getBody().get("createdAt").asText();
        String originalUpdatedAt = created.getBody().get("updatedAt").asText();
        // Az időbélyeg ezredmásodperc pontosságú: enélkül az állítás időzítésfüggő lenne.
        tick();

        ResponseEntity<JsonNode> response = moderate(admin, reviewId, "approved");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode review = response.getBody();
        assertThat(review.get("status").asText()).isEqualTo("approved");
        assertThat(review.get("createdAt").asText()).isEqualTo(originalCreatedAt);
        assertThat(Instant.parse(review.get("updatedAt").asText()))
                .isAfter(Instant.parse(originalUpdatedAt));
    }

    @Test
    @DisplayName("K-68: 400, ha valaki vissza akarna lépni pending státuszra")
    void rejectsPendingStatus() {
        String admin = adminToken();
        String reviewId = submitReview(verifiedBuyer("visszalepovevo", admin), 5);

        ResponseEntity<JsonNode> response = moderate(admin, reviewId, "pending");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("error").asText())
                .isEqualTo(Messages.reviewStatusInvalid());
    }

    @Test
    @DisplayName("400 minden érvénytelen státuszértékre (ismeretlen, üres, nem szöveg, hiányzó)")
    void rejectsInvalidStatus() {
        String admin = adminToken();
        String reviewId = submitReview(verifiedBuyer("rosszstatuszvevo", admin), 5);

        for (Object status : new Object[] {"torolve", "", 5}) {
            ResponseEntity<JsonNode> response = patch("/api/admin/reviews/" + reviewId,
                    Map.of("status", status), admin);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().get("error").asText())
                    .isEqualTo(Messages.reviewStatusInvalid());
        }

        Map<String, Object> nullStatus = new HashMap<>();
        nullStatus.put("status", null);
        assertThat(patch("/api/admin/reviews/" + reviewId, nullStatus, admin).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(patch("/api/admin/reviews/" + reviewId, Map.of(), admin).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("404 nem létező értékelésre — a létezés ellenőrzése megelőzi a státuszvalidációt")
    void rejectsUnknownReview() {
        String admin = adminToken();

        ResponseEntity<JsonNode> response = moderate(admin, "nincs-ilyen", "approved");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.REVIEW_NOT_FOUND);

        // Érvénytelen státusszal is 404 marad: előbb a létezés dől el.
        assertThat(moderate(admin, "nincs-ilyen", "pending").getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    @DisplayName("A removed SOFT DELETE: az értékelés az admin listán megmarad")
    void removedIsSoftDelete() {
        String admin = adminToken();
        String reviewId = submitReview(verifiedBuyer("softdeletevevo", admin), 5);

        assertThat(moderate(admin, reviewId, "removed").getStatusCode()).isEqualTo(HttpStatus.OK);

        assertThat(ids(get("/api/admin/reviews?status=removed", admin).getBody()))
                .containsExactly(reviewId);
    }

    private static List<String> ids(JsonNode array) {
        List<String> ids = new ArrayList<>();
        array.forEach(node -> ids.add(node.get("id").asText()));
        return ids;
    }
}
