package hu.webshop.catalog;

import hu.webshop.domain.ProductEntity;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.function.ToIntFunction;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * A TERMÉKKATALÓGUS szűrése és lapozása — MEMÓRIÁBAN, a betöltött listán.
 *
 * <p><b>Miért nem SQL-ben.</b> A szűrés/lapozás szemantikája a HTTP-szerződés része,
 * a legapróbb részletekig: a {@code category} a paramétert ÉS az értéket is trimmelve
 * hasonlítja, a {@code page} 1 és {@code totalPages} közé vágódik, a {@code categories}
 * a SZŰRETLEN halmazból származik, a nem szám {@code minPrice} pedig némán kimarad. Ezt
 * a viselkedést a korábbi Node implementáció memóriában szűrve állította elő (ADR-0006);
 * ha itt lekérdezéssé fordítanánk, minden ilyen apróság
 * külön elcsúszási pont lenne (SQL {@code LIKE} és kollációk, {@code OFFSET} az utolsó
 * oldal mögött, {@code NULL}-kezelés). A katalógus mérete (tíz-százas nagyságrend) mellett
 * a teljes lista betöltése olcsó, a viselkedés egyezése viszont kötelező — ezért a
 * memóriában szűrés itt nem kényelmi, hanem helyességi döntés.
 *
 * <p><b>Ez az érvelés a TERMÉKKATALÓGUSRA szól, és nem általánosítható.</b> A katalógus
 * korlátos halmaz: adminisztrátor gondozza, kézzel nő. Az admin RENDELÉSLISTA nem az —
 * felhasználók hajtják, egyirányúan nő, nincs plafonja —, ezért az a lekérdezésben
 * szűr és lapoz ({@link hu.webshop.order.AdminOrderQueryService}, ADR-0009). A vágás
 * MATEMATIKÁJA viszont ott is innen jön: a {@link #window} a közös forrás, hogy a két
 * lista lapozási szerződése ne tudjon szétcsúszni.
 *
 * <p>A forrás listát mindig {@code seq} szerint rendezve kapjuk (a beszúrási sorrend a
 * szerződés része), és a szűrés/lapozás ezt a sorrendet megőrzi.
 */
public final class Catalog {

    /** Felső lapméret-korlát. Az alapértelmezettet a hívó adja (vásárlói 12, admin 25). */
    public static final int MAX_PAGE_SIZE = 100;

    private Catalog() {
    }

    /**
     * Egy lapnyi elem a lapozás metaadataival (a {@code categories}-t a hívó teszi hozzá).
     *
     * <p>A típusparaméter azért van, mert a lapozás SZEMANTIKÁJA (a query paraméterek
     * JS-{@code Number()} értelmezése, a vágások) nem termékspecifikus: az admin
     * rendeléslista ugyanezt a szerződést használja. Egy második példány előbb-utóbb
     * szétcsúszna ettől.
     *
     * @param <T> a lapozott elem típusa
     */
    public record Slice<T>(List<T> items, int total, int page, int pageSize,
            int totalPages) {
    }

    /**
     * Egy lapnyi ABLAK a találathalmazon: hol kezdődik, meddig tart, és mit írunk a
     * lapozás metaadataiba. Ugyanaz a vágás, mint a {@link #paginate}-é — csak a
     * kivágás elvégzése NÉLKÜL, hogy SQL {@code offset}/{@code limit}-té is fordítható
     * legyen.
     *
     * @param offset hányadik elemtől (0-alapú) — az SQL {@code offset}
     * @param limit hány elem — az SQL {@code limit}; {@code 0}, ha nincs találat
     */
    public record Window(int offset, int limit, int page, int pageSize, int totalPages) {
    }

    /**
     * Szűrés. A forrást a hívó választja meg: vásárlói oldalon már csak az aktív
     * termékek, admin oldalon a teljes katalógus.
     *
     * <p>Az {@code availableOf} azt mondja meg, hány darab rendelhető MOST — erre épül az
     * {@code inStock} szűrő. A modul nem ismeri (és nem is kell ismernie) a foglalásokat,
     * ezért kapja függvényként.
     */
    public static List<ProductEntity> filter(List<ProductEntity> source, ProductFilter filter,
            ToIntFunction<ProductEntity> availableOf) {
        List<ProductEntity> filtered = source;

        if (filter.status() == ProductFilter.Status.ACTIVE) {
            filtered = filtered.stream().filter(ProductEntity::isActive).toList();
        } else if (filter.status() == ProductFilter.Status.INACTIVE) {
            filtered = filtered.stream().filter(product -> !product.isActive()).toList();
        }

        if (filter.category() != null) {
            // A trimmelt értékkel hasonlítunk: a feltétel is trimmelve dönt, így egy
            // szóközzel körülvett kategória (?category=%20Otthon%20) különben átjutna az
            // őrön, majd némán 0 találatot adna (K-08).
            String category = filter.category();
            filtered = filtered.stream()
                    .filter(product -> category.equals(product.getCategory()))
                    .toList();
        }

        if (filter.minPrice() != null) {
            double min = filter.minPrice();
            filtered = filtered.stream().filter(product -> product.getPrice() >= min).toList();
        }

        if (filter.maxPrice() != null) {
            double max = filter.maxPrice();
            filtered = filtered.stream().filter(product -> product.getPrice() <= max).toList();
        }

        if (filter.search() != null) {
            String needle = filter.search().toLowerCase(Locale.ROOT);
            filtered = filtered.stream()
                    .filter(product -> contains(product.getName(), needle)
                            || contains(product.getDescription(), needle))
                    .toList();
        }

        if (filter.inStock()) {
            filtered = filtered.stream()
                    .filter(product -> availableOf.applyAsInt(product) > 0)
                    .toList();
        }

        return filtered;
    }

    private static boolean contains(String value, String lowerCaseNeedle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(lowerCaseNeedle);
    }

    /**
     * Lapozás. A {@code pageSize} 1…{@link #MAX_PAGE_SIZE}, a {@code page} 1…{@code totalPages}
     * közé vágódik. A page-vágás nem kényelmi: enélkül az utolsó oldal utolsó elemének
     * törlése után az admin üres oldalon ragadna (K-07).
     *
     * <p>A {@code totalPages} üres találathalmaznál is legalább 1.
     *
     * <p>A számítás elemtípus-független, ezért generikus: a hívó dönti el, mit lapoz
     * (termék vagy rendelés). A viselkedés ettől nem változik.
     *
     * <p>A vágásokat maga a {@link #window} adja — ez a metódus már csak KIVÁGJA a lapot a
     * betöltött listából. Aki SQL-ben lapoz, a {@code window}-t hívja közvetlenül.
     *
     * @param <T> a lapozott elem típusa
     */
    public static <T> Slice<T> paginate(List<T> items, String page, String pageSize,
            int defaultPageSize) {
        int total = items.size();
        Window window = window(total, page, pageSize, defaultPageSize);
        int from = window.offset();
        return new Slice<>(List.copyOf(items.subList(from, from + window.limit())), total,
                window.page(), window.pageSize(), window.totalPages());
    }

    /**
     * A lapozás VÁGÁSAI a találathalmaz ismert méretéből — a {@link #paginate} matematikája,
     * a kivágás nélkül.
     *
     * <p>A {@code total} azért paraméter, mert SQL-oldali lapozásnál egy {@code count}
     * lekérdezés adja, nem egy betöltött lista mérete. A sorrend emiatt KÖTÖTT: előbb a
     * darabszám, utána az ablak, és csak legvégül a lap lekérdezése — a {@code page} ugyanis
     * csak a {@code totalPages} ismeretében vágható.
     *
     * <p>Ez a metódus a lapozási szerződés EGYETLEN forrása: a termékkatalógus a
     * {@link #paginate}-en át, az admin rendeléslista pedig közvetlenül ezt használja
     * (ADR-0009). Egy második példány előbb-utóbb szétcsúszna ettől.
     */
    public static Window window(int total, String page, String pageSize, int defaultPageSize) {
        int size = (int) Math.min(MAX_PAGE_SIZE,
                Math.max(1, intParam(pageSize, defaultPageSize)));
        int totalPages = Math.max(1, (int) Math.ceil((double) total / size));
        int current = (int) Math.min(totalPages, Math.max(1, intParam(page, 1)));

        int from = Math.min(total, (current - 1) * size);
        int to = Math.min(total, from + size);
        return new Window(from, to - from, current, size, totalPages);
    }

    /** A halmaz kategóriái, az első előfordulás sorrendjében, ismétlés nélkül. */
    public static List<String> categories(List<ProductEntity> products) {
        return List.copyOf(products.stream()
                .map(ProductEntity::getCategory)
                .collect(Collectors.toCollection(LinkedHashSet::new)));
    }

    // --- Query paraméterek értelmezése (a JS Number() szemantikájával) ---

    /**
     * A JavaScript {@code Number(string)} által elfogadott alakok. A referencia
     * implementáció ezzel értelmezi a query paramétereket, és a határesetek is a
     * szerződés részei: az ÜRES szöveg {@code 0} (nem hiba), a {@code "abc"} viszont
     * {@code NaN}, tehát az alapértelmezett érték marad.
     */
    private static final Pattern DECIMAL =
            Pattern.compile("[+-]?(Infinity|(\\d+(\\.\\d*)?|\\.\\d+)([eE][+-]?\\d+)?)");

    /** A JS által ismert egész-literálok: hexa, oktális, bináris (előjel nélkül). */
    private static final Pattern RADIX = Pattern.compile("0[xXoObB][0-9a-fA-F]+");

    /**
     * Query paraméter számként, a JS {@code Number()} szabályai szerint.
     * Érvénytelen alaknál {@code NaN}, hiányzó paraméternél is {@code NaN}
     * (a JS-ben {@code Number(undefined)} is az).
     */
    static double number(String value) {
        if (value == null) {
            return Double.NaN;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return 0;
        }
        if (RADIX.matcher(trimmed).matches()) {
            int radix = switch (Character.toLowerCase(trimmed.charAt(1))) {
                case 'x' -> 16;
                case 'o' -> 8;
                default -> 2;
            };
            try {
                return Long.parseLong(trimmed.substring(2), radix);
            } catch (NumberFormatException ex) {
                return Double.NaN;
            }
        }
        if (!DECIMAL.matcher(trimmed).matches()) {
            return Double.NaN;
        }
        return Double.parseDouble(trimmed);
    }

    /**
     * Query paraméter egész számmá alakítva; érvénytelen érték esetén a {@code fallback}.
     * A visszatérési érték {@code double}, mert a lefelé kerekített bemenet tetszőlegesen
     * nagy lehet ({@code ?page=1e30}) — a vágást a hívó végzi, túlcsordulás nélkül.
     */
    static double intParam(String value, int fallback) {
        double parsed = number(value);
        return Double.isFinite(parsed) ? Math.floor(parsed) : fallback;
    }

    /**
     * Query paraméter számként, szűrési szempontnak. Hiányzó vagy érvénytelen érték esetén
     * {@code null}, hogy az adott szempont KIMARADJON a szűrésből (nem hiba, nem 0).
     */
    static Double optionalNumber(String value) {
        if (value == null) {
            return null;
        }
        double parsed = number(value);
        return Double.isFinite(parsed) ? parsed : null;
    }
}
