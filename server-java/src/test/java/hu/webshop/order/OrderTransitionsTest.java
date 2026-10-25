package hu.webshop.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import hu.webshop.common.Messages;
import hu.webshop.domain.OrderStatus;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * A teljesítési státuszváltás szabályának egysége (spec 4.3).
 *
 * <p>Az átmenettáblázat 3×3 = 9 esete kicsi és TELJES, ezért mintavételezés helyett
 * mindet felsoroljuk: így egy új státusz bevezetése azonnal látszik a hiányzó sorokon.
 *
 * <p>A teszt szándékosan a {@code hu.webshop.order} csomagban van — az osztály és a
 * metódus is csomagszintű.
 */
class OrderTransitionsTest {

    @ParameterizedTest(name = "{2}")
    @MethodSource("allowedTransitions")
    void allowsValidTransition(OrderStatus from, OrderStatus to, String label) {
        assertThat(OrderTransitions.blocked(from, to)).isNull();
    }

    static Stream<Arguments> allowedTransitions() {
        return Stream.of(
                arguments(OrderStatus.PENDING, OrderStatus.PENDING,
                        "pending → pending (ismételt kérés nem hiba)"),
                arguments(OrderStatus.PENDING, OrderStatus.EXPIRED,
                        "pending → expired (rendesen az ütemező állítja)"),
                arguments(OrderStatus.PENDING, OrderStatus.DELIVERED,
                        "pending → delivered (teljesítés)"),
                arguments(OrderStatus.EXPIRED, OrderStatus.EXPIRED,
                        "expired → expired (idempotens)"),
                arguments(OrderStatus.EXPIRED, OrderStatus.DELIVERED,
                        "expired → delivered (utólag is teljesíthető, ha a készlet fedezi)"),
                arguments(OrderStatus.DELIVERED, OrderStatus.DELIVERED,
                        "delivered → delivered (idempotens)"));
    }

    @ParameterizedTest(name = "{2}")
    @MethodSource("blockedTransitions")
    void explainsBlockedTransition(OrderStatus from, OrderStatus to, String expectedMessage,
            String label) {
        assertThat(OrderTransitions.blocked(from, to)).isEqualTo(expectedMessage);
    }

    static Stream<Arguments> blockedTransitions() {
        return Stream.of(
                // A lejárt foglalás készletét időközben más is megvehette — a pending
                // foglalás-ígéretét már nem tudnánk betartani.
                arguments(OrderStatus.EXPIRED, OrderStatus.PENDING, Messages.ORDER_EXPIRED_FINAL,
                        "expired → pending: a lejárt foglalás nem éleszthető újra"),
                // A kiszállított rendelés készlete már levonódott: a visszalépés vagy
                // kétszeres levonáshoz, vagy néma készlet-visszaíráshoz vezetne.
                arguments(OrderStatus.DELIVERED, OrderStatus.PENDING,
                        Messages.ORDER_DELIVERED_FINAL,
                        "delivered → pending: a végállapotból nincs visszaút"),
                arguments(OrderStatus.DELIVERED, OrderStatus.EXPIRED,
                        Messages.ORDER_DELIVERED_FINAL,
                        "delivered → expired: a végállapotból nincs visszaút"));
    }

    @ParameterizedTest(name = "{0} → {0} mindig szabad")
    @EnumSource(OrderStatus.class)
    void sameStatusIsAlwaysAllowed(OrderStatus status) {
        // Egy megismételt kérés nem hiba. @EnumSource: egy új státusz automatikusan
        // beleesik ebbe a szabályba, felsorolás-frissítés nélkül.
        assertThat(OrderTransitions.blocked(status, status)).isNull();
    }

    @ParameterizedTest(name = "{0} → delivered mindig szabad")
    @EnumSource(OrderStatus.class)
    void deliveryIsAllowedFromEveryStatus(OrderStatus status) {
        assertThat(OrderTransitions.blocked(status, OrderStatus.DELIVERED)).isNull();
    }
}
