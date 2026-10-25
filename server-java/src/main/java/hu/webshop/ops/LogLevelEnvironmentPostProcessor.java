package hu.webshop.ops;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.commons.logging.Log;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.boot.logging.DeferredLogFactory;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * A {@code LOG_LEVEL} beállítás megszűrése: érvénytelen érték esetén visszaesés az
 * alapszintre, figyelmeztető naplóbejegyzéssel (spec 7.3, hibakatalógus „Naplóüzenetek").
 *
 * <p>Miért {@link EnvironmentPostProcessor} és nem {@code ApplicationRunner}: az
 * {@code application.yml} a {@code logging.level.root} értékét közvetlenül a nyers
 * {@code LOG_LEVEL} env-változóból veszi, és a naplórendszert a Spring még a
 * bean-ek létrejötte ELŐTT állítja be. Egy futásidejű ellenőrzés tehát elkésne: a
 * Logback addigra már megpróbálta értelmezni a szemetet, és angol nyelvű
 * {@code Cannot set level ...} hibát írt volna ki. Itt viszont még a naplórendszer
 * indítása előtt felülírjuk az értéket, így a felhasználó pontosan egy — magyar,
 * figyelmeztető szintű — üzenetet lát.
 *
 * <p>A figyelmeztetés {@link DeferredLogFactory}-val készül: ekkor még nincs
 * naplórendszer, a Spring a bejegyzést a naplózás inicializálása után játssza vissza.
 *
 * <p>Az érvényes szintek halmaza SZÁNDÉKOSAN szűkebb, mint amit a Logback ismer
 * (nincs {@code trace}, {@code fatal}, {@code off}): a korábbi Node implementáció is
 * pontosan ezt a négyet fogadta el, és a szűkítés azóta a konfigurációs szerződés
 * része (ADR-0006).
 *
 * <p>Regisztráció: {@code META-INF/spring.factories}.
 */
public class LogLevelEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    /** A spec 7.6 szerinti kulcs — nyers környezeti változó, nem Spring-relaxed név. */
    static final String LOG_LEVEL_KEY = "LOG_LEVEL";

    /** Az a property, amit az {@code application.yml} a {@code LOG_LEVEL}-ből tölt. */
    static final String ROOT_LEVEL_PROPERTY = "logging.level.root";

    /** Az alapértelmezett (és a visszaesési) szint. */
    static final String DEFAULT_LEVEL = "info";

    /** Az elfogadott szintek — a korábbi Node oldali {@code VALID_LEVELS} párja. */
    static final List<String> VALID_LEVELS = List.of("debug", "info", "warn", "error");

    private static final String PROPERTY_SOURCE_NAME = "webshopLogLevelFallback";

    private final Log logger;

    public LogLevelEnvironmentPostProcessor(DeferredLogFactory logFactory) {
        this.logger = logFactory.getLog(LogLevelEnvironmentPostProcessor.class);
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment,
            SpringApplication application) {
        String requested = environment.getProperty(LOG_LEVEL_KEY);
        if (requested == null || isValid(requested)) {
            // Nincs beállítva (marad az yml alapértéke), vagy érvényes: nincs teendő.
            return;
        }

        // A legmagasabb prioritású forrásba írunk, így a `${LOG_LEVEL:info}` feloldása
        // helyett ez az érték jut el a naplórendszerhez.
        environment.getPropertySources().addFirst(new MapPropertySource(PROPERTY_SOURCE_NAME,
                Map.of(ROOT_LEVEL_PROPERTY, DEFAULT_LEVEL)));

        // Üres értéknél a Node oldal sem figyelmeztetett (a „nincs megadva" esettel egyenértékű),
        // csak a valóban hibás szintnév kap üzenetet.
        if (!requested.isBlank()) {
            logger.warn("Érvénytelen LOG_LEVEL érték, visszaesés az alapértelmezett szintre"
                    + " (kért: '" + requested + "', érvényesek: " + String.join(", ", VALID_LEVELS)
                    + ", használt: " + DEFAULT_LEVEL + ")");
        }
    }

    /** Elfogadott naplószint-e az érték (kis-nagybetűtől és szóköztől függetlenül). */
    static boolean isValid(String rawLevel) {
        return rawLevel != null && VALID_LEVELS.contains(rawLevel.trim().toLowerCase(Locale.ROOT));
    }

    @Override
    public int getOrder() {
        // A konfigurációs fájlok betöltése UTÁN futunk, hogy a felülírásunk maradjon a
        // property-források élén.
        return Ordered.LOWEST_PRECEDENCE;
    }
}
