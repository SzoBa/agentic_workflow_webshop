package hu.webshop.ops;

import java.io.IOException;
import org.springframework.boot.autoconfigure.web.WebProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * A lefordított frontend kiszolgálása SPA-visszaeséssel (spec 7.5).
 *
 * <p>Éles üzemben ugyanez a szerver adja a {@code client/dist} tartalmát, és minden
 * olyan útvonal, amihez nincs fájl, az {@code index.html}-t kapja — a kliensoldali
 * útválasztás így mélylinkre és oldalfrissítésre is működik. A kiszolgált könyvtár a
 * {@code STATIC_DIR} konfigurációból jön ({@code application.yml}).
 *
 * <p>Két dolog, amit nem szabad elrontani:
 *
 * <ul>
 *   <li><b>{@code /api/**} SOSEM esik vissza az {@code index.html}-re.</b> Enélkül egy
 *       elgépelt végpont HTML-t adna 200-zal, és a kliens „sikeres" válaszként próbálná
 *       JSON-ként értelmezni — a hiba a hívás helyétől távol derülne ki.</li>
 *   <li><b>Hiányzó {@code client/dist} mellett is el kell indulnia az alkalmazásnak.</b>
 *       Fejlesztés alatt a frontendet a Vite szolgálja ki, tehát a könyvtár tipikusan
 *       nem is létezik. Ezért itt nincs semmilyen létezés-ellenőrzés indításkor: a
 *       hiányzó fájl egyszerűen nem található erőforrás.</li>
 * </ul>
 *
 * <p>A {@link Order} annotáció nem díszítés: a {@code ResourceHandlerRegistry} azonos
 * útvonalmintát (itt {@code /**}) egyetlen kezelőre képez le, és a KÉSŐBB regisztrált
 * nyer. A Spring Boot alapértelmezett statikus kezelője {@code @Order(0)}-val fut, ezért
 * kell nekünk a legalacsonyabb prioritás ahhoz, hogy a mi visszaesésünk maradjon érvényben.
 */
@Configuration
@Order(Ordered.LOWEST_PRECEDENCE)
public class SpaResourceConfig implements WebMvcConfigurer {

    private final WebProperties.Resources resources;

    public SpaResourceConfig(WebProperties webProperties) {
        this.resources = webProperties.getResources();
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        if (!resources.isAddMappings()) {
            // Ha a statikus kiszolgálás konfigurációval ki van kapcsolva, az SPA-visszaesés
            // sem élhet — különben a kikapcsolás felét csendben visszahoznánk.
            return;
        }
        registry.addResourceHandler("/**")
                .addResourceLocations(resources.getStaticLocations())
                .resourceChain(resources.getChain().isCache())
                .addResolver(new SpaFallbackResolver());
    }

    /**
     * Megkeresi a kért fájlt; ha nincs, NEM API útvonal esetén az {@code index.html}-t adja.
     */
    static class SpaFallbackResolver extends PathResourceResolver {

        private static final String INDEX = "index.html";

        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            // A szülő végzi az útvonal-bezárás (path traversal) ellenőrzését is — ezért
            // hívjuk, nem a location.createRelative()-t közvetlenül.
            Resource requested = super.getResource(resourcePath, location);
            if (requested != null) {
                return requested;
            }
            if (isApiPath(resourcePath)) {
                return null;
            }
            return super.getResource(INDEX, location);
        }
    }

    /**
     * API útvonal-e a kért erőforrás. A {@code resourcePath} itt már kezdő {@code /} nélkül
     * érkezik, de a védettséget nem az elnevezési szokásra bízzuk: a vezető {@code /}-eket
     * levágjuk, mielőtt döntenénk.
     */
    static boolean isApiPath(String resourcePath) {
        String path = resourcePath;
        while (path.startsWith("/")) {
            path = path.substring(1);
        }
        return path.equals("api") || path.startsWith("api/");
    }
}
