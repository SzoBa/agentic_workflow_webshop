package hu.webshop.config;

import hu.webshop.security.AdminInterceptor;
import hu.webshop.security.AuthInterceptor;
import hu.webshop.security.CurrentUserArgumentResolver;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * A webréteg bekötése: hitelesítés, jogosultság, a belépett felhasználó feloldása, CORS.
 *
 * <p>A védett útvonalak listája ITT van, egy helyen. Az {@code /api/admin/**}
 * névtér egészét egyetlen minta védi — nem végpontonkénti annotáció —, így egy új
 * admin végpontnál nem felejthető el (K-70, K-71).
 *
 * <p>A hitelesítés és a jogosultság KÉT interceptor, mert a bekötési mintájuk más. Az
 * admin névtérre így nem prefix-összehasonlítás dönt, hanem maga a regisztráció — az
 * összehasonlítás ugyanis nem üres context path mellett csendben hamis lenne (K-58,
 * lásd {@code AuthInterceptor} osztálykomment).
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    /**
     * Hitelesítést igénylő útvonalak. A {@code /api/reviews} kivételesen pontos minta,
     * nem {@code /**}: az egyetlen alatta lévő végpont, a
     * {@code GET /api/products/{id}/reviews}, publikus (K-65…K-67).
     *
     * <p>Az {@code /api/auth} névtér ugyanezért szerepel VÉGPONTONKÉNT: a regisztráció
     * és a bejelentkezés nyilvános, tehát egy {@code /api/auth/**} minta kizárná a
     * belépés lehetőségét. Az útvonalminta a HTTP-metódusra nem szűkít, ezért a
     * {@code /api/auth/me} egy mintával védi a {@code GET}-et és a {@code PUT}-ot is.
     */
    private static final String[] PROTECTED_PATTERNS = {
        "/api/admin/**",
        "/api/orders",
        "/api/orders/**",
        "/api/reviews",
        "/api/auth/me",
        "/api/auth/logout",
        "/api/auth/password",
    };

    /** Admin szerepkört igénylő útvonalak — a hitelesítettek RÉSZHALMAZA. */
    private static final String[] ADMIN_PATTERNS = {
        "/api/admin/**",
    };

    private final AuthInterceptor authInterceptor;
    private final AdminInterceptor adminInterceptor;
    private final CurrentUserArgumentResolver currentUserArgumentResolver;
    private final AppProperties properties;

    public WebConfig(AuthInterceptor authInterceptor,
            AdminInterceptor adminInterceptor,
            CurrentUserArgumentResolver currentUserArgumentResolver,
            AppProperties properties) {
        this.authInterceptor = authInterceptor;
        this.adminInterceptor = adminInterceptor;
        this.currentUserArgumentResolver = currentUserArgumentResolver;
        this.properties = properties;
    }

    /** Jelszóhash-elés a platform szabványos eszközével. */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * A sorrend számít: előbb 401 (ki vagy?), utána 403 (szabad-e?). Az interceptorok
     * regisztrációs sorrendben futnak, tehát az admin-ellenőrzés már a hitelesített
     * felhasználót látja a kérés attribútumában.
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor).addPathPatterns(PROTECTED_PATTERNS);
        registry.addInterceptor(adminInterceptor).addPathPatterns(ADMIN_PATTERNS);
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserArgumentResolver);
    }

    /**
     * CORS kizárólag konfigurált eredetekre. ÜRES {@code CORS_ORIGINS} esetén nincs
     * regisztráció, tehát a válaszban egyáltalán nincs CORS fejléc (K-76) — sem a
     * fejlesztői proxy, sem az éles static kiszolgálás nem támaszkodik rá.
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> origins = properties.corsOrigins();
        if (origins.isEmpty()) {
            return;
        }
        registry.addMapping("/api/**")
                .allowedOrigins(origins.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }
}
