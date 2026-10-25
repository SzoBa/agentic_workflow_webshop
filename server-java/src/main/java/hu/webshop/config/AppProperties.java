package hu.webshop.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * A spec 7.6 fejezetének konfigurációs kulcsai.
 *
 * <p>A numerikus értékek szövegként kötődnek, és a {@link #positive}, illetve a
 * {@link #nonNegativeInt} olvassa ki őket. Ez szándékos: a hiányzó, nem szám, nem
 * véges vagy tartományon kívüli értéket egyaránt az alapértelmezésre cseréljük —
 * indulási hiba helyett.
 *
 * <p>Biztonsági kulcsoknál (lásd {@link #trustedProxyHops}) az alapértelmezés
 * egyben a SZIGORÚBB ág, hogy egy elírt konfiguráció ne bizalomra váltson.
 */
@ConfigurationProperties(prefix = "webshop")
public class AppProperties {

    /** A foglalás alapértelmezett élettartama órában. */
    public static final double DEFAULT_RESERVATION_HOURS = 72;

    /** A munkamenet alapértelmezett élettartama órában (7 nap). */
    public static final double DEFAULT_TOKEN_TTL_HOURS = 168;

    /** A lejárati kör alapértelmezett gyakorisága percben. */
    public static final double DEFAULT_SWEEP_MINUTES = 5;

    /** Alapból NINCS megbízható proxy: az X-Forwarded-For fejlécet nem olvassuk. */
    public static final int DEFAULT_TRUSTED_PROXY_HOPS = 0;

    private String orderReservationHours;
    private String tokenTtlHours;
    private String expirySweepMinutes;
    private String trustedProxyHops;
    private String corsOrigins;
    private String gmailClientId;
    private String gmailClientSecret;
    private String gmailRefreshToken;
    private String gmailSender;
    private String orderNotifyTo;
    private String importFile;

    /** A foglalási idő órában (ORDER_RESERVATION_HOURS). */
    public double reservationHours() {
        return positive(orderReservationHours, DEFAULT_RESERVATION_HOURS);
    }

    /** A munkamenet élettartama órában (TOKEN_TTL_HOURS). */
    public double tokenTtlHours() {
        return positive(tokenTtlHours, DEFAULT_TOKEN_TTL_HOURS);
    }

    /** A lejárati kör gyakorisága percben (ORDER_EXPIRY_SWEEP_MINUTES). */
    public double sweepMinutes() {
        return positive(expirySweepMinutes, DEFAULT_SWEEP_MINUTES);
    }

    /**
     * Hány MEGBÍZHATÓ proxy áll a kliens és a szerver között
     * ({@code TRUSTED_PROXY_HOPS}) — a {@link hu.webshop.auth.ClientIpResolver} ennyi
     * elemet számol vissza az {@code X-Forwarded-For} lánc végéről.
     *
     * <p>Miért szám, és miért nem boolean: egy be/ki kapcsoló csak arra válaszol, hogy
     * RÁNÉZZÜNK-e a fejlécre, arra nem, hogy MELYIK eleme megbízható. A láncnak csak a
     * jobb vége az, amit a saját proxyink írtak — a bal széle a kliensé, tehát
     * hamisítható. A hop-szám az az egyetlen adat, amit a támadó nem tud befolyásolni.
     *
     * <p>Érvénytelen vagy negatív érték esetén 0, azaz a biztonságos ág: a fejléc
     * figyelmen kívül marad. Ez az osztály általános elve (indulási hiba helyett
     * alapértelmezés), és itt egyben a „secure by default" is.
     */
    public int trustedProxyHops() {
        return nonNegativeInt(trustedProxyHops, DEFAULT_TRUSTED_PROXY_HOPS);
    }

    /**
     * Az engedélyezett CORS eredetek. Üres konfiguráció esetén üres lista — ilyenkor
     * a válaszban EGYÁLTALÁN nincs CORS fejléc (K-76).
     */
    public List<String> corsOrigins() {
        if (corsOrigins == null || corsOrigins.isBlank()) {
            return List.of();
        }
        return Arrays.stream(corsOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }

    /** Egy nem negatív egész a konfigurációból; érvénytelen érték esetén az alapértelmezés. */
    private static int nonNegativeInt(String raw, int fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            int value = Integer.parseInt(raw.trim());
            return value >= 0 ? value : fallback;
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    /** Egy pozitív szám a konfigurációból; érvénytelen érték esetén az alapértelmezés. */
    private static double positive(String raw, double fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            double value = Double.parseDouble(raw.trim());
            return Double.isFinite(value) && value > 0 ? value : fallback;
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    // --- Getterek/setterek: a Spring binding ezeket használja. ---

    public String getOrderReservationHours() {
        return orderReservationHours;
    }

    public void setOrderReservationHours(String orderReservationHours) {
        this.orderReservationHours = orderReservationHours;
    }

    public String getTokenTtlHours() {
        return tokenTtlHours;
    }

    public void setTokenTtlHours(String tokenTtlHours) {
        this.tokenTtlHours = tokenTtlHours;
    }

    public String getExpirySweepMinutes() {
        return expirySweepMinutes;
    }

    public void setExpirySweepMinutes(String expirySweepMinutes) {
        this.expirySweepMinutes = expirySweepMinutes;
    }

    public String getTrustedProxyHops() {
        return trustedProxyHops;
    }

    public void setTrustedProxyHops(String trustedProxyHops) {
        this.trustedProxyHops = trustedProxyHops;
    }

    public String getCorsOrigins() {
        return corsOrigins;
    }

    public void setCorsOrigins(String corsOrigins) {
        this.corsOrigins = corsOrigins;
    }

    public String getGmailClientId() {
        return gmailClientId;
    }

    public void setGmailClientId(String gmailClientId) {
        this.gmailClientId = gmailClientId;
    }

    public String getGmailClientSecret() {
        return gmailClientSecret;
    }

    public void setGmailClientSecret(String gmailClientSecret) {
        this.gmailClientSecret = gmailClientSecret;
    }

    public String getGmailRefreshToken() {
        return gmailRefreshToken;
    }

    public void setGmailRefreshToken(String gmailRefreshToken) {
        this.gmailRefreshToken = gmailRefreshToken;
    }

    public String getGmailSender() {
        return gmailSender;
    }

    public void setGmailSender(String gmailSender) {
        this.gmailSender = gmailSender;
    }

    public String getOrderNotifyTo() {
        return orderNotifyTo;
    }

    public void setOrderNotifyTo(String orderNotifyTo) {
        this.orderNotifyTo = orderNotifyTo;
    }

    /**
     * Egy meglévő lowdb {@code db.json} útvonala EGYSZERI átvételhez
     * ({@code IMPORT_FILE}). Üresen nincs import — ez a normál üzem.
     */
    public String getImportFile() {
        return importFile;
    }

    public void setImportFile(String importFile) {
        this.importFile = importFile;
    }
}
