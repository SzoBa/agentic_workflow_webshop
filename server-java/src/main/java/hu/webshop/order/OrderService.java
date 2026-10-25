package hu.webshop.order;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.ApiException;
import hu.webshop.common.JsonInput;
import hu.webshop.common.Messages;
import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderItemEntity;
import hu.webshop.domain.OrderStatus;
import hu.webshop.domain.ProductEntity;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.OrderRepository;
import hu.webshop.repo.ProductRepository;
import hu.webshop.stock.ReservationService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A rendelés életciklusa: leadás, saját lista, teljesítés.
 *
 * <p>Ez a projekt legkockázatosabb logikája, ezért két dolgot mond ki a szolgáltatás
 * szintjén:
 *
 * <ul>
 *   <li><b>I-5 atomicitás:</b> a fedezetellenőrzés és a foglalás létrejötte (a rendelés
 *       beszúrása) EGY tranzakcióban, a termékek sorainak zárolásával fut. Enélkül két
 *       egyidejű kérés ugyanazt a darabot foglalhatná le, és a készlet negatívba
 *       mehetne. A zárolás mindig {@code seq} szerint rendezve történik (holtpont).</li>
 *   <li><b>A validáció SORRENDJE szerződés:</b> a {@code requirements.md} 4.2 lépéseit
 *       követi, mert a hibaüzenet attól függ, melyik hiba dől el előbb — például
 *       fedezethiány ÉS áreltérés esetén a készlethiány üzenete megy vissza.</li>
 * </ul>
 */
@Service
public class OrderService {

    private final OrderRepository orders;
    private final ProductRepository products;
    private final ReservationService reservations;
    private final OrderMapper mapper;

    public OrderService(OrderRepository orders, ProductRepository products,
            ReservationService reservations, OrderMapper mapper) {
        this.orders = orders;
        this.products = products;
        this.reservations = reservations;
        this.mapper = mapper;
    }

    /**
     * A felhasználó SAJÁT rendelései, beszúrási sorrendben (K-32).
     *
     * <p>A szűrés nem opció, hanem adatvédelem: a rendelés a leadáskori nevet, e-mail
     * címet és szállítási címet is tartalmazza.
     */
    @Transactional(readOnly = true)
    public List<OrderResponse> listOwn(String userId) {
        return mapper.toResponses(orders.findByUserIdOrderBySeqAsc(userId));
    }

