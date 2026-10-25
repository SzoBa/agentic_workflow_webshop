package hu.webshop.auth;

import hu.webshop.common.ApiException;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A saját fiókadatok TRANZAKCIONÁLIS írása.
 *
 * <p>Miért külön komponens, és nem az {@link AccountService} egy metódusa: az
 * {@code AccountService} szándékosan nem tranzakcionális (a találgatási számlálónak
 * a hibaválasz mellett is meg kell maradnia), az írás viszont az. Saját beanre azért
 * van szükség, mert az azonos osztályon belüli hívás megkerülné a tranzakciós proxyt
 * — ugyanaz a felosztás, mint az {@link AuthService} és a {@link SessionIssuer}
 * között.
 *
 * <p>A felhasználót minden metódus azonosító alapján tölti be újra, hogy a módosítás
 * MANAGED entitáson történjen: a hívó által látott példány már leválasztott.
 */
@Service
public class AccountWriter {

    private final UserRepository users;
    private final UserValidator validator;
    private final PasswordEncoder passwordEncoder;
    private final SessionIssuer sessionIssuer;

    public AccountWriter(UserRepository users, UserValidator validator,
            PasswordEncoder passwordEncoder, SessionIssuer sessionIssuer) {
        this.users = users;
        this.validator = validator;
        this.passwordEncoder = passwordEncoder;
        this.sessionIssuer = sessionIssuer;
    }

    /**
     * Név, e-mail és cím módosítása. A validáció UGYANAZ, mint a regisztrációnál és
     * az admin szerkesztésnél (K-45) — nincs saját szabály.
     *
     * <p>A saját, változatlan nevének megtartása nem ütközés: a saját azonosítót ezért
     * kapja meg a {@link UserValidator#requireAvailable} kizárásként.
     */
    @Transactional
    public PublicUserResponse saveProfile(String userId, String username, String email,
            String address) {
        UserEntity user = users.findById(userId).orElseThrow(ApiException::unauthorized);

        validator.validateProfile(username, email, address);
        validator.requireAvailable(username, email, userId);

        user.setUsername(username);
        user.setEmail(email);
        user.setAddress(address);

        try {
            // Az előzetes ellenőrzés óta befutott versenytárs módosítás is itt akad
            // el: az egyediség végső fóruma az adatbázis indexe (I-1, I-2).
            users.flush();
        } catch (DataIntegrityViolationException ex) {
            throw validator.duplicate(ex);
        }

        return PublicUserResponse.of(user);
    }

    /**
     * Az új jelszó hash-ének kiírása és a munkamenet-token rotációja, EGY
     * tranzakcióban. A kettő nem választható szét: ha a jelszó megváltozna, de a
     * régi token érvényben maradna, a jelszócsere pont azt nem érné el, amiért
     * csinálják — a korábban megszerzett munkamenet kizárását.
     *
     * <p>A tokent a {@link SessionIssuer} adja (I-6, ADR-0008); itt nem keletkezik
     * új tokenkiadó kód. A hívás ugyanebbe a tranzakcióba és perzisztencia-kontextusba
     * fut be, tehát ugyanazt a managed példányt módosítja.
     */
    @Transactional
    public AuthResponse replacePassword(String userId, String newPassword) {
        UserEntity user = users.findById(userId).orElseThrow(ApiException::unauthorized);
        user.setPasswordHash(passwordEncoder.encode(newPassword));

        return sessionIssuer.issue(userId);
    }
}
