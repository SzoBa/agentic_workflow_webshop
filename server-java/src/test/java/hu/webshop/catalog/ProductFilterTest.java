package hu.webshop.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * A query paraméterek szűrővé alakításának egysége.
 *
 * <p>A határesetek itt nem kényelmi kérdések, hanem a HTTP-szerződés részei: a nem szám
 * {@code minPrice} némán kimarad, az üres {@code category} nem szűr, és kizárólag a
 * {@code "true"} kapcsolja be az {@code inStock}-ot. A tesztek ezért mindkét gyártófüggvényt
 * ugyanazokon a bemeneteken mérik.
 */
class ProductFilterTest {

    @Nested
    class Customer {

        @Test
        void allValidParametersAreParsed() {
            ProductFilter filter = ProductFilter.customer("Otthon", "1000", "5000", "kávé", "true");

            assertThat(filter.category()).isEqualTo("Otthon");
            assertThat(filter.minPrice()).isCloseTo(1000.0, offset(1e-9));
            assertThat(filter.maxPrice()).isCloseTo(5000.0, offset(1e-9));
            assertThat(filter.search()).isEqualTo("kávé");
            assertThat(filter.inStock()).isTrue();
            // A vásárlói forrás eleve csak aktív termékeket tartalmaz — nincs mit szűrni.
            assertThat(filter.status()).isEqualTo(ProductFilter.Status.ALL);
        }

        @Test
        void allNullParametersLeaveEveryAspectOut() {
            ProductFilter filter = ProductFilter.customer(null, null, null, null, null);

            assertThat(filter.category()).isNull();
            assertThat(filter.minPrice()).isNull();
            assertThat(filter.maxPrice()).isNull();
            assertThat(filter.search()).isNull();
            assertThat(filter.inStock()).isFalse();
            assertThat(filter.status()).isEqualTo(ProductFilter.Status.ALL);
        }

        @Test
        void onlyExactTrueEnablesStockFilter() {
            assertThat(ProductFilter.customer(null, null, null, null, "true").inStock()).isTrue();
        }

        @ParameterizedTest(name = "inStock = [{0}] → nem szűr")
        @NullAndEmptySource
        @ValueSource(strings = {"TRUE", "True", "1", "igen", "yes", "false", " true "})
        void anythingElseLeavesStockFilterOff(String inStock) {
            assertThat(ProductFilter.customer(null, null, null, null, inStock).inStock()).isFalse();
        }

        @Test
        void statusIsAlwaysAll() {
            assertThat(ProductFilter.customer("Otthon", "1", "2", "x", "true").status())
                    .isEqualTo(ProductFilter.Status.ALL);
        }
    }

    @Nested
    class Admin {

        @Test
        void allValidParametersAreParsed() {
            ProductFilter filter = ProductFilter.admin("Otthon", "1000", "5000", "kávé", "active");

            assertThat(filter.category()).isEqualTo("Otthon");
            assertThat(filter.minPrice()).isCloseTo(1000.0, offset(1e-9));
            assertThat(filter.maxPrice()).isCloseTo(5000.0, offset(1e-9));
            assertThat(filter.search()).isEqualTo("kávé");
            assertThat(filter.status()).isEqualTo(ProductFilter.Status.ACTIVE);
        }

        @ParameterizedTest(name = "status = [{0}] → {1}")
        @CsvSource(nullValues = "NULL", value = {
            "active,    ACTIVE",
            "inactive,  INACTIVE",
            "all,       ALL",
            // Ismeretlen vagy elgépelt érték → ALL: egy elütés ne rejtse el némán a
            // termékek felét az admin elől.
            "NULL,      ALL",
            "'',        ALL",
            "ACTIVE,    ALL",
            "Active,    ALL",
            "aktiv,     ALL",
            "' active', ALL"
        })
        void parsesStatusParameter(String status, ProductFilter.Status expected) {
            assertThat(ProductFilter.admin(null, null, null, null, status).status())
                    .isEqualTo(expected);
        }

        @Test
        void inStockNeverFiltersOnAdminList() {
            // Az admin táblázat a reserved/available oszlopokkal dolgozik, nem szűréssel.
            assertThat(ProductFilter.admin("Otthon", "1", "2", "x", "active").inStock()).isFalse();
        }
    }

    @Nested
    class TextAspects {

        @ParameterizedTest(name = "category = [{0}] → nem szűr")
        @NullAndEmptySource
        @ValueSource(strings = {" ", "   ", "\t"})
        void blankCategoryDoesNotFilter(String category) {
            assertThat(ProductFilter.customer(category, null, null, null, null).category()).isNull();
            assertThat(ProductFilter.admin(category, null, null, null, null).category()).isNull();
        }

        @ParameterizedTest(name = "[{0}] → [{1}]")
        @CsvSource({
            "' Otthon ',  Otthon",
            "Otthon,      Otthon",
            "'  Kis kert', 'Kis kert'"
        })
        void categoryAndSearchAreTrimmed(String raw, String expected) {
            assertThat(ProductFilter.customer(raw, null, null, null, null).category())
                    .isEqualTo(expected);
            assertThat(ProductFilter.customer(null, null, null, raw, null).search())
                    .isEqualTo(expected);
            assertThat(ProductFilter.admin(raw, null, null, null, null).category())
                    .isEqualTo(expected);
            assertThat(ProductFilter.admin(null, null, null, raw, null).search())
                    .isEqualTo(expected);
        }
    }

    @Nested
    class PriceAspects {

        @ParameterizedTest(name = "minPrice = [{0}] → {1}")
        @CsvSource({
            "1000,   1000.0",
            "99.5,   99.5",
            "0,      0.0",
            "-100,   -100.0",
            // A JS Number("") nulla — a szerződés ezt a szemantikát követi, tehát az
            // ÜRES paraméter 0-ra szűr, nem hagyja ki a szempontot.
            "'',     0.0",
            "'  ',   0.0",
            "1e3,    1000.0"
        })
        void parsesNumericValues(String raw, double expected) {
            assertThat(ProductFilter.customer(null, raw, null, null, null).minPrice())
                    .isCloseTo(expected, offset(1e-9));
            assertThat(ProductFilter.admin(null, raw, null, null, null).minPrice())
                    .isCloseTo(expected, offset(1e-9));
        }

        @ParameterizedTest(name = "minPrice = [{0}] → a szempont kimarad")
        @ValueSource(strings = {"abc", "12abc", "Infinity", "-Infinity", "NaN", "1,5"})
        void nonNumericValueDropsTheAspect(String raw) {
            assertThat(ProductFilter.customer(null, raw, null, null, null).minPrice()).isNull();
            assertThat(ProductFilter.admin(null, raw, null, null, null).minPrice()).isNull();
        }

        @Test
        void missingPriceParameterDoesNotFilter() {
            ProductFilter filter = ProductFilter.customer(null, null, null, null, null);

            assertThat(filter.minPrice()).isNull();
            assertThat(filter.maxPrice()).isNull();
        }

        @Test
        void maxPriceIsParsedLikeMinPrice() {
            assertThat(ProductFilter.customer(null, null, "5000", null, null).maxPrice())
                    .isCloseTo(5000.0, offset(1e-9));
            assertThat(ProductFilter.customer(null, null, "abc", null, null).maxPrice()).isNull();
            assertThat(ProductFilter.admin(null, null, "5000", null, null).maxPrice())
                    .isCloseTo(5000.0, offset(1e-9));
            assertThat(ProductFilter.admin(null, null, "abc", null, null).maxPrice()).isNull();
        }
    }
}
