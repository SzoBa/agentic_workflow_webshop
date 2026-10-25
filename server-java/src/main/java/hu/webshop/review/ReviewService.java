package hu.webshop.review;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.ApiException;
import hu.webshop.common.JsonInput;
import hu.webshop.common.Messages;
import hu.webshop.domain.ReviewEntity;
import hu.webshop.domain.ReviewStatus;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.OrderRepository;
import hu.webshop.repo.ProductRepository;
import hu.webshop.repo.ReviewRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A termékértékelés üzleti szabályai: publikus láthatóság, „ellenőrzött vásárló",
 * egyszeri értékelés és moderáció.
 *
 * <p>Miért egy szolgáltatásban a vásárlói és az admin oldal: ugyanaz a néhány szabály
 * mozgatja mindkettőt, és épp ezek a feature legkockázatosabb pontjai — egy elhibázott
 * státuszszűrés moderálatlan tartalmat tenne publikussá. Szétszórva ez a szabály két
 * helyen romolhatna el.
 *
 * <p>Az I-7 invariáns („publikus = kizárólag {@code approved}") EGYETLEN helyen él: a
 * publikus lekérdezés már a repository szintjén státuszra szűr, a hívók pedig nem
 * szűrnek utólag.
 */
@Service
public class ReviewService {

    /** A szöveges vélemény maximális hossza (a {@code Messages} szövege is ezt mondja). */
    private static final int MAX_BODY_LENGTH = 500;

    private final ReviewRepository reviews;
    private final ProductRepository products;
    private final OrderRepository orders;

    public ReviewService(ReviewRepository reviews, ProductRepository products,
            OrderRepository orders) {
        this.reviews = reviews;
        this.products = products;
        this.orders = orders;
    }

    /**
     * Egy termék publikus értékelései: legújabb elöl, lapozás nélkül, {@code author}
     * mező nélkül.
     *
     * <p>Az inaktív termék ugyanazt a 404-et kapja, mint a nem létező — a kettő a
     * vásárlói nézetből megkülönböztethetetlen (K-03, K-04).
     */
    @Transactional(readOnly = true)
    public List<PublicReviewResponse> publicReviews(String productId) {
        requireActiveProduct(productId);
        return reviews
                .findByProductIdAndStatusOrderByCreatedAtDescIdAsc(productId, ReviewStatus.APPROVED)
                .stream()
                .map(PublicReviewResponse::of)
                .toList();
    }

    /**
     * Új értékelés beküldése. A hibák sorrendje a korábbi Node implementációt követi:
     * előbb a kérés alakja (400), utána a termék létezése (404), a vásárlás
     * ellenőrzése (403), végül az egyszeri értékelés szabálya (409).
     *
     * <p>Az {@code author} MINDIG a tokenből származik: a kérés törzsében küldött
     * érték figyelmen kívül marad, különben bárki bárki nevében értékelhetne.
     */
    @Transactional
    public ReviewResponse create(UserEntity user, JsonNode request) {
        JsonNode body = JsonInput.body(request);
        String productId = productId(body);
        int rating = validatedRating(body);
        String text = validatedBody(body);

        requireActiveProduct(productId);

        // „Ellenőrzött vásárló": a puszta megrendelés nem elég, a termék tényleges
        // kézhezvétele (delivered rendelés) után írható vélemény.
        if (!orders.existsDeliveredItem(user.getId(), productId)) {
            throw ApiException.forbidden(Messages.REVIEW_NOT_VERIFIED_BUYER);
        }

        // I-4: a korábbi értékelés BÁRMILYEN státusszal blokkol. Az elutasított és az
        // eltávolított is számít, különben a moderáció megkerülhető lenne.
        if (reviews.existsByProductIdAndAuthor(productId, user.getId())) {
            throw ApiException.conflict(Messages.REVIEW_ALREADY_EXISTS);
        }

        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        ReviewEntity review = new ReviewEntity();
        review.setId(UUID.randomUUID().toString());
        review.setProductId(productId);
        review.setAuthor(user.getId());
        review.setRating(rating);
        review.setBody(text);
        // Minden értékelés moderálatlanul születik: jóváhagyás nélkül semmi sem publikus.
        review.setStatus(ReviewStatus.PENDING);
        review.setCreatedAt(now);
        review.setUpdatedAt(now);

        try {
            // A flush ITT történik, hogy az egyediségi index sértése még ebben a
            // metódusban derüljön ki. A fenti `exists` hívás csak gyorsítás: két
            // egyidejű beküldésnél mindkettő átmehet rajta, és az ütközést kizárólag
            // az adatbázis-index dönti el — abból is 409-nek kell lennie, nem 500-nak.
            return ReviewResponse.of(reviews.saveAndFlush(review));
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict(Messages.REVIEW_ALREADY_EXISTS);
        }
    }

    /**
     * Az admin moderációs listája: TELJES rekordok, legújabb elöl.
     *
     * <p>Hiányzó vagy üres {@code status} esetén minden értékelés. Ismeretlen érték
     * (pl. {@code ?status=torolve}) egyszerűen nem illik egyetlen értékelésre sem, így
     * üres listát ad — nem hiba, ahogy a korábbi Node implementációban sem volt az.
     */
    @Transactional(readOnly = true)
    public List<ReviewResponse> forModeration(String rawStatus) {
        if (rawStatus == null || rawStatus.isEmpty()) {
            return toResponses(reviews.findAllByOrderByCreatedAtDescIdAsc());
        }
        ReviewStatus status = ReviewStatus.from(rawStatus);
        if (status == null) {
            return List.of();
        }
        return toResponses(reviews.findByStatusOrderByCreatedAtDescIdAsc(status));
    }

    /**
     * A moderációs státusz beállítása.
     *
     * <p>A {@code pending} SZÁNDÉKOSAN nem állítható be: a moderálatlan állapot a
     * kezdet, oda visszalépni értelmetlen lenne. A {@code removed} soft delete: a sor
     * megmarad, de sem a publikus listába, sem az átlagba nem számít bele.
     *
     * <p>Előbb a létezés (404), utána a státusz érvényessége (400) — a korábbi Node
     * implementáció sorrendje.
     */
    @Transactional
    public ReviewResponse moderate(String id, JsonNode request) {
        ReviewEntity review = reviews.findById(id)
                .orElseThrow(() -> ApiException.notFound(Messages.REVIEW_NOT_FOUND));

        ReviewStatus status = ReviewStatus.from(JsonInput.text(request, "status"));
        if (status == null || status == ReviewStatus.PENDING) {
            throw ApiException.badRequest(Messages.reviewStatusInvalid());
        }

        review.setStatus(status);
        // Az értékelés TARTALMA nem módosítható, ezért az updatedAt kizárólag a
        // moderációs lépést jelöli; a createdAt érintetlen marad.
        review.setUpdatedAt(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        return ReviewResponse.of(reviews.save(review));
    }

    // --- Segédek ---

    private static List<ReviewResponse> toResponses(List<ReviewEntity> entities) {
        return entities.stream().map(ReviewResponse::of).toList();
    }

    /** Csak létező ÉS aktív termék értékelhető és kérdezhető le. */
    private void requireActiveProduct(String productId) {
        if (products.findByIdAndActiveTrue(productId).isEmpty()) {
            throw ApiException.notFound(Messages.PRODUCT_NOT_FOUND);
        }
    }

    /**
     * A kért termék azonosítója. A hiányzó és a {@code null} érték üres azonosítóvá
     * válik, ami egyetlen termékre sem illik — ugyanaz a 404 lesz belőle, mint az
     * ismeretlen azonosítóból. A nem szöveg egyszerű értéket (szám, logikai) a korábbi
     * Node implementációhoz igazodva szövegként vesszük.
     */
    private static String productId(JsonNode body) {
        JsonNode node = JsonInput.body(body).get("productId");
        if (node == null || node.isNull() || !node.isValueNode()) {
            return "";
        }
        return node.asText();
    }

    /** 1 és 5 közötti EGÉSZ; a tört, a nem szám és a hiányzó érték egyaránt 400. */
    private static int validatedRating(JsonNode body) {
        Integer rating = JsonInput.integer(body, "rating");
        if (rating == null || rating < 1 || rating > 5) {
            throw ApiException.badRequest(Messages.RATING_INVALID);
        }
        return rating;
    }

    /**
     * A szöveges vélemény ellenőrzése és tárolási alakja.
     *
     * <p>Három döntés, mind a korábbi Node implementációból:
     *
     * <ul>
     *   <li>A HIÁNYZÓ mező rendben van (a vélemény opcionális), a JELEN LÉVŐ, de nem
     *       szöveg típusú viszont 400 — a JSON {@code null} is ilyen. Ezért nem a
     *       {@code JsonInput.isPresentButNotText} segédet használjuk: az a
     *       {@code null}-t hiányzónak veszi, a szerződés viszont jelen lévőnek.</li>
     *   <li>A hosszkorlát a NYERS szövegre vonatkozik (trimmelés előtt).</li>
     *   <li>Az üres vagy csak whitespace vélemény {@code null}-ként tárolódik, így a
     *       válaszból is kimarad a mező.</li>
     * </ul>
     */
    private static String validatedBody(JsonNode body) {
        JsonNode node = JsonInput.body(body).get("body");
        if (node == null) {
            return null;
        }
        if (!node.isTextual()) {
            throw ApiException.badRequest(Messages.REVIEW_BODY_NOT_TEXT);
        }
        String text = node.textValue();
        if (text.length() > MAX_BODY_LENGTH) {
            throw ApiException.badRequest(Messages.REVIEW_BODY_TOO_LONG);
        }
        String trimmed = text.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
