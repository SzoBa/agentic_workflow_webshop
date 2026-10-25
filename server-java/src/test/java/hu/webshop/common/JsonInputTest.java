package hu.webshop.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.stream.Stream;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EmptySource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * A kéréstörzs-olvasás egysége. Se Spring, se adatbázis: minden metódus tiszta függvény
 * egy {@link JsonNode} felett.
 *
 * <p>A hangsúly a HIÁNYZÓ és a ROSSZ TÍPUSÚ érték megkülönböztetésén van — a
 * hibakatalógus két külön üzenete („kötelező" vs. „csak szöveg lehet") erre épül.
 */
class JsonInputTest {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    @Nested
    class Body {

        @Test
        void nullBodyBecomesEmptyObject() {
            JsonNode result = JsonInput.body(null);

            assertThat(result.isObject()).isTrue();
            assertThat(result.size()).isZero();
        }

        @ParameterizedTest(name = "{1} → üres objektum")
        @MethodSource("nonObjectBodies")
        void nonObjectBodyBecomesEmptyObject(JsonNode input, String label) {
            JsonNode result = JsonInput.body(input);

            assertThat(result.isObject()).isTrue();
            assertThat(result.size()).isZero();
        }

        static Stream<Arguments> nonObjectBodies() {
            return Stream.of(
                    arguments(NODES.arrayNode().add(1), "tömb"),
                    arguments(NODES.textNode("szöveg"), "szöveg"),
                    arguments(NODES.numberNode(42), "szám"),
                    arguments(NODES.booleanNode(true), "logikai"),
                    arguments(NODES.nullNode(), "JSON null"));
        }

        @Test
        void returnsObjectBodyUnchanged() {
            ObjectNode input = node("name", NODES.textNode("Kávéfőző"));

            // Ugyanaz a példány: a metódus nem másol, csak őrködik.
            assertThat(JsonInput.body(input)).isSameAs(input);
        }
    }

    @Nested
    class IsMissing {

        @ParameterizedTest(name = "{1} → hiányzik: {2}")
        @MethodSource("missingCases")
        void distinguishesMissingFromPresent(JsonNode body, String label, boolean expected) {
            assertThat(JsonInput.isMissing(body, "mezo")).isEqualTo(expected);
        }

        static Stream<Arguments> missingCases() {
            return Stream.of(
                    arguments(null, "null törzs", true),
                    arguments(NODES.objectNode(), "hiányzó mező", true),
                    arguments(node("mezo", NODES.nullNode()), "JSON null érték", true),
                    arguments(node("mezo", NODES.textNode("")), "üres szöveg", false),
                    arguments(node("mezo", NODES.numberNode(0)), "nulla szám", false),
                    arguments(node("mezo", NODES.booleanNode(false)), "hamis logikai", false));
        }
    }

    @Nested
    class Text {

        @ParameterizedTest(name = "{1} → {2}")
        @MethodSource("textCases")
        void returnsOnlyTextType(JsonNode body, String label, String expected) {
            assertThat(JsonInput.text(body, "mezo")).isEqualTo(expected);
        }

        static Stream<Arguments> textCases() {
            return Stream.of(
                    arguments(NODES.objectNode(), "hiányzó mező", null),
                    arguments(node("mezo", NODES.nullNode()), "JSON null", null),
                    arguments(node("mezo", NODES.numberNode(42)), "szám", null),
                    arguments(node("mezo", NODES.booleanNode(true)), "logikai", null),
                    arguments(node("mezo", NODES.textNode("Kávéfőző")), "szöveg", "Kávéfőző"),
                    // A `text` NEM trimmel — az a `trimmedText` dolga.
                    arguments(node("mezo", NODES.textNode("  Kávéfőző  ")), "körbeszóközös",
                            "  Kávéfőző  "));
        }
    }

    @Nested
    class TrimmedText {

        @Test
        void trimsSurroundingWhitespace() {
            assertThat(JsonInput.trimmedText(node("mezo", NODES.textNode("  Kávéfőző  ")), "mezo"))
                    .isEqualTo("Kávéfőző");
        }

