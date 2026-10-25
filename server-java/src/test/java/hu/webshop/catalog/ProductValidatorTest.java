package hu.webshop.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import hu.webshop.catalog.ProductValidator.ProductFields;
import hu.webshop.common.ApiException;
import hu.webshop.common.Messages;
import java.util.stream.Stream;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;

/**
 * A termékvalidáció egysége. Spring és adatbázis nélkül fut: a szabályok tiszta
 * függvények a kéréstörzs felett.
 *
 * <p>A hibaüzenetek a {@link Messages} konstansaival vannak összevetve, nem szó szerint
 * másolva — a szövegek a hibakatalógus tulajdonai, a tesztnek a SZABÁLYT kell rögzítenie.
 *
 * <p>Külön figyelem a hibák SORRENDJÉRE: a validáció az első hibánál megáll, tehát
 * egyszerre egy üzenet megy vissza.
 */
class ProductValidatorTest {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    @Nested
    class Validate {

        @Test
        void validProductFieldsAreTrimmed() {
            ObjectNode body = validProduct();
            body.put("name", "  Kávéfőző  ");
            body.put("description", "  Kis presszógép  ");
            body.put("category", "  Otthon  ");
            body.put("imageUrl", "  https://pelda.hu/kep.png  ");
            body.put("price", 24_990);
            body.put("stock", 7);

            ProductFields fields = ProductValidator.validate(body);

            assertThat(fields.name()).isEqualTo("Kávéfőző");
            assertThat(fields.description()).isEqualTo("Kis presszógép");
            assertThat(fields.category()).isEqualTo("Otthon");
            assertThat(fields.imageUrl()).isEqualTo("https://pelda.hu/kep.png");
            assertThat(fields.price()).isEqualTo(24_990);
            assertThat(fields.stock()).isEqualTo(7);
            // Az `active` hiányzik → null, NEM false: a hívó dönt a jelentéséről.
            assertThat(fields.active()).isNull();
        }

