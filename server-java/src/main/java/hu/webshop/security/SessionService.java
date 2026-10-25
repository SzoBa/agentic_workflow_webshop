package hu.webshop.security;

import hu.webshop.config.AppProperties;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A munkamenet élettartamának szabályai és a token-feloldás.
 *
 * <p>CSÚSZÓ lejárat: minden hitelesített kérés meghosszabbítja a munkamenetet, így
 * az aktív felhasználó nem esik ki vásárlás közben. A megújítás viszont ÍRÁS, ezért
 * csak akkor történik, ha a hátralévő idő az élettartam felénél kevesebb — enélkül
 * a leggyakoribb út (minden hitelesített kérés) egyben a legdrágább is lenne.
 *
 * <p>A tárolóba a tokennek csak a LENYOMATA kerül (ADR-0008): a nyers token bemutatóra
 * szóló hitelesítő adat, tárolva egy adatbázis-olvasás minden belépett felhasználó
 * megszemélyesítését jelentené.
 */
@Service
public class SessionService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final AppProperties properties;

    public SessionService(UserRepository users, AppProperties properties) {
        this.users = users;
        this.properties = properties;
    }

    /** Új munkamenet-token: kriptográfiailag véletlen 32 bájt hex alakban. */
    public String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    /**
     * A tárolható lenyomat egy kiadott tokenből.
     *
     * <p>SZÁNDÉKOSAN gyors hash, nem jelszóhash: a token 32 bájt {@link SecureRandom}
     * kimenete, tehát nincs szótár, ami ellen a lassúság védene — a BCrypt költségét
     * viszont MINDEN hitelesített kérés kifizetné. Sózni sem kell: a só ugyanezen okból
     * nem véd semmi ellen, viszont elvenné a globális egyediséget (I-6) és a
     * „lenyomatból felhasználó" keresés lehetőségét.
     */
    public String hashToken(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            // A SHA-256 minden Java platformon kötelező; ha mégsem elérhető, a
            // hitelesítés nem működhet tovább csendben.
            throw new IllegalStateException("A SHA-256 nem érhető el ezen a platformon", ex);
        }
    }

    /** Egy most kiadott munkamenet lejárata. */
    public Instant newExpiry(Instant now) {
        return now.plusMillis(ttlMillis()).truncatedTo(ChronoUnit.MILLIS);
    }

    /**
     * Igaz, ha a munkamenet lejárt. A HIÁNYZÓ lejárat is lejáratnak számít: egy
     * biztonsági döntés hiányzó adatra tilt, nem enged (ADR-0008). Enélkül egy lejárat
     * nélküli sor örökéletű munkamenet lenne — az adatbázisban a
     * {@code users_session_pair_chk} zárja ki, hogy ilyen egyáltalán előálljon.
     */
    public boolean isExpired(UserEntity user, Instant now) {
        Instant expiresAt = user.getTokenExpiresAt();
        return expiresAt == null || !expiresAt.isAfter(now);
    }

    /** Igaz, ha a hátralévő idő az élettartam felénél kevesebb (ekkor érdemes írni). */
    public boolean shouldRenew(UserEntity user, Instant now) {
        Instant expiresAt = user.getTokenExpiresAt();
        if (expiresAt == null) {
            // Ide a hitelesítési úton nem jutunk el: az isExpired már elutasította.
            return true;
        }
        long remaining = expiresAt.toEpochMilli() - now.toEpochMilli();
        return remaining < ttlMillis() / 2;
    }

    /**
     * A tokenhez tartozó felhasználó, ha a munkamenet érvényes — és a csúszó
     * megújítás elvégzése.
     *
     * <p>A LEJÁRT munkamenet ugyanazt az üres eredményt adja, mint az érvénytelen
     * token: a kliensnek mindkét esetben ugyanaz a teendője, és a különbségtétel
     * csak azt árulná el, hogy a token valaha érvényes volt.
     */
    @Transactional
    public Optional<UserEntity> authenticate(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        Optional<UserEntity> found = users.findByTokenHash(hashToken(token));
        if (found.isEmpty()) {
            return Optional.empty();
        }
        UserEntity user = found.get();
        Instant now = Instant.now();
        if (isExpired(user, now)) {
            return Optional.empty();
        }
        if (shouldRenew(user, now)) {
            user.setTokenExpiresAt(newExpiry(now));
        }
        return Optional.of(user);
    }

    private long ttlMillis() {
        return Math.round(properties.tokenTtlHours() * 60 * 60 * 1000);
    }
}