        @Test
        void whitespaceOnlyBecomesEmptyText() {
            assertThat(JsonInput.trimmedText(node("mezo", NODES.textNode("   ")), "mezo")).isEmpty();
        }

        @Test
        void returnsNullForNonTextType() {
            assertThat(JsonInput.trimmedText(node("mezo", NODES.numberNode(42)), "mezo")).isNull();
        }
    }

    @Nested
    class IsPresentButNotText {

        @ParameterizedTest(name = "{1} → {2}")
        @MethodSource("presentNonTextCases")
        void flagsOnlyPresentNonText(JsonNode body, String label, boolean expected) {
            assertThat(JsonInput.isPresentButNotText(body, "mezo")).isEqualTo(expected);
        }

        static Stream<Arguments> presentNonTextCases() {
            return Stream.of(
                    // A hiányzó mező NEM „rossz típus" — arra a „kötelező" üzenet jár.
                    arguments(NODES.objectNode(), "hiányzó mező", false),
                    arguments(node("mezo", NODES.nullNode()), "JSON null", false),
                    arguments(node("mezo", NODES.textNode("szöveg")), "szöveg", false),
                    arguments(node("mezo", NODES.numberNode(42)), "szám", true),
                    arguments(node("mezo", NODES.booleanNode(true)), "logikai", true),
                    arguments(node("mezo", NODES.objectNode()), "objektum", true),
                    arguments(node("mezo", NODES.arrayNode()), "tömb", true));
        }
    }

    @Nested
    class Number {

        @ParameterizedTest(name = "{1} → null")
        @MethodSource("nonNumberValues")
        void returnsNullForNonNumberType(JsonNode body, String label) {
            assertThat(JsonInput.number(body, "mezo")).isNull();
        }

        static Stream<Arguments> nonNumberValues() {
            return Stream.of(
                    arguments(NODES.objectNode(), "hiányzó mező"),
                    arguments(node("mezo", NODES.nullNode()), "JSON null"),
                    // A számot ÁBRÁZOLÓ szöveg sem szám: a típus számít, nem a tartalom.
                    arguments(node("mezo", NODES.textNode("42")), "szöveg"),
                    arguments(node("mezo", NODES.booleanNode(true)), "logikai"));
        }

        @ParameterizedTest(name = "{1} → {2}")
        @MethodSource("numberValues")
        void returnsNumberType(JsonNode body, String label, double expected) {
            assertThat(JsonInput.number(body, "mezo")).isCloseTo(expected, offset(1e-9));
        }

        static Stream<Arguments> numberValues() {
            return Stream.of(
                    arguments(node("mezo", NODES.numberNode(42)), "egész", 42.0),
                    arguments(node("mezo", NODES.numberNode(-7.5)), "negatív tört", -7.5),
                    arguments(node("mezo", NODES.numberNode(0)), "nulla", 0.0));
        }
    }

    @Nested
    class IntegerField {

        @ParameterizedTest(name = "{1} → {2}")
        @MethodSource("integerCases")
        void acceptsOnlyIntegerValuedNumbers(JsonNode body, String label, Integer expected) {
            assertThat(JsonInput.integer(body, "mezo")).isEqualTo(expected);
        }

        static Stream<Arguments> integerCases() {
            return Stream.of(
                    arguments(NODES.objectNode(), "hiányzó mező", null),
                    arguments(node("mezo", NODES.textNode("3")), "szöveg", null),
                    arguments(node("mezo", NODES.numberNode(3)), "egész", 3),
                    // A JSON nem különbözteti meg a 3-at és a 3.0-t.
                    arguments(node("mezo", NODES.numberNode(3.0)), "3.0", 3),
                    arguments(node("mezo", NODES.numberNode(3.5)), "3.5", null),
                    arguments(node("mezo", NODES.numberNode(-4.0)), "-4.0", -4),
                    arguments(node("mezo", NODES.numberNode(0)), "nulla", 0));
        }

        @ParameterizedTest(name = "{1} → null")
        @MethodSource("nonFiniteAndOutOfRangeValues")
        void rejectsNonFiniteAndOutOfRangeValues(JsonNode body, String label) {
            assertThat(JsonInput.integer(body, "mezo")).isNull();
        }

