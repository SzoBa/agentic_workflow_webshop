package hu.webshop.common;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Kéréstörzs-olvasás típusellenőrzéssel.
 *
 * <p>Miért nem DTO-k kötelező mezőkkel: a szerződés KÜLÖNBSÉGET TESZ a hiányzó és a
 * rossz típusú érték között („a termék neve kötelező" vs. „a szöveges vélemény csak
 * szöveg lehet"), és az üzenetnek egy dinamikusan validált JSON-ból kell származnia.
 * Egy Bean Validation-alapú DTO ezt csak a kivételkezelő átfordításával tudná
 * visszaadni — ez az út egyszerűbb és pontosabb.
 *
 * <p>Minden metódus {@code null}-tűrő: hiányzó törzs esetén üres objektummal
 * dolgozunk, ahogy az {@code express.json()} is teszi.
 */
public final class JsonInput {

    private JsonInput() {
    }

    /** A kéréstörzs objektumként; hiányzó vagy nem objektum törzs esetén üres objektum. */
    public static JsonNode body(JsonNode body) {
        if (body == null || !body.isObject()) {
            return new ObjectNode(JsonNodeFactory.instance);
        }
        return body;
    }

    /** Igaz, ha a mező hiányzik vagy {@code null}. */
    public static boolean isMissing(JsonNode body, String field) {
        JsonNode node = body(body).get(field);
        return node == null || node.isNull();
    }

    /** A mező szövegként, ha SZÖVEG típusú — különben {@code null}. */
    public static String text(JsonNode body, String field) {
        JsonNode node = body(body).get(field);
        return node != null && node.isTextual() ? node.textValue() : null;
    }

    /** A mező trimmelt szövegként, ha szöveg — különben {@code null}. */
    public static String trimmedText(JsonNode body, String field) {
        String value = text(body, field);
        return value == null ? null : value.trim();
    }

    /** Igaz, ha a mező jelen van, de NEM szöveg (a „csak szöveg lehet" üzenetekhez). */
    public static boolean isPresentButNotText(JsonNode body, String field) {
        JsonNode node = body(body).get(field);
        return node != null && !node.isNull() && !node.isTextual();
    }

    /** A mező számként, ha szám típusú — különben {@code null}. */
    public static Double number(JsonNode body, String field) {
        JsonNode node = body(body).get(field);
        return node != null && node.isNumber() ? node.doubleValue() : null;
    }

    /**
     * A mező EGÉSZ számként, ha szám és egész értékű — különben {@code null}.
     * A {@code 3.0} egésznek számít (a JSON nem különbözteti meg), a {@code 3.5} nem.
     */
    public static Integer integer(JsonNode body, String field) {
        Double value = number(body, field);
        if (value == null || !Double.isFinite(value) || value != Math.floor(value)) {
            return null;
        }
        if (value > Integer.MAX_VALUE || value < Integer.MIN_VALUE) {
            return null;
        }
        return (int) (double) value;
    }

    /** A mező logikai értékként, ha logikai típusú — különben {@code null}. */
    public static Boolean bool(JsonNode body, String field) {
        JsonNode node = body(body).get(field);
        return node != null && node.isBoolean() ? node.booleanValue() : null;
    }

    /** Egy beágyazott objektum (pl. {@code customer}); hiányzó esetén üres objektum. */
    public static JsonNode object(JsonNode body, String field) {
        return body(body(body).get(field));
    }

    /** Igaz, ha a szöveg hiányzik, üres vagy csak whitespace. */
    public static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
