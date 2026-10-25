package hu.webshop.auth;

import hu.webshop.common.ApiException;
import hu.webshop.common.JsonInput;
import hu.webshop.common.Messages;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.UserRepository;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

/**
 * A felhasználóadatok közös validációja.
 *
 * <p>Miért közös komponens: két hívója van (a regisztráció és az admin szerkesztés),
 * és a szabályok duplikálva garantáltan elcsúsznának egymástól — a konformancia
 * (K-45) épp azt méri, hogy a két oldal UGYANAZT a szabályt alkalmazza.
 *
 * <p>A validáció az ELSŐ hibánál megáll, tehát egyszerre egy üzenet megy vissza,
 * a hibakatalógus sorrendjében.
 */
@Component
public class UserValidator {

    /** Gyakorlati e-mail formátum — a korábbi Node implementáció regexe, szó szerint. */
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private static final int USERNAME_MIN = 8;
    private static final int USERNAME_MAX = 50;
    private static final int PASSWORD_MIN = 8;

    private final UserRepository users;

    public UserValidator(UserRepository users) {
        this.users = users;
    }

    /**
     * Név, e-mail és cím ellenőrzése. A paraméterek MÁR trimmeltek; a {@code null}
     * (hiányzó vagy nem szöveg típusú mező) üres értékként viselkedik, ahogy a korábbi
     * Node implementáció közös validátorában is.
     */
    public void validateProfile(String username, String email, String address) {
        String name = username == null ? "" : username;
        if (name.length() < USERNAME_MIN) {
            throw ApiException.badRequest(Messages.USERNAME_TOO_SHORT);
        }
        if (name.length() > USERNAME_MAX) {
            throw ApiException.badRequest(Messages.USERNAME_TOO_LONG);
        }
        if (!EMAIL.matcher(email == null ? "" : email).matches()) {
            throw ApiException.badRequest(Messages.EMAIL_INVALID);
        }
        if (JsonInput.isBlank(address)) {
            throw ApiException.badRequest(Messages.ADDRESS_REQUIRED);
        }
    }

    /**
     * A jelszó hosszának ellenőrzése. SZÁNDÉKOSAN nincs a profilvalidációban: az
     * admin felületen a jelszó nem módosítható, ezért ez a szabály kizárólag a
     * regisztrációra vonatkozik. A jelszót nem trimmeljük — a szóköz is karakter.
     */
    public void validatePassword(String password) {
        if (password == null || password.length() < PASSWORD_MIN) {
            throw ApiException.badRequest(Messages.PASSWORD_TOO_SHORT);
        }
    }

    /**
     * Előzetes egyediség-ellenőrzés a SZEBB üzenetért (megnevezi, melyik mező
     * ütközik). Nem ez adja a garanciát: az I-1/I-2 invariánst az adatbázis
     * {@code LOWER()}-es egyedi indexe dönti el — lásd {@link #duplicate}.
     *
     * @param excludeUserId szerkesztéskor a szerkesztett felhasználó azonosítója,
     *     enélkül a saját, változatlan nevének megtartása is ütközésnek látszana
     */
    public void requireAvailable(String username, String email, String excludeUserId) {
        if (isTakenByOther(users.findByUsernameIgnoreCase(username), excludeUserId)) {
            throw ApiException.badRequest(Messages.USERNAME_TAKEN);
        }
        if (isTakenByOther(users.findByEmailIgnoreCase(email), excludeUserId)) {
            throw ApiException.badRequest(Messages.EMAIL_TAKEN);
        }
    }

    /**
     * Az adatbázis egyediségi ütközésének átfordítása szerződéses hibaüzenetre.
     *
     * <p>Ez az ág adja az I-1/I-2 ATOMICITÁSÁT (K-47): két egyidejű, azonos nevű
     * regisztrációból az egyik beszúrása elbukik az egyedi indexen, és pontosan egy
     * fiók jön létre. Előzetes lekérdezésre ez nem építhető — a két kérés
     * ellenőrzése egymás beszúrása előtt is lefuthatna.
     *
     * <p>Az ütköző megszorítást a NEVÉBŐL derítjük ki; utólagos lekérdezés nem
     * lehetséges, mert a megszakadt beszúrás után a perzisztencia-kontextus már nem
     * használható.
     */
    public ApiException duplicate(DataIntegrityViolationException ex) {
        String haystack = describe(ex).toLowerCase(Locale.ROOT);
        if (haystack.contains("users_email_lower")) {
            return ApiException.badRequest(Messages.EMAIL_TAKEN);
        }
        if (haystack.contains("users_username_lower")) {
            return ApiException.badRequest(Messages.USERNAME_TAKEN);
        }
        // Ha a megszorítás neve nem derült ki, az e-mail/felhasználónév szó a
        // driver üzenetében még eligazíthat; végső esetben a névütközést jelezzük.
        if (haystack.contains("email")) {
            return ApiException.badRequest(Messages.EMAIL_TAKEN);
        }
        return ApiException.badRequest(Messages.USERNAME_TAKEN);
    }

    private static boolean isTakenByOther(Optional<UserEntity> found, String excludeUserId) {
        return found.isPresent() && !found.get().getId().equals(excludeUserId);
    }

    /** A megszorítás neve és a driver üzenete egy szövegben, kereséshez. */
    private static String describe(DataIntegrityViolationException ex) {
        StringBuilder text = new StringBuilder();
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException violation
                    && violation.getConstraintName() != null) {
                text.append(violation.getConstraintName()).append(' ');
            }
            if (cause.getMessage() != null) {
                text.append(cause.getMessage()).append(' ');
            }
        }
        return text.toString();
    }
}
