package hu.webshop.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;

/**
 * A hiányzó adatbázis-jelszó indulási hibát ad (spec 7.6).
 *
 * <p>Miért kell rá teszt, holott „csak egy if": ez a szabály maga a követelmény — a
 * hitelesítő adatnak nincs alapértéke, tehát a hiányának HANGOSNAK kell lennie. A
 * mechanizmus ráadásul szövegre van kötve ({@link DatabasePasswordCheck#UNRESOLVED}): ha
 * valaki az {@code application.yml}-ben {@code ${DATABASE_PASSWORD}}-ról
 * {@code ${DATABASE_PASSWORD:}}-ra vált, az ellenőrzés CSENDBEN hatástalanná válna, és a
 * szerver üres jelszóval próbálna csatlakozni. Ez a teszt az a fogás, ami ilyenkor
 * megszólal.
 *
 * <p>Miért nem integrációs teszt: a Testcontainers minden kontextusba beinjektálja a
 * jelszót, tehát a hiányát ott nem lehet előállítani anélkül, hogy a teszt-infrastruktúrát
 * kikapcsolnánk. A vizsgált egység viszont egyetlen tiszta függvény a bean fölött.
 */
class DatabasePasswordCheckTest {

    private final DatabasePasswordCheck check = new DatabasePasswordCheck();

    private DataSourceProperties propertiesWithPassword(String password) {
        DataSourceProperties properties = new DataSourceProperties();
        properties.setPassword(password);
        return properties;
    }

    private void postProcess(String password) {
        check.postProcessAfterInitialization(propertiesWithPassword(password), "dataSourceProperties");
    }

    /**
     * A feloldatlan helyőrző: a Spring a be nem állított környezeti változót nem hibának
     * tekinti, hanem szó szerint továbbadja. Ellenőrzés nélkül a szerver a
     * {@code "${DATABASE_PASSWORD}"} sztringgel jelentkezne be.
     */
    @Test
    void afeloldatlanHelyorzoIndulasiHiba() {
        assertThatThrownBy(() -> postProcess(DatabasePasswordCheck.UNRESOLVED))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage(DatabasePasswordCheck.MESSAGE);
    }

    /**
     * Az ÜRES érték a gyakoribb eset: a {@code .env.example} minden kulcsot üresen sorol
     * fel, és a Spring helyőrző-alapértéke csak a HIÁNYZÓ kulcsra lép be — a jelen lévő,
     * de üres értéket nem írja felül. Enélkül a másolt {@code .env} pont azt a félrevezető
     * „password authentication failed" hibát adná, ami ellen az ellenőrzés készült.
     */
    @Test
    void azUresErtekIsIndulasiHiba() {
        assertThatThrownBy(() -> postProcess("")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> postProcess("   ")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> postProcess(null)).isInstanceOf(IllegalStateException.class);
    }

    /** A hibaüzenet megmondja, mit kell tenni — enélkül a szabály csak akadály. */
    @Test
    void ahibauzenetMegmondjaAzUtatIs() {
        assertThat(DatabasePasswordCheck.MESSAGE)
                .contains("DATABASE_PASSWORD")
                .contains("dev")
                .contains("környezeti változó");
    }

    /** A beállított jelszó átmegy — az ellenőrzés nem lehet vakriasztás. */
    @Test
    void abeallitottJelszoAtmegy() {
        assertThatCode(() -> postProcess("webshop")).doesNotThrowAnyException();
    }

    /** Más bean-t nem érint: az ellenőrzés kizárólag a datasource beállításaira fut. */
    @Test
    void masBeantNemVizsgal() {
        Object bean = new Object();

        assertThat(check.postProcessAfterInitialization(bean, "valamiMas")).isSameAs(bean);
    }
}
