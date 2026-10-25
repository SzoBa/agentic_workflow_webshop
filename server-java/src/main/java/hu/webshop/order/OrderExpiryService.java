package hu.webshop.order;

import hu.webshop.config.AppProperties;
import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderStatus;
import hu.webshop.repo.OrderRepository;
import hu.webshop.stock.ReservationService;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A foglalások lejáratának kezelése: a lejárt {@code pending} rendelések átállítása
 * {@code expired}-re.
 *
 * <p>Miért TÁROLT státusz, és nem az időbélyegből számolt lejárat: így a lejárt állapot
 * egyetlen igazsággal látszik az admin listán és a vevő rendelésein is. Az ára viszont,
 * hogy a készletkép pontossága az ütemező futásán múlik — ha a szerver állt, egy már
 * lejárt foglalás addig foglal, amíg a következő kör be nem következik. Tudatosan vállalt
 * korlát (ADR-0005, „Ismert korlátok" K-2).
 *
 * <p>A lejárati kör SZÁNDÉKOSAN külön, kézzel is hívható metódus: a tesztek így nem egy
 * időzítőre várnak, hanem determinisztikusan futtatják.
 */
@Service
public class OrderExpiryService {

    private static final Logger log = LoggerFactory.getLogger(OrderExpiryService.class);

    private final OrderRepository orders;
    private final ReservationService reservations;
    private final AppProperties properties;

    public OrderExpiryService(OrderRepository orders, ReservationService reservations,
            AppProperties properties) {
        this.orders = orders;
        this.reservations = reservations;
        this.properties = properties;
    }

    /** Egy lejárati kör a mostani időpontra. */
    @Transactional
    public int sweep() {
        return sweep(Instant.now());
    }

    /**
     * Egy lejárati kör a megadott időpontra. Idempotens: másodszor futtatva 0-t ad
     * vissza, mert a már lezárt rendelések nem {@code pending}-ek.
     *
     * <p>A lekérdezés a küszöböt visszafelé számolja ({@code most − foglalási idő}), a
     * végső döntést viszont a {@link ReservationService#isExpired} hozza: a lejárat
     * fogalma EGY helyen él, a szűrés csak szűkít.
     *
     * @return hány rendelés státusza változott meg
     */
    @Transactional
    public int sweep(Instant now) {
        Instant createdAtOrBefore = now.minusMillis(reservationMillis());
        List<OrderEntity> candidates = orders
                .findByStatusAndCreatedAtLessThanEqualOrderBySeqAsc(
                        OrderStatus.PENDING, createdAtOrBefore);

        int changed = 0;
        for (OrderEntity order : candidates) {
            if (reservations.isExpired(order, now)) {
                order.setStatus(OrderStatus.EXPIRED);
                changed += 1;
            }
        }
        if (changed > 0) {
            log.info("Lejárt foglalások lezárva ({} rendelés)", changed);
        }
        return changed;
    }

    /** A foglalási idő ezredmásodpercben — a konfiguráció változása azonnal érvényes. */
    private long reservationMillis() {
        return Math.round(properties.reservationHours() * 60 * 60 * 1000);
    }
}
