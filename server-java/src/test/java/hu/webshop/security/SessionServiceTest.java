package hu.webshop.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import hu.webshop.config.AppProperties;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * A munkamenet élettartamának szabályai. A CSÚSZÓ lejárat két külön kérdés — mikor
 * LEJÁRT a munkamenet, és mikor ÉRDEMES megújítani —, és a kettő határa NEM ugyanaz:
 * a megújítás a fél élettartamnál kezdődik, hogy a leggyakoribb út ne legyen írás is.
 *
 * <p>A tároló a tokennek csak a LENYOMATÁT látja (ADR-0008), ezért a keresés stubja is a
 * lenyomatra szól — a nyers tokenre szóló stub sosem illeszkedne. A lenyomat alakját a
 * {@link HashTokenAspects} szögezi le ismert SHA-256 vektorokkal.
 *
 * <p>Az {@link AppProperties} sima POJO, ezért valós példány; a {@link UserRepository}
 * interfész → mock. A teszt-élettartam mindenütt 1 óra, így minden határ kerek szám.
 */
@ExtendWith(MockitoExtension.class)
class SessionServiceTest {

    /** Teszt-élettartam ezredmásodpercben (1 óra) — a felezőpont így pontosan 1 800 000. */
    private static final long TTL_MS = 3_600_000L;

    @Mock
    private UserRepository users;

    @Nested
    class TokenGeneration {

        @Test
        void sixtyFourCharLowercaseHex() {
            // 32 bájt hex alakban — a hossz maga a belerakott entrópia mértéke.
            assertThat(service().generateToken()).hasSize(64).matches("[0-9a-f]{64}");
        }

        @Test
        void everyCallReturnsDifferentToken() {
            var tokens = IntStream.range(0, 100)
                    .mapToObj(i -> service().generateToken())
                    .distinct()
                    .count();

            assertThat(tokens).isEqualTo(100);
        }
    }

    /**
     * A tárolható lenyomat. Az ellenőrzés ISMERT SHA-256 vektorokra megy, nem a
     * {@link MessageDigest} újrahívására: utóbbi a produkciós számítást ismételné meg,
     * és így akkor is zöld maradna, ha az algoritmus alattunk kicserélődik.
     */
    @Nested
    class HashTokenAspects {

        @ParameterizedTest(name = "sha256([{0}]) = {1}")
        @CsvSource({
            // FIPS 180-4 / közismert próbavektorok — ezek pinnelik az algoritmust.
            "abc,   ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            // A UTF-8 kódolás is a szerződés része: ékezetes token bájtjai nem
            // platformfüggő kódlapon mennek a hash-be.
            "árvíztűrő, 57413fe6f1844b6dba9dc3e4d6c8a3218abd2f860affdb331ad082cb65917a86"
        })
        void matchesKnownVector(String rawToken, String expectedHash) {
            assertThat(service().hashToken(rawToken)).isEqualTo(expectedHash);
        }

        @Test
        void emptyTokenStillHashes() {
            // Az authenticate a blank tokent előbb kiszűri, de a metódus önmagában
            // total: nem dob, hanem az üres bemenet vektorát adja.
            assertThat(service().hashToken(""))
                    .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        }

        @Test
        void sixtyFourCharLowercaseHex() {
            assertThat(service().hashToken(service().generateToken()))
                    .hasSize(64)
                    .matches("[0-9a-f]{64}");
        }

        @Test
        void isDeterministic() {
            // Sótlan, ezért ismételhető — enélkül a „lenyomatból felhasználó" keresés
            // nem működhetne (ADR-0008).
            String token = service().generateToken();

            assertThat(service().hashToken(token)).isEqualTo(service().hashToken(token));
        }

        @Test
        void differentTokensGiveDifferentHashes() {
            assertThat(service().hashToken("árvíztűrő"))
                    .isNotEqualTo(service().hashToken("arvizturo"));
        }

        @Test
        void neverReturnsTheRawToken() {
            // A lenyomat NEM tartalmazhatja a nyers tokent: ez az egész ADR-0008 tétje.
            String token = service().generateToken();

            assertThat(service().hashToken(token)).isNotEqualTo(token).doesNotContain(token);
        }
    }

    @Nested
    class NewExpiry {

        @Test
        void addsTtlToNow() {
            Instant now = Instant.parse("2026-07-27T10:00:00Z");

            assertThat(service().newExpiry(now)).isEqualTo(Instant.parse("2026-07-27T11:00:00Z"));
        }

        @ParameterizedTest(name = "TOKEN_TTL_HOURS = {0} → {1}")
        @CsvSource({
            "1,     2026-07-27T11:00:00Z",
            "0.5,   2026-07-27T10:30:00Z",
            "168,   2026-08-03T10:00:00Z"
        })
        void configuredTtlScalesExpiry(String ttlHours, Instant expected) {
            assertThat(service(ttlHours).newExpiry(Instant.parse("2026-07-27T10:00:00Z")))
                    .isEqualTo(expected);
        }

