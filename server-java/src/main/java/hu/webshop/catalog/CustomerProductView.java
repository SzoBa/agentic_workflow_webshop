package hu.webshop.catalog;

import hu.webshop.domain.ProductEntity;

/**
 * A vásárlói termékválasz: a termék minden mezője + a három SZÁMOLT mező
 * ({@code ratingAvg}, {@code ratingCount}, {@code available}).
 *
 * <p>Egy helyen, mert mindkét vásárlói termékvégpont (lista és részletek) ezt az alakot
 * adja — külön összeállítva elcsúszhatnának egymástól.
 */
public record CustomerProductView(String id, String name, String description, int price,
        String imageUrl, int stock, String category, boolean active, Number ratingAvg,
        long ratingCount, int available) {

    /**
     * A nézet összeállítása. Az {@code average}/{@code count} a JÓVÁHAGYOTT értékelések
     * aggregátuma; értékelés hiányában {@code 0} / {@code 0} — ez a követelmény szerinti
     * „nincs értékelés" állapot, nem hiányzó mező.
     */
    public static CustomerProductView of(ProductEntity product, double average, long count,
            int available) {
        return new CustomerProductView(product.getId(), product.getName(),
                product.getDescription(), product.getPrice(), product.getImageUrl(),
                product.getStock(), product.getCategory(), product.isActive(),
                roundedAverage(average), count, available);
    }

    /**
     * Az átlag egy tizedesre kerekítve, hogy a válasz ne lebegőpontos maradékot közöljön
     * (4.333333333333333 helyett 4.3).
     *
     * <p>A visszatérési típus azért {@link Number}: a korábbi Node implementáció JSON-jában
     * az egész értékű átlag TIZEDES NÉLKÜL szerepelt ({@code 0}, {@code 4} — nem {@code 0.0},
     * {@code 4.0}), mert a JavaScriptben nincs külön egész típus. Az alak azóta a
     * HTTP-szerződés része: egész értéknél {@code Integer}-t adunk vissza, törtnél
     * {@code Double}-t, és a konformancia-esetek erre asszertálnak.
     */
    private static Number roundedAverage(double average) {
        double rounded = Math.round(average * 10) / 10.0;
        return rounded == Math.rint(rounded) ? (Number) (int) rounded : (Number) rounded;
    }
}
