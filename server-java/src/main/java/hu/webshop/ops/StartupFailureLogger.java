package hu.webshop.ops;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationFailedEvent;
import org.springframework.context.ApplicationListener;

/**
 * Indítási hiba naplózása (hibakatalógus: error — „A szerver indítása meghiúsult").
 *
 * <p>Miért nem {@code @Component}: ha az indítás a kontextus felépítése közben bukik
 * (tipikusan foglalt port vagy elérhetetlen adatbázis), akkor bean-ek már nincsenek,
 * tehát egy bean-ként regisztrált eseményfigyelő éppen abban az esetben NEM futna le,
 * amiért létezik. Ezért a {@code META-INF/spring.factories} regisztrálja: az ilyen
 * figyelőt a {@code SpringApplication} maga tartja számon.
 */
public class StartupFailureLogger implements ApplicationListener<ApplicationFailedEvent> {

    private static final Logger log = LoggerFactory.getLogger(StartupFailureLogger.class);

    @Override
    public void onApplicationEvent(ApplicationFailedEvent event) {
        log.error("A szerver indítása meghiúsult", event.getException());
    }
}
