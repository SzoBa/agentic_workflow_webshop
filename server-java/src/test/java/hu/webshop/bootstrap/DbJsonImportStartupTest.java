package hu.webshop.bootstrap;

import static org.assertj.core.api.Assertions.assertThat;

import hu.webshop.WebshopApplication;
import hu.webshop.domain.Role;
import hu.webshop.repo.ProductRepository;
import hu.webshop.repo.UserRepository;
import hu.webshop.support.IntegrationTest;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * Az import BEKÖTÉSE — nem a tartalma (azt a {@link DbJsonImportTest} méri).
 *
 * <p>Miért kell külön: a {@code DbJsonImportTest} közvetlenül hívja az importálót, ezért
 * két dolgot NEM tud igazolni, és pont ez a kettő romolhat el némán:
 *
 * <ul>
 *   <li>az {@code IMPORT_FILE} → {@code webshop.import-file} property-kötés,</li>
 *   <li>az {@link org.springframework.core.annotation.Order} sorrend: az importálónak a
 *       {@link DataBootstrap} ELŐTT kell futnia. Ha fordítva futna, a bootstrap előbb
 *       létrehozná a 8 demó terméket, és az importáló már nem üres adatbázist látna —
 *       vagyis csendben kihagyná magát. Ez a tesztek nélkül csak élesben derülne ki.</li>
 * </ul>
 *
 * <p>Ezért egy VALÓDI alkalmazáspéldány indul, parancssori argumentummal, ugyanarra az
 * adatbázisra — ez a legközelebbi dolog egy éles indításhoz.
 */
class DbJsonImportStartupTest extends IntegrationTest {

    @TempDir
    Path tempDir;

    @Autowired
    private ProductRepository products;

    @Autowired
    private UserRepository users;

    /**
     * Az importáló csak ÜRES adatbázisba tölt, az {@link IntegrationTest} viszont minden
     * teszt előtt lefuttatja az induló állapotot — ezért itt külön ürítünk.
     */
    @BeforeEach
    void emptyTheStore() {
        transactions.executeWithoutResult(status -> entityManager.createNativeQuery(
                        "truncate table order_items, orders, reviews, login_attempts, users,"
                                + " products restart identity cascade")
                .executeUpdate());
    }

    @Test
    void importRunsAtStartupBeforeSeedCatalog() throws IOException {
        Path file = tempDir.resolve("db.json");
        Files.writeString(file, """
                {
                  "products": [
                    {"id":"importalt","name":"Importált termék","description":"A",
                     "price":1234,"imageUrl":"https://example.com/i.png","stock":7,
                     "category":"Import","active":true}
                  ],
                  "users": [
                    {"id":"u-import","username":"importaltvevo","email":"import@example.com",
                     "address":"Import u. 1.","createdAt":"2026-07-01T10:00:00.000Z",
                     "role":"customer"}
                  ]
                }
                """);

        try (ConfigurableApplicationContext ignored = startWithImport(file)) {
            // A katalógusban KIZÁRÓLAG az importált termék van. Ha a bootstrap futott volna
            // előbb, itt 8 (vagy 9) termék állna — ez a sorrend bizonyítéka.
            assertThat(products.count()).isEqualTo(1);
            assertThat(products.findById("importalt")).get()
                    .satisfies(product -> assertThat(product.getPrice()).isEqualTo(1234));
            assertThat(products.findById("p1")).isEmpty();

            // A „legalább egy admin" invariánst a bootstrap az import UTÁN is érvényesíti:
            // a fájlban csak customer volt, tehát létrejött a seed admin.
            assertThat(users.count()).isEqualTo(2);
            assertThat(users.findByUsernameIgnoreCase("importaltvevo")).get()
                    .satisfies(user -> assertThat(user.getRole()).isEqualTo(Role.CUSTOMER));
            assertThat(users.findByUsernameIgnoreCase(DataBootstrap.SEED_ADMIN_USERNAME)).get()
                    .satisfies(user -> assertThat(user.getRole()).isEqualTo(Role.ADMIN));
        }
    }

    /**
     * Friss alkalmazáspéldány, importtal, véletlen porton.
     *
     * <p>A beállítások PARANCSSORI argumentumként mennek át, nem
     * {@code SpringApplicationBuilder.properties()}-szel: az utóbbi „default properties"-t
     * állít, ami a LEGALACSONYABB precedenciájú forrás — az {@code application.yml}
     * felülírná, és a példány a rendes 3001-es portra indulna.
     */
    private ConfigurableApplicationContext startWithImport(Path file) {
        String[] args = java.util.stream.Stream.concat(
                        java.util.Arrays.stream(datasourceProperties()),
                        java.util.stream.Stream.of(
                                "server.port=0",
                                "webshop.import-file=" + file))
                .map(property -> "--" + property)
                .toArray(String[]::new);
        return new SpringApplicationBuilder(WebshopApplication.class).run(args);
    }
}
