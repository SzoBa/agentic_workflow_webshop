package hu.webshop.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

/**
 * Az admin rendeléslista szerződése: a TELJES halmaz, legújabb elöl, szűréssel és
 * lapozással (AR-01…AR-11).
 *
 * <p>Ez az egyetlen mód arra, hogy az admin megtalálja a teljesítendő rendelést, ezért a
 * lista tartalma és sorrendje itt üzemeltetési kérdés is.
 *
 * <p>Minden előfeltétel KIZÁRÓLAG publikus API-hívásokból épül (admin belépés,
 * regisztráció, termékfelvétel, rendelésleadás, fióktörlés) — közvetlen adatbázisírás
 * nélkül.
 */
class AdminOrderListTest extends OrderTestSupport {

    // --- Segédek ---

    /** Egy vevői adatblokk a rendelés törzséhez (a fióktól FÜGGETLEN másolat). */
    private static Map<String, Object> customer(String name, String email) {
        Map<String, Object> customer = new LinkedHashMap<>();
        customer.put("name", name);
        customer.put("email", email);
        customer.put("address", "Teszt utca 1.");
        return customer;
    }

    /** Rendelésleadás SAJÁT vevői adatblokkal — a {@code search} eseteknek kell. */
    private JsonNode placeOrderAs(String token, TestProduct product, int quantity,
            Map<String, Object> customer) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", List.of(item(product.id(), quantity)));
        body.put("customer", customer);
        body.put("expectedTotal", product.price() * quantity);
        ResponseEntity<JsonNode> response = post("/api/orders", body, token);
        assertThat(response.getStatusCode().value()).isEqualTo(201);
        return response.getBody();
    }

    /** Az admin rendeléslista lekérése (a query rész a {@code ?}-lel együtt adandó). */
    private JsonNode adminOrders(String adminToken, String query) {
        ResponseEntity<JsonNode> response = get("/api/admin/orders" + query, adminToken);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody();
    }

    /** A lista elemeinek azonosítói, a válasz sorrendjében. */
    private static List<String> idsOf(JsonNode page) {
        List<String> ids = new ArrayList<>();
        for (JsonNode item : page.get("items")) {
            ids.add(item.get("id").asText());
        }
        return ids;
    }

    // --- AR-01: a válasz burka ---

    /** A lapozás metaadatai jelen vannak — a `categories` viszont rendelésnél értelmetlen. */
    @Test
    void returnsPagedEnvelopeWithoutCategories() {
        String admin = adminToken();
        Customer vevo = registerCustomer("vevoketszazegy");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        placeOrderAs(vevo.token(), product, 1, customer("Teszt Vevő", "vevo@example.com"));

        JsonNode page = adminOrders(admin, "");

        assertThat(page.has("items")).isTrue();
        assertThat(page.has("total")).isTrue();
        assertThat(page.has("page")).isTrue();
        assertThat(page.has("pageSize")).isTrue();
        assertThat(page.has("totalPages")).isTrue();
        // A ProductPage `categories` mezője beszivárogva szerződéshiba lenne.
        assertThat(page.has("categories")).isFalse();
        assertThat(page.get("total").asInt()).isEqualTo(1);
        assertThat(page.get("items")).hasSize(1);
    }

    // --- AR-02: a listaelem alakja ---

    /**
     * Egy elem a rendelés MINDEN mezőjét hordozza; a {@code reservedUntil} viszont
     * kizárólag {@code pending} státusznál van jelen — a kiszállítottnál nincs mit
     * visszaszámolni.
     */
    @Test
    void itemCarriesEveryOrderFieldAndReservedUntilOnlyWhenPending() {
        String admin = adminToken();
        Customer vevo = registerCustomer("vevoketszazketto");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        JsonNode elsoRendeles =
                placeOrderAs(vevo.token(), product, 1, customer("Teszt Vevő", "vevo@example.com"));
        placeOrderAs(vevo.token(), product, 2, customer("Teszt Vevő", "vevo@example.com"));
        assertThat(setStatus(admin, elsoRendeles.get("id").asText(), "delivered")
                .getStatusCode().value()).isEqualTo(200);

        JsonNode page = adminOrders(admin, "");

        JsonNode pending = page.get("items").get(0);
        JsonNode delivered = page.get("items").get(1);
        assertThat(pending.get("status").asText()).isEqualTo("pending");
        assertThat(delivered.get("status").asText()).isEqualTo("delivered");

        for (String field : List.of("id", "items", "customer", "total", "createdAt", "userId",
                "status")) {
            assertThat(pending.has(field)).as("mező: " + field).isTrue();
            assertThat(delivered.has(field)).as("mező: " + field).isTrue();
        }
        assertThat(pending.get("customer").get("name").asText()).isEqualTo("Teszt Vevő");
        assertThat(pending.get("customer").get("email").asText()).isEqualTo("vevo@example.com");
        assertThat(pending.get("customer").get("address").asText()).isEqualTo("Teszt utca 1.");
        assertThat(pending.get("items").get(0).get("productId").asText())
                .isEqualTo(product.id());
        assertThat(pending.get("items").get(0).get("quantity").asInt()).isEqualTo(2);
        assertThat(pending.get("items").get(0).get("name").asText()).isEqualTo("Teszttermék");
        assertThat(pending.get("items").get(0).get("unitPrice").asInt()).isEqualTo(1000);
        assertThat(pending.get("total").asInt()).isEqualTo(2000);
        assertThat(pending.get("userId").asText()).isEqualTo(vevo.userId());

        assertThat(pending.has("reservedUntil")).isTrue();
        assertThat(delivered.has("reservedUntil")).isFalse();
    }

    // --- AR-03: a felhasználónév feloldása ---

    /** A `username` a `userId`-hoz tartozó fiók neve — kényelmi mező a snapshot mellé. */
    @Test
    void itemCarriesUsernameOfTheOrderingAccount() {
        String admin = adminToken();
        Customer vevo = registerCustomer("vevoketszazharom");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        // A vevői blokk SZÁNDÉKOSAN más nevet visel, mint a fiók: a `username` nem a
        // snapshotból jön.
        placeOrderAs(vevo.token(), product, 1, customer("Más Vevőnév", "mas@example.com"));

        JsonNode page = adminOrders(admin, "");

        assertThat(page.get("items").get(0).get("username").asText())
                .isEqualTo("vevoketszazharom");
    }

    /**
     * Törölt fióknál a mező HIÁNYZIK a válaszból (nem `null`, nem üres szöveg): a
     * rendelés önálló bizonylat, a fiók hiánya nem hiba (ADR-0001).
     */
    @Test
    void usernameIsAbsentWhenTheAccountWasDeleted() {
        String admin = adminToken();
        Customer vevo = registerCustomer("vevoketszaznegy");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        placeOrderAs(vevo.token(), product, 1, customer("Teszt Vevő", "vevo@example.com"));

        ResponseEntity<JsonNode> deleted = delete("/api/admin/users/" + vevo.userId(), admin);
        assertThat(deleted.getStatusCode().value()).isEqualTo(200);

        JsonNode page = adminOrders(admin, "");

        // A rendelés megmarad, csak a felhasználónév oldhatatlan.
        assertThat(page.get("total").asInt()).isEqualTo(1);
        JsonNode order = page.get("items").get(0);
        assertThat(order.get("userId").asText()).isEqualTo(vevo.userId());
        assertThat(order.has("username")).isFalse();
    }

    // --- AR-04: teljes halmaz, legújabb elöl ---

    /** A lista MINDEN felhasználó rendelését tartalmazza, a legfrissebbel kezdve. */
    @Test
    void listsEveryUsersOrdersNewestFirst() {
        String admin = adminToken();
        Customer elso = registerCustomer("vevoketszazot");
        Customer masodik = registerCustomer("vevoketszazhat");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);

        String regi = placeOrderAs(elso.token(), product, 1,
                customer("Első Vevő", "elso@example.com")).get("id").asText();
        String uj = placeOrderAs(masodik.token(), product, 1,
                customer("Második Vevő", "masodik@example.com")).get("id").asText();

        JsonNode page = adminOrders(admin, "");

        assertThat(page.get("total").asInt()).isEqualTo(2);
        assertThat(idsOf(page)).containsExactly(uj, regi);
    }

    // --- AR-05: státusz-szűrés ---

    /** A három ismert státuszérték kizárólag az adott státuszú rendeléseket adja. */
    @Test
    void filtersByEachKnownStatus() {
        String admin = adminToken();
        Customer vevo = registerCustomer("vevoketszazhet");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 30);

        String pending = placeOrderAs(vevo.token(), product, 1,
                customer("Teszt Vevő", "vevo@example.com")).get("id").asText();
        String expired = placeOrderAs(vevo.token(), product, 1,
                customer("Teszt Vevő", "vevo@example.com")).get("id").asText();
        String delivered = placeOrderAs(vevo.token(), product, 1,
                customer("Teszt Vevő", "vevo@example.com")).get("id").asText();
        assertThat(setStatus(admin, expired, "expired").getStatusCode().value()).isEqualTo(200);
        assertThat(setStatus(admin, delivered, "delivered").getStatusCode().value()).isEqualTo(200);

        JsonNode pendingPage = adminOrders(admin, "?status=pending");
        assertThat(pendingPage.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(pendingPage)).containsExactly(pending);

        JsonNode expiredPage = adminOrders(admin, "?status=expired");
        assertThat(expiredPage.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(expiredPage)).containsExactly(expired);

        JsonNode deliveredPage = adminOrders(admin, "?status=delivered");
        assertThat(deliveredPage.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(deliveredPage)).containsExactly(delivered);
    }

    // --- AR-06: az ismeretlen státusz NEM hiba ---

    /**
     * Az {@code all}, a hiányzó és az ISMERETLEN érték egyaránt a teljes halmazt adja —
     * egyik sem 400. Ez a {@code GET /api/admin/products} meglévő viselkedése, és a két
     * admin lista nem viselkedhet másképp ugyanazon a néven.
     */
    @Test
    void unknownStatusFallsBackToTheWholeSetInsteadOf400() {
        String admin = adminToken();
        Customer vevo = registerCustomer("vevoketszaznyolc");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        placeOrderAs(vevo.token(), product, 1, customer("Teszt Vevő", "vevo@example.com"));
        String delivered = placeOrderAs(vevo.token(), product, 1,
                customer("Teszt Vevő", "vevo@example.com")).get("id").asText();
        assertThat(setStatus(admin, delivered, "delivered").getStatusCode().value()).isEqualTo(200);

        ResponseEntity<JsonNode> hianyzo = get("/api/admin/orders", admin);
        ResponseEntity<JsonNode> mind = get("/api/admin/orders?status=all", admin);
        ResponseEntity<JsonNode> ismeretlen = get("/api/admin/orders?status=barmi", admin);

        assertThat(hianyzo.getStatusCode().value()).isEqualTo(200);
        assertThat(mind.getStatusCode().value()).isEqualTo(200);
        assertThat(ismeretlen.getStatusCode().value()).isEqualTo(200);
        assertThat(hianyzo.getBody().get("total").asInt()).isEqualTo(2);
        assertThat(mind.getBody().get("total").asInt()).isEqualTo(2);
        assertThat(ismeretlen.getBody().get("total").asInt()).isEqualTo(2);
    }

    // --- AR-07: lapméret ---

    /** Az alap lapméret 25 (admin táblázat); a kért érték 1…100 közé vágódik. */
    @Test
    void clampsPageSizeBetweenOneAndHundred() {
        String admin = adminToken();
        Customer vevo = registerCustomer("vevoketszazkilenc");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        placeOrderAs(vevo.token(), product, 1, customer("Teszt Vevő", "vevo@example.com"));
        placeOrderAs(vevo.token(), product, 1, customer("Teszt Vevő", "vevo@example.com"));

        assertThat(adminOrders(admin, "").get("pageSize").asInt()).isEqualTo(25);
        assertThat(adminOrders(admin, "?pageSize=500").get("pageSize").asInt()).isEqualTo(100);

        JsonNode legkisebb = adminOrders(admin, "?pageSize=0");
        assertThat(legkisebb.get("pageSize").asInt()).isEqualTo(1);
        assertThat(legkisebb.get("items")).hasSize(1);
        assertThat(legkisebb.get("totalPages").asInt()).isEqualTo(2);
    }

    // --- AR-08: lapszám-vágás ---

    /**
     * A {@code page} MINDKÉT irányban 1 és {@code totalPages} közé vágódik — enélkül az
     * utolsó oldal utolsó elemének eltűnése után az admin üres oldalon ragadna. A
     * {@code totalPages} üres találathalmaznál is legalább 1.
     *
     * <p>Az alsó vágást azért kell külön mérni, mert a felső vágás mérése nem fedi le:
     * a két ág külön feltétel ugyanabban a kifejezésben.
     */
    @Test
    void clampsPageAndKeepsAtLeastOnePageWhenEmpty() {
        String admin = adminToken();
        Customer vevo = registerCustomer("vevoketszaztiz");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 10);
        placeOrderAs(vevo.token(), product, 1, customer("Teszt Vevő", "vevo@example.com"));
        placeOrderAs(vevo.token(), product, 1, customer("Teszt Vevő", "vevo@example.com"));
        placeOrderAs(vevo.token(), product, 1, customer("Teszt Vevő", "vevo@example.com"));

        JsonNode tulSokadik = adminOrders(admin, "?page=999&pageSize=1");
        assertThat(tulSokadik.get("totalPages").asInt()).isEqualTo(3);
        assertThat(tulSokadik.get("page").asInt()).isEqualTo(3);
        assertThat(tulSokadik.get("items")).hasSize(1);

        // Az ALSÓ vágás. A totalPages > 1 elvárás az, ami megkülönbözteti a felsőtől:
        // egyoldalas találathalmazon a page=1 a felső vágásból is kijönne, tehát nem
        // bizonyítana semmit.
        JsonNode nulladik = adminOrders(admin, "?page=0&pageSize=1");
        assertThat(nulladik.get("page").asInt()).isEqualTo(1);
        assertThat(nulladik.get("totalPages").asInt()).isEqualTo(3);
        assertThat(nulladik.get("items")).hasSize(1);

        JsonNode ures = adminOrders(admin, "?search=nincsilyenvevoseholsem");
        assertThat(ures.get("total").asInt()).isZero();
        assertThat(ures.get("items")).isEmpty();
        assertThat(ures.get("totalPages").asInt()).isEqualTo(1);
        assertThat(ures.get("page").asInt()).isEqualTo(1);
    }

    // --- AR-09: keresés ---

    /**
     * A {@code search} kis/nagybetűtől függetlenül illeszkedik a vevő NEVÉRE, az
     * E-MAILJÉRE és a rendelés AZONOSÍTÓJÁRA; a {@code total} a SZŰRT halmaz mérete.
     */
    @Test
    void searchMatchesCustomerNameEmailAndOrderIdCaseInsensitively() {
        String admin = adminToken();
        Customer vevo = registerCustomer("vevoketszaztizenegy");
        TestProduct product = createProduct(admin, "Teszttermék", 1000, 30);

        String kovacs = placeOrderAs(vevo.token(), product, 1,
                customer("Kovács Anna", "elsovevo@example.com")).get("id").asText();
        String szabo = placeOrderAs(vevo.token(), product, 1,
                customer("Szabó Béla", "bela@masikcim.hu")).get("id").asText();
        String harmadik = placeOrderAs(vevo.token(), product, 1,
                customer("Nagy Cecília", "cili@example.com")).get("id").asText();

        // Név, eltérő betűzéssel (a keresés a NÉVRE illeszkedik, az e-mailben nincs benne).
        JsonNode nevre = adminOrders(admin, "?search=KOV");
        assertThat(nevre.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(nevre)).containsExactly(kovacs);

        // E-mail, eltérő betűzéssel.
        JsonNode emailre = adminOrders(admin, "?search=MasikCim.HU");
        assertThat(emailre.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(emailre)).containsExactly(szabo);

        // Rendelésazonosító, nagybetűsítve (az azonosító kisbetűs UUID).
        JsonNode azonositora =
                adminOrders(admin, "?search=" + harmadik.toUpperCase(Locale.ROOT));
        assertThat(azonositora.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(azonositora)).containsExactly(harmadik);

        // A közös e-mail-részlet két rendelést fog — a `total` a SZŰRT halmaz mérete.
        JsonNode kettore = adminOrders(admin, "?search=example.com");
        assertThat(kettore.get("total").asInt()).isEqualTo(2);
        assertThat(idsOf(kettore)).containsExactly(harmadik, kovacs);
    }

    // --- AR-10, AR-11: jogosultság ---

    /** Token nélkül 401, `{ error }` törzzsel — ténylegesen lefuttatott kéréssel mérve. */
    @Test
    void missingTokenReturns401() {
        ResponseEntity<JsonNode> response = get("/api/admin/orders");

        assertThat(response.getStatusCode().value()).isEqualTo(401);
        assertThat(error(response)).isEqualTo(Messages.AUTH_REQUIRED);
    }

    /** Customer tokennel 403: a lista a teljes halmazt látja, ezért admin jogot kér. */
    @Test
    void customerTokenReturns403() {
        Customer vevo = registerCustomer("vevoketszaztizenketto");

        ResponseEntity<JsonNode> response = get("/api/admin/orders", vevo.token());

        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(error(response)).isEqualTo(Messages.ADMIN_REQUIRED);
    }
}
