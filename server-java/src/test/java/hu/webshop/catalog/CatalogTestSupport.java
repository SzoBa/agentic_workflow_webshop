package hu.webshop.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.support.IntegrationTest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;

/**
 * A katalógus-tesztek közös előfeltételei — KIZÁRÓLAG publikus API-hívásokból.
 *
 * <p>A konformancia-katalógus alapszabálya, hogy minden előfeltétel a valódi felületen
 * keresztül épül fel (nincs teszt-hátsóajtó, nincs közvetlen adatbázis-írás): így a teszt
 * ugyanazt látja, mint a kliens. A {@code B-1}…{@code B-4} lépések nevei a
 * {@code spec/backend/konformancia.md} bootstrap-táblázatából származnak.
 */
abstract class CatalogTestSupport extends IntegrationTest {

    /** Egy minden szabálynak megfelelő termék; a tesztek egy-egy mezőt írnak felül rajta. */
    static Map<String, Object> validProduct() {
        Map<String, Object> product = new LinkedHashMap<>();
        product.put("name", "Teszt termék");
        product.put("description", "Rövid, szabályos leírás.");
        product.put("price", 1990);
        product.put("stock", 5);
        product.put("category", "Teszt");
        product.put("imageUrl", "https://example.com/kep.png");
        return product;
    }

    /** A szabályos termék a megadott mezők felülírásával. A {@code null} érték TÖRLI a mezőt. */
    static Map<String, Object> productWith(Object... keyValuePairs) {
        Map<String, Object> product = validProduct();
        for (int i = 0; i < keyValuePairs.length; i += 2) {
            String key = (String) keyValuePairs[i];
            Object value = keyValuePairs[i + 1];
            if (value == null) {
                product.remove(key);
            } else {
                product.put(key, value);
            }
        }
        return product;
    }

    /** B-3: termék felvétele admin tokennel. Visszaadja a létrejött termék azonosítóját. */
    protected String createProduct(String adminToken, Map<String, Object> product) {
        ResponseEntity<JsonNode> response = post("/api/admin/products", product, adminToken);
        assertThat(response.getStatusCode().value())
                .as("a teszt előfeltételének létre kell jönnie: %s", response.getBody())
                .isEqualTo(201);
        return response.getBody().get("id").asText();
    }

    /** Termék aktivitásának állítása (a K-01…K-04, K-12 esetek előfeltétele). */
    protected void setActive(String adminToken, String productId, boolean active) {
        ResponseEntity<JsonNode> response = patch("/api/admin/products/" + productId + "/active",
                Map.of("active", active), adminToken);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
    }

    /** B-2: regisztráció egyedi névvel → customer token. */
    protected String customerToken() {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        ResponseEntity<JsonNode> response = post("/api/auth/register", Map.of(
                "username", "vasarlo" + suffix,
                "email", "vasarlo" + suffix + "@example.com",
                "address", "Teszt utca 1.",
                "password", "jelszo123"));
        assertThat(response.getStatusCode().value())
                .as("a regisztrációnak sikerülnie kell: %s", response.getBody())
                .isEqualTo(201);
        return response.getBody().get("token").asText();
    }

    /** Rendelés egyetlen termékre. Az {@code expectedTotal} a szerver ára szerint számolt összeg. */
    protected ResponseEntity<JsonNode> placeOrder(String customerToken, String productId,
            int quantity, int expectedTotal) {
        List<Map<String, Object>> items = new ArrayList<>();
        items.add(Map.of("productId", productId, "quantity", quantity));
        return post("/api/orders", Map.of(
                "items", items,
                "customer", Map.of("name", "Teszt Elek", "email", "teszt@example.com",
                        "address", "Teszt utca 1."),
                "expectedTotal", expectedTotal), customerToken);
    }

    /** A válasz {@code items} tömbjének termékazonosítói, a válasz sorrendjében. */
    protected static List<String> ids(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.get("items").forEach(item -> ids.add(item.get("id").asText()));
        return ids;
    }

    /** A válasz {@code categories} mezője listaként. */
    protected static List<String> categories(JsonNode page) {
        List<String> categories = new ArrayList<>();
        page.get("categories").forEach(category -> categories.add(category.asText()));
        return categories;
    }
}
