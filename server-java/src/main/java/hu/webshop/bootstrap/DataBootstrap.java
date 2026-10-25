package hu.webshop.bootstrap;

import hu.webshop.domain.ProductEntity;
import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.ProductRepository;
import hu.webshop.repo.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Induló állapot: demó katalógus és a „legalább egy admin" invariáns (I-3).
 *
 * <p>Idempotens és tranzakcionális: kétszeri indítás nem duplikál semmit (K-77, K-78).
 * Értékelést SZÁNDÉKOSAN nem seedelünk — a hamis társadalmi bizonyíték rosszabb,
 * mint a „nincs értékelés" állapot, amit a végpontok kifejezetten kezelnek.
 */
@Component
public class DataBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataBootstrap.class);

    /**
     * A seed admin belépési adatai. FEJLESZTŐI ADAT: éles üzemben az első
     * bejelentkezés után cserélendő. A konformancia-esetek bootstrapje ezekre épül
     * (B-1), ezért rögzítettek, és nem konfigurálhatók.
     *
     * <p>VÁLLALT KOCKÁZAT, nem felügyelet (spec 8., K-9 korlát): az
     * {@link #ensureAdmin()} MINDEN admin nélküli adatbázison lefut, tehát egy friss
     * telepítés is mindig ismert felhasználónév/jelszó párossal indul — a fenti
     * „cserélendő" pedig tanács, nem mechanizmus. Az alapértelmezett hitelesítő adat a
     * gyakorlatban az egyik leggyakrabban kihasznált hibaosztály. A rendes megoldás, ha
     * ez a projekt túllép a gyakorlófeladaton: a jelszó környezeti változóból jön, és
     * ha nincs, a rendszer vagy nem hoz létre fiókot, vagy véletlen jelszót generál és
     * EGYSZER naplózza. Lásd ADR-0008 („Consequences").
     */
    public static final String SEED_ADMIN_USERNAME = "adminisztrator";
    public static final String SEED_ADMIN_PASSWORD = "admin123";
    public static final String SEED_ADMIN_EMAIL = "admin@example.com";

    private final ProductRepository products;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;

    public DataBootstrap(ProductRepository products, UserRepository users,
            PasswordEncoder passwordEncoder) {
        this.products = products;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedProducts();
        ensureAdmin();
    }

    /** Üres katalógus esetén 8 demó termék, rögzített azonosítókkal (p1…p8), mind aktív. */
    private void seedProducts() {
        if (products.count() > 0) {
            return;
        }
        products.saveAll(List.of(
                product("p1", "Klasszikus pamut póló",
                        "Kényelmes, 100% pamut póló hétköznapokra.",
                        4990, "https://picsum.photos/seed/tshirt/400/300", 25, "Ruházat"),
                product("p2", "Rozsdamentes kulacs",
                        "0,75 literes, duplafalú, hőtartó kulacs.",
                        6490, "https://picsum.photos/seed/bottle/400/300", 40, "Kiegészítők"),
                product("p3", "Vezeték nélküli fejhallgató",
                        "Bluetooth fejhallgató, akár 20 óra üzemidővel.",
                        19990, "https://picsum.photos/seed/headphones/400/300", 12, "Elektronika"),
                product("p4", "Bőr pénztárca",
                        "Valódi bőrből készült, kompakt pénztárca.",
                        8990, "https://picsum.photos/seed/wallet/400/300", 18, "Kiegészítők"),
                product("p5", "Kerámia bögre",
                        "3 dl-es bögre a reggeli kávéhoz vagy teához.",
                        2490, "https://picsum.photos/seed/mug/400/300", 60, "Otthon"),
                product("p6", "Jegyzetfüzet",
                        "A5-ös, pontrácsos jegyzetfüzet, 120 lap.",
                        1990, "https://picsum.photos/seed/notebook/400/300", 100, "Irodaszer"),
                product("p7", "USB-C töltőkábel",
                        "1 méteres, gyorstöltést támogató USB-C kábel.",
                        1490, "https://picsum.photos/seed/cable/400/300", 80, "Elektronika"),
                product("p8", "Sportzokni (3 pár)",
                        "Légáteresztő sportzokni csomag, 3 pár.",
                        2990, "https://picsum.photos/seed/socks/400/300", 50, "Ruházat")));
        log.info("Demó katalógus létrehozva (8 termék)");
    }

    /**
     * Ha egyetlen admin sincs, a rendszer gondoskodik egyről.
     *
     * <p>Ha a seed felhasználónév vagy e-mail cím már foglalt, NEM hoz létre új
     * fiókot, hanem a meglévő felhasználót lépteti elő — különben sérülne az
     * egyediségi szabály (I-1, I-2).
     */
    private void ensureAdmin() {
        if (users.countByRole(Role.ADMIN) > 0) {
            return;
        }
        Optional<UserEntity> existing = users.findByUsernameIgnoreCase(SEED_ADMIN_USERNAME)
                .or(() -> users.findByEmailIgnoreCase(SEED_ADMIN_EMAIL));

        if (existing.isPresent()) {
            UserEntity user = existing.get();
            user.setRole(Role.ADMIN);
            log.info("Meglévő felhasználó adminná léptetve: {}", user.getId());
            return;
        }

        UserEntity admin = new UserEntity();
        admin.setId(UUID.randomUUID().toString());
        admin.setUsername(SEED_ADMIN_USERNAME);
        admin.setEmail(SEED_ADMIN_EMAIL);
        admin.setAddress("Adminisztrátori cím");
        admin.setPasswordHash(passwordEncoder.encode(SEED_ADMIN_PASSWORD));
        admin.setCreatedAt(Instant.now().truncatedTo(ChronoUnit.MILLIS));
        admin.setRole(Role.ADMIN);
        users.save(admin);
        log.info("Seed admin létrehozva");
    }

    private static ProductEntity product(String id, String name, String description, int price,
            String imageUrl, int stock, String category) {
        ProductEntity product = new ProductEntity();
        product.setId(id);
        product.setName(name);
        product.setDescription(description);
        product.setPrice(price);
        product.setImageUrl(imageUrl);
        product.setStock(stock);
        product.setCategory(category);
        product.setActive(true);
        return product;
    }
}
