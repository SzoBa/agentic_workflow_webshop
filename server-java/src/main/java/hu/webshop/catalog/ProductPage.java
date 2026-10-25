package hu.webshop.catalog;

import java.util.List;

/**
 * A lapozott terméklista válaszburka — a vásárlói és az admin lista UGYANEZT az alakot
 * adja, csak az {@code items} elemtípusa más (számolt mezőkben térnek el).
 *
 * <p>A {@code categories} a SZŰRETLEN halmaz kategórialistája, hogy a szűrő oldalsáv a
 * szűrés után is teljes maradjon.
 *
 * @param <T> a listaelem nézettípusa ({@link CustomerProductView} vagy {@link AdminProductView})
 */
public record ProductPage<T>(List<T> items, int total, int page, int pageSize, int totalPages,
        List<String> categories) {
}
