package hu.webshop.auth;

import hu.webshop.common.OkResponse;
import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.ApiException;
import hu.webshop.common.JsonInput;
import hu.webshop.common.Messages;
import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.UserRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin felhasználókezelés.
 *
 * <p>ÚJ FELHASZNÁLÓ FELVÉTELÉRE NINCS VÉGPONT: fiók kizárólag regisztrációval
 * keletkezik, mert a jelszó az admin felületen nem adható meg. A jelszó módosítására
 * sincs mód — a kérésben érkező jelszómezők figyelmen kívül maradnak.
 */
@Service
public class UserAdminService {

    private final UserRepository users;
    private final UserValidator validator;
    private final EntityManager entityManager;

    public UserAdminService(UserRepository users, UserValidator validator,
            EntityManager entityManager) {
        this.users = users;
        this.validator = validator;
        this.entityManager = entityManager;
    }

    /** A felhasználók beszúrási sorrendben, érzékeny mezők nélkül. */
    @Transactional(readOnly = true)
    public List<AdminUserResponse> list() {
        return users.findAllByOrderBySeqAsc().stream().map(AdminUserResponse::of).toList();
    }

    /**
     * Név, e-mail, cím és szerepkör módosítása. A validáció UGYANAZ, mint
     * regisztrációnál (K-45), a jelszó szabálya nélkül.
     */
    @Transactional
    public AdminUserResponse update(String id, JsonNode body) {
        UserEntity user = users.findById(id)
                .orElseThrow(() -> ApiException.notFound(Messages.USER_NOT_FOUND));

        String username = JsonInput.trimmedText(body, "username");
        String email = JsonInput.trimmedText(body, "email");
        String address = JsonInput.trimmedText(body, "address");

        validator.validateProfile(username, email, address);
        Role role = readRole(body);
        validator.requireAvailable(username, email, user.getId());

        // I-3: az utolsó admin szerepköre nem vehető el. Az ellenőrzés és a
        // módosítás egy tranzakcióban van, és az admin sorok zárolásával — enélkül
        // két egyidejű lefokozás mindkét ellenőrzése „még van másik admin"-t látna,
        // és nullára vihetnék az adminok számát.
        if (role != null && role != user.getRole() && user.getRole() == Role.ADMIN
                && lockedAdminCount() <= 1) {
            throw ApiException.badRequest(Messages.LAST_ADMIN_ROLE);
        }

        user.setUsername(username);
        user.setEmail(email);
        user.setAddress(address);
        if (role != null) {
            user.setRole(role);
        }

        try {
            // Az előzetes ellenőrzés óta befutott versenytárs módosítás is itt akad
            // el: az egyediség végső fóruma az adatbázis indexe (I-1, I-2).
            users.flush();
        } catch (DataIntegrityViolationException ex) {
            throw validator.duplicate(ex);
        }

        return AdminUserResponse.of(user);
    }

    /**
     * A felhasználó törlése. A korábbi rendeléseit és értékeléseit NEM törli: a
     * rendelés önálló bizonylat, amely megőrzi a leadáskori vevői adatokat (ezért
     * nem is idegen kulcs a hivatkozás).
     */
    @Transactional
    public OkResponse delete(String id) {
        UserEntity user = users.findById(id)
                .orElseThrow(() -> ApiException.notFound(Messages.USER_NOT_FOUND));

        // I-3, ugyanazzal a zárolással, mint a lefokozásnál.
        if (user.getRole() == Role.ADMIN && lockedAdminCount() <= 1) {
            throw ApiException.badRequest(Messages.LAST_ADMIN_DELETE);
        }

        users.delete(user);
        return OkResponse.of();
    }

    /**
     * A szerepkör kiolvasása. A HIÁNYZÓ mező azt jelenti, „ne változzon"; a jelen
     * lévő, de érvénytelen érték (ismeretlen szó, {@code null}, nem szöveg) hiba —
     * egy elgépelt szerepkör nem maradhat némán figyelmen kívül.
     */
    private static Role readRole(JsonNode body) {
        JsonNode node = JsonInput.body(body).get("role");
        if (node == null) {
            return null;
        }
        Role role = node.isTextual() ? Role.from(node.textValue()) : null;
        if (role == null) {
            throw ApiException.badRequest(Messages.ROLE_INVALID);
        }
        return role;
    }

    /**
     * Az admin felhasználók száma, a sorok ZÁROLÁSÁVAL.
     *
     * <p>Egy sima {@code count(*)} READ COMMITTED alatt csak pillanatképet adna: két
     * párhuzamos kérés egyszerre láthatna két admint, és mindkettő elvehetné az
     * egyiket. A {@code FOR UPDATE} sorosítja az ilyen kéréseket — a második addig
     * vár, amíg az első be nem fejezte, és utána már a valós állapotot látja (I-3).
     * A zárolás mindig ugyanabban a sorrendben (index szerint) történik, ezért nem
     * alakulhat ki holtpont.
     */
    private long lockedAdminCount() {
        return entityManager
                .createNativeQuery("select id from users where role = 'admin' for update")
                .getResultList().size();
    }
}
