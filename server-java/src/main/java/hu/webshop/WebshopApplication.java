package hu.webshop;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * A webshop backend belépési pontja.
 *
 * <p>A Byte Buddy (Hibernate proxy-generálás) a JDK 25 class-file verzióját csak
 * az experimental flaggel fogadja el. A property-t itt állítjuk be, hogy a
 * {@code java -jar} indítás is működjön külön JVM-argumentum nélkül.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class WebshopApplication {

    public static void main(String[] args) {
        System.setProperty("net.bytebuddy.experimental", "true");
        SpringApplication.run(WebshopApplication.class, args);
    }
}
