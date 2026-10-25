package hu.webshop.ops;

import static org.assertj.core.api.Assertions.assertThat;

import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderItemEntity;
import hu.webshop.domain.UserEntity;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import org.junit.jupiter.api.Test;

/**
 * A rendelési e-mail TARTALMÁNAK egysége (spec 7.4). Hálózat és Spring kontextus nélkül
 * fut: a levél szövege és kódolása tiszta függvény, a Gmail-hívás nélkül is mérhető.
 */
class GmailOrderNotifierTest {

    /** A konfiguráció és a katalógus itt nem játszik: a tétel neve snapshotból jön. */
    private final GmailOrderNotifier notifier = new GmailOrderNotifier(null, null);

    @Test
    void mailBodyContainsAllRequiredData() {
        String body = notifier.buildBody(order(), user());

        assertThat(body).contains("Rendelésazonosító: rendeles-teszt");
        assertThat(body).contains("Dátum: 2026-07-26T10:00:00.000Z");
        assertThat(body).contains("Felhasználónév: tesztelek");
        assertThat(body).contains("Email: teszt.elek@example.com");
        assertThat(body).contains("Szállítási cím: 1011 Budapest, Fő utca 1.");
        // A tételnév a rendelésen tárolt snapshotból, nem a katalógusból.
        assertThat(body).contains("- Kávéfőző × 2 db");
        assertThat(body).contains("Végösszeg: ");
    }

    @Test
    void totalIsShownInForintWithoutDecimals() {
        String formatted = GmailOrderNotifier.formatPrice(12_345);

        assertThat(formatted).contains("Ft").doesNotContain(",00").doesNotContain(".00");
        // A tagolás jellege (szóköz fajtája) területi beállítás kérdése, a számjegyek nem.
        assertThat(formatted.replaceAll("\\D", "")).isEqualTo("12345");
    }

    @Test
    void subjectAndBodyEncodeAccentsCorrectly() {
        String raw = GmailOrderNotifier.encodeMessage("cimzett@example.com", "kuldo@example.com",
                "Új rendelés érkezett: rendeles-teszt", "Árvíztűrő tükörfúrógép");

        String message = new String(Base64.getUrlDecoder().decode(raw), StandardCharsets.UTF_8);

        assertThat(message).contains("To: cimzett@example.com");
        assertThat(message).contains("From: kuldo@example.com");
        assertThat(message).contains("Content-Type: text/plain; charset=\"utf-8\"");
        assertThat(message).contains("Content-Transfer-Encoding: base64");

        // A tárgy MIME encoded-word: a magyar ékezetek csak így maradnak helyesek.
        String subjectLine = message.lines()
                .filter(line -> line.startsWith("Subject: "))
                .findFirst()
                .orElseThrow();
        assertThat(subjectLine).startsWith("Subject: =?utf-8?B?").endsWith("?=");
        String encodedSubject = subjectLine.substring("Subject: =?utf-8?B?".length(),
                subjectLine.length() - "?=".length());
        assertThat(new String(Base64.getDecoder().decode(encodedSubject), StandardCharsets.UTF_8))
                .isEqualTo("Új rendelés érkezett: rendeles-teszt");

        // A törzs base64/UTF-8 — az üres sor utáni utolsó blokk.
        String encodedBody = message.substring(message.indexOf("\r\n\r\n") + 4);
        assertThat(new String(Base64.getDecoder().decode(encodedBody), StandardCharsets.UTF_8))
                .isEqualTo("Árvíztűrő tükörfúrógép");
    }

    private static OrderEntity order() {
        OrderEntity order = new OrderEntity();
        order.setId("rendeles-teszt");
        order.setCustomerName("Teszt Elek");
        order.setCustomerEmail("teszt.elek@example.com");
        order.setCustomerAddress("1011 Budapest, Fő utca 1.");
        order.setTotal(12_345);
        order.setCreatedAt(Instant.parse("2026-07-26T10:00:00Z"));

        OrderItemEntity item = new OrderItemEntity();
        item.setProductId("p1");
        item.setQuantity(2);
        item.setName("Kávéfőző");
        order.addItem(item);
        return order;
    }

    private static UserEntity user() {
        UserEntity user = new UserEntity();
        user.setId("felhasznalo-teszt");
        user.setUsername("tesztelek");
        user.setEmail("teszt.elek@example.com");
        return user;
    }
}
