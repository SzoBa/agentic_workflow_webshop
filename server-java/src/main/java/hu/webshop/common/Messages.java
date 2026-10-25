package hu.webshop.common;

import hu.webshop.domain.OrderStatus;
import hu.webshop.domain.ReviewStatus;
import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * A backend ÖSSZES hibaüzenete, egy helyen — a
 * {@code spec/backend/hibakatalogus.md} szó szerinti átvétele.
 *
 * <p>Miért szó szerint: a szöveg tartalmilag kötelező (magyar, a felhasználónak
 * megmutatható, megnevezi az okot). A szó szerinti egyezés eredetileg azért kellett, hogy
 * a válaszok BÁJTRA megegyezzenek a korábbi Node implementációéval, és a
 * konformancia-katalógus mindkét backend ellen ugyanazt mérje (ADR-0006). A Node oldal
 * megszűnt, a szó szerinti egyezés viszont MA IS kötelező: a konformancia-esetek és az
 * integrációs tesztek erre a szövegre asszertálnak.
 *
 * <p>Hibaüzenet SOSEM tartalmaz belső azonosítót, jelszóhasht, tokent vagy
 * verem-információt.
 */
public final class Messages {

    private Messages() {
    }

    // --- Globális ---

    public static final String AUTH_REQUIRED = "Bejelentkezés szükséges.";
    /**
     * Ismeretlen útvonal. A hibakatalógusban nincs szövege, mert a korábbi Node
     * implementációban ide az Express beépített 404-ese futott; a lényeg a
     * STÁTUSZKÓD — a kezeletlen kivétel 500-a itt félrevezető lenne.
     */
    public static final String ROUTE_NOT_FOUND = "A kért erőforrás nem található.";
    public static final String ADMIN_REQUIRED = "Ehhez adminisztrátori jogosultság szükséges.";
    public static final String INTERNAL_ERROR = "Váratlan szerverhiba.";

    // --- Termékvalidáció (400) ---

    public static final String PRODUCT_NAME_REQUIRED = "A termék neve kötelező.";
    public static final String PRODUCT_NAME_TOO_LONG = "A termék neve legfeljebb 50 karakter lehet.";
    public static final String PRODUCT_DESCRIPTION_REQUIRED = "A termék leírása kötelező.";
    public static final String PRODUCT_DESCRIPTION_TOO_LONG =
            "A termék leírása legfeljebb 100 karakter lehet.";
    public static final String PRODUCT_PRICE_INVALID = "Az ár egész szám és nullánál nagyobb legyen.";
    public static final String PRODUCT_STOCK_INVALID =
            "A készlet megadása kötelező, egész szám és nem negatív.";
    public static final String PRODUCT_CATEGORY_REQUIRED = "A kategória megadása kötelező.";
    public static final String PRODUCT_IMAGE_REQUIRED = "A kép megadása kötelező.";
    public static final String PRODUCT_IMAGE_INVALID =
            "A kép hivatkozása érvényes http vagy https URL legyen.";
    public static final String PRODUCT_ACTIVE_INVALID =
            "Az aktivitási állapot csak igaz vagy hamis lehet.";
    public static final String PRODUCT_NOT_FOUND = "A termék nem található.";

    // --- Felhasználóvalidáció (400) ---

    public static final String USERNAME_TOO_SHORT = "A felhasználónév legalább 8 karakter legyen.";
    public static final String USERNAME_TOO_LONG = "A felhasználónév legfeljebb 50 karakter lehet.";
    public static final String EMAIL_INVALID = "Érvénytelen email cím.";
    public static final String ADDRESS_REQUIRED = "A szállítási cím megadása kötelező.";
    public static final String USERNAME_TAKEN = "Ez a felhasználónév már foglalt.";
    public static final String EMAIL_TAKEN = "Ezzel az email címmel már regisztráltak.";
    public static final String PASSWORD_TOO_SHORT = "A jelszó legalább 8 karakter legyen.";
    public static final String ROLE_INVALID = "Érvénytelen szerepkör.";
    public static final String LAST_ADMIN_ROLE =
            "Ez az utolsó admin jogú felhasználó, ezért a szerepköre nem vehető el."
                    + " Előbb léptess elő egy másik felhasználót adminná.";
    public static final String LAST_ADMIN_DELETE =
            "Ez az utolsó admin jogú felhasználó, ezért nem törölhető."
                    + " Előbb léptess elő egy másik felhasználót adminná.";
    public static final String USER_NOT_FOUND = "A felhasználó nem található.";

    // --- Bejelentkezés ---

    public static final String LOGIN_FAILED = "Hibás felhasználónév vagy jelszó.";
    public static final String LOGIN_RATE_LIMITED =
            "Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.";

    // --- Fiókadatok és jelszócsere ---

