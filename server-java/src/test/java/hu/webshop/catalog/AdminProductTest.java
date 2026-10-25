package hu.webshop.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.ResponseEntity;

/**
 * Az admin termékvégpontok: validáció, CRUD és a végpontok közötti munkamegosztás.
 *
 * <p>A validációs esetek a {@code spec/backend/hibakatalogus.md} „Termékvalidáció"
 * szakaszát fedik, mezőnként legalább egy határesettel, és SZÓ SZERINT ellenőrzik az
 * üzenetet: a szó szerinti egyezés a szerződés része, nem stílus kérdése.
 */
class AdminProductTest extends CatalogTestSupport {

    // --- Validáció ---

    static Stream<Arguments> invalidProducts() {
        return Stream.of(
                Arguments.of("hiányzó név", productWith("name", null),
                        Messages.PRODUCT_NAME_REQUIRED),
                Arguments.of("csak whitespace név", productWith("name", "   "),
                        Messages.PRODUCT_NAME_REQUIRED),
                Arguments.of("nem szöveg név", productWith("name", 42),
                        Messages.PRODUCT_NAME_REQUIRED),
                Arguments.of("51 karakteres név", productWith("name", "x".repeat(51)),
                        Messages.PRODUCT_NAME_TOO_LONG),
                Arguments.of("hiányzó leírás", productWith("description", null),
                        Messages.PRODUCT_DESCRIPTION_REQUIRED),
                Arguments.of("101 karakteres leírás", productWith("description", "x".repeat(101)),
                        Messages.PRODUCT_DESCRIPTION_TOO_LONG),
                Arguments.of("hiányzó ár", productWith("price", null),
                        Messages.PRODUCT_PRICE_INVALID),
                Arguments.of("tört ár", productWith("price", 19.9),
                        Messages.PRODUCT_PRICE_INVALID),
                Arguments.of("nulla ár", productWith("price", 0),
                        Messages.PRODUCT_PRICE_INVALID),
                Arguments.of("negatív ár", productWith("price", -5),
                        Messages.PRODUCT_PRICE_INVALID),
                Arguments.of("szövegként küldött ár", productWith("price", "1990"),
                        Messages.PRODUCT_PRICE_INVALID),
                Arguments.of("hiányzó készlet", productWith("stock", null),
                        Messages.PRODUCT_STOCK_INVALID),
                Arguments.of("negatív készlet", productWith("stock", -1),
                        Messages.PRODUCT_STOCK_INVALID),
                Arguments.of("tört készlet", productWith("stock", 2.5),
                        Messages.PRODUCT_STOCK_INVALID),
                Arguments.of("üres kategória", productWith("category", "  "),
                        Messages.PRODUCT_CATEGORY_REQUIRED),
                Arguments.of("hiányzó kép", productWith("imageUrl", ""),
                        Messages.PRODUCT_IMAGE_REQUIRED),
                Arguments.of("nem URL kép", productWith("imageUrl", "csak-egy-szoveg"),
                        Messages.PRODUCT_IMAGE_INVALID),
                Arguments.of("nem http(s) protokoll", productWith("imageUrl", "ftp://e.com/k.png"),
                        Messages.PRODUCT_IMAGE_INVALID),
                Arguments.of("nem logikai active", productWith("active", "igen"),
                        Messages.PRODUCT_ACTIVE_INVALID));
    }

