package hu.webshop.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Az értékelési aggregátumok a vásárlói termékválaszban ({@code ratingAvg},
 * {@code ratingCount}).
 *
 * <p>Konformancia: K-13, K-14. Az aggregátumokat a katalógus-végpont adja vissza, a
 * BEMENETÜKET viszont ez a feature állítja elő — a moderáció itt dől el, ezért az
 * eseteket az értékelés oldaláról is végig kell mérni: csak a jóváhagyott értékelés
 * számíthat bele.
 */
class ReviewRatingAggregateTest extends ReviewTestSupport {

    @Test
    @DisplayName("K-13: három jóváhagyott értékelés (5, 4, 4) → ratingAvg = 4.3, ratingCount = 3")
    void averagesApprovedReviews() {
        String admin = adminToken();
        reviewWithStatus("atlagvevoegy", admin, 5, "approved");
        reviewWithStatus("atlagvevoketto", admin, 4, "approved");
        reviewWithStatus("atlagvevoharom", admin, 4, "approved");

        ResponseEntity<JsonNode> response = get("/api/products/" + SEED_PRODUCT_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        JsonNode product = response.getBody();
        // Egy tizedesre kerekítve — a válasz nem közöl lebegőpontos maradékot.
        assertThat(product.get("ratingAvg").asDouble()).isEqualTo(4.3, within(0.0001));
        assertThat(product.get("ratingCount").asInt()).isEqualTo(3);
    }

    @Test
    @DisplayName("K-14: értékelés nélkül ratingAvg = 0 és ratingCount = 0")
    void reportsZeroWithoutReviews() {
        ResponseEntity<JsonNode> response = get("/api/products/" + SEED_PRODUCT_ID);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("ratingAvg").asDouble()).isEqualTo(0.0, within(0.0001));
        assertThat(response.getBody().get("ratingCount").asInt()).isZero();
    }

    @Test
    @DisplayName("A moderálatlan és az elutasított értékelés NEM számít az átlagba")
    void unmoderatedReviewsAreExcluded() {
        String admin = adminToken();
        reviewWithStatus("kizartvevoegy", admin, 5, "approved");
        submitReview(verifiedBuyer("kizartvevoketto", admin), 1);
        reviewWithStatus("kizartvevoharom", admin, 1, "rejected");
        reviewWithStatus("kizartvevonegy", admin, 1, "removed");

        ResponseEntity<JsonNode> response = get("/api/products/" + SEED_PRODUCT_ID);

        assertThat(response.getBody().get("ratingAvg").asDouble()).isEqualTo(5.0, within(0.0001));
        assertThat(response.getBody().get("ratingCount").asInt()).isEqualTo(1);
    }
}
