package hu.webshop.bootstrap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.domain.OrderStatus;
import hu.webshop.domain.ReviewStatus;
import hu.webshop.domain.Role;
import hu.webshop.repo.LoginAttemptRepository;
import hu.webshop.repo.OrderRepository;
import hu.webshop.repo.ProductRepository;
import hu.webshop.repo.ReviewRepository;
import hu.webshop.repo.UserRepository;
import hu.webshop.support.IntegrationTest;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * B7.3: meglévő {@code db.json} átvétele.
 *
 * <p>A tesztek az importálót KÖZVETLENÜL hívják, nem alkalmazásindítással: a
 * {@code IMPORT_FILE} kulcs indításkor olvasódik, tesztenként más fájllal pedig
 * osztályonként új Spring-kontextus kellene. Az importáló ugyanaz az egy
 * tranzakciós metódus mindkét úton, tehát a mért viselkedés azonos.
 *
 * <p>Az {@link IntegrationTest} minden teszt előtt ürít ÉS lefuttatja az induló
 * állapotot, ezért az import előtt itt külön ürítünk — az importáló szándékosan
 * kihagyja magát nem üres adatbázison.
 */
class DbJsonImportTest extends IntegrationTest {

    @TempDir
    Path tempDir;

    @Autowired
    private DbJsonImporter importer;

    @Autowired
    private ProductRepository products;

    @Autowired
    private UserRepository users;

    @Autowired
    private OrderRepository orders;

    @Autowired
    private ReviewRepository reviews;

    @Autowired
    private LoginAttemptRepository loginAttempts;

    @BeforeEach
    void emptyTheStore() {
        transactions.executeWithoutResult(status -> entityManager.createNativeQuery(
                        "truncate table order_items, orders, reviews, login_attempts, users,"
                                + " products restart identity cascade")
                .executeUpdate());
    }

    /**
     * A beállítás visszaállítása: az {@link hu.webshop.config.AppProperties} egy
     * MEGOSZTOTT bean a kontextusban, és egy bennfelejtett útvonal a többi
     * tesztosztály indulását is importra bírná.
     */
    @AfterEach
    void clearImportFile() {
        ReflectionTestUtils.setField(importerProperties(), "importFile", null);
    }

    /** A teljes, mai sémájú fájl minden gyűjteménye átjön, sorrendhelyesen. */
    @Test
    void everyCollectionOfTheFullFileIsImported() throws IOException {
        importFile("""
                {
                  "products": [
                    {"id":"p1","name":"Első","description":"A","price":1000,
                     "imageUrl":"https://example.com/1.png","stock":5,"category":"Teszt",
                     "active":true},
                    {"id":"p2","name":"Második","description":"B","price":2000,
                     "imageUrl":"https://example.com/2.png","stock":0,"category":"Teszt",
                     "active":false}
                  ],
                  "users": [
                    {"id":"u1","username":"vevo","email":"vevo@example.com","address":"Cím 1",
                     "passwordHash":"abc","passwordSalt":"def","token":"regi-token",
                     "tokenExpiresAt":"2026-08-01T10:00:00.000Z",
                     "createdAt":"2026-07-01T10:00:00.000Z","role":"customer"},
                    {"id":"u2","username":"fonok","email":"fonok@example.com","address":"Cím 2",
                     "passwordHash":"abc","passwordSalt":"def","token":null,
                     "tokenExpiresAt":null,
                     "createdAt":"2026-07-02T10:00:00.000Z","role":"admin"}
                  ],
                  "orders": [
                    {"id":"o1","items":[{"productId":"p1","quantity":2,"name":"Első","unitPrice":900}],
                     "customer":{"name":"Vevő Elek","email":"vevo@example.com","address":"Cím 1"},
                     "total":1800,"createdAt":"2026-07-03T10:00:00.000Z","userId":"u1",
                     "status":"delivered"}
                  ],
                  "reviews": [
                    {"id":"r1","productId":"p1","author":"u1","rating":4,"body":"Jó volt.",
                     "status":"approved","createdAt":"2026-07-04T10:00:00.000Z",
                     "updatedAt":"2026-07-05T10:00:00.000Z"}
                  ],
                  "loginAttempts": [
                    {"key":"10.0.0.9","count":7,"first":"2026-07-06T10:00:00.000Z"}
                  ]
                }
                """);

        assertThat(products.count()).isEqualTo(2);
        assertThat(users.count()).isEqualTo(2);
        assertThat(orders.count()).isEqualTo(1);
        assertThat(reviews.count()).isEqualTo(1);
        assertThat(loginAttempts.count()).isEqualTo(1);

        assertThat(products.findById("p2")).get()
                .satisfies(product -> assertThat(product.isActive()).isFalse());
        assertThat(users.findById("u2")).get()
                .satisfies(user -> assertThat(user.getRole()).isEqualTo(Role.ADMIN));
        assertThat(reviews.findById("r1")).get()
                .satisfies(review -> assertThat(review.getStatus())
                        .isEqualTo(ReviewStatus.APPROVED));
        assertThat(loginAttempts.findById("10.0.0.9")).get()
                .satisfies(attempt -> assertThat(attempt.getAttempts()).isEqualTo(7));
    }

