package hu.webshop.order;

import hu.webshop.domain.OrderStatus;
import java.time.Instant;
import java.util.List;

/**
 * Az admin rendeléslista eleme: az {@link OrderResponse} MINDEN mezője, azonos
 * sorrendben, plusz a {@code username}.
 *
 * <p>A {@code username} pusztán kényelmi mező: a rendelés {@code customer} blokkja a
 * leadáskori MÁSOLAT (ADR-0001), ami eltérhet a fiók mai adataitól — az adminnak viszont
 * tudnia kell, melyik fiók adta le. Ha a fiókot időközben törölték, a mező {@code null},
 * és a globális Jackson {@code non_null} beállítás miatt KIMARAD a válaszból: a rendelés
 * önálló bizonylat, a fiók hiánya nem hiba.
 *
 * <p>A leképezés az {@link OrderMapper} eredményét bővíti, nem épít párhuzamos ágat —
 * így a „{@code reservedUntil} csak {@code pending}-nél" szabály egy helyen marad.
 */
public record AdminOrderView(
        String id,
        List<OrderResponse.Item> items,
        OrderResponse.Customer customer,
        int total,
        Instant createdAt,
        String userId,
        OrderStatus status,
        Instant reservedUntil,
        String username) {

    /** A már leképezett rendelés kiegészítése a felhasználónévvel (törölt fióknál {@code null}). */
    public static AdminOrderView of(OrderResponse order, String username) {
        return new AdminOrderView(
                order.id(),
                order.items(),
                order.customer(),
                order.total(),
                order.createdAt(),
                order.userId(),
                order.status(),
                order.reservedUntil(),
                username);
    }
}
