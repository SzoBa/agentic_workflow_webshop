package hu.webshop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Egy IP-cím sikertelen bejelentkezési próbálkozásai egy időablakban.
 *
 * <p>Azért tárolt (és nem memóriában él), hogy a védelem túlélje az újraindítást
 * (K-52), és több példány esetén se lehessen példányonként újrakezdeni.
 */
@Entity
@Table(name = "login_attempts")
public class LoginAttemptEntity {

    /** A számlálás kulcsa: a kérő kliens IP-címe. */
    @Id
    @Column(name = "attempt_key", nullable = false, updatable = false)
    private String key;

    /** Sikertelen próbálkozások száma az aktuális ablakban. */
    @Column(name = "attempts", nullable = false)
    private int attempts;

    /** Az ablak kezdete. */
    @Column(name = "first_at", nullable = false)
    private Instant firstAt;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }

    public Instant getFirstAt() {
        return firstAt;
    }

    public void setFirstAt(Instant firstAt) {
        this.firstAt = firstAt;
    }
}
