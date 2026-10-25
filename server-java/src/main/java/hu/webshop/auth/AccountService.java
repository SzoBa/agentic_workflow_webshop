package hu.webshop.auth;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.ApiException;
import hu.webshop.common.JsonInput;
import hu.webshop.common.Messages;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * A belépett felhasználó SAJÁT fiókadatainak szerkesztése és jelszócseréje.
 *
 * <p>Mindkét művelet a jelenlegi jelszó megadásához kötött: egy ellopott munkamenet
 * önmagában így nem elég ahhoz, hogy a támadó átvegye a fiókot (átírja az e-mailt
 * vagy jelszót cseréljen). Ez a második kapu csak akkor ér valamit, ha a jelszó nem
 * TIPPELHETŐ ki a végponton keresztül — ezért van rá találgatási korlát.
 *
 * <p>Az osztály SZÁNDÉKOSAN nem tranzakcionális, ugyanazért, amiért az
 * {@link AuthService#login} sem: a sikertelen próbálkozás számlálójának írnia kell
 * akkor is, amikor a kérés hibaválasszal (itt: 400-zal) végződik. Közös
 * tranzakcióban a hibaválasz a
 * számlálót is visszagörgetné, és a korlát soha nem lépne életbe. Az adatbázisba
 * író rész ezért az {@link AccountWriter}-ben van — ugyanaz a felosztás, mint az
 * {@link AuthService} és a {@link SessionIssuer} között.
 */
@Service
public class AccountService {

    /**
     * A találgatási korlát számlálási kulcsának előtagja.
     *
     * <p>A korlát és az ablak a bejelentkezésé ({@link LoginAttemptService#MAX_ATTEMPTS},
     * {@link LoginAttemptService#WINDOW}), a KULCS viszont a fiók azonosítója, nem a
     * kliens IP-címe. Két okból:
     *
     * <ul>
     *   <li>Ide csak érvényes tokennel lehet eljutni, tehát az IP-alapú számlálás
     *       megkerülhető lenne: a támadó ugyanazzal az ellopott tokennel más-más
     *       címről próbálkozna tovább. A fiókhoz kötött kulcs nem kerülhető meg.
     *   <li>A bejelentkezésnél a fiókhoz kötött zárolás azért tilos, mert bárki
     *       kizárhatna bárkit, akinek ismeri a nevét — ITT ez nem áll fenn: a
     *       számlálót csak az tudja növelni, akinél már van a fiókhoz érvényes token.
     * </ul>
     *
     * <p>Az előtag a bejelentkezés IP-kulcsaitól is elválasztja a számlálót. Enélkül
     * egy sikeres fiókadat-mentés törölné az adott kulcs bejelentkezési számlálóját
     * is, azaz a saját, helyes jelszavával bárki nullázhatná a brute-force védelmet
     * (K-51).
     */
    private static final String KEY_PREFIX = "account:";

    private final UserRepository users;
    private final UserValidator validator;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptService attempts;
    private final AccountWriter writer;

    public AccountService(UserRepository users, UserValidator validator,
            PasswordEncoder passwordEncoder, LoginAttemptService attempts,
            AccountWriter writer) {
        this.users = users;
        this.validator = validator;
        this.passwordEncoder = passwordEncoder;
        this.attempts = attempts;
        this.writer = writer;
    }

    /**
     * A saját fiókadatok mentése. A válasz a publikus felhasználó-alak; tokent NEM
     * tartalmaz, mert a fiókadat nem hitelesítő adat: a munkamenet érintetlen marad.
     *
     * <p>A kérésben érkező {@code role} mező SZÁNDÉKOSAN figyelmen kívül marad — a
     * saját szerepkörét senki nem állíthatja, ugyanúgy, ahogy a regisztrációnál sem
     * (lásd {@link AuthService#register}).
     */
    public PublicUserResponse updateProfile(String userId, JsonNode body) {
        requireCurrentPassword(userId, JsonInput.text(body, "currentPassword"));

        return writer.saveProfile(userId,
                JsonInput.trimmedText(body, "username"),
                JsonInput.trimmedText(body, "email"),
                JsonInput.trimmedText(body, "address"));
    }

    /**
     * Jelszócsere. A válasz a bejelentkezésével azonos alak: a publikus felhasználó
     * és egy ÚJ nyers token — a jelszócsere érvényteleníti a korábbi munkamenetet,
     * de a felhasználót nem lépteti ki (a kliens lecseréli a tárolt tokent).
     */
    public AuthResponse changePassword(String userId, JsonNode body) {
        String currentPassword = JsonInput.text(body, "currentPassword");
        requireCurrentPassword(userId, currentPassword);

        String newPassword = JsonInput.text(body, "newPassword");
        if (!Objects.equals(newPassword, JsonInput.text(body, "newPasswordConfirm"))) {
            throw ApiException.badRequest(Messages.PASSWORD_CONFIRM_MISMATCH);
        }
        validator.validatePassword(newPassword);
        // A jelenlegi jelszóval EZEN a ponton már összevethető a nyers szöveg: fentebb
        // igazoltuk, hogy a megadott `currentPassword` tényleg a fiók jelszava. Így
        // nem kell újabb (szándékosan lassú) hash-ellenőrzést futtatni.
        if (newPassword.equals(currentPassword)) {
            throw ApiException.badRequest(Messages.PASSWORD_SAME_AS_OLD);
        }

        return writer.replacePassword(userId, newPassword);
    }

    /**
     * A jelenlegi jelszó ellenőrzése a találgatási korláttal együtt.
     *
     * <p>A zárolás a HELYES jelszót is elutasítja: különben a támadó a találat
     * pillanatában kicsúszna a korlát alól. A sikeres ellenőrzés — a
     * bejelentkezéshez hasonlóan — nullázza a számlálót.
     *
     * <p>A hibás vagy hiányzó jelszó válasza SZÁNDÉKOSAN 400, nem 401. A 401 ezeken a
     * végpontokon a MUNKAMENET lejártát jelenti: a kliens globális 401-kezelője
     * ilyenkor eldobja a munkamenetet és kilépteti a felhasználót. Egy elgépelt
     * jelenlegi jelszó tehát 401-gyel a saját fiókoldaláról dobná ki a felhasználót,
     * ráadásul rossz magyarázattal. A 400 azt mondja, amit jelent: a BEKÜLDÖTT mező
     * rossz, a munkamenet ép.
     */
    private void requireCurrentPassword(String userId, String currentPassword) {
        String key = KEY_PREFIX + userId;
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        if (attempts.isLimited(key, now)) {
            throw ApiException.tooManyRequests(Messages.LOGIN_RATE_LIMITED);
        }

        UserEntity user = users.findById(userId)
                // Ide csak akkor jutunk, ha a fiókot a hitelesítés óta törölték.
                .orElseThrow(ApiException::unauthorized);

        if (!passwordEncoder.matches(orEmpty(currentPassword), user.getPasswordHash())) {
            attempts.recordFailure(key, now);
            throw ApiException.badRequest(Messages.CURRENT_PASSWORD_INVALID);
        }

        // A számlálót a HELYES jelszó nullázza, függetlenül attól, hogy a kérés
        // többi része sikerül-e: a `changePassword` ezután még elbukhat
        // megerősítés-eltérésen vagy jelszó-validáláson. SZÁNDÉKOS. A számláló
        // azt méri, tudja-e valaki a jelenlegi jelszót — aki ide eljutott, tudja,
        // tehát nincs mit tovább mérni rajta. Nullázni csak a jelszó ismeretében
        // lehet, azaz pont az kell hozzá, amit a korlát véd (vö. K-51: ott a
        // kérdés az volt, KI nullázhat, és a válasz az `account:` előtaggal lett
        // a fiók tulajdonosára szűkítve).
        attempts.clear(key);
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }
}
