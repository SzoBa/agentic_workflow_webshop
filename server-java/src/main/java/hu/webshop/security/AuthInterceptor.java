package hu.webshop.security;

import hu.webshop.common.Messages;
import hu.webshop.domain.UserEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Hitelesítés (401) — útvonalminta alapján bekötve (lásd {@code WebConfig}), nem
 * végpontonkénti annotációval. Így egy új védett végpontnál nem felejthető el.
 *
 * <p>A jogosultsági döntés (403) SZÁNDÉKOSAN nem itt van, hanem az
 * {@link AdminInterceptor}-ban, amit a konfiguráció csak az admin névtérre köt be. Az
 * ok: ha itt döntenénk, a kérés útvonalát össze kellene hasonlítani egy prefixszel, és
 * az összehasonlítás két különböző koordinátarendszerben mozogna — a {@code
 * getRequestURI()} tartalmazza a kiszolgálási útvonalprefixet (context path), a
 * regisztrációs minta viszont anélkül illeszkedik. Nem üres context path mellett a
 * prefix-vizsgálat csendben hamis lett volna, és a szerepkör-ellenőrzés kimaradt volna
 * (K-58). Két interceptorral nincs mit összehasonlítani: a jogosultságot maga a
 * bekötési minta dönti el.
 *
 * <p>Sorrend: előbb 401 (ki vagy?), utána 403 (szabad-e?) — a regisztráció sorrendje
 * adja. A napló a tokent SOSEM tartalmazza.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuthInterceptor.class);
    private static final String BEARER = "Bearer ";

    /** A kérésre tett belépett felhasználó attribútumneve. */
    public static final String USER_ATTRIBUTE = "hu.webshop.currentUser";

    private final SessionService sessions;
    private final InterceptorErrorWriter errors;

    public AuthInterceptor(SessionService sessions, InterceptorErrorWriter errors) {
        this.sessions = sessions;
        this.errors = errors;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
            Object handler) throws Exception {
        Optional<UserEntity> user = sessions.authenticate(bearerToken(request));

        if (user.isEmpty()) {
            log.warn("Hitelesítés nélküli kérés elutasítva: {}", request.getRequestURI());
            errors.write(response, HttpStatus.UNAUTHORIZED, Messages.AUTH_REQUIRED);
            return false;
        }

        request.setAttribute(USER_ATTRIBUTE, user.get());
        return true;
    }

    /** Az "Authorization: Bearer <token>" fejléc tokenje, vagy {@code null}. */
    private static String bearerToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER)) {
            return null;
        }
        return header.substring(BEARER.length()).trim();
    }
}
