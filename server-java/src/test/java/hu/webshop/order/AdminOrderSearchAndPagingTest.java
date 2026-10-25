package hu.webshop.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Az admin rendeléslista SZŰRÉSE és LAPOZÁSA a lekérdezésben (AR-21, ADR-0009).
 *
 * <p>Az {@code AdminOrderListTest} a válasz SZERZŐDÉSÉT méri, és változatlanul zöld maradt a
 * refaktor után — ez önmagában bizonyítja, hogy a látható viselkedés nem változott. Ez az osztály
 * azokat az eseteket méri, amelyek a szerződésből nem következnek, viszont a szűrés SQL-be
 * költöztetésével ÚJ hibafelületté váltak:
 *
 * <ul>
 *   <li>a {@code LIKE} jokerei ({@code %}, {@code _}) a keresett szövegben — a korábbi
 *       {@code String.contains} számára közönséges karakterek voltak;</li>
 *   <li>a kis/nagybetű-egyezés, ami átkerült a Postgres {@code lower()}-jébe — a MINTÁT
 *       továbbra is Java kisbetűsíti, tehát a két oldal egyezése előfeltevés, amit mérni kell;</li>
 *   <li>a lapozás darabolása, ami korábban egyetlen listán futó {@code subList} volt, most
 *       viszont HÁROM lekérdezés együttműködése ({@code count} + azonosító-lap + tétel-lap).</li>
 * </ul>
 */
class AdminOrderSearchAndPagingTest extends OrderTestSupport {

    // --- Segédek ---

    private static Map<String, Object> customer(String name, String email) {
        Map<String, Object> customer = new LinkedHashMap<>();
        customer.put("name", name);
        customer.put("email", email);
        customer.put("address", "Teszt utca 1.");
        return customer;
    }

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

    private JsonNode adminOrders(String adminToken, String query) {
        ResponseEntity<JsonNode> response = get("/api/admin/orders" + query, adminToken);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody();
    }

    /**
     * Lekérés ÖSSZEÁLLÍTOTT URI-val, nem sztring-összefűzéssel.
     *
     * <p>Miért nem elég a {@code String} út: a {@code TestRestTemplate} a sztringet URI-SABLONNAK
     * olvassa és újrakódolja, tehát egy kézzel beírt {@code %25} {@code %2525}-té válna, egy
     * magányos {@code %} pedig értelmezhetetlen escape lenne. Márpedig ezeknek az eseteknek épp
     * az a lényege, hogy a szerver PONTOSAN a megadott karaktereket kapja meg. Az összeállított
     * URI-t a sablonkezelő már nem bántja.
     */
    private JsonNode adminOrdersSearching(String adminToken, String search, String... extraParams) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromPath("/api/admin/orders")
                .queryParam("search", search);
        for (int i = 0; i + 1 < extraParams.length; i += 2) {
            builder.queryParam(extraParams[i], extraParams[i + 1]);
        }
        URI uri = builder.encode(StandardCharsets.UTF_8).build().toUri();

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(adminToken);
        ResponseEntity<JsonNode> response =
                rest.exchange(uri, HttpMethod.GET, new HttpEntity<>(headers), JsonNode.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return response.getBody();
    }

    private static List<String> idsOf(JsonNode page) {
        List<String> ids = new ArrayList<>();
        for (JsonNode item : page.get("items")) {
            ids.add(item.get("id").asText());
        }
        return ids;
    }

    // --- A LIKE jokerei irodalmi karakterek ---

    /**
     * Az aláhúzás a keresett SZÖVEG része, nem „bármely karakter" joker.
     *
     * <p>Menekítés nélkül ez a teszt bukik: a {@code %a_b%} minta az {@code axb}-re is
     * illeszkedne, tehát a keresés némán TÖBBET adna vissza. A hiba a válasz alakján nem
     * látszik — csak a találatokon.
     */
    @Test
    void underscoreInSearchIsMatchedLiterally() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("jokervevo");