        static Stream<Arguments> nonFiniteAndOutOfRangeValues() {
            return Stream.of(
                    // A +Infinity a `Math.floor`-teszten ÁTMENNE (floor(Inf) == Inf), ezt
                    // kizárólag a Double.isFinite ág fogja meg.
                    arguments(node("mezo", NODES.numberNode(Double.POSITIVE_INFINITY)), "+Infinity"),
                    arguments(node("mezo", NODES.numberNode(Double.NEGATIVE_INFINITY)), "-Infinity"),
                    arguments(node("mezo", NODES.numberNode(Double.NaN)), "NaN"),
                    arguments(node("mezo", NODES.numberNode(2147483648L)), "Integer.MAX_VALUE + 1"),
                    arguments(node("mezo", NODES.numberNode(-2147483649L)),
                            "Integer.MIN_VALUE - 1"));
        }

        @Test
        void intBoundsStillFit() {
            assertThat(JsonInput.integer(node("mezo", NODES.numberNode(Integer.MAX_VALUE)), "mezo"))
                    .isEqualTo(Integer.MAX_VALUE);
            assertThat(JsonInput.integer(node("mezo", NODES.numberNode(Integer.MIN_VALUE)), "mezo"))
                    .isEqualTo(Integer.MIN_VALUE);
        }
    }

    @Nested
    class Bool {

        @ParameterizedTest(name = "{1} → {2}")
        @MethodSource("booleanCases")
        void returnsOnlyBooleanType(JsonNode body, String label, Boolean expected) {
            assertThat(JsonInput.bool(body, "mezo")).isEqualTo(expected);
        }

        static Stream<Arguments> booleanCases() {
            return Stream.of(
                    arguments(NODES.objectNode(), "hiányzó mező", null),
                    arguments(node("mezo", NODES.nullNode()), "JSON null", null),
                    // A "true" SZÖVEG nem logikai érték — a szerződés különbséget tesz.
                    arguments(node("mezo", NODES.textNode("true")), "\"true\" szöveg", null),
                    arguments(node("mezo", NODES.numberNode(1)), "1 szám", null),
                    arguments(node("mezo", NODES.booleanNode(true)), "true", true),
                    arguments(node("mezo", NODES.booleanNode(false)), "false", false));
        }
    }

    @Nested
    class NestedObject {

        @Test
        void missingNestedObjectBecomesEmpty() {
            JsonNode result = JsonInput.object(NODES.objectNode(), "customer");

            assertThat(result.isObject()).isTrue();
            assertThat(result.size()).isZero();
        }

        @Test
        void returnsNestedObject() {
            ObjectNode customer = node("name", NODES.textNode("Teszt Elek"));

            JsonNode result = JsonInput.object(node("customer", customer), "customer");

            assertThat(result).isSameAs(customer);
            assertThat(result.get("name").textValue()).isEqualTo("Teszt Elek");
        }

        @Test
        void nonObjectFieldBecomesEmptyObject() {
            JsonNode result = JsonInput.object(node("customer", NODES.textNode("Teszt Elek")),
                    "customer");

            assertThat(result.isObject()).isTrue();
            assertThat(result.size()).isZero();
        }
    }

    @Nested
    class IsBlank {

        @ParameterizedTest(name = "üresnek számít: [{0}]")
        @NullSource
        @EmptySource
        @ValueSource(strings = {" ", "   ", "\t", "\r\n"})
        void missingAndWhitespaceOnlyAreBlank(String value) {
            assertThat(JsonInput.isBlank(value)).isTrue();
        }

        @ParameterizedTest(name = "nem üres: [{0}]")
        @ValueSource(strings = {"a", " a ", "0", "false"})
        void nonEmptyTextIsNotBlank(String value) {
            assertThat(JsonInput.isBlank(value)).isFalse();
        }
    }

    // --- Fixture ---

    /** Egymezős objektum-törzs; a mező neve mindenhol {@code mezo}. */
    private static ObjectNode node(String field, JsonNode value) {
        ObjectNode body = NODES.objectNode();
        body.set(field, value);
        return body;
    }
}