        @ParameterizedTest(name = "használhatatlan TOKEN_TTL_HOURS = [{0}] → 168 óra")
        @ValueSource(strings = {"nem-szam", "0", "-3", ""})
        void invalidConfigUsesDefaultTtl(String ttlHours) {
            // Az AppProperties a hibás értéket alapértelmezésre cseréli (7 nap), nem
            // indulási hibára — a lejárat számítása erre épül.
            Instant now = Instant.parse("2026-07-27T10:00:00Z");

            assertThat(service(ttlHours).newExpiry(now)).isEqualTo(now.plus(7, ChronoUnit.DAYS));
        }

        @Test
        void truncatesToMillis() {
            // Az adatbázis oszlopa ezredmásodperc-pontosságú; a csonkítás nélkül a
            // visszaolvasott lejárat eltérne a kiírttól.
            Instant expiresAt =
                    service().newExpiry(Instant.parse("2026-07-27T10:00:00.123456789Z"));

            assertThat(expiresAt).isEqualTo(Instant.parse("2026-07-27T11:00:00.123Z"));
            assertThat(expiresAt.getNano() % 1_000_000).isZero();
        }
    }

    @Nested
    class Expired {

        @ParameterizedTest(name = "lejárat = most {0} ms → lejárt: {1}")
        @CsvSource(nullValues = "NULL", value = {
            // A HIÁNYZÓ lejárat IS lejáratnak számít: biztonsági döntés hiányzó adatra
            // tilt, nem enged (ADR-0008). Enélkül a lejárat nélküli sor örökéletű
            // munkamenet lenne. Ez a korábbi viselkedés SZÁNDÉKOS megfordítása.
            "NULL,       true",
            "-3600000,   true",
            "-1,         true",
            // Pontosan a lejárat pillanata MÁR lejárt (!isAfter, nem isBefore).
            "0,          true",
            "1,          false",
            "3600000,    false"
        })
        void expiryBoundaries(Long offsetMs, boolean expected) {
            Instant now = Instant.parse("2026-07-27T10:00:00Z");
            UserEntity user = userWithExpiry(offsetMs == null ? null : now.plusMillis(offsetMs));

            assertThat(service().isExpired(user, now)).isEqualTo(expected);
        }
    }

    @Nested
    class RenewalNeeded {

        @ParameterizedTest(name = "lejárat = most + {0} ms → megújítandó: {1}")
        @CsvSource(nullValues = "NULL", value = {
            // Lejárat nélkül igazat ad, de a hitelesítési úton ide már nem jutunk el:
            // az isExpired a hiányzó lejáratot elutasítja. Az ág így csak közvetlenül
            // hívva élő — a metódus szerződését mégis ez a sor rögzíti.
            "NULL,       true",
            "-1000,      true",
            "0,          true",
            "1799999,    true",
            // Pontosan a felénél MÉG nem újít: a feltétel szigorú kisebb.
            "1800000,    false",
            "1800001,    false",
            "3600000,    false"
        })
        void startsAtHalfTtl(Long offsetMs, boolean expected) {
            Instant now = Instant.parse("2026-07-27T10:00:00Z");
            UserEntity user = userWithExpiry(offsetMs == null ? null : now.plusMillis(offsetMs));

            assertThat(service().shouldRenew(user, now)).isEqualTo(expected);
        }

        @Test
        void midpointMovesWithTtl() {
            // Ugyanaz a hátralévő idő (30 perc) rövid élettartamnál még bőven elég,
            // hosszúnál viszont már megújítandó — a küszöb relatív, nem abszolút.
            Instant now = Instant.parse("2026-07-27T10:00:00Z");
            UserEntity user = userWithExpiry(now.plus(30, ChronoUnit.MINUTES));

            assertThat(service("1").shouldRenew(user, now)).isFalse();
            assertThat(service("168").shouldRenew(user, now)).isTrue();
        }
    }

    @Nested
    class Authentication {

        @Test
        void nullTokenNeverReachesRepository() {
            assertThat(service().authenticate(null)).isEmpty();

            verifyNoInteractions(users);
        }

        @ParameterizedTest(name = "üres token: [{0}]")
        @ValueSource(strings = {"", " ", "   ", "\t"})
        void blankTokenNeverReachesRepository(String token) {
            assertThat(service().authenticate(token)).isEmpty();

            verifyNoInteractions(users);
        }

        @Test
        void looksUpByHashNeverByRawToken() {
            // ADR-0008 magja: a tárolóhoz a LENYOMAT megy le. A nyers tokenre szóló
            // keresés egy szivárgás esetén belépésre használható oszlopot jelentene.
            givenNoUserFor("nyers-token");

            service().authenticate("nyers-token");

            verify(users).findByTokenHash(sha256Hex("nyers-token"));
            verify(users, never()).findByTokenHash("nyers-token");
        }

