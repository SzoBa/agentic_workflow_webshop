package hu.webshop.auth;

import hu.webshop.domain.LoginAttemptEntity;
import hu.webshop.repo.LoginAttemptRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A bejelentkezési próbálkozások korlátozása (brute-force ellen).
 *
 * <p>Miért TÁROLT, és nem memóriában: a memóriában tartott számláló újraindításkor
 * nullázódik, és több példány esetén példányonként külön számol — mindkettő
 * megkerülhetővé teszi a védelmet (K-52). A sikertelen bejelentkezés ritka esemény,
 * ezért az írás ára elhanyagolható.
 *
 * <p>Miért IP-alapú, és nem fiókhoz kötött: a fiókzárolás azt is lehetővé tenné,
 * hogy bárki kizárjon bárkit, akinek ismeri a felhasználónevét — a védekezésből
 * támadási felület lenne.
 *
 * <p>Minden metódus SAJÁT tranzakcióban fut, és a hívó ({@link AuthService#login})
 * szándékosan nem tranzakcionális. A sikertelen bejelentkezés 401-gyel végződik: ha
 * a számláló növelése a hívó tranzakciójában lenne, a válasszal együtt visszagördülne,
 * és a korlát soha nem lépne életbe.
 */
@Service
public class LoginAttemptService {

    /** Ennyi sikertelen próbálkozás után tiltunk az ablakon belül. */
    public static final int MAX_ATTEMPTS = 10;

    /** Az időablak hossza. */
    public static final Duration WINDOW = Duration.ofMinutes(15);

    private final LoginAttemptRepository attempts;

    public LoginAttemptService(LoginAttemptRepository attempts) {
        this.attempts = attempts;
    }

    /** Igaz, ha a kulcs túllépte a korlátot az AKTÍV időablakban. */
    @Transactional(readOnly = true)
    public boolean isLimited(String key, Instant now) {
        Optional<LoginAttemptEntity> entry = attempts.findById(key);
        return entry.isPresent()
                && !isStale(entry.get(), now)
                && entry.get().getAttempts() >= MAX_ATTEMPTS;
    }

    /**
     * Sikertelen próbálkozás rögzítése: új ablak indítása vagy a számláló növelése.
     *
     * <p>A takarítás IS itt fut, nem a sikeres bejelentkezésnél. A táblába hitelesítés
     * nélküli kérés szúr be sort, a támadó pedig épp az, aki sosem lép be sikeresen —
     * a boldog útra kötött retenció nála soha nem futna le, és a tábla minden valaha
     * látott kulccsal nőne. A sikertelen bejelentkezés ritka esemény (lásd az osztály
     * fejlécét), ezért ez az ár elhanyagolható, és nem kell hozzá külön ütemező.
     *
     * <p>A törlés a beolvasás ELŐTT megy: így a tömeges törlés és a most mentett sor
     * nem kerül egymás útjába a perzisztenciakontextusban.
     */
    @Transactional
    public void recordFailure(String key, Instant now) {
        attempts.deleteExpired(now.minus(WINDOW));

        LoginAttemptEntity entry = attempts.findById(key).orElse(null);
        if (entry == null) {
            entry = new LoginAttemptEntity();
            entry.setKey(key);
            entry.setAttempts(1);
            entry.setFirstAt(now);
        } else if (isStale(entry, now)) {
            entry.setAttempts(1);
            entry.setFirstAt(now);
        } else {
            entry.setAttempts(entry.getAttempts() + 1);
        }
        attempts.save(entry);
    }

    /** Sikeres bejelentkezés után: a kulcs számlálójának törlése. */
    @Transactional
    public void clear(String key) {
        attempts.deleteById(key);
    }

    /** Igaz, ha a bejegyzés ablaka már lejárt (tiszta lapot jelent). */
    private static boolean isStale(LoginAttemptEntity entry, Instant now) {
        return now.toEpochMilli() - entry.getFirstAt().toEpochMilli() > WINDOW.toMillis();
    }
}
