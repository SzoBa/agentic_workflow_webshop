package hu.webshop.common;

import org.springframework.http.HttpStatus;

/**
 * Szerződéses hibaválasz: státuszkód + a felhasználónak megmutatható magyar üzenet.
 *
 * <p>A kéréskezelés bárhol dobhatja; a {@link GlobalExceptionHandler} fordítja
 * {@code { "error": "..." }} törzsű válasszá. Minden MÁS kivétel 500 lesz, semleges
 * üzenettel — a részletek kizárólag a naplóba kerülnek.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }

    /** 400 — validációs hiba. */
    public static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message);
    }

    /** 401 — hiányzó, érvénytelen vagy lejárt token. */
    public static ApiException unauthorized() {
        return new ApiException(HttpStatus.UNAUTHORIZED, Messages.AUTH_REQUIRED);
    }

    /** 403 — érvényes token, de nincs jogosultság. */
    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, message);
    }

    /** 404 — az erőforrás nem létezik (vagy a vásárlói nézet számára nem létezik). */
    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, message);
    }

    /** 409 — a kérés érvényes, de az aktuális állapottal ütközik. */
    public static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, message);
    }

    /** 429 — túl sok sikertelen próbálkozás. */
    public static ApiException tooManyRequests(String message) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, message);
    }
}