    /**
     * A saját fiókadatok mentéséhez és a jelszócseréhez megadott jelenlegi jelszó
     * hibás. SZÁNDÉKOSAN más szöveg, mint a {@link #LOGIN_FAILED}: itt a hívó már
     * hitelesítette magát, a felhasználónév tehát nem kérdés — csak a jelszó az.
     *
     * <p>A státuszkódja 400, nem 401: a 401 ezeken a végpontokon a MUNKAMENET
     * lejártát jelenti, amire a kliens kilépteti a felhasználót. Egy elgépelt
     * jelenlegi jelszó nem munkamenet-hiba, ezért mezőhibaként megy vissza.
     */
    public static final String CURRENT_PASSWORD_INVALID = "A jelenlegi jelszó hibás.";
    public static final String PASSWORD_CONFIRM_MISMATCH = "A két jelszó nem egyezik.";
    public static final String PASSWORD_SAME_AS_OLD =
            "Az új jelszó nem egyezhet meg a jelenlegivel.";

    // --- Rendelés (400) ---

    public static final String CART_EMPTY = "A kosár üres vagy hibás.";
    public static final String CUSTOMER_DATA_MISSING = "Hiányzó vevői adatok (név, email, cím).";
    public static final String EXPECTED_TOTAL_REQUIRED = "A jóváhagyott végösszeg megadása kötelező.";

    /** Ismeretlen vagy időközben inaktivált termék. A nyers azonosító sosem kerül bele. */
    public static String productUnavailable(String productName) {
        return "A(z) " + productName + " már nem elérhető, ezért a rendelés nem adható le."
                + " Kérjük, vedd ki a kosárból, és próbáld újra.";
    }

    public static String quantityInvalid(String productName) {
        return "Hibás mennyiség a(z) " + productName + " terméknél.";
    }

    // --- Rendelés (409) ---

    public static final String TOTAL_MISMATCH =
            "A kosárban lévő termékek ára időközben megváltozott."
                    + " Kérjük, frissítsd az oldalt és ellenőrizd a végösszeget.";

    /** Fedezethiány, ha van még valamennyi elérhető darab. */
    public static String insufficientStock(String productName, int available) {
        return "A(z) " + productName + " termékből jelenleg " + available + " db érhető el,"
                + " ezért a rendelés nem adható le.";
    }

    /** Fedezethiány, ha egyáltalán nincs elérhető darab. */
    public static String outOfStock(String productName) {
        return "A(z) " + productName + " termék elfogyott, ezért a rendelés nem adható le.";
    }

    // --- Rendelés státusz ---

    /**
     * Az érvénytelen státuszérték üzenete. A felsorolás az {@link OrderStatus}
     * értékeiből épül, tehát egy új státusz automatikusan megjelenik benne.
     */
    public static String orderStatusInvalid() {
        return "A rendelés státusza csak a következő lehet: " + OrderStatus.listed() + ".";
    }

    public static final String ORDER_NOT_FOUND = "A rendelés nem található.";

    public static String deliveryShortfall(String productName, int available) {
        return "A(z) " + productName + " termékből nincs elegendő készlet a rendelés"
                + " teljesítéséhez (elérhető: " + available + " db).";
    }

    public static final String ORDER_DELIVERED_FINAL =
            "A kiszállított rendelés státusza már nem módosítható.";
    public static final String ORDER_EXPIRED_FINAL =
            "A lejárt rendelés már nem állítható vissza feldolgozás alá.";

    // --- Értékelés ---

    public static final String RATING_INVALID = "Az értékelés 1 és 5 közötti egész szám lehet.";
    public static final String REVIEW_BODY_NOT_TEXT = "A szöveges vélemény csak szöveg lehet.";
    public static final String REVIEW_BODY_TOO_LONG =
            "A szöveges vélemény legfeljebb 500 karakter lehet.";
    public static final String REVIEW_NOT_VERIFIED_BUYER =
            "Csak olyan terméket értékelhetsz, amelyet már megrendeltél, és a rendelésed"
                    + " kiszállítottként van nyilvántartva.";
    public static final String REVIEW_ALREADY_EXISTS = "Ezt a terméket már értékelted.";
    public static final String REVIEW_NOT_FOUND = "Az értékelés nem található.";

    /**
     * A moderációs státusz érvénytelen értéke. A {@code pending} SZÁNDÉKOSAN nincs a
     * listában: a moderálatlan állapot a kezdet, oda visszalépni értelmetlen.
     */
    public static String reviewStatusInvalid() {
        String allowed = Arrays.stream(ReviewStatus.values())
                .filter(status -> status != ReviewStatus.PENDING)
                .map(ReviewStatus::value)
                .collect(Collectors.joining(", "));
        return "A státusz csak a következő értékek egyike lehet: " + allowed + ".";
    }

    /** A hibaüzenetben használt semleges terméknév, ha máshonnan nem derül ki. */
    public static final String FALLBACK_PRODUCT_NAME = "Egy termék";
}
