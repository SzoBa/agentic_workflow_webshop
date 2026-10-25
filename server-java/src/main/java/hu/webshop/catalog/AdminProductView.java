package hu.webshop.catalog;

import hu.webshop.domain.ProductEntity;

/**
 * Az admin terméklista eleme: a termék minden mezője + a FOGLALÁSI adatok.
 *
 * <p>Értékelési aggregátumot szándékosan NEM hordoz (K-15): a szerkesztő felületnek arra
 * van szüksége, hogy miért utasít el a bolt egy rendelést olyan termékre, amelyből a
 * táblázat szerint van készlet — erre a {@code reserved} és az {@code available} válaszol.
 */
public record AdminProductView(String id, String name, String description, int price,
        String imageUrl, int stock, String category, boolean active, int reserved,
        int available) {

    public static AdminProductView of(ProductEntity product, int reserved, int available) {
        return new AdminProductView(product.getId(), product.getName(), product.getDescription(),
                product.getPrice(), product.getImageUrl(), product.getStock(),
                product.getCategory(), product.isActive(), reserved, available);
    }
}
