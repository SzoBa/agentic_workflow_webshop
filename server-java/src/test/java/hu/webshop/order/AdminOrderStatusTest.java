package hu.webshop.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

/**
 * A teljesítési státuszváltás szerződése: átmenetek, fizikai készletlevonás és
 * idempotencia (K-26, K-35, K-36).
 *
 * <p>Ez az egyetlen mód arra, hogy egy rendelés kiszállítottá váljon, ezért a
 * hibaválaszok pontossága itt üzemeltetési kérdés is.
 */
class AdminOrderStatusTest extends OrderTestSupport {

    @Test
    void unknownOrderReturns404() {
        ResponseEntity<JsonNode> response = setStatus(adminToken(), "nincs-ilyen", "delivered");

        assertThat(response.getStatusCode().value()).isEqualTo(404);
        assertThat(error(response)).isEqualTo(Messages.ORDER_NOT_FOUND);
    }

    /** Érvénytelen státuszérték: 400, az érvényes értékek felsorolásával. */
    @Test
    void invalidStatusReturns400() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoszaz");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 1)), 1000);

        ResponseEntity<JsonNode> response = setStatus(admin, order.get("id").asText(), "x");

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(error(response)).isEqualTo(Messages.orderStatusInvalid());
        assertThat(error(response)).contains("pending", "expired", "delivered");
    }

    /** A `delivered` a foglalás véglegesítése: ekkor (és csak ekkor) csökken a `stock`. */
    @Test
    void deliveredAfterPendingDecrementsStock() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoszazegy");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 2)), 2000);

        ResponseEntity<JsonNode> response = setStatus(admin, order.get("id").asText(), "delivered");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("status").asText()).isEqualTo("delivered");
        JsonNode view = customerProduct(product.id());
        assertThat(view.get("stock").asInt()).isEqualTo(8);
        // A kiszállított rendelés már NEM foglal: az elérhető mennyiség a teljes készlet.
        assertThat(view.get("available").asInt()).isEqualTo(8);
    }

    /** K-26: fedezethiánynál 409, és a státusz MARAD `pending`. */
    @Test
    void physicalShortfallReturns409AndKeepsStatus() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoszazketto");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 2)), 2000);
        setStock(admin, product, 1);

        ResponseEntity<JsonNode> response = setStatus(admin, order.get("id").asText(), "delivered");

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(error(response)).isEqualTo(Messages.deliveryShortfall("Teszttermék", 1));
        assertThat(ownOrders(customer.token()).get(0).get("status").asText()).isEqualTo("pending");
        assertThat(customerProduct(product.id()).get("stock").asInt()).isEqualTo(1);
    }

    /**
     * A FIZIKAI készlettel mérünk, nem az elérhetővel: az elérhető mennyiség a
     * teljesítendő rendelés saját foglalását is levonja, azzal tehát minden rendelés
     * elbukna.
     */
    @Test
    void ownReservationDoesNotBlockDelivery() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoszazharom");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 2);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 2)), 2000);

        // Az elérhető mennyiség ekkor 0 — a teljesítésnek mégis mennie kell.
        assertThat(customerProduct(product.id()).get("available").asInt()).isZero();

        ResponseEntity<JsonNode> response = setStatus(admin, order.get("id").asText(), "delivered");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(customerProduct(product.id()).get("stock").asInt()).isZero();
    }

    /** K-36: a `delivered → delivered` idempotens — NEM von le újra. */
    @Test
    void repeatedDeliveredDoesNotDecrementAgain() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoszaznegy");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 2)), 2000);
        String orderId = order.get("id").asText();

        assertThat(setStatus(admin, orderId, "delivered").getStatusCode().value()).isEqualTo(200);
        ResponseEntity<JsonNode> repeated = setStatus(admin, orderId, "delivered");

        assertThat(repeated.getStatusCode().value()).isEqualTo(200);
        assertThat(customerProduct(product.id()).get("stock").asInt()).isEqualTo(8);
    }

    /** K-35: a `delivered` VÉGÁLLAPOT — onnan más státuszra váltani 409. */
    @Test
    void noTransitionBackAfterDelivered() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoszazot");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 2)), 2000);
        String orderId = order.get("id").asText();
        assertThat(setStatus(admin, orderId, "delivered").getStatusCode().value()).isEqualTo(200);

        ResponseEntity<JsonNode> backToPending = setStatus(admin, orderId, "pending");
        assertThat(backToPending.getStatusCode().value()).isEqualTo(409);
        assertThat(error(backToPending)).isEqualTo(Messages.ORDER_DELIVERED_FINAL);

        ResponseEntity<JsonNode> backToExpired = setStatus(admin, orderId, "expired");
        assertThat(backToExpired.getStatusCode().value()).isEqualTo(409);
        assertThat(error(backToExpired)).isEqualTo(Messages.ORDER_DELIVERED_FINAL);

        assertThat(ownOrders(customer.token()).get(0).get("status").asText()).isEqualTo("delivered");
        // A visszalépési kísérlet nem írta vissza a készletet.
        assertThat(customerProduct(product.id()).get("stock").asInt()).isEqualTo(8);
    }

    /** A `pending → expired` kézzel is beállítható, levonás nélkül. */
    @Test
    void expiredCanBeSetManuallyAfterPending() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoszazhat");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 2)), 2000);

        ResponseEntity<JsonNode> response = setStatus(admin, order.get("id").asText(), "expired");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("status").asText()).isEqualTo("expired");
        assertThat(response.getBody().has("reservedUntil")).isFalse();
        JsonNode view = customerProduct(product.id());
        assertThat(view.get("stock").asInt()).isEqualTo(10);
        // A lejárt rendelés nem foglal többé.
        assertThat(view.get("available").asInt()).isEqualTo(10);
    }

    /** A végpont az admin névtérben él: customer tokennel 403 (K-71). */
    @Test
    void customerTokenReturns403() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoszazhet");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 1)), 1000);

        ResponseEntity<JsonNode> response = patch(
                "/api/admin/orders/" + order.get("id").asText() + "/status",
                Map.of("status", "delivered"), customer.token());

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(ownOrders(customer.token()).get(0).get("status").asText()).isEqualTo("pending");
    }
}
