package hu.webshop.ops;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderItemEntity;
import hu.webshop.domain.UserEntity;
import hu.webshop.support.IntegrationTest;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Üzemeltetési viselkedés (spec 7.3–7.5): egészség-ellenőrzés, a rendelési értesítő
 * kecses kimaradása és a CORS-fejlécek hiánya.
 *
 * <p>A teszt a valódi konfigurációval fut: az {@code application.yml} minden
 * {@code GMAIL_*} és {@code CORS_ORIGINS} kulcsot üresen hagy, ha nincs env-változó —
 * tehát pontosan az a beállítatlan állapot, amit a K-73, K-74 és K-76 vizsgál.
 */
class OpsIntegrationTest extends IntegrationTest {

    @Autowired
    private OrderNotifier notifier;

    /** K: {@code GET /api/health} → 200, {@code {"status":"ok"}}. */
    @Test
    void healthEndpointReturnsOk() {
        ResponseEntity<JsonNode> response = get("/api/health");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("status").asText()).isEqualTo("ok");
    }

    /**
     * K-73, K-74: hiányos e-mail konfiguráció mellett a küldés kimarad — kivétel nélkül,
     * figyelmeztető naplóbejegyzéssel, hitelesítő adat nélkül.
     *
     * <p>Az „nem megy ki e-mail" itt onnan bizonyított, hogy a metódus a konfiguráció
     * ellenőrzése után azonnal visszatér: a napló pontosan egy warn bejegyzést tartalmaz,
     * és nincs sem „elküldve", sem „sikertelen" esemény (utóbbi már kísérletet jelentene).
     */
    @Test
    void missingEmailConfigSkipsSending() {
        ch.qos.logback.classic.Logger notifierLogger =
                (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(GmailOrderNotifier.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        notifierLogger.addAppender(appender);

        try {
            assertThatCode(() -> notifier.notifyNewOrder(order(), user())).doesNotThrowAnyException();
        } finally {
            notifierLogger.detachAppender(appender);
        }

        List<String> messages = appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
        assertThat(messages).containsExactly("Gmail nincs konfigurálva, e-mail kihagyva");
        assertThat(appender.list.getFirst().getLevel())
                .isEqualTo(ch.qos.logback.classic.Level.WARN);
        // A naplóba hitelesítő adat nem kerülhet: a kulcsok NEVE sem, az értékük végképp nem.
        assertThat(messages.getFirst()).doesNotContain("GMAIL_", "REFRESH", "token", "secret");
    }

    /** K-76: üres {@code CORS_ORIGINS} mellett nincs {@code Access-Control-Allow-Origin}. */
    @Test
    void emptyCorsOriginsMeansNoCorsHeader() {
        HttpHeaders headers = new HttpHeaders();
        headers.setOrigin("https://idegen.example.com");

        ResponseEntity<JsonNode> response = rest.exchange("/api/health", HttpMethod.GET,
                new HttpEntity<>(headers), JsonNode.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getAccessControlAllowOrigin()).isNull();
        assertThat(response.getHeaders().keySet())
                .noneMatch(name -> name.toLowerCase(java.util.Locale.ROOT)
                        .startsWith("access-control-"));
    }

    // --- Segédek: átmeneti (nem mentett) entitások, mert az értesítő csak olvassa őket. ---

    private static OrderEntity order() {
        OrderEntity order = new OrderEntity();
        order.setId("rendeles-teszt");
        order.setUserId("felhasznalo-teszt");
        order.setCustomerName("Teszt Elek");
        order.setCustomerEmail("teszt.elek@example.com");
        order.setCustomerAddress("1011 Budapest, Fő utca 1.");
        order.setTotal(12_345);
        order.setCreatedAt(Instant.parse("2026-07-26T10:00:00Z"));

        OrderItemEntity item = new OrderItemEntity();
        item.setProductId("p1");
        item.setQuantity(2);
        item.setName("Kávéfőző");
        item.setUnitPrice(6_172);
        order.addItem(item);
        return order;
    }

    private static UserEntity user() {
        UserEntity user = new UserEntity();
        user.setId("felhasznalo-teszt");
        user.setUsername("tesztelek");
        user.setEmail("teszt.elek@example.com");
        user.setAddress("1011 Budapest, Fő utca 1.");
        return user;
    }
}
