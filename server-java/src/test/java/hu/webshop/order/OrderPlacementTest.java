package hu.webshop.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

/**
 * A rendelés leadásának szerződése: végösszeg, ár-egyeztetés, készletfedezet, snapshot és
 * a saját rendelések láthatósága (K-20…K-28, K-32, K-33).
 *
 * <p>A tesztek kizárólag HTTP-n keresztül dolgoznak: ugyanazt a felületet mérik, amit a
 * kliens is használ.
 */
class OrderPlacementTest extends OrderTestSupport {

    /** K-20: a végösszeget a SZERVER számolja; a kliens által küldött ár nem érvényesül. */
    @Test
    void serverComputesTotalIgnoringClientPrice() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoegyes");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);

        // A kliens hamisítja az egységárat — a szervernek nem szabad elhinnie.
        Map<String, Object> forgedItem = item(product.id(), 2);
        forgedItem.put("unitPrice", 1);
        forgedItem.put("price", 1);

        JsonNode order = placeOrderOk(customer.token(), List.of(forgedItem), 2000);

        assertThat(order.get("total").asInt()).isEqualTo(2000);
        assertThat(order.get("status").asText()).isEqualTo("pending");
        assertThat(order.get("userId").asText()).isEqualTo(customer.userId());
        assertThat(order.get("id").isTextual()).isTrue();

        JsonNode item = order.get("items").get(0);
        assertThat(item.get("productId").asText()).isEqualTo(product.id());
        assertThat(item.get("quantity").asInt()).isEqualTo(2);
        // Snapshot: a leadáskori név és egységár (ADR-0001).
        assertThat(item.get("name").asText()).isEqualTo("Teszttermék");
        assertThat(item.get("unitPrice").asInt()).isEqualTo(1000);

