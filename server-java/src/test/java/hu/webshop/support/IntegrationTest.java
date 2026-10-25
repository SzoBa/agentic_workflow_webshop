package hu.webshop.support;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.bootstrap.DataBootstrap;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Integrációs tesztek közös alapja: VALÓDI Postgres (Testcontainers) és valódi HTTP.
 *
 * <p>Miért nem in-memory adatbázis és nem közvetlen kontrollerhívás: a migrációk, a
 * részleges egyedi indexek, a {@code LOWER()}-es indexek és a sorszintű zárolás
 * Postgres-specifikusak — pont azok az invariánsok, amelyeket ellenőrizni akarunk.
 *
 * <p>A konténer SINGLETON: egyszer indul minden tesztosztályra, és a JVM leállásáig
 * él (a Ryuk takarítja). Osztályonkénti indítás percekkel hosszabb futást jelentene.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class IntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("webshop")
                    .withUsername("webshop")
                    .withPassword("webshop");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    /**
     * A futó adatbázis kapcsolati adatai Spring property-formában.
     *
     * <p>Az „újraindítás" jellegű esetekhez kell (K-52): egy MÁSODIK
     * alkalmazáspéldány indul UGYANARRA az adatbázisra, friss memóriaállapottal —
     * ez az egyetlen mód igazolni, hogy egy állapot tényleg a tárolóban él, és nem
     * a folyamat memóriájában.
     */
    protected static String[] datasourceProperties() {
        return new String[] {
            "spring.datasource.url=" + POSTGRES.getJdbcUrl(),
            "spring.datasource.username=" + POSTGRES.getUsername(),
            "spring.datasource.password=" + POSTGRES.getPassword(),
        };
    }

    @Autowired
    protected TestRestTemplate rest;

    @Autowired
    protected DataBootstrap bootstrap;

    @Autowired
    protected TransactionTemplate transactions;

    @Autowired
    protected EntityManager entityManager;

    /**
     * Minden teszt tiszta adattárolóval indul: a táblák ürülnek, majd lefut az
     * induló állapot létrehozása (seed katalógus + seed admin). A konformancia-esetek
     * előfeltétele is ez („tiszta kiinduló állapot").
     */
    @BeforeEach
    void resetDatabase() {
        transactions.executeWithoutResult(status -> entityManager.createNativeQuery(
                        "truncate table order_items, orders, reviews, login_attempts, users, products"
                                + " restart identity cascade")
                .executeUpdate());
        bootstrap.run(null);
    }

    // --- HTTP segédek. A tesztek kizárólag a publikus API-t használják. ---

    protected ResponseEntity<JsonNode> get(String path) {
        return exchange(HttpMethod.GET, path, null, null);
    }

    protected ResponseEntity<JsonNode> get(String path, String token) {
        return exchange(HttpMethod.GET, path, null, token);
    }

    protected ResponseEntity<JsonNode> post(String path, Object body) {
        return exchange(HttpMethod.POST, path, body, null);
    }

    protected ResponseEntity<JsonNode> post(String path, Object body, String token) {
        return exchange(HttpMethod.POST, path, body, token);
    }

    protected ResponseEntity<JsonNode> put(String path, Object body, String token) {
        return exchange(HttpMethod.PUT, path, body, token);
    }

    protected ResponseEntity<JsonNode> patch(String path, Object body, String token) {
        return exchange(HttpMethod.PATCH, path, body, token);
    }

    protected ResponseEntity<JsonNode> delete(String path, String token) {
        return exchange(HttpMethod.DELETE, path, null, token);
    }

    protected ResponseEntity<JsonNode> exchange(HttpMethod method, String path, Object body,
            String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) {
            headers.setBearerAuth(token);
        }
        return rest.exchange(path, method, new HttpEntity<>(body, headers), JsonNode.class);
    }

    /** Bejelentkezés a seed adminnal — a legtöbb eset innen indul (bootstrap B-1). */
    protected String adminToken() {
        ResponseEntity<JsonNode> response = post("/api/auth/login",
                java.util.Map.of("username", DataBootstrap.SEED_ADMIN_USERNAME,
                        "password", DataBootstrap.SEED_ADMIN_PASSWORD));
        return response.getBody().get("token").asText();
    }

    /** Adatbázis-állapot közvetlen ellenőrzéséhez (csak állításokhoz, nem előfeltételhez). */
    @Transactional
    protected <T> T inTransaction(java.util.function.Supplier<T> work) {
        return transactions.execute(status -> work.get());
    }
}
