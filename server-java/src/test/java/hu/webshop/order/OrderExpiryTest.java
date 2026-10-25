package hu.webshop.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.ResponseEntity;

/**
 * A foglalás lejárata (K-29, K-30, K-31, K-34).
 *
 * <p>Két dolog teszi determinisztikussá, várakozás nélkül: a foglalási idő ebben a
 * kontextusban a másodperc törtrésze, a lejárati kört pedig a teszt KÖZVETLENÜL hívja egy
 * megadott időponttal — így semmilyen időzítőre nem kell várni, és a futás nem függ a
 * gépterheléstől.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "webshop.order-reservation-hours=0.0001")
class OrderExpiryTest extends OrderTestSupport {

    @Autowired
    private OrderExpiryService expiry;

    /** A lejárati kör lefuttatása egy biztosan a foglalási időn túli pillanatra. */
    private int sweep() {
        return expiry.sweep(Instant.now().plusSeconds(5));
    }

    /** K-29: a lejárati idő letelte + az ütemező futása után a rendelés `expired`. */
    @Test
    void sweepMarksLapsedOrdersExpired() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevolejarategy");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);
        placeOrderOk(customer.token(), List.of(item(product.id(), 1)), 1000);

        assertThat(sweep()).isEqualTo(1);

        JsonNode order = ownOrders(customer.token()).get(0);
        assertThat(order.get("status").asText()).isEqualTo("expired");
        // A lejárt rendelésnél nincs mit visszaszámolni.
        assertThat(order.has("reservedUntil")).isFalse();
    }

    /** A kör IDEMPOTENS: másodszor futtatva már nincs mit lezárni. */
    @Test
    void sweepIsIdempotent() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevolejaratketto");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);
        placeOrderOk(customer.token(), List.of(item(product.id(), 1)), 1000);

        assertThat(sweep()).isEqualTo(1);
        assertThat(sweep()).isZero();
        assertThat(ownOrders(customer.token()).get(0).get("status").asText()).isEqualTo("expired");
    }

    /** K-30: a lejárt rendelés NEM foglal — a készlete felszabadul a következő vevőnek. */
    @Test
    void expiredOrderHoldsNoStock() {
        String admin = adminToken();
        Customer first = registerCustomer("vevolejarathrom");
        Customer second = registerCustomer("vevolejaratnegy");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 1);

        placeOrderOk(first.token(), List.of(item(product.id(), 1)), 1000);
        // Amíg a foglalás él, a második vevő nem fér hozzá az egyetlen darabhoz.
        assertThat(placeOrder(second.token(), List.of(item(product.id(), 1)), 1000)
                .getStatusCode().value()).isEqualTo(409);

        assertThat(sweep()).isEqualTo(1);

        assertThat(customerProduct(product.id()).get("available").asInt()).isEqualTo(1);
        assertThat(placeOrder(second.token(), List.of(item(product.id(), 1)), 1000)
                .getStatusCode().value()).isEqualTo(201);
    }

    /** K-31: az `expired` NEM végállapot — teljesíthető, ha a fizikai készlet fedezi. */
    @Test
    void expiredOrderCanStillBeDelivered() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevolejaratot");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 2)), 2000);
        assertThat(sweep()).isEqualTo(1);

        ResponseEntity<JsonNode> response = setStatus(admin, order.get("id").asText(), "delivered");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("status").asText()).isEqualTo("delivered");
        assertThat(customerProduct(product.id()).get("stock").asInt()).isEqualTo(3);
    }

    /** K-34: a lejárt foglalás nem éleszthető újra — `expired → pending` 409. */
    @Test
    void expiredOrderCannotReturnToPending() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevolejarathat");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 1)), 1000);
        assertThat(sweep()).isEqualTo(1);

        ResponseEntity<JsonNode> response = setStatus(admin, order.get("id").asText(), "pending");

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(error(response)).isEqualTo(Messages.ORDER_EXPIRED_FINAL);
        assertThat(ownOrders(customer.token()).get(0).get("status").asText()).isEqualTo("expired");
    }

    /** Az `expired → expired` megengedett (idempotens), levonás nélkül. */
    @Test
    void expiredCanBeSetAgain() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevolejarathet");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 1)), 1000);
        assertThat(sweep()).isEqualTo(1);

        ResponseEntity<JsonNode> response = setStatus(admin, order.get("id").asText(), "expired");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(customerProduct(product.id()).get("stock").asInt()).isEqualTo(5);
    }
}