        @Test
        void unknownTokenGivesEmptyResult() {
            givenNoUserFor("ismeretlen");

            assertThat(service().authenticate("ismeretlen")).isEmpty();
        }

        @Test
        void expiredSessionBehavesLikeInvalid() {
            // A különbségtétel csak azt árulná el, hogy a token valaha érvényes volt.
            UserEntity user = userWithExpiry(Instant.now().minusSeconds(1));
            givenUserFor("lejart", user);

            assertThat(service().authenticate("lejart")).isEmpty();
        }

        @Test
        void doesNotExtendExpiredSession() {
            Instant expiresAt = Instant.now().minusSeconds(1);
            UserEntity user = userWithExpiry(expiresAt);
            givenUserFor("lejart", user);

            service().authenticate("lejart");

            assertThat(user.getTokenExpiresAt()).isEqualTo(expiresAt);
        }

        @Test
        void doesNotRenewComfortablyValidSession() {
            // 50 perc hátra az 1 órás élettartamból: a fél TTL fölött vagyunk, ezért
            // ez az út OLVASÁS marad.
            Instant farExpiry = Instant.now().plusSeconds(3000);
            UserEntity user = userWithExpiry(farExpiry);
            givenUserFor("t", user);

            assertThat(service().authenticate("t")).containsSame(user);
            assertThat(user.getTokenExpiresAt()).isEqualTo(farExpiry);
        }

        @Test
        void extendsSessionCloseToExpiry() {
            Instant nearExpiry = Instant.now().plusSeconds(60);
            UserEntity user = userWithExpiry(nearExpiry);
            givenUserFor("t", user);
            Instant before = Instant.now();

            assertThat(service().authenticate("t")).containsSame(user);

            assertThat(user.getTokenExpiresAt())
                    .isAfter(nearExpiry)
                    .isBetween(lowerBound(before), Instant.now().plusMillis(TTL_MS));
        }

        @Test
        void sessionWithoutExpiryIsRejected() {
            // A hiányzó lejárat lejáratnak számít (ADR-0008), ezért ez az út NEM ad
            // felhasználót és NEM tol ki lejáratot. A shouldRenew null-ágáig el sem jut.
            UserEntity user = userWithExpiry(null);
            givenUserFor("t", user);

            assertThat(service().authenticate("t")).isEmpty();
            assertThat(user.getTokenExpiresAt()).isNull();
        }

        @Test
        void renewalIsNotAnExplicitSave() {
            // A megújítást a JPA dirty checking írja ki a @Transactional határán —
            // save() hívás nincs. Hogy a tranzakció tényleg ki is írja, azt az
            // AuthSessionExpiryTest integrációs teszt méri.
            UserEntity user = userWithExpiry(Instant.now().plusSeconds(60));
            givenUserFor("t", user);

            service().authenticate("t");

            verify(users, never()).save(any());
        }

        private void givenUserFor(String rawToken, UserEntity user) {
            when(users.findByTokenHash(sha256Hex(rawToken))).thenReturn(Optional.of(user));
        }

        private void givenNoUserFor(String rawToken) {
            when(users.findByTokenHash(sha256Hex(rawToken))).thenReturn(Optional.empty());
        }
    }

    // --- Fixture ---

    /**
     * A megújított lejárat alsó határa. Az {@code Instant.now()} mikroszekundum-pontos,
     * a {@code newExpiry} viszont ezredmásodpercre CSONKÍT — a csonkítás lefelé kerekít,
     * ezért a nyers {@code before + TTL} határ hajszálnyival túl magas lenne.
     */
    private static Instant lowerBound(Instant before) {
        return before.plusMillis(TTL_MS).truncatedTo(ChronoUnit.MILLIS);
    }

    private SessionService service() {
        return service("1");
    }

    private SessionService service(String ttlHours) {
        AppProperties properties = new AppProperties();
        properties.setTokenTtlHours(ttlHours);
        return new SessionService(users, properties);
    }

    private static UserEntity userWithExpiry(Instant expiresAt) {
        UserEntity user = new UserEntity();
        user.setId("u1");
        user.setUsername("teszt");
        user.setTokenHash(sha256Hex("t"));
        user.setTokenExpiresAt(expiresAt);
        return user;
    }

    /**
     * A tárolt lenyomat kiszámítása a STUBOLÁSHOZ — a keresés kulcsát kell eltalálni.
     * Nem ez ellenőrzi a lenyomat helyességét: azt a {@link HashTokenAspects} ismert
     * vektorai teszik, mert ez a helper ugyanazt a hívást ismételné meg.
     */
    private static String sha256Hex(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
