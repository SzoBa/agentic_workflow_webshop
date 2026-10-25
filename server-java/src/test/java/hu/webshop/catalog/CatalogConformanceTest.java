package hu.webshop.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

/**
 * A katalógus konformancia-esetei: K-01…K-12, K-14, K-15, K-77.
 *
 * <p>Minden eset kizárólag HTTP-n keresztül dolgozik, tiszta kiinduló állapotból (8 seed
 * termék + seed admin). A K-13 (értékelési átlag kerekítése) szándékosan nincs itt: annak
 * előfeltétele értékelés beküldése és moderálása, ami az értékelés-modul felülete.
 */
class CatalogConformanceTest extends CatalogTestSupport {

    // --- Láthatóság ---

    @Test
    @DisplayName("K-01: az inaktív termék nincs a vásárlói listában")
    void inactiveProductIsNotListed() {
        String admin = adminToken();
        String id = createProduct(admin, validProduct());
        setActive(admin, id, false);

        ResponseEntity<JsonNode> response = get("/api/products?pageSize=100");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(ids(response.getBody())).doesNotContain(id);
    }

    @Test
    @DisplayName("K-02 + K-04: az inaktív és a nem létező termék UGYANAZT a 404-et kapja")
    void inactiveAndMissingProductAreIndistinguishable() {
        String admin = adminToken();
        String id = createProduct(admin, validProduct());
        setActive(admin, id, false);

        ResponseEntity<JsonNode> inactive = get("/api/products/" + id);
        ResponseEntity<JsonNode> missing = get("/api/products/nemletezik");

        assertThat(inactive.getStatusCode().value()).isEqualTo(404);
        assertThat(missing.getStatusCode().value()).isEqualTo(404);
        assertThat(inactive.getBody().get("error").asText())
                .isEqualTo(Messages.PRODUCT_NOT_FOUND);
        // A válasz nem árulhatja el, hogy a termék létezik-e egyáltalán.
        assertThat(inactive.getBody()).isEqualTo(missing.getBody());
    }

