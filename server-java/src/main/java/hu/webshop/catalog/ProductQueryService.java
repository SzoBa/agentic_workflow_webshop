package hu.webshop.catalog;

import hu.webshop.common.ApiException;
import hu.webshop.common.Messages;
import hu.webshop.domain.ProductEntity;
import hu.webshop.repo.ProductRepository;
import hu.webshop.repo.ReviewRepository;
import hu.webshop.stock.ReservationService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A termékkatalógus OLVASÁSI útjai: vásárlói lista, vásárlói részletek, admin lista.
 *
 * <p>Miért egy szolgáltatás a kétféle nézetre: a szűrés és a lapozás szabályai közösek, a
 * NÉZETEK viszont szándékosan külön metódusok. A kerülendő minta az „egy végpont, benne
 * {@code if (admin)} elágazás": az minden hívási helyen újra elhibázható, és egyetlen
 * félresikerült feltétel inaktív terméket szivárogtatna a vásárlói oldalra.
 */
@Service
public class ProductQueryService {

    /** A vásárlói, 12 kártyás elrendezéshez szabott lapméret. */
    private static final int CUSTOMER_PAGE_SIZE = 12;

    /** Az admin táblázatos listát lát, nem kártyarácsot — ezért nagyobb lapméret. */
    private static final int ADMIN_PAGE_SIZE = 25;

    private final ProductRepository products;
    private final ReviewRepository reviews;
    private final ReservationService reservations;

    public ProductQueryService(ProductRepository products, ReviewRepository reviews,
            ReservationService reservations) {
        this.products = products;
        this.reviews = reviews;
        this.reservations = reservations;
    }

    /**
     * A vásárlói terméklista. A forrás KIZÁRÓLAG az aktív termékek halmaza — feltétel
     * nélkül, mert az inaktív termék a vásárlói felület számára nem létezik (K-01).
     */
    @Transactional(readOnly = true)
    public ProductPage<CustomerProductView> customerList(String page, String pageSize,
            ProductFilter filter) {
        List<ProductEntity> visible = products.findByActiveTrueOrderBySeqAsc();

        // A szűrő oldalsávhoz a SZŰRETLEN halmaz kategórialistája — de csak az aktív
        // termékekből, különben egy üresre szűrhető kategória maradna benne (K-12).
        List<String> categories = Catalog.categories(visible);

        // A "raktáron" szűrő az ELÉRHETŐ mennyiségre vonatkozik, nem a fizikai készletre:
        // egy teljesen lefoglalt termék a vásárló számára elfogyott (K-11). Ez az egyetlen
        // eset, amikor a foglalásokat a teljes halmazra ki kell számolni — egyébként csak
        // a megjelenített oldalra, hogy a lapozás ne dráguljon a katalógus méretével.
        Map<String, Integer> availableOfAll =
                filter.inStock() ? reservations.availableByProduct(visible) : Map.of();

        List<ProductEntity> filtered = Catalog.filter(visible, filter,
                product -> availableOfAll.getOrDefault(product.getId(), 0));
        Catalog.Slice<ProductEntity> slice =
                Catalog.paginate(filtered, page, pageSize, CUSTOMER_PAGE_SIZE);

        Map<String, Integer> available = filter.inStock()
                ? availableOfAll
                : reservations.availableByProduct(slice.items());
        Map<String, ReviewRepository.RatingRow> ratings = ratingsOf(slice.items());

        List<CustomerProductView> items = slice.items().stream()
                .map(product -> view(product, ratings, available))
                .toList();

        return new ProductPage<>(items, slice.total(), slice.page(), slice.pageSize(),
                slice.totalPages(), categories);
    }

    /**
     * Egyetlen AKTÍV termék a vásárlói nézethez.
     *
     * <p>Az inaktív termék ugyanazt a 404-et kapja, mint a nem létező: közvetlen
     * hivatkozással sem érhető el, és a válaszból az sem derül ki, hogy létezik-e
     * (K-02, K-04).
     */
    @Transactional(readOnly = true)
    public CustomerProductView customerProduct(String id) {
        ProductEntity product = products.findByIdAndActiveTrue(id)
                .orElseThrow(() -> ApiException.notFound(Messages.PRODUCT_NOT_FOUND));
        List<ProductEntity> single = List.of(product);
        return view(product, ratingsOf(single), reservations.availableByProduct(single));
    }

    /**
     * Az admin terméklista: a TELJES katalógus, az inaktív termékekkel együtt.
     * Értékelési aggregátum nincs rajta, foglalási adat viszont igen (K-15).
     */
    @Transactional(readOnly = true)
    public ProductPage<AdminProductView> adminList(String page, String pageSize,
            ProductFilter filter) {
        List<ProductEntity> all = products.findAllByOrderBySeqAsc();

        // A kategóriaszűrőhöz a TELJES katalógus kategórialistája (az inaktívakét is,
        // különben egy csak inaktív termékeket tartalmazó kategória eltűnne a szűrőből).
        List<String> categories = Catalog.categories(all);

        // Az admin lista nem szűr elérhetőségre, ezért itt nem kell foglalást számolni.
        List<ProductEntity> filtered = Catalog.filter(all, filter, ProductEntity::getStock);
        Catalog.Slice<ProductEntity> slice =
                Catalog.paginate(filtered, page, pageSize, ADMIN_PAGE_SIZE);

        // A foglalási adatok CSAK a megjelenített oldalra számolódnak.
        Map<String, Integer> reserved = reservations.reservedByProduct(
                slice.items().stream().map(ProductEntity::getId).toList());

        List<AdminProductView> items = slice.items().stream()
                .map(product -> {
                    int held = reserved.getOrDefault(product.getId(), 0);
                    return AdminProductView.of(product, held, reservations.available(product, held));
                })
                .toList();

        return new ProductPage<>(items, slice.total(), slice.page(), slice.pageSize(),
                slice.totalPages(), categories);
    }

    private CustomerProductView view(ProductEntity product,
            Map<String, ReviewRepository.RatingRow> ratings, Map<String, Integer> available) {
        ReviewRepository.RatingRow rating = ratings.get(product.getId());
        double average = rating == null ? 0 : rating.getAverage();
        long count = rating == null ? 0 : rating.getCount();
        return CustomerProductView.of(product, average, count,
                available.getOrDefault(product.getId(), 0));
    }

    /**
     * Értékelési aggregátumok a megadott termékekre, EGY lekérdezéssel. Üres listánál nem
     * indítunk lekérdezést: az {@code in ()} feltétel üres halmazzal értelmetlen.
     */
    private Map<String, ReviewRepository.RatingRow> ratingsOf(List<ProductEntity> page) {
        if (page.isEmpty()) {
            return Map.of();
        }
        List<String> ids = page.stream().map(ProductEntity::getId).toList();
        Map<String, ReviewRepository.RatingRow> byProduct = new HashMap<>();
        for (ReviewRepository.RatingRow row : reviews.ratingsByProductIds(ids)) {
            byProduct.put(row.getProductId(), row);
        }
        return byProduct;
    }
}
