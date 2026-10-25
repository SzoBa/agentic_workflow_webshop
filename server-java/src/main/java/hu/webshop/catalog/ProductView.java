package hu.webshop.catalog;

import hu.webshop.domain.ProductEntity;

/**
 * A termék TÁROLT mezői — számolt mező nélkül.
 *
 * <p>Ezt adják vissza az admin írási végpontok (létrehozás, csere, aktivitásváltás): a
 * válasz a MENTETT állapotot tükrözi, és nem keveredik bele foglalási vagy értékelési
 * adat, ami a mentés pillanatában amúgy sem változott.
 *
 * <p>A mezőnevek és a sorrend a szerződés szerinti. A számolt mezőkkel bővített nézetek
 * (lásd {@link CustomerProductView}, {@link AdminProductView}) szándékosan LAPOS, önálló
 * rekordok: a JSON-ban sincs beágyazott „product" objektum, és így egyik nézet mezőit sem
 * lehet véletlenül átvinni a másikba.
 */
public record ProductView(String id, String name, String description, int price, String imageUrl,
        int stock, String category, boolean active) {

    public static ProductView of(ProductEntity product) {
        return new ProductView(product.getId(), product.getName(), product.getDescription(),
                product.getPrice(), product.getImageUrl(), product.getStock(),
                product.getCategory(), product.isActive());
    }
}
