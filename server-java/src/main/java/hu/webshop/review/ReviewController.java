package hu.webshop.review;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.domain.UserEntity;
import hu.webshop.security.CurrentUser;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Az értékelések vásárlói oldala: publikus olvasás és beküldés.
 *
 * <p>A moderáció NEM itt van, hanem az admin névtérben — egy nyitott moderációs
 * végpont bárkinek megengedné, hogy tetszőleges véleményt eltüntessen vagy
 * jóváhagyjon (lásd {@link AdminReviewController}).
 *
 * <p>A beküldés hitelesítést igényel; a 401-et az {@code AuthInterceptor} intézi az
 * útvonalminta alapján, ezért itt nincs rá külön ellenőrzés.
 */
@RestController
public class ReviewController {

    private final ReviewService service;

    public ReviewController(ReviewService service) {
        this.service = service;
    }

    /**
     * A termék publikus értékelései. Bejelentkezés nem kell — épp ezért nincs a
     * válaszban {@code author} mező.
     */
    @GetMapping("/api/products/{id}/reviews")
    public List<PublicReviewResponse> publicReviews(@PathVariable String id) {
        return service.publicReviews(id);
    }

    /**
     * Új értékelés. A törzs {@code { productId, rating, body? }}; az esetleg küldött
     * {@code author} mező figyelmen kívül marad, a szerző mindig a token gazdája.
     */
    @PostMapping("/api/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public ReviewResponse create(@CurrentUser UserEntity user,
            @RequestBody(required = false) JsonNode body) {
        return service.create(user, body);
    }
}
