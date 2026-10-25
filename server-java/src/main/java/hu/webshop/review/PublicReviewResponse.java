package hu.webshop.review;

import hu.webshop.domain.ReviewEntity;
import hu.webshop.domain.ReviewStatus;
import java.time.Instant;

/**
 * Az értékelés PUBLIKUS alakja. Az {@code author} szándékosan hiányzik.
 *
 * <p>Miért külön típus, és nem egy „kihagyjuk szerializáláskor" trükk: a publikus
 * lista bejelentkezés nélkül bárki számára olvasható, az {@code author} pedig belső
 * felhasználó-azonosító — a kiadása a fiókazonosítók kigyűjtését tenné lehetővé.
 * Ha a mező nincs is a típuson, akkor egy későbbi módosítás sem szivárogtathatja ki
 * véletlenül. A megjelenítendő szerzőnév külön feature lenne.
 *
 * <p>A mezők sorrendje a teljes alakéval egyezik, csak az {@code author} marad ki —
 * pontosan úgy, ahogy a korábbi Node implementáció {@code toPublicReview} függvénye tette.
 */
public record PublicReviewResponse(
        String id,
        String productId,
        int rating,
        String body,
        ReviewStatus status,
        Instant createdAt,
        Instant updatedAt) {

    public static PublicReviewResponse of(ReviewEntity review) {
        return new PublicReviewResponse(
                review.getId(),
                review.getProductId(),
                review.getRating(),
                review.getBody(),
                review.getStatus(),
                review.getCreatedAt(),
                review.getUpdatedAt());
    }
}
