package hu.webshop.ops;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.event.Level;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Kérésnapló: MINDEN HTTP kérés naplózódik metódussal, útvonallal, státuszkóddal és
 * válaszidővel (spec 7.3).
 *
 * <p>A szűrő a lánc LEGELEJÉN áll ({@link Ordered#HIGHEST_PRECEDENCE}), mert csak így
 * fedi le a teljes kérés-életciklust: a hitelesítést, a hibakezelést és a statikus
 * kiszolgálást is. A korábbi Node implementációban ugyanezért volt a legelső middleware
 * a {@code pino-http}.
 *
 * <p>A napló SZINTJE a válasz státuszkódjából jön (5xx → error, 4xx → warn, egyébként
 * info), ahogy a korábbi Node oldali {@code customLogLevel}-ben is volt. Így egy elutasított kérés a
 * naplószűrésben is elkülönül a kiszolgálttól.
 *
 * <p><b>Hitelesítő adat és token SOHA nem kerül a naplóba.</b> Ezért itt szándékosan
 * nincs fejléc-naplózás: sem az {@code Authorization}, sem más fejléc nem íródik ki —
 * nem maszkolunk, hanem el sem olvassuk. A törzs (jelszó, regisztrációs adat) szintén
 * kimarad.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        long startedAt = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            // A finally ág azért kell, hogy a kivétellel végződő kérés is naplózódjon —
            // a hibakezelő ilyenkor már beállította a válasz státuszkódját.
            long durationMs = (System.nanoTime() - startedAt) / 1_000_000L;
            log(request, response.getStatus(), durationMs);
        }
    }

    private void log(HttpServletRequest request, int status, long durationMs) {
        String method = request.getMethod();
        String path = fullPath(request);
        log.atLevel(levelFor(status))
                // Kulcs-érték párok a strukturált (ECS) kimenethez: a naplógyűjtő így
                // szűrhet státuszra és válaszidőre a szöveg értelmezése nélkül.
                .addKeyValue("method", method)
                .addKeyValue("path", path)
                .addKeyValue("status", status)
                .addKeyValue("responseTimeMs", durationMs)
                .log("{} {} {} - {}ms", method, path, status, durationMs);
    }

    /** A teljes kért útvonal a query stringgel együtt (a korábbi Node {@code originalUrl} párja). */
    private static String fullPath(HttpServletRequest request) {
        String query = request.getQueryString();
        return query == null ? request.getRequestURI() : request.getRequestURI() + "?" + query;
    }

    /** 5xx → error, 4xx → warn, minden más → info. */
    private static Level levelFor(int status) {
        if (status >= 500) {
            return Level.ERROR;
        }
        if (status >= 400) {
            return Level.WARN;
        }
        return Level.INFO;
    }
}
