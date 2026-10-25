package hu.webshop.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * A lapozás VÁGÁSAI — a {@link Catalog#window} egysége.
 *
 * <p>Miért van külön tesztje: a {@code window} a lapozási szerződés egyetlen forrása, és
 * két HÍVÓJA van, akik másképp használják. A termékkatalógus a {@link Catalog#paginate}-en
 * át egy betöltött listából vág; az admin rendeléslista ugyanezekből a számokból SQL
 * {@code offset}/{@code limit}-et képez (ADR-0009). Ha a kettő szétcsúszna, a két lista
 * ugyanarra a query paraméterre más lapot adna.
 *
 * <p>A {@code window} kiemelése a {@code paginate}-ből tiszta Extract Method volt. A
 * {@code windowReproducesPaginateOnTheSameInput} ezt MÉRI is: ez az egyetlen bizonyíték
 * arra, hogy a termék-lapozás viselkedése nem változott.
 */
class CatalogWindowTest {

    /** Az admin rendeléslista lapmérete — a valós hívó alapértelmezése. */
    private static final int ADMIN_PAGE_SIZE = 25;

    /**
     * A vizsgált bemenetek: minden érdekes {@code total} × {@code page} × {@code pageSize}
     * kombináció. A {@code page}/{@code pageSize} értékek szándékosan a JS {@code Number()}
     * határeseteit járják körbe (üres szöveg = 0, {@code "abc"} = NaN, hexa, exponenciális),
     * mert ezek is a szerződés részei.
     */
    static Stream<Arguments> everyInput() {
        int[] totals = {0, 1, 7, 12, 13, 25, 26, 100, 101, 205};
        String[] pages = {null, "", "0", "1", "2", "3", "abc", "999", "-3", "1e30", "0x10", "2.7"};
        String[] pageSizes = {null, "", "0", "-5", "1", "7", "12", "25", "100", "500", "abc"};

        List<Arguments> cases = new ArrayList<>();
        for (int total : totals) {
            for (String page : pages) {
                for (String pageSize : pageSizes) {
                    cases.add(Arguments.of(total, page, pageSize));
                }
            }
        }
        return cases.stream();
    }

    /** Egy {@code total} elemű lista, hogy a {@code paginate} kivágását is mérni lehessen. */
    private static List<Integer> items(int total) {
        return IntStream.range(0, total).boxed().toList();
    }

    /**
     * A KIEMELÉS bizonyítéka: a {@code paginate} minden metaadata megegyezik a
     * {@code window}-éval, és a kivágott lap pontosan az {@code offset}…{@code offset+limit}
     * tartomány. Amíg ez áll, a termék-lapozás nem változhatott meg.
     */
    @ParameterizedTest(name = "total={0}, page={1}, pageSize={2}")
    @MethodSource("everyInput")
    void windowReproducesPaginateOnTheSameInput(int total, String page, String pageSize) {
        List<Integer> items = items(total);

        Catalog.Slice<Integer> slice = Catalog.paginate(items, page, pageSize, ADMIN_PAGE_SIZE);
        Catalog.Window window = Catalog.window(total, page, pageSize, ADMIN_PAGE_SIZE);

        assertThat(slice.total()).isEqualTo(total);
        assertThat(slice.page()).isEqualTo(window.page());
        assertThat(slice.pageSize()).isEqualTo(window.pageSize());
        assertThat(slice.totalPages()).isEqualTo(window.totalPages());
        assertThat(slice.items())
                .isEqualTo(items.subList(window.offset(), window.offset() + window.limit()));
    }

    /**
     * Az SQL {@code offset} oda esik, ahonnan a {@code subList} vágott volna.
     *
     * <p>A rendeléslista a {@code PageRequest.of(page - 1, pageSize)} alakot használja, ami
     * {@code (page-1) * pageSize} eltolást jelent. Ez csak azért egyezik az {@code offset}-tel,
     * mert a {@code page} már a {@code totalPages}-hez van vágva — enélkül a {@code window}
     * {@code Math.min(total, …)} korlátja eltérést okozna. A teszt ezt a levezetést váltja ki.
     */
    @ParameterizedTest(name = "total={0}, page={1}, pageSize={2}")
    @MethodSource("everyInput")
    void windowOffsetEqualsPageRequestOffset(int total, String page, String pageSize) {
        Catalog.Window window = Catalog.window(total, page, pageSize, ADMIN_PAGE_SIZE);

        assertThat(window.offset()).isEqualTo((window.page() - 1) * window.pageSize());
    }

    /**
     * A {@code limit == 0} PONTOSAN az üres találathalmazt jelenti.
     *
     * <p>Ezen múlik, hogy a rendeléslista üres eredménynél kihagyhatja MINDKÉT lekérdezést:
     * ha a {@code limit} nem üres halmazon is lehetne 0, a kihagyás elnyelne egy valódi lapot.
     */
    @ParameterizedTest(name = "total={0}, page={1}, pageSize={2}")
    @MethodSource("everyInput")
    void windowLimitIsZeroOnlyWhenTotalIsZero(int total, String page, String pageSize) {
        Catalog.Window window = Catalog.window(total, page, pageSize, ADMIN_PAGE_SIZE);

        assertThat(window.limit() == 0).isEqualTo(total == 0);
    }

    /** A vágások betartása: a lapméret 1…100, a lapszám 1…{@code totalPages}. */
    @ParameterizedTest(name = "total={0}, page={1}, pageSize={2}")
    @MethodSource("everyInput")
    void windowClampsPageSizeAndPageIntoTheContractRange(int total, String page, String pageSize) {
        Catalog.Window window = Catalog.window(total, page, pageSize, ADMIN_PAGE_SIZE);

        assertThat(window.pageSize()).isBetween(1, Catalog.MAX_PAGE_SIZE);
        assertThat(window.page()).isBetween(1, window.totalPages());
        assertThat(window.offset()).isBetween(0, Math.max(0, total));
        assertThat(window.offset() + window.limit()).isLessThanOrEqualTo(total);
    }

    /** Üres halmazon is van egy (üres) lap — különben az admin „0. oldalon" ragadna (K-07). */
    @Test
    void windowKeepsAtLeastOnePageWhenTotalIsZero() {
        Catalog.Window window = Catalog.window(0, null, null, ADMIN_PAGE_SIZE);

        assertThat(window.totalPages()).isEqualTo(1);
        assertThat(window.page()).isEqualTo(1);
        assertThat(window.offset()).isZero();
        assertThat(window.limit()).isZero();
    }

    /**
     * Az ALSÓ lapszám-vágás önmagában, {@code totalPages > 1} mellett — ez különbözteti meg a
     * felsőtől (egyoldalas halmazon a {@code page=1} a felső vágásból is kijönne).
     */
    @Test
    void windowClampsPageBelowOneUpToTheFirstPage() {
        Catalog.Window window = Catalog.window(3, "0", "1", ADMIN_PAGE_SIZE);

        assertThat(window.page()).isEqualTo(1);
        assertThat(window.totalPages()).isEqualTo(3);
        assertThat(window.offset()).isZero();
        assertThat(window.limit()).isEqualTo(1);
    }

    /** A felső vágás: a túl nagy lapszám az UTOLSÓ lapot adja, nem üreset. */
    @Test
    void windowClampsPageAboveTotalPagesDownToTheLastPage() {
        Catalog.Window window = Catalog.window(3, "999", "1", ADMIN_PAGE_SIZE);

        assertThat(window.page()).isEqualTo(3);
        assertThat(window.totalPages()).isEqualTo(3);
        assertThat(window.offset()).isEqualTo(2);
        assertThat(window.limit()).isEqualTo(1);
    }
}