        @ParameterizedTest(name = "{1} → {2}")
        @MethodSource("invalidFields")
        void rejectsInvalidField(ObjectNode body, String label, String expectedMessage) {
            ApiException ex = assertThrows(ApiException.class,
                    () -> ProductValidator.validate(body));

            assertThat(ex).hasMessage(expectedMessage);
            assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        static Stream<Arguments> invalidFields() {
            return Stream.of(
                    arguments(without("name"), "hiányzó név", Messages.PRODUCT_NAME_REQUIRED),
                    arguments(withField("name", ""), "üres név", Messages.PRODUCT_NAME_REQUIRED),
                    arguments(withField("name", "   "), "csupa szóköz név",
                            Messages.PRODUCT_NAME_REQUIRED),
                    arguments(withNumberField("name", 42), "nem szöveg típusú név",
                            Messages.PRODUCT_NAME_REQUIRED),

                    arguments(without("description"), "hiányzó leírás",
                            Messages.PRODUCT_DESCRIPTION_REQUIRED),
                    arguments(withField("description", "   "), "csupa szóköz leírás",
                            Messages.PRODUCT_DESCRIPTION_REQUIRED),

                    arguments(without("price"), "hiányzó ár", Messages.PRODUCT_PRICE_INVALID),
                    arguments(withField("price", "24990"), "szöveges ár",
                            Messages.PRODUCT_PRICE_INVALID),
                    arguments(withNumberField("price", 2.5), "tört ár",
                            Messages.PRODUCT_PRICE_INVALID),

                    arguments(without("stock"), "hiányzó készlet", Messages.PRODUCT_STOCK_INVALID),
                    arguments(withNumberField("stock", 1.5), "tört készlet",
                            Messages.PRODUCT_STOCK_INVALID),

                    arguments(without("category"), "hiányzó kategória",
                            Messages.PRODUCT_CATEGORY_REQUIRED),
                    arguments(withField("category", "  "), "csupa szóköz kategória",
                            Messages.PRODUCT_CATEGORY_REQUIRED),

                    arguments(without("imageUrl"), "hiányzó kép", Messages.PRODUCT_IMAGE_REQUIRED),
                    arguments(withField("imageUrl", " "), "csupa szóköz kép",
                            Messages.PRODUCT_IMAGE_REQUIRED));
        }

        @Test
        void missingBodyFailsOnFirstRule() {
            assertThatThrownBy(() -> ProductValidator.validate(null))
                    .isInstanceOf(ApiException.class)
                    .hasMessage(Messages.PRODUCT_NAME_REQUIRED);
        }

        @Test
        void firstRuleMessageWinsForMultipleInvalidFields() {
            // Minden mező hibás; a hibakatalógus sorrendje szerint a névé az elsőbbség.
            ObjectNode body = NODES.objectNode();
            body.put("name", "");
            body.put("description", "");
            body.put("price", 0);
            body.put("stock", -1);
            body.put("category", "");
            body.put("imageUrl", "");

            assertThatThrownBy(() -> ProductValidator.validate(body))
                    .hasMessage(Messages.PRODUCT_NAME_REQUIRED);
        }

        @ParameterizedTest(name = "{0} karakteres név átmegy")
        @ValueSource(ints = {1, 49, 50})
        void acceptsNameUpToLimit(int length) {
            ObjectNode body = validProduct();
            body.put("name", "x".repeat(length));

            assertThat(ProductValidator.validate(body).name()).hasSize(length);
        }

        @Test
        void rejectsFiftyOneCharacterName() {
            ObjectNode body = validProduct();
            body.put("name", "x".repeat(51));

            assertThatThrownBy(() -> ProductValidator.validate(body))
                    .hasMessage(Messages.PRODUCT_NAME_TOO_LONG);
        }

        @ParameterizedTest(name = "{0} karakteres leírás átmegy")
        @ValueSource(ints = {1, 99, 100})
        void acceptsDescriptionUpToLimit(int length) {
            ObjectNode body = validProduct();
            body.put("description", "x".repeat(length));

            assertThat(ProductValidator.validate(body).description()).hasSize(length);
        }

        @Test
        void rejectsHundredAndOneCharacterDescription() {
            ObjectNode body = validProduct();
            body.put("description", "x".repeat(101));

            assertThatThrownBy(() -> ProductValidator.validate(body))
                    .hasMessage(Messages.PRODUCT_DESCRIPTION_TOO_LONG);
        }

        @ParameterizedTest(name = "ár = {0} Ft átmegy")
        @ValueSource(ints = {1, 2, 24_990, Integer.MAX_VALUE})
        void acceptsPositivePrice(int price) {
            ObjectNode body = validProduct();
            body.put("price", price);

            assertThat(ProductValidator.validate(body).price()).isEqualTo(price);
        }

        @ParameterizedTest(name = "ár = {0} Ft elbukik")
        @ValueSource(ints = {0, -1, -24_990})
        void rejectsNonPositivePrice(int price) {
            ObjectNode body = validProduct();
            body.put("price", price);

            assertThatThrownBy(() -> ProductValidator.validate(body))
                    .hasMessage(Messages.PRODUCT_PRICE_INVALID);
        }

        @ParameterizedTest(name = "készlet = {0} db átmegy")
        @ValueSource(ints = {0, 1, 1000})
        void acceptsNonNegativeStock(int stock) {
            ObjectNode body = validProduct();
            body.put("stock", stock);

            assertThat(ProductValidator.validate(body).stock()).isEqualTo(stock);
        }

        @ParameterizedTest(name = "készlet = {0} db elbukik")
        @ValueSource(ints = {-1, -100})
        void rejectsNegativeStock(int stock) {
            ObjectNode body = validProduct();
            body.put("stock", stock);

            assertThatThrownBy(() -> ProductValidator.validate(body))
                    .hasMessage(Messages.PRODUCT_STOCK_INVALID);
        }

        @ParameterizedTest(name = "érvényes kép: {0}")
        @ValueSource(strings = {
            "http://pelda.hu/kep.png",
            "https://pelda.hu/kep.png",
            // A séma kis-nagybetűtől független.
            "HTTPS://PELDA.HU/KEP.PNG",
            "https://pelda.hu:8443/kep.png?w=400&h=300"
        })
        void acceptsHttpImageUrl(String url) {
            ObjectNode body = validProduct();
            body.put("imageUrl", url);

            assertThat(ProductValidator.validate(body).imageUrl()).isEqualTo(url);
        }

        @ParameterizedTest(name = "érvénytelen kép: {0}")
        @ValueSource(strings = {
            "pelda.hu/kep.png",       // nincs séma
            "/kepek/kep.png",         // relatív útvonal
            "ftp://pelda.hu/kep.png", // nem http(s) séma
            "data:image/png;base64,AAAA",
            "http://pelda hu/kep.png" // szóköz → URISyntaxException
        })
        void rejectsNonHttpImageUrl(String url) {
            ObjectNode body = validProduct();
            body.put("imageUrl", url);

            assertThatThrownBy(() -> ProductValidator.validate(body))
                    .hasMessage(Messages.PRODUCT_IMAGE_INVALID);
        }

        @Test
        void missingActiveStaysNull() {
            assertThat(ProductValidator.validate(validProduct()).active()).isNull();
        }

        @ParameterizedTest(name = "active = {0}")
        @ValueSource(booleans = {true, false})
        void takesOverProvidedActive(boolean active) {
            ObjectNode body = validProduct();
            body.put("active", active);

            assertThat(ProductValidator.validate(body).active()).isEqualTo(active);
        }

        @ParameterizedTest(name = "{1} → 400")
        @MethodSource("nonBooleanActiveValues")
        void rejectsNonBooleanActive(ObjectNode body, String label) {
            assertThatThrownBy(() -> ProductValidator.validate(body))
                    .hasMessage(Messages.PRODUCT_ACTIVE_INVALID);
        }

        static Stream<Arguments> nonBooleanActiveValues() {
            return Stream.of(
                    arguments(withField("active", "true"), "\"true\" szöveg"),
                    arguments(withNumberField("active", 1), "1 szám"),
                    // A JSON null sem logikai érték — a szabály szándékosan szigorú.
                    arguments(withNullField("active"), "JSON null"));
        }
    }

