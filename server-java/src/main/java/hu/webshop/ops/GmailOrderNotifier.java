package hu.webshop.ops;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.gmail.Gmail;
import com.google.api.services.gmail.model.Message;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.UserCredentials;
import hu.webshop.config.AppProperties;
import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderItemEntity;
import hu.webshop.domain.ProductEntity;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.ProductRepository;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.Currency;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Rendelési e-mail értesítő a Gmail API-n (OAuth2) keresztül — a korábbi Node
 * implementáció e-mail moduljának átültetése (ADR-0006).
 *
 * <p>Három szabály, amiért ez az osztály így néz ki:
 *
 * <ul>
 *   <li><b>Kecses kimaradás.</b> Ha BÁRMELYIK konfigurációs érték hiányzik, a küldés
 *       kimarad egy figyelmeztető naplóbejegyzéssel, és semmilyen e-mail nem megy ki.
 *       Beégetett tartalék címzett SZÁNDÉKOSAN nincs: env hiányában ne menjen vevői
 *       személyes adat egy fix címre (K-73, K-74).</li>
 *   <li><b>Soha nem dob.</b> A rendelés akkor is sikeres, ha az értesítés bukik — a vevő
 *       válasza változatlan, a hiba csak a naplóba kerül, a rendelésazonosítóval (K-75).</li>
 *   <li><b>Egyetlen próbálkozás.</b> Nincs újrapróbálás, sorbaállítás vagy kézbesítési
 *       garancia (spec 7.4). Az értesítő üzemeltetői kényelem, nem üzleti garancia.</li>
 * </ul>
 *
 * <p>A hívó a mentés után, ugyanabban a kérésben hívja: a {@code order.getItems()} ekkor
 * még betöltött. Ha mégsem lenne az, a kivétel a szokásos hibaágra fut (error napló), a
 * rendelést nem érinti.
 */
@Component
public class GmailOrderNotifier implements OrderNotifier {

    private static final Logger log = LoggerFactory.getLogger(GmailOrderNotifier.class);

    /** A Gmail API „a hitelesített felhasználó" pszeudo-azonosítója. */
    private static final String ME = "me";

    private static final String APPLICATION_NAME = "webshop";

    /**
     * A JavaScript {@code Date#toISOString()} formátuma: mindig UTC, mindig 3 tizedesjegy.
     * Az {@code Instant#toString()} ettől eltér (elhagyja a nulla ezredmásodperceket),
     * ezért itt explicit minta van — az e-mail dátuma így ugyanúgy néz ki, mint a
     * korábbi Node implementációban.
     */
    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private final AppProperties properties;
    private final ProductRepository products;

    public GmailOrderNotifier(AppProperties properties, ProductRepository products) {
        this.properties = properties;
        this.products = products;
    }

    @Override
    public void notifyNewOrder(OrderEntity order, UserEntity user) {
        String clientId = properties.getGmailClientId();
        String clientSecret = properties.getGmailClientSecret();
        String refreshToken = properties.getGmailRefreshToken();
        String sender = properties.getGmailSender();
        String to = properties.getOrderNotifyTo();

        if (isBlank(clientId) || isBlank(clientSecret) || isBlank(refreshToken)
                || isBlank(sender) || isBlank(to)) {
            // A napló SEM nevezi meg, melyik kulcs hiányzik: a kulcsok neve önmagában
            // ártalmatlan, de a „melyik van meg" információ már a konfiguráció térképe.
            log.warn("Gmail nincs konfigurálva, e-mail kihagyva");
            return;
        }

        try {
            String subject = "Új rendelés érkezett: " + order.getId();
            String raw = encodeMessage(to, sender, subject, buildBody(order, user));
            gmail(clientId, clientSecret, refreshToken)
                    .users().messages().send(ME, new Message().setRaw(raw))
                    .execute();
            log.atInfo().addKeyValue("orderId", order.getId()).log("Rendelési e-mail elküldve");
        } catch (Exception ex) {
            // MINDEN kivétel itt áll meg (a RuntimeException is): az értesítés hibája nem
            // buktathatja a már létrejött rendelést.
            log.atError().addKeyValue("orderId", order.getId())
                    .setCause(ex)
                    .log("Rendelési e-mail küldése sikertelen");
        }
    }

