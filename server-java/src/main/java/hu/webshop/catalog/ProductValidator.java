package hu.webshop.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.ApiException;
import hu.webshop.common.JsonInput;
import hu.webshop.common.Messages;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Termékvalidáció — a létrehozás és a teljes csere KÖZÖS szabályai.
 *
 * <p>Miért közös osztály: a {@code POST} és a {@code PUT} ugyanazokat a szabályokat
 * érvényesíti, és duplikálva a kettő garantáltan elcsúszna egymástól. A validáció az ELSŐ
 * hibánál megáll, tehát egyszerre egy üzenet megy vissza; a sorrend és a szövegek a
 * {@code spec/backend/hibakatalogus.md} „Termékvalidáció" szakaszát követik.
 *
 * <p>A kép MÉRETÉT (400*300) a szerkesztő felület ellenőrzi — a szerver a képet nem tölti
 * le, csak a hivatkozás formátumát nézi.
 */
public final class ProductValidator {

    private static final int MAX_NAME_LENGTH = 50;
    private static final int MAX_DESCRIPTION_LENGTH = 100;

    private ProductValidator() {
    }

    /**
     * A validált, tárolásra kész termékmezők. A szövegek TRIMMELVE.
     *
     * <p>Az {@code active} azért {@link Boolean}: a {@code null} azt jelenti, hogy a kérés
     * NEM nyilatkozott az aktivitásról. A két írási végpont ilyenkor mást tesz —
     * létrehozáskor az alapérték {@code true}, cserénél a termék meglévő állapota marad.
     */
    public record ProductFields(String name, String description, int price, String imageUrl,
            int stock, String category, Boolean active) {
    }

    /**
     * A kéréstörzs validálása és tiszta mezőkké alakítása. Hiba esetén 400-as
     * {@link ApiException}-t dob az első hibás mező üzenetével.
     */
    public static ProductFields validate(JsonNode requestBody) {
        JsonNode body = JsonInput.body(requestBody);

        String name = JsonInput.trimmedText(body, "name");
        if (JsonInput.isBlank(name)) {
            throw ApiException.badRequest(Messages.PRODUCT_NAME_REQUIRED);
        }
        if (name.length() > MAX_NAME_LENGTH) {
            throw ApiException.badRequest(Messages.PRODUCT_NAME_TOO_LONG);
        }

        String description = JsonInput.trimmedText(body, "description");
        if (JsonInput.isBlank(description)) {
            throw ApiException.badRequest(Messages.PRODUCT_DESCRIPTION_REQUIRED);
        }
        if (description.length() > MAX_DESCRIPTION_LENGTH) {
            throw ApiException.badRequest(Messages.PRODUCT_DESCRIPTION_TOO_LONG);
        }

        // A JsonInput.integer a törtet, a nem szám típust és a hiányzó mezőt is kizárja.
        Integer price = JsonInput.integer(body, "price");
        if (price == null || price <= 0) {
            throw ApiException.badRequest(Messages.PRODUCT_PRICE_INVALID);
        }

        // A készlet megadása kötelező: a hiányzó mező is itt akad el.
        Integer stock = JsonInput.integer(body, "stock");
        if (stock == null || stock < 0) {
            throw ApiException.badRequest(Messages.PRODUCT_STOCK_INVALID);
        }

        String category = JsonInput.trimmedText(body, "category");
        if (JsonInput.isBlank(category)) {
            throw ApiException.badRequest(Messages.PRODUCT_CATEGORY_REQUIRED);
        }

        String imageUrl = JsonInput.trimmedText(body, "imageUrl");
        if (JsonInput.isBlank(imageUrl)) {
            throw ApiException.badRequest(Messages.PRODUCT_IMAGE_REQUIRED);
        }
        if (!isHttpUrl(imageUrl)) {
            throw ApiException.badRequest(Messages.PRODUCT_IMAGE_INVALID);
        }

        // Az `active` opcionális; jelen lévő, de nem logikai érték viszont hiba.
        return new ProductFields(name, description, price, imageUrl, stock, category,
                optionalActive(body));
    }

    /**
     * Az {@code active} mező kiolvasása. Hiányzó mező esetén {@code null} (a hívó dönt a
     * jelentéséről); jelen lévő, de nem logikai érték (a JSON {@code null}-t is beleértve)
     * esetén 400.
     */
    private static Boolean optionalActive(JsonNode body) {
        JsonNode node = body.get("active");
        if (node == null) {
            return null;
        }
        if (!node.isBoolean()) {
            throw ApiException.badRequest(Messages.PRODUCT_ACTIVE_INVALID);
        }
        return node.booleanValue();
    }

    /**
     * A kizárólag aktivitást váltó végpont bemenete: az {@code active} itt KÖTELEZŐ és
     * logikai — a hiányzó mező is hiba, különben a kérés némán nem csinálna semmit.
     */
    public static boolean requiredActive(JsonNode requestBody) {
        Boolean active = JsonInput.bool(JsonInput.body(requestBody), "active");
        if (active == null) {
            throw ApiException.badRequest(Messages.PRODUCT_ACTIVE_INVALID);
        }
        return active;
    }

    /**
     * Igaz, ha a szöveg értelmezhető http(s) hivatkozásként.
     *
     * <p>A referencia a JS {@code new URL(value)} konstruktorát használja; a lényegi
     * szabály mindkét oldalon ugyanaz: legyen séma, és az {@code http} vagy {@code https}
     * legyen. A két URL-elemző a mindennapi bemeneteken (abszolút URL vs. sima szöveg)
     * egyformán dönt, csak egzotikus alakoknál térhet el.
     */
    private static boolean isHttpUrl(String value) {
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (scheme == null) {
                return false;
            }
            String lower = scheme.toLowerCase(Locale.ROOT);
            return "http".equals(lower) || "https".equals(lower);
        } catch (URISyntaxException ex) {
            return false;
        }
    }
}
