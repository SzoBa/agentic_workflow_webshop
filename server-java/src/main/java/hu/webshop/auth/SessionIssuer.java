package hu.webshop.auth;

import hu.webshop.common.OkResponse;
import hu.webshop.common.ApiException;
import hu.webshop.common.Messages;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.UserRepository;
import hu.webshop.security.SessionService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Új munkamenet kiadása sikeres bejelentkezés után.
 *
 * <p>Miért KÜLÖN komponens, és nem az {@link AuthService} egy metódusa: a
 * bejelentkezés maga szándékosan NEM tranzakcionális (lásd
 * {@link LoginAttemptService}), a tokencsere viszont írás. Saját beanre azért van
 * szükség, mert az azonos osztályon belüli hívás megkerülné a tranzakciós proxyt.
 */
@Service
public class SessionIssuer {

    private final UserRepository users;
    private final SessionService sessions;

    public SessionIssuer(UserRepository users, SessionService sessions) {
        this.users = users;
        this.sessions = sessions;
    }

    /**
     * Új token és friss lejárat a felhasználónak. A korábbi token ezzel
     * érvénytelenné válik: egy felhasználóhoz EGY érvényes munkamenet tartozik (I-6).
     *
     * <p>A felhasználót azonosító alapján töltjük be újra, hogy a módosítás managed
     * entitáson történjen — a hívó által átadott példány már leválasztott.
     */
    @Transactional
    public AuthResponse issue(String userId) {
        UserEntity user = users.findById(userId)
                // Ide csak akkor jutunk, ha a fiókot a jelszó-ellenőrzés óta törölték.
                // Ilyenkor is a bejelentkezés egységes hibaüzenete megy vissza.
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, Messages.LOGIN_FAILED));

        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        // A NYERS token csak a válaszba kerül; a tárolóba a lenyomata megy (ADR-0008).
        String rawToken = sessions.generateToken();
        user.setTokenHash(sessions.hashToken(rawToken));
        user.setTokenExpiresAt(sessions.newExpiry(now));

        return new AuthResponse(PublicUserResponse.of(user), rawToken);
    }

    /**
     * Kijelentkezés: a token és a lejárat törlése — a munkamenet azonnal érvénytelen.
     */
    @Transactional
    public OkResponse revoke(String userId) {
        users.findById(userId).ifPresent(user -> {
            user.setTokenHash(null);
            user.setTokenExpiresAt(null);
        });
        return OkResponse.of();
    }
}
