package hu.webshop.stock;

import hu.webshop.config.AppProperties;
import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderStatus;
import hu.webshop.domain.ProductEntity;
import hu.webshop.repo.OrderRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Készletfoglalás: mennyi van lefoglalva, mennyi érhető el, meddig tart a foglalás.
 *
 * <p>Három hívói kör használja — a termékvégpontok az elérhető mennyiséget, a
 * rendelési út a fedezetellenőrzést, az admin teljesítés a fizikai levonást —,
 * ezért él külön szolgáltatásként.
 *
 * <p>FONTOS: a foglalás a TÁROLT státuszra épül, nem az időbélyegre. Egy lejárt
 * rendelés addig foglal, amíg az ütemező át nem állítja {@code expired}-re — ez
 * tudatosan vállalt korlát (ADR-0005, „Ismert korlátok" K-2).
 */
@Service
public class ReservationService {

    private final OrderRepository orders;
    private final AppProperties properties;

    public ReservationService(OrderRepository orders, AppProperties properties) {
        this.orders = orders;
        this.properties = properties;
    }

    /** Termékenként lefoglalt darabszám. A lekérdezésben nem szereplő termékre 0. */
    @Transactional(readOnly = true)
    public Map<String, Integer> reservedByProduct(Collection<String> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return Map.of();
        }
        Map<String, Integer> reserved = new HashMap<>();
        for (OrderRepository.ReservedRow row : orders.reservedByProductIds(productIds)) {
            reserved.put(row.getProductId(), (int) Math.min(Integer.MAX_VALUE, row.getQuantity()));
        }
        return reserved;
    }

    /** Egyetlen termékre lefoglalt darabszám. */
    @Transactional(readOnly = true)
    public int reserved(String productId) {
        return reservedByProduct(List.of(productId)).getOrDefault(productId, 0);
    }

    /**
     * Az elérhető mennyiség termékenként: {@code stock − foglalás}, sosem negatív.
     * A negatív érték a felületen értelmezhetetlen lenne, és elfedné, hogy a helyes
     * válasz mindkét esetben ugyanaz: nem rendelhető.
     */
    @Transactional(readOnly = true)
    public Map<String, Integer> availableByProduct(Collection<ProductEntity> products) {
        if (products == null || products.isEmpty()) {
            return Map.of();
        }
        List<String> ids = products.stream().map(ProductEntity::getId).toList();
        Map<String, Integer> reserved = reservedByProduct(ids);
        return products.stream().collect(Collectors.toMap(
                ProductEntity::getId,
                product -> available(product, reserved.getOrDefault(product.getId(), 0))));
    }

    /** Elérhető mennyiség egy termékre. */
    @Transactional(readOnly = true)
    public int available(ProductEntity product) {
        return available(product, reserved(product.getId()));
    }

    /** Elérhető mennyiség már ismert foglalás mellett. */
    public int available(ProductEntity product, int reserved) {
        return Math.max(0, product.getStock() - reserved);
    }

    /** A foglalás lejárata: a rendelés létrehozása + a hatályos foglalási idő. */
    public Instant reservedUntil(OrderEntity order) {
        long millis = Math.round(properties.reservationHours() * 60 * 60 * 1000);
        return order.getCreatedAt().plusMillis(millis).truncatedTo(ChronoUnit.MILLIS);
    }

    /** Igaz, ha a rendelés foglalása a megadott időpontban már lejárt. */
    public boolean isExpired(OrderEntity order, Instant now) {
        return order.getStatus() == OrderStatus.PENDING
                && !reservedUntil(order).isAfter(now);
    }
}