    /**
     * A régi rendelések snapshot mezői SÉRTETLENEK: a tétel neve és egységára a
     * rendelésen tárolt másolatból jön, nem a katalógusból (ADR-0001). Ezt onnan
     * látni, hogy a snapshot ára (900) eltér a termék mai árától (1000).
     */
    @Test
    void legacyOrderSnapshotFieldsStayIntact() throws IOException {
        importFile("""
                {
                  "products": [
                    {"id":"p1","name":"MAI név","description":"A","price":1000,
                     "imageUrl":"https://example.com/1.png","stock":5,"category":"Teszt",
                     "active":true}
                  ],
                  "users": [],
                  "orders": [
                    {"id":"o1",
                     "items":[
                       {"productId":"p1","quantity":2,"name":"AKKORI név","unitPrice":900},
                       {"productId":"torolt-termek","quantity":1,"name":"Törölt","unitPrice":500}
                     ],
                     "customer":{"name":"Vevő","email":"v@example.com","address":"Cím"},
                     "total":2300,"createdAt":"2026-07-03T10:00:00.000Z","status":"delivered"}
                  ]
                }
                """);

        // A tételek lusta kollekció: nyitott session kell hozzá.
        var items = inTransaction(() -> {
            var order = orders.findById("o1").orElseThrow();
            assertThat(order.getTotal()).isEqualTo(2300);
            return List.copyOf(order.getItems());
        });

        assertThat(items).hasSize(2);
        assertThat(items.getFirst().getName()).isEqualTo("AKKORI név");
        assertThat(items.getFirst().getUnitPrice()).isEqualTo(900);

        // A tétel akkor is megmarad, ha a termék már nincs a katalógusban: a
        // rendelés önálló bizonylat, az azonosító nem idegen kulcs.
        assertThat(items.get(1).getProductId()).isEqualTo("torolt-termek");
        assertThat(products.findById("torolt-termek")).isEmpty();

        // A tételek sorrendje is megmarad.
        assertThat(items).extracting(item -> item.getSeq()).containsExactly(0, 1);
    }

    /**
     * A snapshot BEVEZETÉSE ELŐTTI tételeken nincs `name`/`unitPrice` — ezek
     * {@code null}-ként jönnek át, nem kitalált értékkel.
     */
    @Test
    void preSnapshotItemFieldsStayNull() throws IOException {
        importFile("""
                {
                  "orders": [
                    {"id":"o1","items":[{"productId":"p1","quantity":3}],
                     "customer":{"name":"Vevő","email":"v@example.com","address":"Cím"},
                     "total":0,"createdAt":"2026-07-03T10:00:00.000Z","status":"pending"}
                  ]
                }
                """);

        var item = inTransaction(() -> orders.findById("o1").orElseThrow().getItems().getFirst());
        assertThat(item.getName()).isNull();
        assertThat(item.getUnitPrice()).isNull();
        assertThat(item.getQuantity()).isEqualTo(3);
    }

    /**
     * FORRÁS-szabályok egy RÉGI sémájú fájlon: hiányzó gyűjtemények, hiányzó
     * {@code active}, hiányzó {@code role}, ismeretlen rendelési státusz.
     */
    @Test
    void sourceRulesFillInMissingFields() throws IOException {
        importFile("""
                {
                  "products": [
                    {"id":"p1","name":"Régi","description":"A","price":1000,
                     "imageUrl":"https://example.com/1.png","stock":5,"category":"Teszt"}
                  ],
                  "users": [
                    {"id":"u1","username":"regi","email":"regi@example.com","address":"Cím",
                     "createdAt":"2026-07-01T10:00:00.000Z"}
                  ],
                  "orders": [
                    {"id":"o1","items":[{"productId":"p1","quantity":1}],
                     "customer":{"name":"V","email":"v@example.com","address":"C"},
                     "total":1000,"createdAt":"2026-07-03T10:00:00.000Z","status":"szallitas alatt"}
                  ]
                }
                """);

        // Hiányzó `active` → true: a bővítés előtti termék látható marad.
        assertThat(products.findById("p1").orElseThrow().isActive()).isTrue();
        // Hiányzó `role` → customer.
        assertThat(users.findById("u1").orElseThrow().getRole()).isEqualTo(Role.CUSTOMER);
        // Ismeretlen státusz → pending, NEM delivered: az „ellenőrzött vásárló"
        // szabály erre épül, és a szigorúbb alapértelmezés a biztonságos.
        assertThat(orders.findById("o1").orElseThrow().getStatus())
                .isEqualTo(OrderStatus.PENDING);
        // A hiányzó gyűjtemények üresek, nem hiba.
        assertThat(reviews.count()).isZero();
        assertThat(loginAttempts.count()).isZero();
    }