    @ParameterizedTest(name = "400: {0}")
    @MethodSource("invalidProducts")
    @DisplayName("A termékvalidáció 400-at ad a katalógus szerinti üzenettel")
    void invalidProductIsRejected(String label, Map<String, Object> body, String expectedMessage) {
        ResponseEntity<JsonNode> response = post("/api/admin/products", body, adminToken());

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().get("error").asText()).isEqualTo(expectedMessage);
    }

    @ParameterizedTest(name = "400 cserénél is: {0}")
    @MethodSource("invalidProducts")
    @DisplayName("A csere UGYANAZOKAT a szabályokat érvényesíti, mint a létrehozás")
    void invalidReplacementIsRejected(String label, Map<String, Object> body,
            String expectedMessage) {
        ResponseEntity<JsonNode> response = put("/api/admin/products/p1", body, adminToken());

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().get("error").asText()).isEqualTo(expectedMessage);
    }

    @Test
    @DisplayName("A validáció az ELSŐ hibánál megáll, a katalógus sorrendjében")
    void validationStopsAtFirstError() {
        Map<String, Object> body = productWith("name", "", "price", -1, "imageUrl", "nem-url");

        ResponseEntity<JsonNode> response = post("/api/admin/products", body, adminToken());

        assertThat(response.getBody().get("error").asText())
                .isEqualTo(Messages.PRODUCT_NAME_REQUIRED);
    }

    @Test
    @DisplayName("A hibás mentés nem hoz létre terméket")
    void rejectedProductIsNotStored() {
        String admin = adminToken();
        int before = get("/api/admin/products", admin).getBody().get("total").asInt();

        post("/api/admin/products", productWith("name", ""), admin);

        assertThat(get("/api/admin/products", admin).getBody().get("total").asInt())
                .isEqualTo(before);
    }

    @Test
    @DisplayName("Üres kéréstörzsre is a validáció első üzenete jön")
    void emptyBodyIsRejected() {
        ResponseEntity<JsonNode> response = post("/api/admin/products", new HashMap<>(),
                adminToken());

        assertThat(response.getStatusCode().value()).isEqualTo(400);
        assertThat(response.getBody().get("error").asText())
                .isEqualTo(Messages.PRODUCT_NAME_REQUIRED);
    }

    // --- Létrehozás ---

    @Test
    @DisplayName("A létrehozás 201-et ad, a termék alapértelmezés szerint aktív")
    void createdProductIsActiveByDefault() {
        ResponseEntity<JsonNode> response = post("/api/admin/products", validProduct(),
                adminToken());

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        JsonNode created = response.getBody();
        assertThat(created.get("active").asBoolean()).isTrue();
        assertThat(created.get("id").asText()).isNotBlank();
        assertThat(created.get("name").asText()).isEqualTo("Teszt termék");
        // Az írási válasz a MENTETT állapotot adja: számolt mező nincs rajta.
        assertThat(created.has("available")).isFalse();
        assertThat(created.has("ratingAvg")).isFalse();
    }

    @Test
    @DisplayName("A szöveges mezők trimmelve tárolódnak")
    void textFieldsAreTrimmed() {
        Map<String, Object> body = productWith(
                "name", "  Trimmelt név  ",
                "description", "  Trimmelt leírás.  ",
                "category", "  Trimmelt kategória  ",
                "imageUrl", "  https://example.com/kep.png  ");

        JsonNode created = post("/api/admin/products", body, adminToken()).getBody();

        assertThat(created.get("name").asText()).isEqualTo("Trimmelt név");
        assertThat(created.get("description").asText()).isEqualTo("Trimmelt leírás.");
        assertThat(created.get("category").asText()).isEqualTo("Trimmelt kategória");
        assertThat(created.get("imageUrl").asText()).isEqualTo("https://example.com/kep.png");
    }

    @Test
    @DisplayName("Az active: false-szal létrehozott termék nem látszik a vásárlói oldalon")
    void createdInactiveProductIsHidden() {
        String admin = adminToken();
        String id = createProduct(admin, productWith("active", false));

        assertThat(get("/api/products/" + id).getStatusCode().value()).isEqualTo(404);
        assertThat(get("/api/admin/products?pageSize=100", admin).getBody().toString())
                .contains(id);
    }

    // --- Csere ---

    @Test
    @DisplayName("A csere minden mezőt felülír, és a vásárlói végponton is látszik")
    void replaceUpdatesAllFields() {
        String admin = adminToken();

        ResponseEntity<JsonNode> response = put("/api/admin/products/p1",
                productWith("name", "Átnevezett termék", "price", 12345), admin);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("name").asText()).isEqualTo("Átnevezett termék");

        JsonNode customerView = get("/api/products/p1").getBody();
        assertThat(customerView.get("name").asText()).isEqualTo("Átnevezett termék");
        assertThat(customerView.get("price").asInt()).isEqualTo(12345);
    }

    @Test
    @DisplayName("A csere az aktivitást is válthatja, ha a kérés nyilatkozik róla")
    void replaceCanToggleActive() {
        String admin = adminToken();

        JsonNode updated = put("/api/admin/products/p1", productWith("active", false), admin)
                .getBody();

        assertThat(updated.get("active").asBoolean()).isFalse();
    }

    @Test
    @DisplayName("Az active nélküli csere NEM hozza vissza a boltba az elrejtett terméket")
    void replaceWithoutActiveKeepsCurrentState() {
        String admin = adminToken();
        String id = createProduct(admin, validProduct());
        setActive(admin, id, false);

        JsonNode updated = put("/api/admin/products/" + id, validProduct(), admin).getBody();

        assertThat(updated.get("active").asBoolean()).isFalse();
    }

    @Test
    @DisplayName("Nem létező termék cseréje 404 — hibás törzzsel is")
    void replacingMissingProductIsNotFound() {
        String admin = adminToken();

        ResponseEntity<JsonNode> valid = put("/api/admin/products/nincs", validProduct(), admin);
        ResponseEntity<JsonNode> invalid = put("/api/admin/products/nincs",
                productWith("name", ""), admin);

        assertThat(valid.getStatusCode().value()).isEqualTo(404);
        assertThat(valid.getBody().get("error").asText()).isEqualTo(Messages.PRODUCT_NOT_FOUND);
        // A létezés ellenőrzése megelőzi a validációt: nincs mit szerkeszteni.
        assertThat(invalid.getStatusCode().value()).isEqualTo(404);
    }

    // --- Aktivitásváltás ---

    @Test
    @DisplayName("A PATCH .../active kizárólag az aktivitást váltja")
    void patchActiveTogglesOnlyActivity() {
        String admin = adminToken();

        JsonNode updated = patch("/api/admin/products/p1/active", Map.of("active", false), admin)
                .getBody();

        assertThat(updated.get("active").asBoolean()).isFalse();
        assertThat(updated.get("name").asText()).isEqualTo("Klasszikus pamut póló");
    }

    @Test
    @DisplayName("A PATCH .../active 400-at ad, ha az active nem logikai vagy hiányzik")
    void patchActiveRequiresBoolean() {
        String admin = adminToken();

        ResponseEntity<JsonNode> notBoolean = patch("/api/admin/products/p1/active",
                Map.of("active", "igen"), admin);
        ResponseEntity<JsonNode> missing = patch("/api/admin/products/p1/active",
                new HashMap<>(), admin);

        assertThat(notBoolean.getStatusCode().value()).isEqualTo(400);
        assertThat(notBoolean.getBody().get("error").asText())
                .isEqualTo(Messages.PRODUCT_ACTIVE_INVALID);
        assertThat(missing.getStatusCode().value()).isEqualTo(400);
        assertThat(missing.getBody().get("error").asText())
                .isEqualTo(Messages.PRODUCT_ACTIVE_INVALID);
    }

    @Test
    @DisplayName("A PATCH .../active 404-et ad nem létező termékre")
    void patchActiveOnMissingProduct() {
        ResponseEntity<JsonNode> response = patch("/api/admin/products/nincs/active",
                Map.of("active", false), adminToken());

        assertThat(response.getStatusCode().value()).isEqualTo(404);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.PRODUCT_NOT_FOUND);
    }

    // --- Törlés ---

    @Test
    @DisplayName("A törlés { ok: true }-t ad, és a termék eltűnik mindkét listáról")
    void deleteRemovesProduct() {
        String admin = adminToken();
        String id = createProduct(admin, validProduct());

        ResponseEntity<JsonNode> response = delete("/api/admin/products/" + id, admin);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody().get("ok").asBoolean()).isTrue();
        assertThat(get("/api/products/" + id).getStatusCode().value()).isEqualTo(404);
        assertThat(ids(get("/api/admin/products?pageSize=100", admin).getBody()))
                .doesNotContain(id);
    }

    @Test
    @DisplayName("Nem létező termék törlése 404")
    void deletingMissingProductIsNotFound() {
        ResponseEntity<JsonNode> response = delete("/api/admin/products/nincs", adminToken());

        assertThat(response.getStatusCode().value()).isEqualTo(404);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.PRODUCT_NOT_FOUND);
    }

    @Test
    @DisplayName("A törlés nem írja át a korábbi rendelések tartalmát (snapshot)")
    void deleteKeepsEarlierOrdersIntact() {
        String admin = adminToken();
        String id = createProduct(admin, productWith("name", "Kifutó termék", "price", 1000));
        String customer = customerToken();
        assertThat(placeOrder(customer, id, 2, 2000).getStatusCode().value()).isEqualTo(201);

        assertThat(delete("/api/admin/products/" + id, admin).getStatusCode().value())
                .isEqualTo(200);

        JsonNode orders = get("/api/orders", customer).getBody();
        assertThat(orders).hasSize(1);
        JsonNode item = orders.get(0).get("items").get(0);
        assertThat(item.get("productId").asText()).isEqualTo(id);
        assertThat(item.get("name").asText()).isEqualTo("Kifutó termék");
        assertThat(item.get("unitPrice").asInt()).isEqualTo(1000);
    }

    // --- Hozzáférés-vezérlés (K-70, K-71 a termékvégpontokra) ---

    @Test
    @DisplayName("Minden admin termékvégpont 401 token nélkül és 403 customer tokennel")
    void adminEndpointsAreGuarded() {
        String customer = customerToken();

        assertThat(get("/api/admin/products").getStatusCode().value()).isEqualTo(401);
        assertThat(post("/api/admin/products", validProduct()).getStatusCode().value())
                .isEqualTo(401);

        assertThat(get("/api/admin/products", customer).getStatusCode().value()).isEqualTo(403);
        assertThat(post("/api/admin/products", validProduct(), customer).getStatusCode().value())
                .isEqualTo(403);
        assertThat(put("/api/admin/products/p1", validProduct(), customer).getStatusCode().value())
                .isEqualTo(403);
        assertThat(patch("/api/admin/products/p1/active", Map.of("active", false), customer)
                .getStatusCode().value()).isEqualTo(403);
        assertThat(delete("/api/admin/products/p1", customer).getStatusCode().value())
                .isEqualTo(403);
    }
}
