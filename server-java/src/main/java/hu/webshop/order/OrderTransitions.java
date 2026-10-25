package hu.webshop.order;

import hu.webshop.common.Messages;
import hu.webshop.domain.OrderStatus;
import java.util.List;
import java.util.Map;

/**
 * A teljesítési státuszváltás szabálya és a tiltás magyar indoklása — EGY helyen.
 *
 * <p>A szabály (mit szabad) és a szöveg (miért nem) azért él együtt, hogy ne
 * csúszhassanak szét: egy új státusz bevezetésekor a táblázattal EGYÜTT kell bővíteni
 * az indoklást is. Forrás: {@code spec/backend/requirements.md} 4.3.
 *
 * <ul>
 *   <li>{@code pending}: bármerre mozdulhat (az {@code expired}-et rendes körülmények
 *       között az ütemező állítja be).</li>
 *   <li>{@code expired}: már csak teljesíthető. Visszaállítani nem lehet: a foglalása
 *       megszűnt, a készletét időközben más is megvehette, tehát a {@code pending}
 *       foglalás-ígéretét már nem tudnánk betartani.</li>
 *   <li>{@code delivered}: VÉGÁLLAPOT — a készlete már levonódott, a visszalépés vagy
 *       kétszeres levonáshoz, vagy néma készlet-visszaíráshoz vezetne.</li>
 * </ul>
 *
 * <p>Az azonos státuszra állítás mindenhol megengedett: egy megismételt kérés nem hiba
 * (és nem is von le újra — lásd {@code OrderService}).
 */
final class OrderTransitions {

    private static final Map<OrderStatus, List<OrderStatus>> ALLOWED = Map.of(
            OrderStatus.PENDING,
            List.of(OrderStatus.PENDING, OrderStatus.EXPIRED, OrderStatus.DELIVERED),
            OrderStatus.EXPIRED,
            List.of(OrderStatus.EXPIRED, OrderStatus.DELIVERED),
            OrderStatus.DELIVERED,
            List.of(OrderStatus.DELIVERED));

    private OrderTransitions() {
    }

    /**
     * A tiltott átmenet felhasználónak szóló magyar indoklása — vagy {@code null}, ha az
     * átmenet érvényes.
     *
     * <p>A két szöveg SZÁNDÉKOSAN különbözik: az adminnak más a „végállapotból nem lehet
     * visszalépni" és a „lejárt foglalást nem lehet újraéleszteni" ok.
     */
    static String blocked(OrderStatus from, OrderStatus to) {
        if (ALLOWED.getOrDefault(from, List.of()).contains(to)) {
            return null;
        }
        return from == OrderStatus.DELIVERED
                ? Messages.ORDER_DELIVERED_FINAL
                : Messages.ORDER_EXPIRED_FINAL;
    }
}
