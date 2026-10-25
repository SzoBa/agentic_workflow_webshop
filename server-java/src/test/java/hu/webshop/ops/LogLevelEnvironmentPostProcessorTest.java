package hu.webshop.ops;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.function.Supplier;
import org.apache.commons.logging.Log;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.logging.DeferredLogFactory;
import org.springframework.mock.env.MockEnvironment;

/**
 * A naplószint-szűrés (spec 7.3) egysége. Szándékosan NEM integrációs teszt: a
 * vizsgált komponens a Spring kontextus felépítése ELŐTT fut, tehát pont az a
 * környezet nem áll rendelkezésre, amiben egy {@code @SpringBootTest} mérné.
 */
class LogLevelEnvironmentPostProcessorTest {

    /** A halasztott naplózás helyett a teszt azonnal feloldja a Log-ot. */
    private static final DeferredLogFactory LOGS = (Supplier<Log> destination) -> destination.get();

    private final LogLevelEnvironmentPostProcessor processor =
            new LogLevelEnvironmentPostProcessor(LOGS);

    @Test
    void doesNotOverrideValidLevel() {
        MockEnvironment environment = new MockEnvironment().withProperty("LOG_LEVEL", "warn");

        processor.postProcessEnvironment(environment, new SpringApplication());

        // Nincs felülírás: a szintet az application.yml `${LOG_LEVEL:info}` oldja fel.
        assertThat(environment.getProperty("logging.level.root")).isNull();
    }

    @Test
    void invalidLevelFallsBackToDefault() {
        MockEnvironment environment = new MockEnvironment().withProperty("LOG_LEVEL", "hangos");

        processor.postProcessEnvironment(environment, new SpringApplication());

        assertThat(environment.getProperty("logging.level.root")).isEqualTo("info");
    }

    @Test
    void missingLevelOverridesNothing() {
        MockEnvironment environment = new MockEnvironment();

        processor.postProcessEnvironment(environment, new SpringApplication());

        assertThat(environment.getProperty("logging.level.root")).isNull();
    }

    @Test
    void emptyLevelFallsBackToDefault() {
        // Az `${LOG_LEVEL:info}` alapértéke ilyenkor NEM lép életbe (a változó létezik,
        // csak üres), ezért a Logback üres szintnevet kapna — ezt is el kell fognunk.
        MockEnvironment environment = new MockEnvironment().withProperty("LOG_LEVEL", "");

        processor.postProcessEnvironment(environment, new SpringApplication());

        assertThat(environment.getProperty("logging.level.root")).isEqualTo("info");
    }

    @Test
    void levelRecognitionIsCaseInsensitive() {
        assertThat(LogLevelEnvironmentPostProcessor.isValid("INFO")).isTrue();
        assertThat(LogLevelEnvironmentPostProcessor.isValid(" Debug ")).isTrue();
        assertThat(LogLevelEnvironmentPostProcessor.isValid("error")).isTrue();
        // A Logback ismeri, a szerződésünk viszont nem — így érvénytelen.
        assertThat(LogLevelEnvironmentPostProcessor.isValid("trace")).isFalse();
        assertThat(LogLevelEnvironmentPostProcessor.isValid("off")).isFalse();
        assertThat(LogLevelEnvironmentPostProcessor.isValid(null)).isFalse();
    }
}
