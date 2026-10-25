package hu.webshop.catalog;

/**
 * A terméklisták szűrési szempontjai, a nyers query paraméterekből ÉRTELMEZVE.
 *
 * <p>Miért itt történik az értelmezés: a „nem szám {@code minPrice} esetén a szempont
 * kimarad", az „üres/whitespace {@code category} nem szűr" és a „csak a {@code "true"}
 * érték kapcsolja be az {@code inStock}-ot" szabályok a szerződés részei. Ha a
 * kontrollerekben élnének, a vásárlói és az admin lista elcsúszhatna egymástól — így egy
 * helyen vannak, és mindkét gyártófüggvény ugyanazokra a segédekre épül.
 *
 * <p>A {@code null} mező jelentése egységesen: „ez a szempont nem szűr".
 */
public record ProductFilter(String category, Double minPrice, Double maxPrice, String search,
        boolean inStock, Status status) {

    /** Aktivitás szerinti szűrés. Csak az admin lista használja. */
    public enum Status {
        ACTIVE, INACTIVE, ALL
    }

    /**
     * A vásárlói lista szűrője. Státuszszűrés nincs: a forrás eleve csak az aktív
     * termékeket tartalmazza — az inaktív a vásárlói felület számára nem létezik.
     */
    public static ProductFilter customer(String category, String minPrice, String maxPrice,
            String search, String inStock) {
        return new ProductFilter(
                blankToNull(category),
                Catalog.optionalNumber(minPrice),
                Catalog.optionalNumber(maxPrice),
                blankToNull(search),
                // Kizárólag a "true" érték szűr — bármi más (üres, "1", "igen") nem.
                "true".equals(inStock),
                Status.ALL);
    }

    /**
     * Az admin lista szűrője: ugyanazok a szempontok, plusz az aktivitás.
     * Az {@code inStock} itt nincs: az admin táblázat a {@code reserved}/{@code available}
     * oszlopokkal dolgozik, nem szűréssel.
     */
    public static ProductFilter admin(String category, String minPrice, String maxPrice,
            String search, String status) {
        return new ProductFilter(
                blankToNull(category),
                Catalog.optionalNumber(minPrice),
                Catalog.optionalNumber(maxPrice),
                blankToNull(search),
                false,
                status(status));
    }

    /**
     * A státuszparaméter beolvasása. Ismeretlen érték esetén {@code all}, hogy egy elgépelt
     * query ne rejtse el némán a termékek felét az admin elől.
     */
    private static Status status(String value) {
        if ("active".equals(value)) {
            return Status.ACTIVE;
        }
        if ("inactive".equals(value)) {
            return Status.INACTIVE;
        }
        return Status.ALL;
    }

    /** Trimmelt érték, vagy {@code null}, ha hiányzik / csak whitespace (ekkor nincs szűrés). */
    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
