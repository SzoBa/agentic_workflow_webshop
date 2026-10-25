package hu.webshop.ops;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Életciklus-naplózás: elindult / leállítás folyamatban / leállt (spec 7.3,
 * hibakatalógus „Naplóüzenetek").
 *
 * <p>Miért három külön esemény és miért pont ezekben a pontokban:
 *
 * <ul>
 *   <li>{@link ApplicationReadyEvent}: ekkor fogad már kérést a szerver. A korábbi
 *       pontokon kiírt „elindult" hazugság lenne.</li>
 *   <li>{@link ContextClosedEvent}: a leállás LEGELEJE, még a szabályos leállás (a futó
 *       kérések befejezése) előtt — ezért ez a „folyamatban".</li>
 *   <li>{@link PreDestroy}: a bean-ek megsemmisítése a szabályos leállás UTÁN történik,
 *       tehát itt már tényleg nem szolgálunk ki kérést.</li>
 * </ul>
 *
 * <p>A portot a {@link WebServerInitializedEvent} adja, nem a {@code PORT} konfiguráció:
 * a tényleges portot akarjuk naplózni (teszteknél és a {@code PORT=0} esetén ez eltér a
 * kérttől).
 */
@Component
public class LifecycleLogger {

    private static final Logger log = LoggerFactory.getLogger(LifecycleLogger.class);

    private volatile int port = -1;

    @EventListener
    public void onWebServerInitialized(WebServerInitializedEvent event) {
        this.port = event.getWebServer().getPort();
    }

    @EventListener
    public void onReady(ApplicationReadyEvent event) {
        log.atInfo().addKeyValue("port", port)
                .log("Szerver elindult, a webshop API fut: http://localhost:{}", port);
    }

    @EventListener
    public void onContextClosed(ContextClosedEvent event) {
        log.info("Leállítás folyamatban...");
    }

    @PreDestroy
    public void onStopped() {
        log.info("A szerver leállt.");
    }
}
