package hu.webshop.order;

import static org.assertj.core.api.Assertions.assertThat;

import hu.webshop.repo.OrderRepository;
import java.lang.reflect.Method;
import java.util.Locale;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.jpa.repository.Query;

/**
 * A szabadszavas keresés LIKE-mintává alakítása.
 *
 * <p>Ez a lépés azért kapott önálló egységtesztet, mert a szűrés SQL-be költözésekor (ADR-0009)
 * itt keletkezett ÚJ hibafelület, ami korábban nem létezett: a {@code String.contains} számára a
 * {@code %} és a {@code _} közönséges karakter volt, a {@code LIKE} számára viszont joker. Ha a
 * menekítés kimarad, egy {@code a_b} keresés némán az {@code axb}-re is illeszkedik — a válasz
 * alakja változatlan marad, csak rossz sorokat ad vissza.
 *
 * <p>A menekítés KÉT helyen dől el: itt a minta, a lekérdezésben az {@code escape} záradék. Az
 * utolsó eset ezért nem a mintát, hanem a kettő EGYEZÉSÉT méri.
 */
class AdminOrderSearchPatternTest {

    /** Az üres keresés mindent visszaad — az {@code id} elsődleges kulcs, tehát sosem null. */
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\t", "\n", "  \t \n "})
    void blankSearchBecomesMatchAllPattern(String search) {
        assertThat(AdminOrderQueryService.likePattern(search)).isEqualTo("%");
    }

    /** A minta trimmelve és kisbetűsítve, jokerek közé zárva kerül a lekérdezésbe. */
    @ParameterizedTest
    @CsvSource({
        "kov,          %kov%",
        "' KoV ',      %kov%",
        "KOVÁCS,       %kovács%",
        "'ŐRÜLT SZŰCS',%őrült szűcs%",
        "'  Anna  ',   %anna%",
    })
    void wrapsTheTrimmedLowercasedNeedleInWildcards(String search, String expected) {
        assertThat(AdminOrderQueryService.likePattern(search)).isEqualTo(expected);
    }

    /**
     * A LIKE jokerei MENEKÍTVE kerülnek a mintába — ez a szűrés SQL-be költözésének egyetlen
     * olyan pontja, ahol a viselkedés némán elcsúszhatna a korábbi {@code contains}-hez képest.
     */
    @ParameterizedTest
    @CsvSource({
        "50%,     %50!%%",
        "a_b,     %a!_b%",
        "'!',     %!!%",
        "100%_a,  %100!%!_a%",
        "'a!b',   %a!!b%",
        "'%%',    %!%!%%",
        "'___',   %!_!_!_%",
    })
    void escapesLikeWildcardsInTheNeedle(String search, String expected) {
        assertThat(AdminOrderQueryService.likePattern(search)).isEqualTo(expected);
    }

    /**
     * A kisbetűsítés {@code Locale.ROOT}-tal történik, nem az alapértelmezett területi
     * beállítással. Török locale-ban az {@code "I".toLowerCase()} pont nélküli {@code "ı"}-t adna,
     * ami sosem illeszkedne az adatbázisban tárolt {@code "i"}-re — és ez a hiba csak török
     * gépen jelentkezne, tehát a szokásos futtatásokon láthatatlan maradna.
     */
    @Test
    void lowercasesWithRootLocaleNotTheDefaultLocale() {
        Locale.setDefault(Locale.of("tr", "TR"));

        assertThat(AdminOrderQueryService.likePattern("ISTANBUL")).isEqualTo("%istanbul%");
    }

    /**
     * A MINTA és a LEKÉRDEZÉS menekítő jele ugyanaz.
     *
     * <p>A {@code LIKE_ESCAPE} csak a minta előállítását írja le; a párja {@code escape '!'}
     * sztringliterálként él az {@link OrderRepository} két {@code @Query} annotációjában, ahonnan a
     * Java konstans nem hivatkozható. Egy olyan konstans, amit a rá támaszkodó hely nem tud
     * kiolvasni, csak névben konstans — ezért olvassuk vissza magát az annotációt.
     *
     * <p>A szétcsúszás NÉMA hiba lenne: a minta menekítené a {@code %}-ot és a {@code _}-t, a
     * lekérdezés viszont már nem oldaná fel — a jokerek visszaváltoznának jokerré, és egy
     * {@code a_b} keresés megint illeszkedne az {@code axb}-re. A válasz alakja változatlan
     * maradna, csak rossz sorokkal.
     */
    @ParameterizedTest
    @CsvSource({
        "countAdminList,      2",
        "findAdminListIdPage, 3",
    })
    void repositoryQueriesEscapeWithTheSameCharacter(String method, int parameterCount) {
        String query = adminListQuery(method, parameterCount);
        String escaped = "like :needle escape '" + AdminOrderQueryService.LIKE_ESCAPE + "'";

        // Mindhárom illesztett oszlop (név, e-mail, azonosító) menekítéssel, kivétel nélkül.
        assertThat(occurrences(query, escaped)).as("menekített illesztés (%s)", method).isEqualTo(3);
        assertThat(occurrences(query, "like :needle"))
                .as("összes illesztés (%s)", method)
                .isEqualTo(3);
    }

    /** Az admin lista megadott nevű lekérdezésének HQL szövege, az annotációból. */
    private static String adminListQuery(String method, int parameterCount) {
        for (Method candidate : OrderRepository.class.getDeclaredMethods()) {
            if (candidate.getName().equals(method)
                    && candidate.getParameterCount() == parameterCount) {
                return candidate.getAnnotation(Query.class).value();
            }
        }
        throw new AssertionError("Nincs ilyen metódus az OrderRepository-ban: " + method);
    }

    private static int occurrences(String haystack, String needle) {
        return haystack.split(Pattern.quote(needle), -1).length - 1;
    }

    /**
     * A JVM-szintű alapértelmezés visszaállítása. A mentést a mező végzi, nem a helyreállító
     * metódus: a {@code Locale.getDefault()} ekkor már a teszt által BEÁLLÍTOTT értéket adná,
     * és a török locale átszivárogna a JVM-et osztó többi tesztre.
     */
    private final Locale originalDefault = Locale.getDefault();

    @AfterEach
    void restoreDefaultLocale() {
        Locale.setDefault(originalDefault);
    }
}
