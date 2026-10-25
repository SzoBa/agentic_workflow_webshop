package hu.webshop.auth;

import hu.webshop.common.OkResponse;
import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.ApiException;
import hu.webshop.common.JsonInput;
import hu.webshop.common.Messages;
import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.UserRepository;
import hu.webshop.security.SessionService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Regisztráció, bejelentkezés és kijelentkezés. */
@Service
public class AuthService {

    private final UserRepository users;
    private final UserValidator validator;
    private final PasswordEncoder passwordEncoder;
    private final SessionService sessions;
    private final SessionIssuer sessionIssuer;
    private final LoginAttemptService attempts;

    /**
     * Egy fix, érvényes formátumú álhash. Ismeretlen felhasználónévnél is lefuttatunk
     * ellene egy jelszó-ellenőrzést, hogy a VÁLASZIDŐ ne árulja el, létezik-e a név
     * (K-50) — a BCrypt szándékosan lassú, tehát a kihagyása mérhető különbség lenne.
     */
    private final String dummyHash;

    public AuthService(UserRepository users, UserValidator validator,
            PasswordEncoder passwordEncoder, SessionService sessions,
            SessionIssuer sessionIssuer, LoginAttemptService attempts) {
        this.users = users;
        this.validator = validator;
        this.passwordEncoder = passwordEncoder;
        this.sessions = sessions;
        this.sessionIssuer = sessionIssuer;
        this.attempts = attempts;
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /**
     * Új fiók létrehozása. Az egyediséget végső soron az ADATBÁZIS indexe dönti el
     * (I-1, I-2, K-47); az előzetes ellenőrzés csak a beszédesebb üzenetért van.
     */
    @Transactional
    public AuthResponse register(JsonNode body) {
        String username = JsonInput.trimmedText(body, "username");
        String email = JsonInput.trimmedText(body, "email");
        String address = JsonInput.trimmedText(body, "address");
        String password = JsonInput.text(body, "password");

        validator.validateProfile(username, email, address);
        validator.validatePassword(password);
        validator.requireAvailable(username, email, null);

        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        // A NYERS token csak a válaszba kerül; a tárolóba a lenyomata megy (ADR-0008).
        String rawToken = sessions.generateToken();
        UserEntity user = new UserEntity();
        user.setId(UUID.randomUUID().toString());
        user.setUsername(username);
        user.setEmail(email);
        user.setAddress(address);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setTokenHash(sessions.hashToken(rawToken));
        user.setTokenExpiresAt(sessions.newExpiry(now));
        user.setCreatedAt(now);
        // Regisztrációkor MINDENKI customer; adminná csak admin léptethet. A kérésben
        // érkező `role` mező szándékosan figyelmen kívül marad.
        user.setRole(Role.CUSTOMER);

        try {
            // A flush kikényszeríti a beszúrást, hogy az egyediségi ütközés MÉG ITT
            // derüljön ki — a kéréskezelés végén már nem lehetne szerződéses hibává
            // fordítani, és 500-as válasz lenne belőle.
            users.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            throw validator.duplicate(ex);
        }

        return new AuthResponse(PublicUserResponse.of(user), rawToken);
    }

    /**
     * Bejelentkezés. A felhasználónév kis/nagybetűtől függetlenül illeszkedik, a
     * hibaüzenet ismeretlen névnél és rossz jelszónál AZONOS — a válaszból nem
     * derülhet ki, létezik-e a fiók.
     *
     * <p>SZÁNDÉKOSAN nem tranzakcionális: a sikertelen próbálkozás számlálójának
     * írnia kell akkor is, amikor a kérés 401-gyel végződik. Egy közös tranzakció a
     * hibaválasszal együtt a számlálót is visszagörgetné.
     */
    public AuthResponse login(JsonNode body, String clientIp) {
        String username = orEmpty(JsonInput.trimmedText(body, "username"));
        String password = orEmpty(JsonInput.text(body, "password"));
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        // A zárolás a HELYES jelszót is elutasítja: különben a támadó a találat
        // pillanatában kicsúszna a korlát alól.
        if (attempts.isLimited(clientIp, now)) {
            throw ApiException.tooManyRequests(Messages.LOGIN_RATE_LIMITED);
        }

        Optional<UserEntity> found = users.findByUsernameIgnoreCase(username);
        boolean passwordOk;
        if (found.isPresent()) {
            passwordOk = passwordEncoder.matches(password, found.get().getPasswordHash());
        } else {
            // Az eredményt eldobjuk; csak az egyenletes válaszidő a cél.
            passwordEncoder.matches(password, dummyHash);
            passwordOk = false;
        }

        if (!passwordOk) {
            attempts.recordFailure(clientIp, now);
            throw new ApiException(HttpStatus.UNAUTHORIZED, Messages.LOGIN_FAILED);
        }

        attempts.clear(clientIp);
        return sessionIssuer.issue(found.get().getId());
    }

    /** Kijelentkezés: a munkamenet-token érvénytelenítése. */
    public OkResponse logout(String userId) {
        return sessionIssuer.revoke(userId);
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }
}
