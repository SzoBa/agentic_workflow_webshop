package hu.webshop.common;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Központi hibakezelő.
 *
 * <p>Két ág: a szerződéses {@link ApiException} a saját státuszkódjával és
 * üzenetével megy vissza, MINDEN más kivétel egységesen 500 lesz, semleges magyar
 * üzenettel. A részletek (verem, kivételtípus) kizárólag a naplóba kerülnek — a
 * hibaválaszból nem derülhet ki a belső működés.
 *
 * <p>A kezelt hiba nem állítja le a folyamatot: a szerver a következő kérést
 * kiszolgálja (K-72).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(new ErrorResponse(ex.getMessage()));
    }

    /**
     * Ismeretlen útvonal (nincs kezelő, és a statikus kiszolgálás sem talált fájlt).
     *
     * <p>Külön ág kell rá: enélkül a lenti általános kezelő nyelné el, és minden
     * elgépelt útvonal 500-at adna 404 helyett — a korábbi Node implementációban ide az
     * Express beépített 404-ese futott.
     */
    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    public ResponseEntity<ErrorResponse> handleNotFound(Exception ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse(Messages.ROUTE_NOT_FOUND));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Kéréskezelési hiba: {} {}", request.getMethod(), request.getRequestURI(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponse(Messages.INTERNAL_ERROR));
    }
}