    @Test
    @DisplayName("K-03: az inaktív termék értékeléslistája is 404")
    void inactiveProductReviewsAreNotFound() {
        // A végpont az értékelés-modulé, de a LÁTHATÓSÁGI szabály a katalógusé: a vásárlói
        // oldal minden termékolvasása ugyanazon az „aktív termék" fogalmon megy keresztül.
        String admin = adminToken();
        String id = createProduct(admin, validProduct());
        setActive(admin, id, false);

        ResponseEntity<JsonNode> response = get("/api/products/" + id + "/reviews");

        assertThat(response.getStatusCode().value()).isEqualTo(404);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.PRODUCT_NOT_FOUND);
    }

    // --- Lapozás ---

    @Test
    @DisplayName("K-05: 13 aktív termék mellett az alap lapméret 12, totalPages 2")
    void defaultPageSizeIsTwelve() {
        String admin = adminToken();
        // A tiszta állapotban 8 seed termék van; öttel 13 lesz belőlük.
        for (int i = 0; i < 5; i++) {
            createProduct(admin, productWith("name", "Extra termék " + i));
        }

        JsonNode page = get("/api/products").getBody();

        assertThat(page.get("total").asInt()).isEqualTo(13);
        assertThat(page.get("items")).hasSize(12);
        assertThat(page.get("pageSize").asInt()).isEqualTo(12);
        assertThat(page.get("page").asInt()).isEqualTo(1);
        assertThat(page.get("totalPages").asInt()).isEqualTo(2);
    }

    @Test
    @DisplayName("K-06: a túl nagy pageSize 100-ra vágódik")
    void pageSizeIsClampedToHundred() {
        JsonNode page = get("/api/products?pageSize=500").getBody();

        assertThat(page.get("pageSize").asInt()).isEqualTo(100);
    }

    @Test
    @DisplayName("K-07: a túl nagy page az utolsó oldalra vágódik, és az nem üres")
    void pageIsClampedToLastPage() {
        String admin = adminToken();
        for (int i = 0; i < 5; i++) {
            createProduct(admin, productWith("name", "Extra termék " + i));
        }

        JsonNode page = get("/api/products?page=99").getBody();

        assertThat(page.get("page").asInt()).isEqualTo(page.get("totalPages").asInt());
        assertThat(page.get("items")).isNotEmpty();
    }

    @Test
    @DisplayName("A lapozás értelmezése a referenciáéval egyezik (nem szám, nulla, üres érték)")
    void paginationParsingMatchesReference() {
        // Nem szám page → az első oldal (nem hiba): egy elgépelt query nem törheti el a listát.
        assertThat(get("/api/products?page=abc").getBody().get("page").asInt()).isEqualTo(1);
        // A 0 és a negatív lapméret 1-re emelkedik.
        assertThat(get("/api/products?pageSize=0").getBody().get("pageSize").asInt()).isEqualTo(1);
        assertThat(get("/api/products?pageSize=-5").getBody().get("pageSize").asInt()).isEqualTo(1);
        // Az ÜRES érték a referenciában 0-nak számít (JS Number("") === 0), tehát szintén 1-re
        // vágódik — nem az alapértelmezett 12-re.
        assertThat(get("/api/products?pageSize=").getBody().get("pageSize").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("Üres találathalmaznál is 1 a totalPages")
    void totalPagesIsAtLeastOne() {
        JsonNode page = get("/api/products?search=nincs-ilyen-termek-sehol").getBody();

        assertThat(page.get("items")).isEmpty();
        assertThat(page.get("total").asInt()).isZero();
        assertThat(page.get("totalPages").asInt()).isEqualTo(1);
        assertThat(page.get("page").asInt()).isEqualTo(1);
    }

    // --- Szűrés ---

    @Test
    @DisplayName("K-08: a category trimmelve hasonlít (?category=%20Otthon%20)")
    void categoryFilterTrimsBothSides() {
        String admin = adminToken();
        createProduct(admin, productWith("name", "Otthoni termék", "category", "Otthon"));
        createProduct(admin, productWith("name", "Irodai termék", "category", "Iroda"));

        // Szóköz, nem %20: a RestTemplate a sablont maga kódolja, tehát a kézzel írt
        // %20-ból %2520 lenne — a szerver „%20Otthon%20"-t látna, és némán 0 találatot adna.
        JsonNode page = get("/api/products?category= Otthon &pageSize=100").getBody();

        assertThat(page.get("items")).isNotEmpty();
        page.get("items").forEach(item ->
                assertThat(item.get("category").asText()).isEqualTo("Otthon"));
    }

    @Test
    @DisplayName("K-09: a minPrice/maxPrice határok inkluzívak")
    void priceBoundsAreInclusive() {
        String admin = adminToken();
        String olcso = createProduct(admin,
                productWith("name", "Olcsó", "price", 1000, "category", "Árteszt"));
        String kozepes = createProduct(admin,
                productWith("name", "Közepes", "price", 2000, "category", "Árteszt"));
        String draga = createProduct(admin,
                productWith("name", "Drága", "price", 3000, "category", "Árteszt"));

        JsonNode page = get("/api/products?category=Árteszt&minPrice=2000&maxPrice=3000"
                + "&pageSize=100").getBody();

        assertThat(ids(page)).containsExactly(kozepes, draga).doesNotContain(olcso);
    }

    @Test
    @DisplayName("Nem szám ártartomány esetén az adott szempont kimarad")
    void nonNumericPriceBoundIsIgnored() {
        String admin = adminToken();
        createProduct(admin, productWith("name", "Olcsó", "price", 1000, "category", "Árteszt2"));
        createProduct(admin, productWith("name", "Drága", "price", 3000, "category", "Árteszt2"));

        JsonNode page = get("/api/products?category=Árteszt2&minPrice=abc&pageSize=100").getBody();

        assertThat(page.get("total").asInt()).isEqualTo(2);
    }

    @Test
    @DisplayName("K-10: a keresés kis/nagybetűre érzéketlen, névben ÉS leírásban keres")
    void searchMatchesNameAndDescription() {
        String admin = adminToken();
        String nevben = createProduct(admin,
                productWith("name", "Kulacs", "description", "Egyszerű palack."));
        String leirasban = createProduct(admin,
                productWith("name", "Sportcsomag", "description", "Kulacsos szett futóknak."));

        JsonNode page = get("/api/products?search=KULACS&pageSize=100").getBody();

        assertThat(ids(page)).contains(nevben, leirasban);
        page.get("items").forEach(item -> assertThat(
                item.get("name").asText().toLowerCase() + " "
                        + item.get("description").asText().toLowerCase())
                .contains("kulacs"));
    }

    @Test
    @DisplayName("K-11: az inStock szűrő az ELÉRHETŐ mennyiségre vonatkozik, nem a készletre")
    void inStockFilterUsesAvailableQuantity() {
        String admin = adminToken();
        String id = createProduct(admin, productWith("price", 1000, "stock", 1));
        String customer = customerToken();

        ResponseEntity<JsonNode> order = placeOrder(customer, id, 1, 1000);
        assertThat(order.getStatusCode().value())
                .as("a foglaló rendelésnek létre kell jönnie: %s", order.getBody())
                .isEqualTo(201);

        // A teljesen lefoglalt termék a vásárló számára elfogyott...
        JsonNode filtered = get("/api/products?inStock=true&pageSize=100").getBody();
        assertThat(ids(filtered)).doesNotContain(id);

        // ...de attól még listázódik és megnyitható: az aktivitás és a készlet két külön fogalom.
        JsonNode all = get("/api/products?pageSize=100").getBody();
        assertThat(ids(all)).contains(id);
    }

    @Test
    @DisplayName("K-27: a rendelés nem a stockot csökkenti, hanem az available-t")
    void orderReducesAvailableNotStock() {
        String admin = adminToken();
        String id = createProduct(admin, productWith("price", 1000, "stock", 5));
        String customer = customerToken();

        assertThat(placeOrder(customer, id, 2, 2000).getStatusCode().value()).isEqualTo(201);

        JsonNode product = get("/api/products/" + id).getBody();

        assertThat(product.get("stock").asInt()).isEqualTo(5);
        assertThat(product.get("available").asInt()).isEqualTo(3);
    }

    @Test
    @DisplayName("K-12: csak inaktív terméket tartalmazó kategória eltűnik a szűrőből")
    void categoriesOmitFullyInactiveCategories() {
        String admin = adminToken();
        String id = createProduct(admin, productWith("category", "Kifutó"));

        assertThat(categories(get("/api/products").getBody())).contains("Kifutó");

        setActive(admin, id, false);

        assertThat(categories(get("/api/products").getBody())).doesNotContain("Kifutó");
    }

    @Test
    @DisplayName("A categories a SZŰRETLEN aktív halmazból származik")
    void categoriesComeFromUnfilteredSet() {
        JsonNode page = get("/api/products?category=Ruházat").getBody();

        // A szűrő oldalsáv a szűrés után is teljes marad.
        assertThat(categories(page)).contains("Ruházat", "Elektronika", "Otthon", "Irodaszer");
    }

    // --- Értékelési aggregátumok ---

    @Test
    @DisplayName("K-14: értékelés nélkül ratingAvg = 0 és ratingCount = 0")
    void productWithoutReviewsHasZeroAggregates() {
        String admin = adminToken();
        String id = createProduct(admin, validProduct());

        JsonNode product = get("/api/products/" + id).getBody();

        assertThat(product.get("ratingAvg").asInt()).isZero();
        assertThat(product.get("ratingCount").asInt()).isZero();
        // Egész értékű átlag tizedes nélkül szerepel a JSON-ban (0, nem 0.0) — a referencia
        // JavaScript számábrázolásával egyezően.
        assertThat(product.get("ratingAvg").isIntegralNumber()).isTrue();
    }

    @Test
    @DisplayName("A vásárlói lista elemein rajta van mind a három számolt mező")
    void customerListItemsCarryComputedFields() {
        JsonNode page = get("/api/products").getBody();
        JsonNode first = page.get("items").get(0);

        assertThat(first.has("ratingAvg")).isTrue();
        assertThat(first.has("ratingCount")).isTrue();
        assertThat(first.has("available")).isTrue();
        // A termék tárolt mezői is mind jelen vannak.
        assertThat(List.of("id", "name", "description", "price", "imageUrl", "stock", "category",
                "active")).allSatisfy(field -> assertThat(first.has(field)).isTrue());
    }

    // --- Admin lista ---

    @Test
    @DisplayName("K-15: az admin lista elemein NINCS ratingAvg / ratingCount")
    void adminListHasNoRatingAggregates() {
        String admin = adminToken();
        createProduct(admin, validProduct());

        JsonNode page = get("/api/admin/products", admin).getBody();
        JsonNode first = page.get("items").get(0);

        assertThat(first.has("ratingAvg")).isFalse();
        assertThat(first.has("ratingCount")).isFalse();
        // Helyettük a foglalási adatok szerepelnek.
        assertThat(first.has("reserved")).isTrue();
        assertThat(first.has("available")).isTrue();
    }

    @Test
    @DisplayName("Az admin lista a teljes katalógust adja, 25-ös alap lapmérettel")
    void adminListShowsWholeCatalog() {
        String admin = adminToken();
        String id = createProduct(admin, validProduct());
        setActive(admin, id, false);

        JsonNode page = get("/api/admin/products", admin).getBody();

        assertThat(page.get("pageSize").asInt()).isEqualTo(25);
        assertThat(ids(page)).contains(id);
        assertThat(page.get("total").asInt()).isEqualTo(9);
    }

    @Test
    @DisplayName("Az admin lista status paramétere szűr; ismeretlen érték esetén mindent mutat")
    void adminStatusFilter() {
        String admin = adminToken();
        String inaktiv = createProduct(admin, validProduct());
        setActive(admin, inaktiv, false);

        assertThat(ids(get("/api/admin/products?status=inactive&pageSize=100", admin).getBody()))
                .containsExactly(inaktiv);
        assertThat(ids(get("/api/admin/products?status=active&pageSize=100", admin).getBody()))
                .doesNotContain(inaktiv)
                .hasSize(8);
        // Elgépelt érték nem rejtheti el némán a termékek felét.
        assertThat(ids(get("/api/admin/products?status=elgepelt&pageSize=100", admin).getBody()))
                .hasSize(9);
    }

    @Test
    @DisplayName("Az admin categories az INAKTÍV termékek kategóriáit is tartalmazza")
    void adminCategoriesIncludeInactive() {
        String admin = adminToken();
        String id = createProduct(admin, productWith("category", "Csak inaktív"));
        setActive(admin, id, false);

        JsonNode page = get("/api/admin/products?status=active&pageSize=100", admin).getBody();

        assertThat(categories(page)).contains("Csak inaktív");
    }

    @Test
    @DisplayName("Az admin lista reserved/available mezője a foglalásokat tükrözi")
    void adminListShowsReservations() {
        String admin = adminToken();
        String id = createProduct(admin, productWith("price", 1000, "stock", 5));
        String customer = customerToken();
        assertThat(placeOrder(customer, id, 2, 2000).getStatusCode().value()).isEqualTo(201);

        JsonNode page = get("/api/admin/products?pageSize=100", admin).getBody();
        JsonNode item = itemById(page, id);

        assertThat(item.get("stock").asInt()).isEqualTo(5);
        assertThat(item.get("reserved").asInt()).isEqualTo(2);
        assertThat(item.get("available").asInt()).isEqualTo(3);
    }

    // --- Induló állapot ---

    @Test
    @DisplayName("K-77: üres adattárolón indulva 8 aktív termék listázódik")
    void seedCatalogHasEightActiveProducts() {
        ResponseEntity<JsonNode> response = get("/api/products");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        JsonNode page = response.getBody();
        assertThat(page.get("total").asInt()).isEqualTo(8);
        assertThat(page.get("items")).hasSize(8);
        page.get("items").forEach(item -> assertThat(item.get("active").asBoolean()).isTrue());
    }

    @Test
    @DisplayName("A lista a beszúrási sorrendet őrzi (p1…p8)")
    void seedCatalogKeepsInsertionOrder() {
        JsonNode page = get("/api/products").getBody();

        assertThat(ids(page))
                .containsExactly("p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8");
    }

    private static JsonNode itemById(JsonNode page, String id) {
        for (JsonNode item : page.get("items")) {
            if (id.equals(item.get("id").asText())) {
                return item;
            }
        }
        throw new AssertionError("A termék nincs a listában: " + id);
    }
}