    @Nested
    class RequiredActive {

        @ParameterizedTest(name = "active = {0}")
        @ValueSource(booleans = {true, false})
        void returnsProvidedBooleanValue(boolean active) {
            ObjectNode body = NODES.objectNode();
            body.put("active", active);

            assertThat(ProductValidator.requiredActive(body)).isEqualTo(active);
        }

        @ParameterizedTest(name = "{1} → 400")
        @MethodSource("invalidBodies")
        void requiresBooleanValue(ObjectNode body, String label) {
            assertThatThrownBy(() -> ProductValidator.requiredActive(body))
                    .isInstanceOf(ApiException.class)
                    .hasMessage(Messages.PRODUCT_ACTIVE_INVALID);
        }

        static Stream<Arguments> invalidBodies() {
            return Stream.of(
                    arguments(NODES.objectNode(), "hiányzó mező"),
                    arguments(withField("active", "true"), "\"true\" szöveg"),
                    arguments(withNumberField("active", 0), "0 szám"),
                    arguments(withNullField("active"), "JSON null"));
        }

        @Test
        void missingBodyIsAlsoInvalid() {
            // A hiányzó törzs némán nem csinálna semmit — ezért 400.
            assertThatThrownBy(() -> ProductValidator.requiredActive(null))
                    .hasMessage(Messages.PRODUCT_ACTIVE_INVALID);
        }
    }

    // --- Fixture ---

    /** Minden mezőn érvényes alapérték; a tesztek csak a vizsgált mezőt írják felül. */
    private static ObjectNode validProduct() {
        ObjectNode body = NODES.objectNode();
        body.put("name", "Kávéfőző");
        body.put("description", "Kis presszógép otthonra");
        body.put("price", 24_990);
        body.put("stock", 7);
        body.put("category", "Otthon");
        body.put("imageUrl", "https://pelda.hu/kep.png");
        return body;
    }

    private static ObjectNode without(String field) {
        ObjectNode body = validProduct();
        body.remove(field);
        return body;
    }

    private static ObjectNode withField(String field, String value) {
        ObjectNode body = validProduct();
        body.put(field, value);
        return body;
    }

    private static ObjectNode withNumberField(String field, double value) {
        ObjectNode body = validProduct();
        body.put(field, value);
        return body;
    }

    private static ObjectNode withNullField(String field) {
        ObjectNode body = validProduct();
        body.putNull(field);
        return body;
    }
}
