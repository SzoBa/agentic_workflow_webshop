package hu.webshop.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.willThrow;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.ops.OrderNotifier;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * K-75: a rendelési értesítő hibája NEM buktathatja a már létrejött rendelést.
 *
 * <p>A katalógus „érvénytelen e-mail hitelesítő adatok" előfeltételt ír; ez a
 * gyakorlatban egyetlen megfigyelhető dolgot jelent: a küldés kivétellel elszáll.
 * A teszt ezt a kivételt injektálja az {@link OrderNotifier} felületen, hálózati
 * hívás NÉLKÜL — egy valódi Gmail-hívás bogus kulcsokkal kimenő kapcsolatot
 * igényelne, és a tesztek offline is futnak.
 *
 * <p>A védelem két rétegű, és mindkettő szándékos: a {@code GmailOrderNotifier}
 * saját maga elnyel minden kivételt, a {@link OrderController} pedig még egyszer
 * körbezárja a hívást. A második réteg azért kell, mert az értesítő felület
 * CSERÉLHETŐ — egy jövőbeli implementáció hibája sem szivároghat ki a vevőhöz.
 * Ez a teszt a második réteget méri; az elsőt (hiányzó konfiguráció) az
 * {@code OpsIntegrationTest} fedi (K-73, K-74).
 */
class OrderNotificationFailureTest extends OrderTestSupport {

    @MockitoBean
    private OrderNotifier notifier;

    private ListAppender<ILoggingEvent> logs;
    private ch.qos.logback.classic.Logger controllerLogger;

    @BeforeEach
    void captureLogs() {
        controllerLogger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(
                OrderController.class);
        logs = new ListAppender<>();
        logs.start();
        controllerLogger.addAppender(logs);
    }

    @AfterEach
    void releaseLogs() {
        controllerLogger.detachAppender(logs);
    }

    /**
     * A vevő válasza VÁLTOZATLAN: 201, a teljes rendeléssel. A hiba kizárólag a
     * naplóba kerül, a rendelésazonosítóval — enélkül az üzemeltető nem tudná, melyik
     * rendelésről maradt le az értesítés.
     */
    @Test
    void k75_failingNotificationDoesNotFailOrder() {
        willThrow(new IllegalStateException("érvénytelen Gmail hitelesítő adatok"))
                .given(notifier).notifyNewOrder(any(), any());

        String adminToken = adminToken();
        TestProduct product = createProduct(adminToken, "Értesítő teszttermék", 1500, 5);
        Customer customer = registerCustomer("ertesitovevo");

        ResponseEntity<JsonNode> response =
                placeOrder(customer.token(), List.of(item(product.id(), 2)), 3000);

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        JsonNode order = response.getBody();
        assertThat(order.get("total").asInt()).isEqualTo(3000);
        assertThat(order.get("status").asText()).isEqualTo("pending");
        // A hiba nem szivároghat a válaszba semmilyen formában.
        assertThat(order.has("error")).isFalse();
        assertThat(order.toString()).doesNotContain("Gmail", "hitelesítő");

        String orderId = order.get("id").asText();

        List<ILoggingEvent> errors = logs.list.stream()
                .filter(event -> event.getLevel() == Level.ERROR)
                .toList();
        assertThat(errors).hasSize(1);
        assertThat(errors.getFirst().getFormattedMessage()).contains(orderId);
        assertThat(errors.getFirst().getThrowableProxy().getMessage())
                .contains("érvénytelen Gmail hitelesítő adatok");
    }

    /**
     * A rendelés a bukott értesítés után is TELJES ÉRTÉKŰ: lekérdezhető, és a
     * készletfoglalása él. A hibakezelés nem hagyhat félkész állapotot.
     */
    @Test
    void k75_orderIsFullyValidAfterFailingNotification() {
        willThrow(new RuntimeException("küldés sikertelen"))
                .given(notifier).notifyNewOrder(any(), any());

        String adminToken = adminToken();
        TestProduct product = createProduct(adminToken, "Értesítő teszttermék 2", 1000, 5);
        Customer customer = registerCustomer("ertesitovevo2");

        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 3)), 3000);

        // A saját rendeléslistában megjelenik…
        JsonNode own = ownOrders(customer.token());
        assertThat(own).hasSize(1);
        assertThat(own.get(0).get("id").asText()).isEqualTo(order.get("id").asText());

        // …és a foglalás is megtörtént: 5 - 3 = 2 elérhető.
        assertThat(customerProduct(product.id()).get("available").asInt()).isEqualTo(2);
    }
}
