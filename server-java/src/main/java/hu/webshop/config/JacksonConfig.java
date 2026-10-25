package hu.webshop.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.io.IOException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Az időbélyegek szerializálása.
 *
 * <p>A szerződés ISO időbélyegeket ír elő, méghozzá a JavaScript {@code toISOString()}
 * alakjában — MINDIG UTC, MINDIG három tizedes ({@code 2026-07-26T08:56:12.645Z}) —,
 * mert a korábbi Node implementáció ezt adta, és az alak azóta a szerződés része. A
 * Jackson alapértelmezése ettől eltér (a
 * nulla ezredmásodperc lemarad, a mikroszekundum viszont kiíródik), ezért saját
 * szerializáló rögzíti az alakot — a kliens és a konformancia-futtató is erre épül.
 */
@Configuration
public class JacksonConfig {

    private static final DateTimeFormatter ISO_MILLIS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer isoInstantCustomizer() {
        SimpleModule module = new SimpleModule();
        module.addSerializer(Instant.class, new JsonSerializer<Instant>() {
            @Override
            public void serialize(Instant value, JsonGenerator gen, SerializerProvider serializers)
                    throws IOException {
                gen.writeString(ISO_MILLIS.format(value));
            }
        });
        return builder -> builder.modulesToInstall(module);
    }

    /** Az ISO alak máshol is kell (pl. számolt mezők szövegként). */
    public static String toIso(Instant instant) {
        return instant == null ? null : ISO_MILLIS.format(instant);
    }
}
