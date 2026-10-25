package hu.webshop.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import hu.webshop.config.AppProperties;
import hu.webshop.domain.LoginAttemptEntity;
import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderItemEntity;
import hu.webshop.domain.OrderStatus;
import hu.webshop.domain.ProductEntity;
import hu.webshop.domain.ReviewEntity;
import hu.webshop.domain.ReviewStatus;
import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.LoginAttemptRepository;
import hu.webshop.repo.OrderRepository;
import hu.webshop.repo.ProductRepository;
import hu.webshop.repo.ReviewRepository;
import hu.webshop.repo.UserRepository;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Egy meglévő lowdb {@code db.json} EGYSZERI átvétele Postgresbe
 * ({@code tasks.md} B7.3, {@code plan.md} B.4).
 *
 * <p>Bekapcsolás: {@code IMPORT_FILE=../server/data/db.json}. Üres értéknél nem
 * csinál semmit — ez a normál üzem.
 *
 * <p><b>Nem futásidejű viselkedés.</b> A {@code requirements.md} 8. fejezetének
 * {@code FORRÁS} szabályai (hiányzó gyűjtemény, hiányzó {@code active}/{@code role},
 * ismeretlen rendelési státusz) a séma nélküli JSON-tároló sajátosságai; relációs
 * sémán elő sem állhatnak. Itt mégis érvényesek, mert a BEJÖVŐ fájl még a régi
 * séma szerint készült.
 *
 * <p><b>Jelszavak NEM jönnek át.</b> A régi tároló scryptet használt külön sóval,
 * ez a modul BCryptet egyetlen oszlopban — a kettő nem konvertálható
 * egymásba, visszafejteni pedig nem lehet. Az importált fiókok ezért olyan
 * jelszóhasht kapnak, amire semmilyen jelszó nem illik, és a felhasználóknak új
 * jelszót kell kapniuk. Ez TUDATOS döntés: az alternatíva egy scrypt-ellenőrző
 * réteg lett volna a Java oldalon.
 *
 * <p><b>Mindent vagy semmit.</b> Egyetlen tranzakció: bármelyik rekord hibája az
 * egész importot visszagörgeti — félig átvett adatbázisnál a tiszta újrapróbálás
 * a kevésbé kockázatos.
 *
 * <p>A {@link DataBootstrap} elé van rendezve, és nem ütközik vele: a bootstrap a
 * demó katalógust csak ÜRES termékhalmaznál hozza létre, a „legalább egy admin"
 * invariánst pedig az import után is helyesen alkalmazza.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class DbJsonImporter implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DbJsonImporter.class);

    /** Egyetlen példány: a {@code SecureRandom} felépítése (seedelése) drága. */
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppProperties properties;
    private final ObjectMapper mapper;
    private final ProductRepository products;
    private final UserRepository users;
    private final OrderRepository orders;
    private final ReviewRepository reviews;
    private final LoginAttemptRepository loginAttempts;
    private final PasswordEncoder passwordEncoder;

    public DbJsonImporter(AppProperties properties, ObjectMapper mapper,
            ProductRepository products, UserRepository users, OrderRepository orders,
            ReviewRepository reviews, LoginAttemptRepository loginAttempts,
            PasswordEncoder passwordEncoder) {
        this.properties = properties;
        this.mapper = mapper;
        this.products = products;
        this.users = users;
        this.orders = orders;
        this.reviews = reviews;
        this.loginAttempts = loginAttempts;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws IOException {
        String file = properties.getImportFile();
        if (file == null || file.isBlank()) {
            return;
        }

        // Nem üres adatbázisba nem importálunk. Nem hiba: így a beállítás
        // bennfelejtése nem akadályozza meg a következő indulást, és nem is
        // duplikál — az import egyszeri művelet.
        if (!isEmpty()) {
            log.warn("Az adatbázis nem üres, a db.json importálása kimarad");
            return;
        }

        Path path = Path.of(file.trim());
        if (!Files.isRegularFile(path)) {
            throw new IllegalStateException(
                    "Az importálandó fájl nem található: " + path.toAbsolutePath());
        }

        JsonNode root = mapper.readTree(Files.readString(path));
        log.info("db.json importálása indul: {}", path.toAbsolutePath());

        int productCount = importProducts(root.path("products"));
        int userCount = importUsers(root.path("users"));
        int orderCount = importOrders(root.path("orders"));
        int reviewCount = importReviews(root.path("reviews"));
        int attemptCount = importLoginAttempts(root.path("loginAttempts"));

        log.atInfo()
                .addKeyValue("products", productCount)
                .addKeyValue("users", userCount)
                .addKeyValue("orders", orderCount)
                .addKeyValue("reviews", reviewCount)
                .addKeyValue("loginAttempts", attemptCount)
                .log("db.json importálása kész");

        if (userCount > 0) {
            log.warn("{} felhasználó jelszava NEM jött át (scrypt → BCrypt): "
                    + "új jelszót kell kapniuk", userCount);
        }
    }

    /** Csak teljesen üres adatbázisba importálunk — egyetlen sor is leállítja. */
    private boolean isEmpty() {
        return products.count() == 0 && users.count() == 0 && orders.count() == 0
                && reviews.count() == 0 && loginAttempts.count() == 0;
    }

    // --- Gyűjtemények -------------------------------------------------------
    //
    // A beszúrás SORRENDBEN történik: a `seq` oszlop ebből kapja az értékét, és a
    // listák sorrendje a szerződés része. Ezért nincs `saveAll` — a soronkénti
    // mentés teszi láthatóvá, hogy a sorrend szándékos.

    private int importProducts(JsonNode array) {
        int count = 0;
        for (JsonNode node : arrayOrEmpty(array)) {
            ProductEntity product = new ProductEntity();
            product.setId(requireText(node, "id", "termék"));
            product.setName(text(node, "name", ""));
            product.setDescription(text(node, "description", ""));
            product.setPrice(positiveInt(node, "price", product.getId(), "termék ára"));
            product.setImageUrl(text(node, "imageUrl", ""));
            product.setStock(nonNegativeInt(node, "stock", product.getId(), "termék készlete"));
            product.setCategory(text(node, "category", ""));
            // FORRÁS: hiányzó `active` → true, hogy a bővítés előtti termékek
            // láthatók maradjanak.
            product.setActive(!node.path("active").isBoolean() || node.path("active").asBoolean());
            products.save(product);
            count++;
        }
        return count;
    }

    private int importUsers(JsonNode array) {
        Set<String> usernames = new HashSet<>();
        Set<String> emails = new HashSet<>();
        int count = 0;
        for (JsonNode node : arrayOrEmpty(array)) {
            UserEntity user = new UserEntity();
            user.setId(requireText(node, "id", "felhasználó"));
            user.setUsername(text(node, "username", ""));
            user.setEmail(text(node, "email", ""));
            user.setAddress(text(node, "address", ""));

            // I-1, I-2: az egyediség kis/nagybetűtől FÜGGETLEN — pontosan úgy, ahogy
            // a `users_username_lower_uidx` / `users_email_lower_uidx` indexek.
            requireUniqueIgnoreCase(usernames, user.getUsername(), user.getId(), "felhasználónév");
            requireUniqueIgnoreCase(emails, user.getEmail(), user.getId(), "e-mail cím");

            user.setPasswordHash(unusablePasswordHash());
            // A munkamenet SEM jön át: a token megtartása belépve hagyna olyan
            // felhasználókat, akik utána soha nem tudnának újra belépni.
            user.setTokenHash(null);
            user.setTokenExpiresAt(null);
            user.setCreatedAt(instant(node, "createdAt", user.getId()));
            // FORRÁS: ismeretlen vagy hiányzó szerepkör → customer.
            Role role = Role.from(text(node, "role", null));
            user.setRole(role == null ? Role.CUSTOMER : role);
            users.save(user);
            count++;
        }
        return count;
    }

    private int importOrders(JsonNode array) {
        int count = 0;
        for (JsonNode node : arrayOrEmpty(array)) {
            OrderEntity order = new OrderEntity();
            order.setId(requireText(node, "id", "rendelés"));
            // A `userId` szándékosan nem idegen kulcs (ADR-0001): a rendelés
            // önálló bizonylat, akkor is megáll, ha a fiók már nincs meg.
            order.setUserId(text(node, "userId", null));

            JsonNode customer = node.path("customer");
            order.setCustomerName(text(customer, "name", ""));
            order.setCustomerEmail(text(customer, "email", ""));
            order.setCustomerAddress(text(customer, "address", ""));
            order.setTotal(nonNegativeInt(node, "total", order.getId(), "rendelés végösszege"));
            order.setCreatedAt(instant(node, "createdAt", order.getId()));

            // FORRÁS: ismeretlen vagy hiányzó státusz → pending, NEM delivered.
            // Az „ellenőrzött vásárló" szabály erre épül, és egy régi rendelésről
            // nem tudjuk, kiszállították-e — a szigorúbb alapértelmezés a biztonságos.
            OrderStatus status = OrderStatus.from(text(node, "status", null));
            order.setStatus(status == null ? OrderStatus.PENDING : status);

            for (JsonNode itemNode : arrayOrEmpty(node.path("items"))) {
                OrderItemEntity item = new OrderItemEntity();
                item.setProductId(requireText(itemNode, "productId", "rendelési tétel"));
                item.setQuantity(
                        atLeastOne(itemNode, "quantity", order.getId(), "tétel darabszáma"));
                // A snapshot mezők ÁTMÁSOLÓDNAK, nem újraszámolódnak a katalógusból:
                // egy régi rendelés tartalma nem változhat meg az importtól (ADR-0001).
                // A snapshot bevezetése előtti tételeken hiányoznak — maradnak null.
                item.setName(text(itemNode, "name", null));
                item.setUnitPrice(itemNode.path("unitPrice").isNumber()
                        ? itemNode.path("unitPrice").asInt() : null);
                order.addItem(item);
            }
            orders.save(order);
            count++;
        }
        return count;
    }

    private int importReviews(JsonNode array) {
        Set<String> seen = new HashSet<>();
        int count = 0;
        for (JsonNode node : arrayOrEmpty(array)) {
            ReviewEntity review = new ReviewEntity();
            review.setId(requireText(node, "id", "értékelés"));
            review.setProductId(requireText(node, "productId", "értékelés"));
            review.setAuthor(requireText(node, "author", "értékelés"));
            review.setRating(rating(node, review.getId()));
            String body = text(node, "body", null);
            review.setBody(body == null || body.isBlank() ? null : body);
            ReviewStatus status = ReviewStatus.from(text(node, "status", null));
            review.setStatus(status == null ? ReviewStatus.PENDING : status);
            review.setCreatedAt(instant(node, "createdAt", review.getId()));
            review.setUpdatedAt(instant(node, "updatedAt", review.getId()));

            // I-4: egy felhasználó egy terméket legfeljebb egyszer értékelhet.
            // A `reviews_product_author_uidx` index NEM `LOWER()`-es, ezért itt sem
            // kisbetűsítünk: az őrszem pontosan azt a szabályt védje, ami az
            // adatbázisban áll — különben olyan fájlt is elutasítana, amit a séma
            // elfogadna.
            requireUnique(seen, List.of(review.getProductId(), review.getAuthor()),
                    review.getId(), "termék–szerző pár");
            reviews.save(review);
            count++;
        }
        return count;
    }

    /**
     * A bejelentkezési számlálók IS átjönnek: egy folyamatban lévő brute-force
     * kísérlet nem kaphat tiszta lapot attól, hogy a bolt backendet váltott.
     */
    private int importLoginAttempts(JsonNode array) {
        int count = 0;
        for (JsonNode node : arrayOrEmpty(array)) {
            LoginAttemptEntity attempt = new LoginAttemptEntity();
            attempt.setKey(requireText(node, "key", "bejelentkezési számláló"));
            attempt.setAttempts(Math.max(0, node.path("count").asInt(0)));
            attempt.setFirstAt(instant(node, "first", attempt.getKey()));
            loginAttempts.save(attempt);
            count++;
        }
        return count;
    }

    // --- Segédek ------------------------------------------------------------

    /**
     * Olyan jelszóhash, amire semmilyen jelszó nem illik.
     *
     * <p>Nem üres és nem szemét-szöveg: valódi BCrypt hash egy eldobott, véletlen
     * titokból. Így a jelszóellenőrzés a szokásos úton fut le és hamisat ad,
     * ahelyett hogy formátumhibára figyelmeztetne minden bejelentkezési
     * kísérletnél. Fiókonként külön érték: azonos hash mellett látszana, hogy a
     * fiókok „egyformák".
     */
    private String unusablePasswordHash() {
        byte[] random = new byte[32];
        RANDOM.nextBytes(random);
        return passwordEncoder.encode(Base64.getEncoder().encodeToString(random));
    }

    /** FORRÁS: a hiányzó gyűjtemény üresnek számít, nem hibának. */
    private static Iterable<JsonNode> arrayOrEmpty(JsonNode node) {
        return node != null && node.isArray() ? node : List.<JsonNode>of();
    }

    private static String text(JsonNode node, String field, String fallback) {
        JsonNode value = node.path(field);
        return value.isTextual() ? value.asText() : fallback;
    }

    private static String requireText(JsonNode node, String field, String what) {
        String value = text(node, field, null);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Hiányzó vagy üres '" + field + "' mező egy " + what + " rekordban");
        }
        return value;
    }

    /**
     * Egész érték kiolvasása — a törtszám NEM csonkul némán.
     *
     * <p>Az {@code asInt()} önmagában levágná a tizedeseket ({@code 1000.5} → {@code 1000}),
     * ami migráció közben csendes adatmódosítás: a bolt más áron adná a terméket, és senki
     * nem tudná, mikor csúszott el. Inkább hangosan elutasítjuk.
     */
    private static int integer(JsonNode node, String field, String id, String what) {
        JsonNode value = node.path(field);
        if (!value.isIntegralNumber()) {
            throw new IllegalStateException("Érvénytelen " + what + " (" + id + "): "
                    + (value.isMissingNode() ? "hiányzik" : value.asText())
                    + " — egész szám kell");
        }
        return value.asInt();
    }

    private static int positiveInt(JsonNode node, String field, String id, String what) {
        int value = integer(node, field, id, what);
        if (value <= 0) {
            throw new IllegalStateException(
                    "Érvénytelen " + what + " (" + id + "): " + value + " — pozitív szám kell");
        }
        return value;
    }

    private static int nonNegativeInt(JsonNode node, String field, String id, String what) {
        int value = integer(node, field, id, what);
        if (value < 0) {
            throw new IllegalStateException(
                    "Érvénytelen " + what + " (" + id + "): " + value + " — nem lehet negatív");
        }
        return value;
    }

    private static int atLeastOne(JsonNode node, String field, String id, String what) {
        int value = integer(node, field, id, what);
        if (value < 1) {
            throw new IllegalStateException(
                    "Érvénytelen " + what + " (" + id + "): " + value + " — legalább 1 kell");
        }
        return value;
    }

    private static int rating(JsonNode node, String id) {
        int value = integer(node, "rating", id, "értékelés");
        if (value < 1 || value > 5) {
            throw new IllegalStateException(
                    "Érvénytelen értékelés (" + id + "): " + value + " — 1 és 5 közötti egész kell");
        }
        return value;
    }

    /**
     * Egyediség-ellenőrzés kis/nagybetűre ÉRZÉKENYEN, összetett kulccsal.
     *
     * <p>A kulcs {@link List}, nem összefűzött szöveg: egy elválasztó karakterrel
     * összeragasztott kulcsnál két különböző pár ütközhetne, ha a komponens maga is
     * tartalmazza az elválasztót.
     */
    private static void requireUnique(Set<String> seen, List<String> key, String id, String what) {
        if (!seen.add(key.toString())) {
            throw new IllegalStateException(
                    "Ütköző " + what + " a forrásfájlban (" + id + "): " + String.join(" / ", key));
        }
    }

    /** Egyediség-ellenőrzés kis/nagybetűtől FÜGGETLENÜL (a `LOWER()`-es indexekhez). */
    private static void requireUniqueIgnoreCase(Set<String> seen, String value, String id,
            String what) {
        if (!seen.add(value.toLowerCase(Locale.ROOT))) {
            throw new IllegalStateException(
                    "Ütköző " + what + " a forrásfájlban (" + id + "): " + value);
        }
    }

    /**
     * ISO időbélyeg beolvasása. Hiányzó vagy értelmezhetetlen érték esetén HIBA.
     *
     * <p>Korábban a jelen idő lépett a helyébe. Ez migrációnál rossz csere: az
     * importáló nem találhat ki adatot. A „most" beírása egy értékelésnél
     * {@code updatedAt < createdAt} állapotot is szülhet, egy rendelésnél pedig
     * a foglalás lejáratát tolná el — mindkettő némán. Ha a forrásfájl hiányos,
     * azt javítani kell, nem elfedni; az import mindent-vagy-semmit, tehát a
     * tiszta újrapróbálás olcsó.
     */
    private static Instant instant(JsonNode node, String field, String id) {
        String raw = text(node, field, null);
        if (raw == null) {
            throw new IllegalStateException(
                    "Hiányzó '" + field + "' időbélyeg (" + id + ")");
        }
        try {
            return Instant.parse(raw);
        } catch (DateTimeParseException ex) {
            throw new IllegalStateException(
                    "Értelmezhetetlen '" + field + "' időbélyeg (" + id + "): " + raw);
        }
    }
}
