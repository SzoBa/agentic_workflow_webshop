package hu.webshop.security;

import hu.webshop.common.Messages;
import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Admin jogosultság (403) az admin névtérre. Azt, hogy MELY kérésekre fut le, a
 * bekötési minta mondja meg ({@code WebConfig}) — ez az osztály nem hasonlít útvonalat
 * prefixhez. Ez nem stílus kérdése: az útvonal-összehasonlítás könnyen más
 * koordinátarendszerből veszi a két oldalt (context path-fal és anélkül), és akkor a
 * biztonsági ellenőrzés némán kimarad. Lásd {@link AuthInterceptor} osztálykommentjét
 * és a K-58 esetet.
 *
 * <p>Az {@link AuthInterceptor} ELŐBB fut (regisztrációs sorrend), ezért a belépett
 * felhasználó itt már a kérés attribútumában van.
 */
@Component
public class AdminInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AdminInterceptor.class);

    private final InterceptorErrorWriter errors;

    public AdminInterceptor(InterceptorErrorWriter errors) {
        this.errors = errors;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
            Object handler) throws Exception {
        Object attribute = request.getAttribute(AuthInterceptor.USER_ATTRIBUTE);

        if (!(attribute instanceof UserEntity user)) {
            // Ide csak akkor jutunk, ha a bekötés elromlott: az admin névtéren
            // hitelesítés nélkül járunk. Ilyenkor ZÁRVA bukunk, nem átengedve.
            log.error("Az admin névtér hitelesítés nélkül futott le: {}",
                    request.getRequestURI());
            errors.write(response, HttpStatus.UNAUTHORIZED, Messages.AUTH_REQUIRED);
            return false;
        }

        if (user.getRole() != Role.ADMIN) {
            log.warn("Admin jogosultság nélküli kérés elutasítva: {} (felhasználó: {})",
                    request.getRequestURI(), user.getId());
            errors.write(response, HttpStatus.FORBIDDEN, Messages.ADMIN_REQUIRED);
            return false;
        }

        return true;
    }
}
