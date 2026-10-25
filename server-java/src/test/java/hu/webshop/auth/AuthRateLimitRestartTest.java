package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.WebshopApplication;
import hu.webshop.common.Messages;
import hu.webshop.support.IntegrationTest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.client.RestTemplate;

/**
 * K-52: a bejelentkezési korlát TÚLÉLI a szerver újraindítását.
 *
 * <p>Az eset a katalógusban {@code ⚙} jelű, mert egy futó szervert nem lehet HTTP-n
 * újraindítani. A teszt ezért egy MÁSODIK alkalmazáspéldányt indít ugyanarra az
 * adatbázisra, saját porton, teljesen friss memóriaállapottal — a Java-folyamat
 * szempontjából ez pontosan az, amit egy újraindítás jelent: minden in-memory
 * gyorsítótár üres, csak a tároló marad.
 *
 * <p>Miért nem elég a {@code login_attempts} tábla létét ellenőrizni: attól, hogy a
 * számláló ki van írva, még jöhetne memóriából a DÖNTÉS. Az egyetlen bizonyíték az,
 * hogy egy soha nem látott példány is elutasítja a kérést.
 *
 * <p>Miért külön osztály: az indított második kontextus lassú, és egy beállított
 * proxy-hop kell hozzá, hogy a számlálási kulcs az {@code X-Forwarded-For} fejlécből
 * jöjjön — enélkül a két példány hurok-címe keveredne a többi teszttel. Egy hop mellett
 * az egyelemű lánc maga a kulcs (lásd {@link ClientIpResolverTest}).
 */
@TestPropertySource(properties = "webshop.trusted-proxy-hops=1")
class AuthRateLimitRestartTest extends IntegrationTest {

    private static final String IP = "10.52.0.1";
    private static final Map<String, String> ROSSZ_BELEPES =
            Map.of("username", "nincsilyenfelhasznalo", "password", "rosszjelszo");

    @Test
    void k52_rateLimitSurvivesRestart() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            assertThat(login(rest.getRootUri(), IP).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
        assertThat(login(rest.getRootUri(), IP).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);

        try (ConfigurableApplicationContext restarted = startSecondInstance()) {
            String rootUri = "http://localhost:" + port(restarted);

            ResponseEntity<JsonNode> blocked = login(rootUri, IP);

            assertThat(blocked.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
            assertThat(blocked.getBody().get("error").asText())
                    .isEqualTo(Messages.LOGIN_RATE_LIMITED);

            // Az újraindult példány nem vaktában tilt: egy MÁSIK kliens érintetlen.
            assertThat(login(rootUri, "10.52.0.2").getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    /**
     * Friss alkalmazáspéldány UGYANARRA az adatbázisra, véletlen porton.
     *
     * <p>A beállítások PARANCSSORI argumentumként mennek át, nem
     * {@code SpringApplicationBuilder.properties()}-szel: az utóbbi
     * „default properties"-t állít, ami a LEGALACSONYABB precedenciájú forrás — az
     * {@code application.yml} felülírná, és a második példány a rendes 3001-es
     * portra indulna (ütközve az elsővel vagy egy futó fejlesztői szerverrel).
     */
    private ConfigurableApplicationContext startSecondInstance() {
        String[] args = java.util.stream.Stream.concat(
                        java.util.Arrays.stream(datasourceProperties()),
                        java.util.stream.Stream.of("server.port=0",
                                "webshop.trusted-proxy-hops=1"))
                .map(property -> "--" + property)
                .toArray(String[]::new);
        return new SpringApplicationBuilder(WebshopApplication.class).run(args);
    }

    private static int port(ConfigurableApplicationContext context) {
        return context.getEnvironment().getRequiredProperty("local.server.port", Integer.class);
    }

    /**
     * Bejelentkezési kísérlet megadott gyökér-URI-ra és kliens IP-re.
     *
     * <p>Saját {@link RestTemplate}, mert a {@code TestRestTemplate} az ELSŐ példány
     * portjához van kötve. A 4xx nem dobhat kivételt, ezért a hibakezelő ki van véve.
     */
    private static ResponseEntity<JsonNode> login(String rootUri, String ip) {
        RestTemplate client = new RestTemplate();
        client.setErrorHandler(new org.springframework.web.client.DefaultResponseErrorHandler() {
            @Override
            public boolean hasError(org.springframework.http.client.ClientHttpResponse response) {
                return false;
            }
        });
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Forwarded-For", ip);
        return client.exchange(rootUri + "/api/auth/login", HttpMethod.POST,
                new HttpEntity<>(ROSSZ_BELEPES, headers), JsonNode.class);
    }
}
