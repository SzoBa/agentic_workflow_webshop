package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.Messages;
import hu.webshop.support.IntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

/**
 * K-58: az admin névtér védelme NEM EGY ÜRES kiszolgálási útvonalprefix mellett is áll.
 *
 * <p>Miért kell külön eset erre. A jogosultsági döntés korábban egy prefix-hasonlítás
 * volt: {@code request.getRequestURI().startsWith("/api/admin")}. A {@code
 * getRequestURI()} viszont a context path-ot IS tartalmazza, míg a bekötési minta
 * anélkül illeszkedik. Amíg a context path üres — ez a Spring Boot alapértelmezése —,
 * a kettő egybeesik, és minden működik. Egy {@code server.servlet.context-path=/shop}
 * beállítás viszont — puszta üzemeltetési döntés, egy sor konfiguráció — szétviszi
 * őket: az interceptor lefut, a 401 megvan, de a {@code "/shop/api/admin/users"} nem
 * kezdődik {@code "/api/admin"}-nal, tehát a szerepkör-ellenőrzés CSENDBEN kimarad, és
 * bármelyik belépett vevő eléri az admin végpontokat.
 *
 * <p>Ez a hibaosztály legrosszabb fajtája: nincs kivétel, nincs naplósor, nincs bukó
 * teszt — egy ellenőrzés egyszerűen „rendben"-t mond. A javítás után a jogosultságot a
 * bekötési minta dönti el (külön {@code AdminInterceptor}), tehát nincs két
 * koordinátarendszer, amit össze lehetne keverni.
 */
@TestPropertySource(properties = "server.servlet.context-path=/shop")
class AdminContextPathTest extends IntegrationTest {

    /**
     * A {@code TestRestTemplate} gyökér-URI-ja követi a context path-ot, ezért az
     * öröklött segédek útvonalai változatlanok — a kérés a {@code /shop} alá megy.
     */
    private String customerToken() {
        ResponseEntity<JsonNode> registered = post("/api/auth/register", Map.of(
                "username", "vevoacontextpathon",
                "email", "vevo.contextpath@example.com",
                "address", "Teszt utca 1",
                "password", "jelszo12345"));
        assertThat(registered.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return registered.getBody().get("token").asText();
    }

    @Test
    void customerTokennel403AzAdminNevteren() {
        ResponseEntity<JsonNode> response = get("/api/admin/users", customerToken());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.ADMIN_REQUIRED);
    }

    @Test
    void tokenNelkul401AzAdminNevteren() {
        ResponseEntity<JsonNode> response = get("/api/admin/users");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody().get("error").asText()).isEqualTo(Messages.AUTH_REQUIRED);
    }

    /** A védelem nem lehet vakriasztás: az adminnak tovább kell jutnia. */
    @Test
    void adminTokennelTovabbraIsHozzafer() {
        ResponseEntity<JsonNode> response = get("/api/admin/users", adminToken());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