        // A vevői adatok a KÉRÉSBŐL jönnek, nem a fiókból.
        assertThat(order.get("customer").get("name").asText()).isEqualTo("Teszt Vevő");
        assertThat(order.get("customer").get("email").asText()).isEqualTo("vevo@example.com");
        assertThat(order.get("customer").get("address").asText()).isEqualTo("Teszt utca 1.");
    }

    /** K-21: a hiányzó `expectedTotal` a KÉRÉS hibája (400), nem ütközés. */
    @Test
    void missingExpectedTotalReturns400() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevokettes");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);

        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(product.id(), 1)), null);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(error(response)).isEqualTo(Messages.EXPECTED_TOTAL_REQUIRED);
        assertThat(ownOrders(customer.token()).size()).isZero();
    }

    /** K-21 párja: a nem szám érték ugyanaz az eset. */
    @Test
    void nonNumericExpectedTotalReturns400() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevoharmas");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);

        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(product.id(), 1)), "1000");

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(error(response)).isEqualTo(Messages.EXPECTED_TOTAL_REQUIRED);
    }

    /** K-22: az eltérő végösszeg ÜTKÖZÉS (409) — a kérés hibátlan, a világ változott meg. */
    @Test
    void mismatchedExpectedTotalReturns409() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevonegyes");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);

        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(product.id(), 1)), 1);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(error(response)).isEqualTo(Messages.TOTAL_MISMATCH);
        assertThat(ownOrders(customer.token()).size()).isZero();
    }

    /** K-23: az üzenet megnevezi a terméket és az elérhető darabszámot. */
    @Test
    void insufficientAvailableQuantityReturns409() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevootos");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 2);

        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(product.id(), 3)), 3000);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(error(response)).isEqualTo(Messages.insufficientStock("Teszttermék", 2));
        assertThat(ownOrders(customer.token()).size()).isZero();
    }

    /** Elfogyott terméknél külön (nem darabszámot közlő) üzenet jár. */
    @Test
    void outOfStockProductHasItsOwnMessage() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevohatos");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 1);
        setStock(admin, product, 0);

        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(product.id(), 1)), 1000);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(error(response)).isEqualTo(Messages.outOfStock("Teszttermék"));
    }

    /** K-24: mind-vagy-semmi — egyetlen fedezetlen tétel az EGÉSZ rendelést elutasítja. */
    @Test
    void singleUncoveredItemRejectsWholeOrder() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevohetes");
        TestProduct inStock = createProduct(admin, "Van készlet", 1000, 5);
        TestProduct soldOut = createProduct(admin, "Nincs készlet", 2000, 1);
        setStock(admin, soldOut, 0);

        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(inStock.id(), 1), item(soldOut.id(), 1)), 3000);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(error(response)).isEqualTo(Messages.outOfStock("Nincs készlet"));
        // Részleges teljesítés nincs: rendelés sem keletkezik.
        assertThat(ownOrders(customer.token()).size()).isZero();
    }

    /** Az azonos termékre vonatkozó több tétel ÖSSZEVONTAN meríti a készletet. */
    @Test
    void itemsOfSameProductAreMeasuredCombined() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevonyolcas");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 3);

        // Külön-külön mindkét tétel átmenne (2 ≤ 3), együtt viszont 4 > 3.
        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(product.id(), 2), item(product.id(), 2)), 4000);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(error(response)).isEqualTo(Messages.insufficientStock("Teszttermék", 3));
    }

    /** K-25 és K-27: a leadás nem írja át a `stock`-ot, csak az elérhető mennyiséget fogyasztja. */
    @Test
    void placementOnlyReservesAndKeepsPhysicalStock() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevokilences");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);

        placeOrderOk(customer.token(), List.of(item(product.id(), 2)), 2000);

        JsonNode view = customerProduct(product.id());
        assertThat(view.get("stock").asInt()).isEqualTo(5);
        assertThat(view.get("available").asInt()).isEqualTo(3);
    }

    /** A foglalás csökkenti a KÖVETKEZŐ rendelő számára elérhető mennyiséget. */
    @Test
    void reservationReducesAvailableForNextBuyer() {
        String admin = adminToken();
        Customer first = registerCustomer("vevotizes");
        Customer second = registerCustomer("vevotizenegy");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 3);

        placeOrderOk(first.token(), List.of(item(product.id(), 2)), 2000);

        // Már csak 1 db szabad, a második kérés 2-t kérne.
        assertThat(placeOrder(second.token(), List.of(item(product.id(), 2)), 2000)
                .getStatusCode().value()).isEqualTo(409);
        // 1 db viszont még belefér.
        assertThat(placeOrder(second.token(), List.of(item(product.id(), 1)), 1000)
                .getStatusCode().value()).isEqualTo(201);
    }

    /** K-28: a `pending` rendelésen van `reservedUntil`, a `delivered`-en nincs. */
    @Test
    void reservedUntilIsPresentOnlyWhilePending() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevotizenketto");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);

        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 1)), 1000);
        assertThat(order.hasNonNull("reservedUntil")).isTrue();
        // A számolt lejárat a leadás után van.
        assertThat(order.get("reservedUntil").asText())
                .isGreaterThan(order.get("createdAt").asText());

        ResponseEntity<JsonNode> delivered =
                setStatus(admin, order.get("id").asText(), "delivered");
        assertThat(delivered.getStatusCode().value()).isEqualTo(200);
        assertThat(delivered.getBody().has("reservedUntil")).isFalse();
        assertThat(ownOrders(customer.token()).get(0).has("reservedUntil")).isFalse();
    }

    /** K-32: a felhasználó KIZÁRÓLAG a saját rendeléseit látja. */
    @Test
    void userSeesOnlyOwnOrders() {
        String admin = adminToken();
        Customer first = registerCustomer("vevotizenharom");
        Customer second = registerCustomer("vevotizennegy");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);

        JsonNode own = placeOrderOk(first.token(), List.of(item(product.id(), 1)), 1000);
        JsonNode others = placeOrderOk(second.token(), List.of(item(product.id(), 1)), 1000);

        JsonNode list = ownOrders(first.token());
        assertThat(list.size()).isEqualTo(1);
        assertThat(list.get(0).get("id").asText()).isEqualTo(own.get("id").asText());
        assertThat(list.get(0).get("id").asText()).isNotEqualTo(others.get("id").asText());
    }

    /** K-33: fedezethiány ÉS áreltérés esetén a KÉSZLET üzenete megy vissza. */
    @Test
    void stockMessageWinsOverTotalMismatch() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevotizenot");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 1);
        setStock(admin, product, 0);

        // Az `expectedTotal` szándékosan hibás — mégsem az ár üzenete jár.
        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(product.id(), 1)), 1);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(error(response)).isEqualTo(Messages.outOfStock("Teszttermék"));
        assertThat(ownOrders(customer.token()).size()).isZero();
    }

    /** Részleges fedezethiánynál is a készlet dönt. */
    @Test
    void stockDecidesOnPartialShortfallToo() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevotizenhat");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 2);

        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(product.id(), 3)), 1);

        assertThat(response.getStatusCode().value()).isEqualTo(409);
        assertThat(error(response)).isEqualTo(Messages.insufficientStock("Teszttermék", 2));
    }

    // --- Alapvalidáció ---

    @Test
    void emptyOrInvalidCartReturns400() {
        Customer customer = registerCustomer("vevotizenhet");

        ResponseEntity<JsonNode> response = placeOrder(customer.token(), List.of(), 0);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(error(response)).isEqualTo(Messages.CART_EMPTY);
    }

    @Test
    void missingCustomerDataReturns400() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevotizennyolc");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", List.of(item(product.id(), 1)));
        body.put("customer", Map.of("name", "Csak név"));
        body.put("expectedTotal", 1000);

        ResponseEntity<JsonNode> response = post("/api/orders", body, customer.token());

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(error(response)).isEqualTo(Messages.CUSTOMER_DATA_MISSING);
    }

    @Test
    void nonPositiveQuantityReturns400() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevotizenkilenc");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 5);

        ResponseEntity<JsonNode> response = placeOrder(customer.token(),
                List.of(item(product.id(), 0)), 0);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(error(response)).isEqualTo(Messages.quantityInvalid("Teszttermék"));
    }

    /** Ismeretlen termék: a hibaüzenet SOSEM tartalmazza a nyers azonosítót. */
    @Test
    void unknownProductLeaksNoIdentifier() {
        Customer customer = registerCustomer("vevohuszas");

        ResponseEntity<JsonNode> response =
                placeOrder(customer.token(), List.of(item("nincs-ilyen-termek", 1)), 1000);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(error(response))
                .isEqualTo(Messages.productUnavailable(Messages.FALLBACK_PRODUCT_NAME))
                .doesNotContain("nincs-ilyen-termek");
    }

    /** Törölt terméknél a kliens kosarából érkező névre esünk vissza. */
    @Test
    void deletedProductShowsCartSnapshotName() {
        Customer customer = registerCustomer("vevohuszonegy");

        Map<String, Object> cartItem = item("nincs-ilyen-termek", 1);
        cartItem.put("name", "Régi termék");

        ResponseEntity<JsonNode> response = placeOrder(customer.token(), List.of(cartItem), 1000);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(error(response)).isEqualTo(Messages.productUnavailable("Régi termék"));
    }

    /** Inaktivált terméknél a SZERVER neve nyer, nem a kliens által küldött. */
    @Test
    void inactiveProductUsesServerName() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevohuszonketto");
        TestProduct product = createProduct(admin, "Igazi név", 1000, 5);
        deactivate(admin, product);

        Map<String, Object> cartItem = item(product.id(), 1);
        cartItem.put("name", "Hamis kosárnév");

        ResponseEntity<JsonNode> response = placeOrder(customer.token(), List.of(cartItem), 1000);

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(error(response))
                .isEqualTo(Messages.productUnavailable("Igazi név"))
                .doesNotContain("Hamis kosárnév");
        assertThat(ownOrders(customer.token()).size()).isZero();
    }

    /** A rendelés önálló bizonylat: a termék átárazása nem írja át visszamenőleg. */
    @Test
    void placedOrderContentDoesNotChangeAfterwards() {
        String admin = adminToken();
        Customer customer = registerCustomer("vevohuszonharom");
        TestProduct product = createProduct(admin, "Eredeti név", 1000, 10);

        JsonNode order = placeOrderOk(customer.token(), List.of(item(product.id(), 2)), 2000);

        // Átnevezés + átárazás a leadás UTÁN.
        ResponseEntity<JsonNode> updated = put("/api/admin/products/" + product.id(),
                Map.of("name", "Teljesen más név", "description", "Módosítva.", "price", 999999,
                        "imageUrl", "https://example.com/kep.png", "stock", 10,
                        "category", "Teszt"),
                admin);
        assertThat(updated.getStatusCode().value()).isEqualTo(200);

        JsonNode stored = ownOrders(customer.token()).get(0);
        assertThat(stored.get("id").asText()).isEqualTo(order.get("id").asText());
        assertThat(stored.get("total").asInt()).isEqualTo(2000);
        assertThat(stored.get("items").get(0).get("name").asText()).isEqualTo("Eredeti név");
        assertThat(stored.get("items").get(0).get("unitPrice").asInt()).isEqualTo(1000);
    }
}
