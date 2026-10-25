package hu.webshop.review;

import hu.webshop.domain.ReviewEntity;
import hu.webshop.domain.ReviewStatus;
import java.time.Instant;

/**
 * Az értékelés TELJES alakja, az {@code author} mezővel együtt.
 *
 * <p>Két hívói kör kapja meg: a beküldő (a saját, frissen létrehozott értékelését) és
 * az admin moderációs felülete — utóbbinak a szerző azonosítója a munkaeszköze
 * (visszatérő rosszhiszemű beküldő felismerése). A bejelentkezés nélkül olvasható
 * publikus listára SOHA nem ez kerül, hanem a {@link PublicReviewResponse}.
 *
 * <p>A mezők sorrendje a korábbi Node implementáció objektumalakjából származik
 * (ADR-0006), és azóta is a szerződés része.
 *
 * <p>A {@code body} {@code null} esetén kimarad a JSON-ból (globális
 * {@code non_null} szerializálás) — a szerződés szerint az üres vélemény nem üres
 * szövegként, hanem hiányzó mezőként jelenik meg.
 */
public record ReviewResponse(
        String id,
        String productId,
        String author,
        int rating,
        String body,
        ReviewStatus status,
        Instant createdAt,
        Instant updatedAt) {

    public static ReviewResponse of(ReviewEntity review) {
        return new ReviewResponse(
                review.getId(),
                review.getProductId(),
                review.getAuthor(),
                review.getRating(),
                review.getBody(),
                review.getStatus(),
                review.getCreatedAt(),
                review.getUpdatedAt());
    }
}
