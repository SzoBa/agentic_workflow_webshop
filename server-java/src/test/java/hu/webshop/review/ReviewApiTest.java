package hu.webshop.review;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Az értékelés vásárlói oldala: beküldés ({@code POST /api/reviews}) és publikus lista
 * ({@code GET /api/products/:id/reviews}).
 *
 * <p>Konformancia: K-60…K-67.
 */
class ReviewApiTest extends ReviewTestSupport {

    // --- Beküldés: jogosultság és „ellenőrzött vásárló" ---

    @Test
    @DisplayName("401 token nélkül — a beküldés hitelesítést igényel")
    void requiresAuthentication() {
        ResponseEntity<JsonNode> response = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID, "rating", 5));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(error(response)).isEqualTo(Messages.AUTH_REQUIRED);
    }

    @Test
    @DisplayName("K-60: 403, ha a felhasználónak nincs kiszállított rendelése a termékre")
    void rejectsUnverifiedBuyer() {
        String token = registerCustomer("vevonelkulirendeles");

        ResponseEntity<JsonNode> response = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID, "rating", 5), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(error(response)).isEqualTo(Messages.REVIEW_NOT_VERIFIED_BUYER);
    }

    @Test
    @DisplayName("403, ha a rendelés még nem kiszállított — a megrendelés önmagában nem elég")
    void rejectsPendingOrder() {
        String token = registerCustomer("vevofuggorendeles");
        ResponseEntity<JsonNode> order = post("/api/orders", Map.of(
                "items", List.of(Map.of("productId", SEED_PRODUCT_ID, "quantity", 1)),
                "customer", Map.of("name", "Teszt Vevő", "email", "fuggo@example.com",
                        "address", "Teszt utca 1."),
                "expectedTotal", SEED_PRODUCT_PRICE), token);
        assertThat(order.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        ResponseEntity<JsonNode> response = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID, "rating", 5), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    // --- Beküldés: siker ---

    @Test
    @DisplayName("K-61: 201 ellenőrzött vásárlónak, pending státusszal és a token szerinti szerzővel")
    void createsPendingReview() {
        String admin = adminToken();
        String token = verifiedBuyer("ellenorzottvevo", admin);

        ResponseEntity<JsonNode> response = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID, "rating", 5, "body", "Nagyon jó termék."),
                token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        JsonNode review = response.getBody();
        assertThat(review.get("productId").asText()).isEqualTo(SEED_PRODUCT_ID);
        assertThat(review.get("rating").asInt()).isEqualTo(5);
        assertThat(review.get("body").asText()).isEqualTo("Nagyon jó termék.");
        // Jóváhagyás nélkül semmi nem válik publikussá.
        assertThat(review.get("status").asText()).isEqualTo("pending");
        assertThat(review.get("author").asText()).isEqualTo(userId(token));
        assertThat(review.get("createdAt").asText()).isEqualTo(review.get("updatedAt").asText());
    }

    @Test
    @DisplayName("Az author a TOKENBŐL jön, a kérés törzse nem írhatja felül")
    void authorAlwaysComesFromToken() {
        String admin = adminToken();
        String token = verifiedBuyer("hamisszerzo", admin);

        ResponseEntity<JsonNode> response = post("/api/reviews", Map.of(
                "productId", SEED_PRODUCT_ID, "rating", 4, "author", "valaki-mas"), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().get("author").asText()).isEqualTo(userId(token));
    }

    // --- Beküldés: validáció ---

    @Test
    @DisplayName("400, ha a rating nem 1–5 közötti egész (hiányzó, tört, tartományon kívüli)")
    void rejectsInvalidRating() {
        String admin = adminToken();
        String token = verifiedBuyer("rosszertekeles", admin);

        for (Object rating : new Object[] {0, 6, -1, 4.5}) {
            ResponseEntity<JsonNode> response = post("/api/reviews",
                    Map.of("productId", SEED_PRODUCT_ID, "rating", rating), token);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(error(response)).isEqualTo(Messages.RATING_INVALID);
        }

        ResponseEntity<JsonNode> missing = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID), token);
        assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(missing)).isEqualTo(Messages.RATING_INVALID);
    }

    @Test
    @DisplayName("400, ha a body jelen van, de nem szöveg")
    void rejectsNonTextBody() {
        String admin = adminToken();
        String token = verifiedBuyer("nemszovegbody", admin);

        ResponseEntity<JsonNode> response = post("/api/reviews", Map.of(
                "productId", SEED_PRODUCT_ID, "rating", 5, "body", 42), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.REVIEW_BODY_NOT_TEXT);
    }

    @Test
    @DisplayName("A JSON null body is 'jelen van, de nem szöveg' - 400")
    void rejectsNullBody() {
        String admin = adminToken();
        String token = verifiedBuyer("nullbody", admin);
        // Nyers JSON, nem Map: a kliens ObjectMapper-e a globális `non_null` beállítás
        // miatt eldobná a null értékű mezőt, és épp a jelenlétét akarjuk vizsgálni.
        String request = "{\"productId\":\"" + SEED_PRODUCT_ID + "\",\"rating\":5,\"body\":null}";

        ResponseEntity<JsonNode> response = post("/api/reviews", request, token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(response)).isEqualTo(Messages.REVIEW_BODY_NOT_TEXT);
    }

    @Test
    @DisplayName("400, ha a vélemény 500 karakternél hosszabb; pontosan 500 még elfogadott")
    void enforcesBodyLength() {
        String admin = adminToken();
        String token = verifiedBuyer("tulhosszubody", admin);

        ResponseEntity<JsonNode> rejected = post("/api/reviews", Map.of(
                "productId", SEED_PRODUCT_ID, "rating", 5, "body", "a".repeat(501)), token);
        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error(rejected)).isEqualTo(Messages.REVIEW_BODY_TOO_LONG);

        ResponseEntity<JsonNode> accepted = post("/api/reviews", Map.of(
                "productId", SEED_PRODUCT_ID, "rating", 5, "body", "a".repeat(500)), token);
        assertThat(accepted.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(accepted.getBody().get("body").asText()).hasSize(500);
    }

    @Test
    @DisplayName("Az üres vagy csak szóközből álló vélemény nem kerül a válaszba")
    void blankBodyIsOmitted() {
        String admin = adminToken();
        String token = verifiedBuyer("uresbody", admin);

        ResponseEntity<JsonNode> response = post("/api/reviews", Map.of(
                "productId", SEED_PRODUCT_ID, "rating", 3, "body", "   "), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().has("body")).isFalse();
    }

    @Test
    @DisplayName("A vélemény elhagyható — a mező ilyenkor sem szerepel a válaszban")
    void bodyIsOptional() {
        String admin = adminToken();
        String token = verifiedBuyer("nincsbody", admin);

        ResponseEntity<JsonNode> response = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID, "rating", 2), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().has("body")).isFalse();
    }

    // --- Beküldés: termék létezése ---

    @Test
    @DisplayName("404 nem létező termékre")
    void rejectsUnknownProduct() {
        String admin = adminToken();
        String token = verifiedBuyer("ismeretlentermek", admin);

        ResponseEntity<JsonNode> response = post("/api/reviews",
                Map.of("productId", "nincs-ilyen", "rating", 5), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(error(response)).isEqualTo(Messages.PRODUCT_NOT_FOUND);
    }

    @Test
    @DisplayName("404 INAKTÍV termékre — a vásárló számára nem létezik")
    void rejectsInactiveProduct() {
        String admin = adminToken();
        String token = verifiedBuyer("inaktivtermek", admin);
        deactivateSeedProduct(admin);

        ResponseEntity<JsonNode> response = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID, "rating", 5), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(error(response)).isEqualTo(Messages.PRODUCT_NOT_FOUND);
    }

    // --- Beküldés: egyszeri értékelés (I-4) ---

    @Test
    @DisplayName("K-62: 409, ha a felhasználó már értékelte a terméket")
    void rejectsDuplicateReview() {
        String admin = adminToken();
        String token = verifiedBuyer("duplaertekelo", admin);
        submitReview(token, 5);

        ResponseEntity<JsonNode> response = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID, "rating", 1), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(error(response)).isEqualTo(Messages.REVIEW_ALREADY_EXISTS);
    }

    @Test
    @DisplayName("K-63: 409 akkor is, ha a korábbi értékelés removed — a moderáció nem kerülhető meg")
    void rejectsResubmissionAfterModeration() {
        String admin = adminToken();
        String token = verifiedBuyer("moderaltertekelo", admin);
        String reviewId = submitReview(token, 5);
        assertThat(moderate(admin, reviewId, "removed").getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<JsonNode> response = post("/api/reviews",
                Map.of("productId", SEED_PRODUCT_ID, "rating", 5), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(error(response)).isEqualTo(Messages.REVIEW_ALREADY_EXISTS);
    }

    // --- Publikus lista ---

    @Test
    @DisplayName("K-64: a moderálatlan (pending) értékelés nem publikus")
    void pendingReviewIsNotPublic() {
        String admin = adminToken();
        submitReview(verifiedBuyer("fuggoertekelo", admin), 5);

        ResponseEntity<JsonNode> response = get("/api/products/" + SEED_PRODUCT_ID + "/reviews");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ids(response.getBody())).isEmpty();
    }

    @Test
    @DisplayName("K-65: kizárólag az approved értékelés publikus (a rejected és a removed nem)")
    void onlyApprovedReviewsArePublic() {
        String admin = adminToken();
        String approved = reviewWithStatus("jovahagyottvevo", admin, 5, "approved");
        reviewWithStatus("elutasitottvevo", admin, 1, "rejected");
        reviewWithStatus("eltavolitottvevo", admin, 1, "removed");

        ResponseEntity<JsonNode> response = get("/api/products/" + SEED_PRODUCT_ID + "/reviews");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ids(response.getBody())).containsExactly(approved);
    }

    @Test
    @DisplayName("K-66: createdAt szerint csökkenő sorrend — a későbbi áll elöl")
    void newestReviewComesFirst() {
        String admin = adminToken();
        String older = reviewWithStatus("regebbivevo", admin, 4, "approved");
        tick();
        String newer = reviewWithStatus("ujabbvevo", admin, 5, "approved");

        ResponseEntity<JsonNode> response = get("/api/products/" + SEED_PRODUCT_ID + "/reviews");

        assertThat(ids(response.getBody())).containsExactly(newer, older);
    }

    @Test
    @DisplayName("K-67: a publikus elemeken nincs author mező — a felhasználó-azonosító nem szivároghat ki")
    void publicReviewsHideAuthor() {
        String admin = adminToken();
        String token = verifiedBuyer("rejtettszerzo", admin);
        String authorId = userId(token);
        String reviewId = submitReview(token, 5);
        assertThat(moderate(admin, reviewId, "approved").getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<JsonNode> response = get("/api/products/" + SEED_PRODUCT_ID + "/reviews");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ids(response.getBody())).containsExactly(reviewId);
        JsonNode first = response.getBody().get(0);
        assertThat(first.has("author")).isFalse();
        assertThat(first.toString()).doesNotContain(authorId);
        // A hasznos mezők viszont megvannak.
        assertThat(first.get("rating").asInt()).isEqualTo(5);
        assertThat(first.get("status").asText()).isEqualTo("approved");
        assertThat(first.get("productId").asText()).isEqualTo(SEED_PRODUCT_ID);
    }

    @Test
    @DisplayName("A publikus lista bejelentkezés nélkül olvasható, és üres, ha nincs jóváhagyott értékelés")
    void publicListIsOpenAndEmptyByDefault() {
        ResponseEntity<JsonNode> response = get("/api/products/" + SEED_PRODUCT_ID + "/reviews");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ids(response.getBody())).isEmpty();
    }

    @Test
    @DisplayName("404 a publikus listán nem létező és inaktív termékre egyaránt — a kettő azonos")
    void publicListRejectsMissingProduct() {
        ResponseEntity<JsonNode> unknown = get("/api/products/nincs-ilyen/reviews");
        assertThat(unknown.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(error(unknown)).isEqualTo(Messages.PRODUCT_NOT_FOUND);

        deactivateSeedProduct(adminToken());

        ResponseEntity<JsonNode> inactive = get("/api/products/" + SEED_PRODUCT_ID + "/reviews");
        assertThat(inactive.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(inactive.getBody().toString()).isEqualTo(unknown.getBody().toString());
    }

    @Test
    @DisplayName("A jóváhagyás azonnal publikussá tesz, a removed azonnal eltüntet")
    void moderationTakesEffectImmediately() {
        String admin = adminToken();
        String reviewId = submitReview(verifiedBuyer("moderaciofolyamat", admin), 4);

        assertThat(ids(get("/api/products/" + SEED_PRODUCT_ID + "/reviews").getBody())).isEmpty();

        moderate(admin, reviewId, "approved");
        assertThat(ids(get("/api/products/" + SEED_PRODUCT_ID + "/reviews").getBody()))
                .containsExactly(reviewId);

        moderate(admin, reviewId, "removed");
        assertThat(ids(get("/api/products/" + SEED_PRODUCT_ID + "/reviews").getBody())).isEmpty();
    }

    // --- Segédek ---

    private void deactivateSeedProduct(String adminToken) {
        ResponseEntity<JsonNode> response = patch(
                "/api/admin/products/" + SEED_PRODUCT_ID + "/active",
                Map.of("active", false), adminToken);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private static String error(ResponseEntity<JsonNode> response) {
        return response.getBody().get("error").asText();
    }

    private static List<String> ids(JsonNode array) {
        List<String> ids = new ArrayList<>();
        array.forEach(node -> ids.add(node.get("id").asText()));
        return ids;
    }
}