    /**
     * Az importált fiók NEM tud belépni a régi jelszavával, és a régi munkamenete
     * sem él tovább — a scrypt hash nem konvertálható BCryptté.
     */
    @Test
    void importedAccountCannotLogInWithOldPassword() throws IOException {
        importFile("""
                {
                  "users": [
                    {"id":"u1","username":"regivevo","email":"regi@example.com",
                     "address":"Cím","passwordHash":"abc","passwordSalt":"def",
                     "token":"regi-token","tokenExpiresAt":"2099-01-01T00:00:00.000Z",
                     "createdAt":"2026-07-01T10:00:00.000Z","role":"customer"}
                  ]
                }
                """);

        var user = users.findById("u1").orElseThrow();
        assertThat(user.getPasswordHash()).isNotBlank().doesNotContain("abc", "def");
        // A munkamenet sem jön át: a megtartott token belépve hagyna valakit, aki
        // utána soha nem tudna újra belépni.
        assertThat(user.getTokenHash()).isNull();
        assertThat(user.getTokenExpiresAt()).isNull();

        ResponseEntity<JsonNode> login = post("/api/auth/login",
                Map.of("username", "regivevo", "password", "titkosjelszo"));
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        ResponseEntity<JsonNode> withOldToken = get("/api/auth/me", "regi-token");
        assertThat(withOldToken.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    /** Nem üres adatbázisba nem importálunk — a beállítás bennfelejtése nem duplikál. */
    @Test
    void doesNotImportIntoNonEmptyDatabase() throws IOException {
        bootstrap.run(null);
        long before = products.count();
        assertThat(before).isEqualTo(8);

        importFile("""
                {"products":[{"id":"uj","name":"Új","description":"A","price":100,
                 "imageUrl":"https://example.com/x.png","stock":1,"category":"T","active":true}]}
                """);

        assertThat(products.count()).isEqualTo(before);
        assertThat(products.findById("uj")).isEmpty();
    }

    /**
     * A hibás rekord az EGÉSZ importot visszagörgeti: félig átvett adatbázisnál a
     * tiszta újrapróbálás a kevésbé kockázatos.
     */
    @Test
    void invalidRecordRollsBackTheWholeImport() {
        assertThatThrownBy(() -> importFile("""
                {
                  "products": [
                    {"id":"jo","name":"Jó","description":"A","price":1000,
                     "imageUrl":"https://example.com/1.png","stock":5,"category":"T","active":true},
                    {"id":"rossz","name":"Rossz","description":"B","price":0,
                     "imageUrl":"https://example.com/2.png","stock":5,"category":"T","active":true}
                  ]
                }
                """))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("rossz");

        assertThat(products.count()).isZero();
    }

    /** A forrásfájl kis/nagybetűben eltérő, de ütköző felhasználóneve beszédes hibát ad. */
    @Test
    void collidingUsernameGivesDescriptiveError() {
        assertThatThrownBy(() -> importFile("""
                {
                  "users": [
                    {"id":"u1","username":"Teszt.Elek","email":"a@example.com","address":"C",
                     "createdAt":"2026-07-01T10:00:00.000Z","role":"customer"},
                    {"id":"u2","username":"teszt.elek","email":"b@example.com","address":"C",
                     "createdAt":"2026-07-01T10:00:00.000Z","role":"customer"}
                  ]
                }
                """))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("felhasználónév")
                .hasMessageContaining("u2");
    }

    /** A hiányzó fájl beszédes hibát ad, nem csendes kihagyást. */
    @Test
    void missingFileGivesDescriptiveError() {
        ReflectionTestUtils.setField(importerProperties(), "importFile",
                tempDir.resolve("nincs-ilyen.json").toString());

        assertThatThrownBy(() -> importer.run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("nem található");
    }

    // --- Segédek ---

    /** A megadott JSON kiírása ideiglenes fájlba, majd az importáló futtatása. */
    private void importFile(String json) throws IOException {
        Path file = tempDir.resolve("db.json");
        Files.writeString(file, json);
        ReflectionTestUtils.setField(importerProperties(), "importFile", file.toString());
        importer.run(null);
    }

    private Object importerProperties() {
        return ReflectionTestUtils.getField(importer, "properties");
    }
}
