package hu.webshop.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.support.IntegrationTest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;

/**
 * A rendelési tesztek közös előfeltétel-építői.
 *
 * <p>Minden előfeltétel KIZÁRÓLAG publikus API-hívásokból épül (konformancia B-1…B-4):
 * az implementáció ugyanazt a felületet mutatja a tesztnek, mint a valódi kliensnek.
 * Adatbázis-hozzáférés csak állításhoz használható, előfeltételhez nem.
 */
abstract class OrderTestSupport extends IntegrationTest {

    /** A vevői adatok a rendelés törzsében — a fióktól FÜGGETLEN másolat. */
    protected static final Map<String, Object> CUSTOMER = Map.of(
            "name", "Teszt Vevő",
            "email", "vevo@example.com",
            "address", "Teszt utca 1.");

    /** Egy regisztrált vevő: a tokenje és a felhasználóazonosítója. */
    protected record Customer(String token, String userId) {
    }

    /** Egy teszttermék azonosítója és azon adatai, amelyek a teljes cseréhez kellenek. */
    protected record TestProduct(String id, String name, int price) {
    }

    /** B-2: regisztráció egyedi névvel → customer token. */
    protected Customer registerCustomer(String username) {
        ResponseEntity<JsonNode> response = post("/api/auth/register", Map.of(
                "username", username,
                "email", username + "@example.com",
                "address", "Teszt utca 1.",
                "password", "titkosjelszo"));
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        JsonNode body = response.getBody();
        return new Customer(body.get("token").asText(), body.get("user").get("id").asText());
    }

    /** B-3: ismert készletű, aktív termék felvétele. */
    protected TestProduct createProduct(String adminToken, String name, int price, int stock) {
        ResponseEntity<JsonNode> response =
                post("/api/admin/products", productBody(name, price, stock, true), adminToken);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        return new TestProduct(response.getBody().get("id").asText(), name, price);
    }

    /** A termék készletének átállítása (teljes csere — a végpont minden mezőt újravalidál). */
    protected void setStock(String adminToken, TestProduct product, int stock) {
        ResponseEntity<JsonNode> response = put("/api/admin/products/" + product.id(),
                productBody(product.name(), product.price(), stock, true), adminToken);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
    }

    /** A termék inaktiválása — a vásárlói felület számára ettől „nem létezik". */
    protected void deactivate(String adminToken, TestProduct product) {
        ResponseEntity<JsonNode> response = patch(
                "/api/admin/products/" + product.id() + "/active", Map.of("active", false),
                adminToken);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
    }

    private static Map<String, Object> productBody(String name, int price, int stock,
            boolean active) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("description", "Teszttermék a rendelési esetekhez.");
        body.put("price", price);
        body.put("imageUrl", "https://example.com/kep.png");
        body.put("stock", stock);
        body.put("category", "Teszt");
        body.put("active", active);
        return body;
    }

    // --- Rendelés ---

    /** Egy tétel a kérésben. */
    protected static Map<String, Object> item(String productId, Object quantity) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("productId", productId);
        item.put("quantity", quantity);
        return item;
    }

    /**
     * Rendelési kéréstörzs. Az {@code expectedTotal} {@code null} értéke a mező HIÁNYÁT
     * jelenti — a „kötelező mező" esethez (K-21) pont erre van szükség.
     */
    protected static Map<String, Object> orderBody(List<Map<String, Object>> items,
            Object expectedTotal) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("customer", CUSTOMER);
        if (expectedTotal != null) {
            body.put("expectedTotal", expectedTotal);
        }
        return body;
    }

    protected ResponseEntity<JsonNode> placeOrder(String token, List<Map<String, Object>> items,
            Object expectedTotal) {
        return post("/api/orders", orderBody(items, expectedTotal), token);
    }

    /** Sikeres rendelés leadása; a válasz a teljes rendelés. */
    protected JsonNode placeOrderOk(String token, List<Map<String, Object>> items,
            int expectedTotal) {
        ResponseEntity<JsonNode> response = placeOrder(token, items, expectedTotal);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        return response.getBody();
    }

    /** A státusz beállítása adminként. */
    protected ResponseEntity<JsonNode> setStatus(String adminToken, String orderId, String status) {
        return patch("/api/admin/orders/" + orderId + "/status", Map.of("status", status),
                adminToken);
    }

    /** A felhasználó saját rendeléslistája. */
    protected JsonNode ownOrders(String token) {
        ResponseEntity<JsonNode> response = get("/api/orders", token);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody();
    }

    /** Egy termék vásárlói nézete (a számolt {@code available} mezővel). */
    protected JsonNode customerProduct(String productId) {
        ResponseEntity<JsonNode> response = get("/api/products/" + productId);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody();
    }

    /** A hibaválasz szövege. */
    protected static String error(ResponseEntity<JsonNode> response) {
        return response.getBody().get("error").asText();
    }
}
