package hu.webshop.order;

import hu.webshop.domain.OrderStatus;
import java.time.Instant;
import java.util.List;

/**
 * A rendelés válasz-alakja. A mezőnevek ÉS a sorrendjük a HTTP-szerződés része: a sorrend
 * a korábbi Node implementáció szerializálási sorrendjéből származik (ADR-0006), és azóta
 * is kötelező — a konformancia-esetek erre asszertálnak.
 *
 * <p>A {@code reservedUntil} SZÁMOLT mező, és kizárólag {@code pending} státusznál van
 * jelen: a lejárt és a kiszállított rendelésnél nincs mit visszaszámolni. A {@code null}
 * mezők a globális Jackson-beállítás miatt kimaradnak a válaszból — így a snapshot előtti
 * rendelések hiányzó {@code name}/{@code unitPrice} mezői sem jelennek meg üresen.
 */
public record OrderResponse(
        String id,
        List<Item> items,
        Customer customer,
        int total,
        Instant createdAt,
        String userId,
        OrderStatus status,
        Instant reservedUntil) {

    /**
     * Rendelési tétel. A {@code name} és az {@code unitPrice} a leadáskori MÁSOLAT
     * (ADR-0001), ezért egy későbbi átnevezés vagy átárazás nem írja át a rendelést.
     */
    public record Item(String productId, int quantity, String name, Integer unitPrice) {
    }

    /** A leadáskori vevői adatok másolata — nem a fiók aktuális adatai. */
    public record Customer(String name, String email, String address) {
    }
}
