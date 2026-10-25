package hu.webshop.order;

import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderItemEntity;
import hu.webshop.domain.OrderStatus;
import hu.webshop.stock.ReservationService;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Entitás → válasz leképezés.
 *
 * <p>Azért külön komponens, mert a „{@code reservedUntil} CSAK {@code pending}
 * státusznál van jelen" szabálynak EGY helyen kell élnie: a saját rendeléslista, a
 * leadás válasza és az admin státuszváltás válasza is ezen megy keresztül. Ha a
 * szabály három helyre másolódna, az egyik hívó előbb-utóbb lemaradna róla.
 */
@Component
public class OrderMapper {

    private final ReservationService reservations;

    public OrderMapper(ReservationService reservations) {
        this.reservations = reservations;
    }

    /**
     * A rendelés válasz-alakja.
     *
     * <p>A hívó felelőssége, hogy a tételek betöltött állapotban legyenek (nyitott
     * tranzakció vagy saját magunk által épített gráf) — az {@code open-in-view}
     * szándékosan ki van kapcsolva.
     */
    public OrderResponse toResponse(OrderEntity order) {
        Instant reservedUntil = order.getStatus() == OrderStatus.PENDING
                ? reservations.reservedUntil(order)
                : null;
        return new OrderResponse(
                order.getId(),
                order.getItems().stream().map(OrderMapper::toItem).toList(),
                new OrderResponse.Customer(
                        order.getCustomerName(),
                        order.getCustomerEmail(),
                        order.getCustomerAddress()),
                order.getTotal(),
                order.getCreatedAt(),
                order.getUserId(),
                order.getStatus(),
                reservedUntil);
    }

    /** Több rendelés leképezése a beszúrási sorrend megtartásával. */
    public List<OrderResponse> toResponses(List<OrderEntity> orders) {
        return orders.stream().map(this::toResponse).toList();
    }

    private static OrderResponse.Item toItem(OrderItemEntity item) {
        return new OrderResponse.Item(
                item.getProductId(), item.getQuantity(), item.getName(), item.getUnitPrice());
    }
}
