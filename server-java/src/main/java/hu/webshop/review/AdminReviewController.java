package hu.webshop.review;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Értékelés-moderáció (admin).
 *
 * <p>A hitelesítést és az admin jogosultságot az {@code AuthInterceptor} intézi az
 * {@code /api/admin/**} mintára — végpontonkénti annotáció nélkül, hogy egy új admin
 * végpontnál ne lehessen elfelejteni.
 *
 * <p>Eltérés az eredeti követelménytől: az „MVP-ben bárki moderálhat" szabály a
 * felhasználókezelés bevezetése óta nyitott végpontot jelentene, ezért a moderáció az
 * admin névtérbe került.
 */
@RestController
@RequestMapping("/api/admin/reviews")
public class AdminReviewController {

    private final ReviewService service;

    public AdminReviewController(ReviewService service) {
        this.service = service;
    }

    /**
     * Az értékelések moderáláshoz, TELJES rekordokkal (az {@code author} mezővel):
     * a szerző azonosítója a moderátor munkaeszköze.
     *
     * <p>Miért van erre szükség: moderálni csak azt lehet, amit az admin meg is talál —
     * a beküldés válasza csak a BEKÜLDŐNEK adja vissza az azonosítót.
     */
    @GetMapping
    public List<ReviewResponse> list(@RequestParam(required = false) String status) {
        return service.forModeration(status);
    }

    /** A moderációs státusz beállítása: {@code { status: approved | rejected | removed }}. */
    @PatchMapping("/{id}")
    public ReviewResponse moderate(@PathVariable String id,
            @RequestBody(required = false) JsonNode body) {
        return service.moderate(id, body);
    }
}