        String alahuzos = placeOrderAs(vevo.token(), product, 1,
                customer("Teszt a_b Vevő", "alahuzos@example.com")).get("id").asText();
        placeOrderAs(vevo.token(), product, 1,
                customer("Teszt axb Vevő", "barmilyen@example.com"));

        JsonNode talalat = adminOrdersSearching(admin, "a_b");

        assertThat(talalat.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(talalat)).containsExactly(alahuzos);
    }

    /** A százalékjel ugyanígy: keresett szöveg, nem „bármennyi karakter". */
    @Test
    void percentSignInSearchIsMatchedLiterally() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("szazalekvevo");

        String szazalekos = placeOrderAs(vevo.token(), product, 1,
                customer("Kedvezmény 50% Vevő", "szazalek@example.com")).get("id").asText();
        placeOrderAs(vevo.token(), product, 1,
                customer("Kedvezmény 5012 Vevő", "masik@example.com"));

        JsonNode talalat = adminOrdersSearching(admin, "50%");

        assertThat(talalat.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(talalat)).containsExactly(szazalekos);
    }

    /**
     * A menekítő jel ({@code !}) önmaga is keresett karakter lehet.
     *
     * <p>Ha a menekítés nem menekítené ELŐSZÖR saját magát, a {@code !} elnyelné az utána
     * következő karaktert, és a minta csendben mást keresne.
     */
    @Test
    void theEscapeCharacterItselfIsMatchedLiterally() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("felkialtovevo");

        String felkialtos = placeOrderAs(vevo.token(), product, 1,
                customer("Hello! Vevő", "felkialto@example.com")).get("id").asText();
        placeOrderAs(vevo.token(), product, 1,
                customer("Hello Vevő", "sima@example.com"));

        // Csak a `!`-ig keresünk: a záró szóközt a minta amúgy is trimmelné.
        JsonNode talalat = adminOrdersSearching(admin, "o!");

        assertThat(talalat.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(talalat)).containsExactly(felkialtos);
    }

    // --- Kis/nagybetű ékezetes szövegen ---

    /**
     * NAGYBETŰS ÉKEZETES név megtalálható kisbetűs mintával.
     *
     * <p>Ez a teszt egy INFRASTRUKTURÁLIS előfeltevést őriz, nem alkalmazáslogikát: a mintát
     * Java kisbetűsíti ({@code Locale.ROOT}), az oszlopot viszont a Postgres {@code lower()}-je.
     * A kettő csak Unicode-képes kolláció mellett egyezik. ASCII-only {@code lower()}
     * ({@code LC_CTYPE=C}) mellett az {@code Á} nem hajtódna le, és a keresés némán nem találna —
     * miközben a tisztán ASCII eseteket mérő tesztek zöldek maradnának (ADR-0009).
     */
    @Test
    void searchMatchesUppercaseAccentedCustomerName() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("ekezetesvevo");

        String ekezetes = placeOrderAs(vevo.token(), product, 1,
                customer("KOVÁCS ANNA", "kovacs@example.com")).get("id").asText();

        JsonNode talalat = adminOrdersSearching(admin, "kovács");

        assertThat(talalat.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(talalat)).containsExactly(ekezetes);
    }

    /** Hosszú ő/ű is helyesen hajtódik le — a magyar adat leggyakoribb esete. */
    @Test
    void searchMatchesHungarianLongVowelsCaseInsensitively() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("hosszuvevo");

        String hosszu = placeOrderAs(vevo.token(), product, 1,
                customer("SZŰCS ŐRS", "szucs@example.com")).get("id").asText();

        JsonNode talalat = adminOrdersSearching(admin, "szűcs őrs");

        assertThat(talalat.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(talalat)).containsExactly(hosszu);
    }

    // --- A lapozás darabolása ---

    /**
     * A lapok EGYÜTT pontosan a teljes halmazt adják — átfedés és hézag nélkül, azonos
     * sorrendben.
     *
     * <p>Ez a kétlépcsős lekérdezés fő kockázatát méri: a tételeket hozó fetch join elvileg
     * duplikálhatná vagy elejthetné a gyökér-entitásokat, a második lekérdezés pedig
     * felboríthatná a sorrendet ({@code in} nem őrzi meg a listát).
     */
    @Test
    void everyPageTogetherCoversTheWholeSetWithoutOverlapOrGaps() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("lapozovevo");

        for (int i = 1; i <= 7; i++) {
            placeOrderAs(vevo.token(), product, 1,
                    customer("Vevő " + i, "vevo" + i + "@example.com"));
        }

        List<String> egyben = idsOf(adminOrders(admin, "?pageSize=100"));

        List<String> lapokbol = new ArrayList<>();
        for (int page = 1; page <= 3; page++) {
            lapokbol.addAll(idsOf(adminOrders(admin, "?pageSize=3&page=" + page)));
        }

        assertThat(egyben).hasSize(7);
        assertThat(lapokbol).containsExactlyElementsOf(egyben);
    }

    /**
     * A {@code total} megegyezik a lapokon ténylegesen visszaadott elemek számával.
     *
     * <p>A {@code count} és az azonosító-lap KÉT külön {@code @Query}, azonos {@code where}
     * feltétellel — a közös részt sztringliterálokból nem lehet kiemelni, tehát semmi nem
     * akadályozza meg, hogy a kettő szétcsússzon. Ez a teszt az egyetlen őr.
     */
    @Test
    void totalMatchesTheNumberOfItemsAcrossAllPages() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("osszesitovevo");

        for (int i = 1; i <= 5; i++) {
            placeOrderAs(vevo.token(), product, 1,
                    customer("Keresett Vevő " + i, "keresett" + i + "@example.com"));
        }
        placeOrderAs(vevo.token(), product, 1, customer("Másik Ember", "masik@example.com"));

        JsonNode elsoLap = adminOrders(admin, "?search=keresett&pageSize=2&page=1");
        int total = elsoLap.get("total").asInt();

        int osszesen = 0;
        for (int page = 1; page <= elsoLap.get("totalPages").asInt(); page++) {
            osszesen += idsOf(adminOrders(admin, "?search=keresett&pageSize=2&page=" + page)).size();
        }

        assertThat(total).isEqualTo(5);
        assertThat(osszesen).isEqualTo(total);
    }

    /** A szűrés a lapozás ELŐTT fut: az utolsó lap a szűrt halmaz maradéka, nem üres. */
    @Test
    void searchIsAppliedBeforePagingSoTheLastPageIsNotEmpty() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("szurtlapozo");

        for (int i = 1; i <= 15; i++) {
            placeOrderAs(vevo.token(), product, 1,
                    customer("Zajos Vevő " + i, "zaj" + i + "@example.com"));
        }
        for (int i = 1; i <= 5; i++) {
            placeOrderAs(vevo.token(), product, 1,
                    customer("Talalat Vevo " + i, "talalat" + i + "@example.com"));
        }

        JsonNode utolso = adminOrders(admin, "?search=talalat&pageSize=2&page=3");

        assertThat(utolso.get("total").asInt()).isEqualTo(5);
        assertThat(utolso.get("totalPages").asInt()).isEqualTo(3);
        assertThat(utolso.get("page").asInt()).isEqualTo(3);
        assertThat(utolso.get("items")).hasSize(1);
    }

    /** A túl nagy lapszám az UTOLSÓ lap tényleges elemét adja — nem csak helyes metaadatot. */
    @Test
    void pageBeyondTheLastPageReturnsTheLastPageItems() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("tullapozo");

        for (int i = 1; i <= 3; i++) {
            placeOrderAs(vevo.token(), product, 1,
                    customer("Vevő " + i, "vevo" + i + "@example.com"));
        }

        // A lista LEGÚJABB elöl rendez, tehát az utolsó lapon a LEGRÉGEBBI rendelés áll.
        List<String> mind = idsOf(adminOrders(admin, "?pageSize=100"));
        String legregebbi = mind.get(mind.size() - 1);

        JsonNode tulsokadik = adminOrders(admin, "?page=999&pageSize=1");

        assertThat(idsOf(tulsokadik)).containsExactly(legregebbi);
    }

    // --- A szűrők együtt ---

    /** A státusz-szűrő és a {@code search} EGY lekérdezésben, együtt érvényesül. */
    @Test
    void statusFilterAndSearchApplyTogether() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("egyuttvevo");

        String kiszallitott = placeOrderAs(vevo.token(), product, 1,
                customer("Együtt Vevő", "egyutt1@example.com")).get("id").asText();
        placeOrderAs(vevo.token(), product, 1, customer("Együtt Vevő", "egyutt2@example.com"));
        placeOrderAs(vevo.token(), product, 1, customer("Másik Ember", "masik@example.com"));

        assertThat(setStatus(admin, kiszallitott, "delivered").getStatusCode().value())
                .isEqualTo(200);

        JsonNode talalat = adminOrdersSearching(admin, "együtt", "status", "delivered");

        assertThat(talalat.get("total").asInt()).isEqualTo(1);
        assertThat(idsOf(talalat)).containsExactly(kiszallitott);
    }

    /** Ismeretlen státusz + lapozás: a teljes halmazon lapozunk, nem üresen (AR-06). */
    @Test
    void unknownStatusIsPagedAsTheWholeSet() {
        String admin = adminToken();
        TestProduct product = createProduct(admin, "Lapozós termék", 1000, 100);
        Customer vevo = registerCustomer("ismeretlenvevo");

        for (int i = 1; i <= 3; i++) {
            placeOrderAs(vevo.token(), product, 1,
                    customer("Vevő " + i, "vevo" + i + "@example.com"));
        }

        JsonNode teljes = adminOrders(admin, "?pageSize=1");
        JsonNode ismeretlen = adminOrders(admin, "?status=barmi&pageSize=1");

        assertThat(ismeretlen.get("total").asInt()).isEqualTo(teljes.get("total").asInt());
        assertThat(ismeretlen.get("totalPages").asInt()).isEqualTo(3);
        assertThat(idsOf(ismeretlen)).isEqualTo(idsOf(teljes));
    }

    // --- A tételek a kétlépcsős betöltés után ---

    /**
     * Egy rendelés TÉTELEI megőrzik a beszúrási sorrendjüket az admin listán is.
     *
     * <p>A tételek immár egy MÁSODIK lekérdezésből jönnek ({@code in :ids}), tehát a
     * gyűjtemény {@code @OrderBy("seq asc")} rendezésének ezen az úton is érvényesülnie kell.
     */
    @Test
    void itemsOfAnOrderKeepTheirInsertionOrderInTheAdminList() {
        String admin = adminToken();
        TestProduct elso = createProduct(admin, "Első termék", 1000, 100);
        TestProduct masodik = createProduct(admin, "Második termék", 2000, 100);
        TestProduct harmadik = createProduct(admin, "Harmadik termék", 3000, 100);
        Customer vevo = registerCustomer("tetelesvevo");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", List.of(item(elso.id(), 1), item(masodik.id(), 1),
                item(harmadik.id(), 1)));
        body.put("customer", customer("Tételes Vevő", "teteles@example.com"));
        body.put("expectedTotal", 6000);
        assertThat(post("/api/orders", body, vevo.token()).getStatusCode().value()).isEqualTo(201);

        JsonNode lista = adminOrdersSearching(admin, "tételes");

        List<String> nevek = new ArrayList<>();
        for (JsonNode tetel : lista.get("items").get(0).get("items")) {
            nevek.add(tetel.get("name").asText());
        }
        assertThat(nevek).containsExactly("Első termék", "Második termék", "Harmadik termék");
    }
}
