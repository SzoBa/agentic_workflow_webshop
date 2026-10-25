package hu.webshop.ops;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Az SPA-visszaesés egyetlen kockázatos döntése: mi számít API útvonalnak (spec 7.5).
 *
 * <p>Ez a szabály dönti el, hogy egy ismeretlen {@code /api/...} kérés HTML-t kap-e az
 * {@code index.html}-ből — ezért külön, integrációs futtatás nélkül is mérhető.
 */
class SpaResourceConfigTest {

    @Test
    void apiPathsNeverFallBackToIndex() {
        assertThat(SpaResourceConfig.isApiPath("api/products")).isTrue();
        assertThat(SpaResourceConfig.isApiPath("/api/products")).isTrue();
        assertThat(SpaResourceConfig.isApiPath("api")).isTrue();
    }

    @Test
    void otherPathsFallBackToIndex() {
        assertThat(SpaResourceConfig.isApiPath("")).isFalse();
        assertThat(SpaResourceConfig.isApiPath("termekek/p1")).isFalse();
        assertThat(SpaResourceConfig.isApiPath("assets/index-abc123.js")).isFalse();
        // Nem elég a prefix-egyezés: az „apirol" oldal nem API útvonal.
        assertThat(SpaResourceConfig.isApiPath("apirol")).isFalse();
    }
}
