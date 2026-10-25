package hu.webshop.common;

/**
 * A tartalom nélküli sikeres műveletek válasza: {@code { "ok": true }}.
 *
 * <p>Primitív {@code boolean}, hogy a globális {@code non_null} beállítás se
 * hagyhassa ki a mezőt — a kliens a mező LÉTÉRE épül, nem az értékére.
 */
public record OkResponse(boolean ok) {

    /** A gyári metódus neve nem lehet {@code ok()}: azt a rekord-akcesszor foglalja. */
    public static OkResponse of() {
        return new OkResponse(true);
    }
}
