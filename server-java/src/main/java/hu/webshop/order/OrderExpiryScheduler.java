package hu.webshop.order;

import hu.webshop.config.AppProperties;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.scheduling.support.PeriodicTrigger;

/**
 * A lejárati kör ütemezése.
 *
 * <p>Miért programozott ütemezés, és nem {@code @Scheduled(fixedDelayString = ...)}: a
 * gyakoriság törtperc is lehet, és a hiányzó/érvénytelen konfiguráció az
 * {@link AppProperties} alapértékére esik vissza — ezt a feloldást egy annotációban lévő
 * property-hivatkozás nem tudná elvégezni.
 *
 * <p>Indításkori pótfutás SZÁNDÉKOSAN nincs (ezért az induló késleltetés a teljes
 * periódus): tudatos döntés, nem hiányosság. Következménye, hogy egy leállás alatt lejárt
 * foglalás az első kör lefutásáig még foglal (ADR-0005, K-2 korlát).
 */
@Configuration
public class OrderExpiryScheduler implements SchedulingConfigurer {

    private static final Logger log = LoggerFactory.getLogger(OrderExpiryScheduler.class);

    private final OrderExpiryService expiry;
    private final AppProperties properties;

    public OrderExpiryScheduler(OrderExpiryService expiry, AppProperties properties) {
        this.expiry = expiry;
        this.properties = properties;
    }

    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        Duration period = Duration.ofMillis(
                Math.max(1, Math.round(properties.sweepMinutes() * 60 * 1000)));
        PeriodicTrigger trigger = new PeriodicTrigger(period);
        trigger.setInitialDelay(period);
        registrar.addTriggerTask(this::run, trigger);
    }

    /**
     * Egy kör lefuttatása. A hiba SOSEM szakíthatja meg az ütemezést: egy meghiúsult kör
     * után a következő ugyanúgy elindul, és a lejárt foglalások akkor zárulnak le.
     */
    private void run() {
        try {
            expiry.sweep();
        } catch (Exception ex) {
            log.error("A lejárati kör futtatása meghiúsult", ex);
        }
    }
}