    /** A Gmail kliens a refresh tokenből felépített felhasználói hitelesítéssel. */
    private Gmail gmail(String clientId, String clientSecret, String refreshToken)
            throws Exception {
        UserCredentials credentials = UserCredentials.newBuilder()
                .setClientId(clientId)
                .setClientSecret(clientSecret)
                .setRefreshToken(refreshToken)
                .build();
        return new Gmail.Builder(
                GoogleNetHttpTransport.newTrustedTransport(),
                GsonFactory.getDefaultInstance(),
                new HttpCredentialsAdapter(credentials))
                .setApplicationName(APPLICATION_NAME)
                .build();
    }

    /** A levél törzse: magyar nyelvű, egyszerű szöveg (spec 7.4). */
    String buildBody(OrderEntity order, UserEntity user) {
        return String.join("\n",
                "Új rendelés érkezett a webshopból.",
                "",
                "Rendelésazonosító: " + order.getId(),
                "Dátum: " + formatDate(order.getCreatedAt()),
                "",
                "Rendelő:",
                "  Felhasználónév: " + user.getUsername(),
                "  Email: " + user.getEmail(),
                "  Szállítási cím: " + order.getCustomerAddress(),
                "",
                "Tételek:",
                itemLines(order.getItems()),
                "",
                "Végösszeg: " + formatPrice(order.getTotal()));
    }

    /**
     * A tételek felsorolása. A név forrása sorrendben: a rendelésen TÁROLT snapshot →
     * a katalógus → a termékazonosító.
     *
     * <p>A snapshot azért előzi meg a katalógust, mert különben ugyanarról a rendelésről
     * két igazság keletkezne: a rendeléslista a befagyasztott nevet mutatná, az e-mail az
     * időközben átnevezett terméket.
     */
    private String itemLines(List<OrderItemEntity> items) {
        return items.stream()
                .map(item -> "- " + itemName(item) + " × " + item.getQuantity() + " db")
                .collect(Collectors.joining("\n"));
    }

    private String itemName(OrderItemEntity item) {
        if (item.getName() != null && !item.getName().isBlank()) {
            return item.getName();
        }
        return products.findById(item.getProductId())
                .map(ProductEntity::getName)
                .orElse(item.getProductId());
    }

    /** Forint formátum tizedesjegy nélkül, magyar tagolással (pl. {@code 12 345 Ft}). */
    static String formatPrice(int price) {
        NumberFormat format = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("hu-HU"));
        format.setCurrency(Currency.getInstance("HUF"));
        format.setMaximumFractionDigits(0);
        return format.format(price);
    }

    private static String formatDate(Instant createdAt) {
        return createdAt == null ? "" : ISO_MILLIS.format(createdAt);
    }

    /**
     * RFC 822 üzenet base64url kódolása a Gmail API számára.
     *
     * <p>A tárgy MIME encoded-word ({@code =?utf-8?B?...?=}), a törzs base64/UTF-8: a
     * magyar ékezetek csak így jelennek meg helyesen minden levelezőben. A záró
     * base64url kódolás a Gmail {@code raw} mezőjének formátuma (padding nélkül).
     */
    static String encodeMessage(String to, String from, String subject, String body) {
        String encodedSubject = "=?utf-8?B?" + base64(subject) + "?=";
        String message = String.join("\r\n",
                "To: " + to,
                "From: " + from,
                "Subject: " + encodedSubject,
                "MIME-Version: 1.0",
                "Content-Type: text/plain; charset=\"utf-8\"",
                "Content-Transfer-Encoding: base64",
                "",
                base64(body));
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(message.getBytes(StandardCharsets.UTF_8));
    }

    private static String base64(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
