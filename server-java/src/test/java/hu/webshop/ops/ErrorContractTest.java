package hu.webshop.ops;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.catalog.ProductQueryService;
import hu.webshop.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * K-72: hibainjektálás egy kéréskezelési útvonalon.
 *
 * <p>Az eset a katalógusban {@code ⚙} jelű, mert HTTP-n keresztül nem lehet hibát
 * előidézni — a jól működő backendnek nincs olyan végpontja, ami kérésre elszáll.
 * Az injektálás itt a lekérdező szolgáltatás kicserélése egy dobó változatra: a
 * kontroller, a hibakezelő és a szervlet-lánc VALÓDI marad, tehát pontosan az a
 * kód fut, ami élesben is futna egy váratlan kivétel után.
 *
 * <p>Miért a {@link ProductQueryService} a célpont: a {@code GET /api/products} a
 * legforgalmasabb, hitelesítés nélkül elérhető végpont — ha valahol, itt látszik
 * meg egy 500-as válasz szivárgása.
 */
class ErrorContractTest extends IntegrationTest {

    @MockitoBean
    private ProductQueryService products;

    /**
     * A kezeletlen kivétel egységes 500-at ad semleges magyar üzenettel, és a
     * szerver a KÖVETKEZŐ kérést kiszolgálja.
     */
    @Test
    void k72_unhandledErrorGivesNeutral500AndServerKeepsRunning() {
        given(products.customerList(any(), any(), any()))
                .willThrow(new IllegalStateException("injektált hiba: adatbázis-kapcsolat elveszett"));

        ResponseEntity<JsonNode> failed = get("/api/products");

        assertThat(failed.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(failed.getBody().get("error").asText()).isEqualTo("Váratlan szerverhiba.");
        // A hibaválasz nem szivárogtathat belső részletet: se kivételtípust, se vermet,
        // se az injektált üzenetet.
        assertThat(failed.getBody().toString())
                .doesNotContain("IllegalStateException", "injektált", "hu.webshop");
        assertThat(failed.getBody().has("stack")).isFalse();
        assertThat(failed.getBody().has("trace")).isFalse();

        // A folyamat él: egy másik végpont változatlanul kiszolgál.
        ResponseEntity<JsonNode> health = get("/api/health");
        assertThat(health.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(health.getBody().get("status").asText()).isEqualTo("ok");

        // És ugyanaz a hibás végpont is újra kiszolgál — nem ragad be hibás állapotba.
        assertThat(get("/api/products").getStatusCode())
                .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    /**
     * A hibaszerződés a hitelesített útvonalakon is ugyanaz — a hiba nem válik
     * 401-gyé vagy 403-má attól, hogy a kérés belépett felhasználótól jött.
     */
    @Test
    void k72_sameContractOnAuthenticatedRoute() {
        given(products.adminList(any(), any(), any()))
                .willThrow(new RuntimeException("injektált hiba"));

        ResponseEntity<JsonNode> response = get("/api/admin/products", adminToken());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().get("error").asText()).isEqualTo("Váratlan szerverhiba.");
    }

    /**
     * Az ismeretlen útvonal NEM 500: a hibakezelőnek külön ága van rá, különben egy
     * elgépelt cím belső hibának látszana.
     */
    @Test
    void unknownRouteGives404Not500() {
        given(products.customerProduct(anyString()))
                .willThrow(new IllegalStateException("ide nem szabad eljutni"));

        ResponseEntity<JsonNode> response = get("/api/nincs-ilyen-vegpont");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().get("error").asText())
                .isEqualTo("A kért erőforrás nem található.");
    }
}