    /**
     * Új rendelés leadása.
     *
     * @return a mentett rendelés — a tételekkel együtt MEMÓRIÁBAN felépített gráf, ezért
     *         a tranzakció lezárása után is biztonságosan olvasható (a hívó ebből küldi
     *         az értesítést és ebből képezi a választ)
     */
    @Transactional
    public OrderEntity place(UserEntity user, JsonNode rawBody) {
        JsonNode body = JsonInput.body(rawBody);

        // --- 1. Alapvalidáció (400) ---
        JsonNode items = body.get("items");
        if (items == null || !items.isArray() || items.isEmpty()) {
            throw ApiException.badRequest(Messages.CART_EMPTY);
        }
        JsonNode customer = JsonInput.object(body, "customer");
        String customerName = filled(customer, "name");
        String customerEmail = filled(customer, "email");
        String customerAddress = filled(customer, "address");
        if (customerName == null || customerEmail == null || customerAddress == null) {
            throw ApiException.badRequest(Messages.CUSTOMER_DATA_MISSING);
        }

        // Az ár-egyeztetés MEZŐJE kötelező: a vevő soha ne fizessen mást, mint amit a
        // képernyőn jóváhagyott. A hiánya a KÉRÉS hibája (400) — az ELTÉRÉS viszont nem
        // az, hanem ütközés (409), ezért az lentebb, a fedezet ismeretében dől el.
        Double expectedTotal = JsonInput.number(body, "expectedTotal");
        if (expectedTotal == null || !Double.isFinite(expectedTotal)) {
            throw ApiException.badRequest(Messages.EXPECTED_TOTAL_REQUIRED);
        }

        // A kért termékek sorainak ZÁROLÁSA. Innentől a commitig egyetlen másik kérés sem
        // olvashat elavult foglalási képet ugyanezekre a termékekre (I-5, ADR-0003).
        Map<String, ProductEntity> catalog = lock(requestedIds(items));

        // --- 2-3. Termékfeloldás és mennyiség, a tételek SORRENDJÉBEN ---
        // A két ellenőrzés szándékosan egy körben fut: az első hibás tétel dönt, tehát
        // egy ismeretlen termék előbbre valónak számít egy későbbi tétel rossz
        // mennyiségénél — pontosan úgy, ahogy a korábbi Node implementációban.
        long total = 0;
        List<ValidatedItem> validated = new ArrayList<>();
        for (JsonNode item : items) {
            String productId = JsonInput.text(item, "productId");
            ProductEntity product = productId == null ? null : catalog.get(productId);
            if (product == null || !product.isActive()) {
                throw ApiException.badRequest(Messages.productUnavailable(nameFor(product, item)));
            }
            Integer quantity = quantity(item);
            if (quantity == null) {
                throw ApiException.badRequest(Messages.quantityInvalid(product.getName()));
            }
            // 5. A végösszeg MINDIG a szerver áraiból: a kliens által küldött ár nem
            // érvényesül (K-20).
            total += (long) product.getPrice() * quantity;
            validated.add(new ValidatedItem(product, quantity));
        }

        // --- 4. Készletfedezet (409), mind-vagy-semmi ---
        Map<String, Integer> requested = aggregate(validated);
        Map<String, Integer> reserved = reservations.reservedByProduct(requested.keySet());
        for (Map.Entry<String, Integer> entry : requested.entrySet()) {
            ProductEntity product = catalog.get(entry.getKey());
            int available = reservations.available(product, reserved.getOrDefault(entry.getKey(), 0));
            if (entry.getValue() > available) {
                // Az ELSŐ hiányos tétel üzenete megy vissza: a vevőnek egy konkrét,
                // cselekvésre bírható mondat kell, nem hiánylista.
                throw ApiException.conflict(available == 0
                        ? Messages.outOfStock(product.getName())
                        : Messages.insufficientStock(product.getName(), available));
            }
        }

        // --- 6. Ár-egyeztetés (409) ---
        // SZÁNDÉKOSAN a fedezetellenőrzés UTÁN: egy fedezetlen rendelésnél a vevőnek a
        // készletről kell hallania, nem az árváltozásról — az árat úgyis hiába
        // frissítené, ha nincs áru (hibakatalogus.md, „a két 409 sorrendje").
        if (expectedTotal != (double) total) {
            throw ApiException.conflict(Messages.TOTAL_MISMATCH);
        }

        // --- 7. Rögzítés: `pending`, tétel-snapshot, a `stock` NEM változik ---
        OrderEntity order = new OrderEntity();
        order.setId(UUID.randomUUID().toString());
        order.setUserId(user.getId());
        order.setCustomerName(customerName);
        order.setCustomerEmail(customerEmail);
        order.setCustomerAddress(customerAddress);
        order.setTotal(Math.toIntExact(total));
        order.setCreatedAt(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        order.setStatus(OrderStatus.PENDING);
        for (ValidatedItem item : validated) {
            OrderItemEntity entity = new OrderItemEntity();
            entity.setProductId(item.product().getId());
            entity.setQuantity(item.quantity());
            // Snapshot: a leadáskori név és egységár a tételbe MÁSOLÓDIK, így egy későbbi
            // átnevezés, átárazás vagy törlés nem írja át a rendelést (ADR-0001).
            entity.setName(item.product().getName());
            entity.setUnitPrice(item.product().getPrice());
            order.addItem(entity);
        }
        return orders.save(order);
    }

    /**
     * A teljesítési státusz beállítása (admin).
     *
     * <p>A {@code delivered} a foglalás VÉGLEGESÍTÉSE: ekkor (és csak ekkor) csökken a
     * fizikai készlet, ezért ez az egyetlen státuszváltás, ami elbukhat.
     *
     * @return a válasz-alak — a leképezés SZÁNDÉKOSAN itt, a tranzakción belül történik,
     *         mert a betöltött rendelés tételei lusta kapcsolatok
     */
    @Transactional
    public OrderResponse updateStatus(String orderId, JsonNode rawBody) {
        JsonNode body = JsonInput.body(rawBody);

        // A 404 megelőzi a 400-at: a nem létező rendelésről a státuszérték helyessége
        // már nem mond semmit (a korábbi Node implementáció sorrendje).
        OrderEntity order = orders.findById(orderId)
                .orElseThrow(() -> ApiException.notFound(Messages.ORDER_NOT_FOUND));

        OrderStatus target = OrderStatus.from(JsonInput.text(body, "status"));
        if (target == null) {
            throw ApiException.badRequest(Messages.orderStatusInvalid());
        }
        String blocked = OrderTransitions.blocked(order.getStatus(), target);
        if (blocked != null) {
            throw ApiException.conflict(blocked);
        }

        // A már kiszállított rendelés ismételt `delivered`-re állítása IDEMPOTENS: nem von
        // le másodszor is (K-36).
        if (target == OrderStatus.DELIVERED && order.getStatus() != OrderStatus.DELIVERED) {
            deductStock(order);
        }
        order.setStatus(target);
        return mapper.toResponse(order);
    }

    /**
     * A tételek levonása a FIZIKAI készletből, előzetes fedezetellenőrzéssel.
     *
     * <p>Miért a {@code stock}-kal mérünk, és nem az elérhető mennyiséggel: az elérhető
     * mennyiség a teljesítendő rendelés SAJÁT foglalását is levonja, azzal tehát minden
     * rendelés elbukna. A kiszállításnál az számít, van-e fizikailag annyi a raktárban.
     *
     * <p>Előbb MINDEN tételt ellenőrzünk, és csak utána vonunk le: fedezethiány esetén a
     * státusz nem változik, és részleges levonás sem marad hátra (K-26).
     */
    private void deductStock(OrderEntity order) {
        Map<String, Integer> requested = aggregate(order.getItems().stream()
                .map(item -> new RequestedQuantity(item.getProductId(), item.getQuantity()))
                .toList());
        Map<String, ProductEntity> catalog = lock(requested.keySet());

        for (Map.Entry<String, Integer> entry : requested.entrySet()) {
            ProductEntity product = catalog.get(entry.getKey());
            // A katalógusból törölt termékről nincs mit mondani: a rendelés a
            // snapshotjából önhordó, készlete viszont már nincs, amit vezetni kellene.
            if (product != null && entry.getValue() > product.getStock()) {
                throw ApiException.conflict(
                        Messages.deliveryShortfall(product.getName(), product.getStock()));
            }
        }
        for (Map.Entry<String, Integer> entry : requested.entrySet()) {
            ProductEntity product = catalog.get(entry.getKey());
            if (product != null) {
                product.setStock(Math.max(0, product.getStock() - entry.getValue()));
            }
        }
    }

    // --- Segédek ---

    /** Egy validált tétel: a feloldott termék és a csonkított darabszám. */
    private record ValidatedItem(ProductEntity product, int quantity) implements RequestedLine {
        @Override
        public String productId() {
            return product.getId();
        }
    }

    /** Egy termékre vonatkozó igény (az összevonáshoz). */
    private record RequestedQuantity(String productId, int quantity) implements RequestedLine {
    }

    private interface RequestedLine {
        String productId();

        int quantity();
    }

    /**
     * Termékenként ÖSSZEVONT igény, a termék első előfordulásának sorrendjében.
     *
     * <p>Az összevonás nem kényelmi lépés: 2+2 darab egy 3 darabos készletet EGYÜTT merít
     * ki, külön-külön mérve viszont mindkét tétel átmenne. A sorrend azért rögzített,
     * mert az első hiányos tétel üzenete megy vissza a vevőnek.
     */
    private static Map<String, Integer> aggregate(List<? extends RequestedLine> lines) {
        Map<String, Integer> totals = new LinkedHashMap<>();
        for (RequestedLine line : lines) {
            totals.merge(line.productId(), line.quantity(),
                    (a, b) -> (int) Math.min(Integer.MAX_VALUE, (long) a + b));
        }
        return totals;
    }

    /** A kérésben szereplő termékazonosítók, ismétlés nélkül. */
    private static Collection<String> requestedIds(JsonNode items) {
        Collection<String> ids = new LinkedHashSet<>();
        for (JsonNode item : items) {
            String productId = JsonInput.text(item, "productId");
            if (productId != null) {
                ids.add(productId);
            }
        }
        return ids;
    }

    /** A termékek sorszintű zárolása azonosító szerint kikeresve (üres kérésre nem fut le). */
    private Map<String, ProductEntity> lock(Collection<String> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return products.lockAllByIdIn(ids).stream()
                .collect(Collectors.toMap(ProductEntity::getId, Function.identity()));
    }

    /** Egy kitöltött vevői mező, vagy {@code null}, ha hiányzik/üres. */
    private static String filled(JsonNode customer, String field) {
        String value = JsonInput.text(customer, field);
        return value == null || value.isEmpty() ? null : value;
    }

    /**
     * A hibaüzenetben megnevezett terméknév. Fontossági sorrend:
     *
     * <ol>
     *   <li>a TELJES katalógus — inaktivált terméknél a szerver tudja az igazit;</li>
     *   <li>a kliens kosarából érkező név — csak a TÖRÖLT termék esetén marad ez;</li>
     *   <li>semleges szöveg, ha egyik sincs.</li>
     * </ol>
     *
     * <p>A nyers termékazonosító SOSEM szivárog ki.
     */
    private static String nameFor(ProductEntity known, JsonNode item) {
        if (known != null) {
            return known.getName();
        }
        String fromCart = JsonInput.trimmedText(item, "name");
        return JsonInput.isBlank(fromCart) ? Messages.FALLBACK_PRODUCT_NAME : fromCart;
    }

    /**
     * A tétel mennyisége egészre CSONKÍTVA, legalább 1 — különben {@code null}
     * (érvénytelen).
     *
     * <p>A numerikus szöveget (pl. {@code "2"}) is elfogadjuk, mert a korábbi Node
     * implementáció JavaScript-oldalon ugyanígy konvertált. A felső vágás azért
     * kell, hogy egy irreálisan nagy darabszám a KÉSZLET ágon akadjon el (409), ne
     * érvénytelen mennyiségként (400) — ott is így volt.
     */
    private static Integer quantity(JsonNode item) {
        JsonNode node = JsonInput.body(item).get("quantity");
        double raw;
        if (node != null && node.isNumber()) {
            raw = node.doubleValue();
        } else if (node != null && node.isTextual()) {
            try {
                raw = Double.parseDouble(node.textValue().trim());
            } catch (NumberFormatException ex) {
                return null;
            }
        } else {
            return null;
        }
        if (!Double.isFinite(raw)) {
            return null;
        }
        double floored = Math.floor(raw);
        if (floored < 1) {
            return null;
        }
        return (int) Math.min(Integer.MAX_VALUE, floored);
    }
}
