package hu.webshop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Regisztrált felhasználó. A jelszó soha nem tárolódik nyersen: csak BCrypt hash
 * (a só a hash formátumában van, ezért nincs külön oszlop).
 *
 * <p>A {@code token} az aktuális munkamenet Bearer tokenje — felhasználónként EGY
 * érvényes munkamenet (I-6), kijelentkezéskor {@code null}. Sem a hash, sem a token
 * nem kerülhet HTTP-válaszba.
 */
@Entity
@Table(name = "users")
public class UserEntity extends AssignedIdEntity {

    @Column(name = "username", nullable = false)
    private String username;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "address", nullable = false)
    private String address;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    /**
     * A munkamenet-token LENYOMATA, nem maga a token (ADR-0008). A nyers tokent csak a
     * kiadó válasz tartalmazza; ez az oszlop egy szivárgás esetén sem használható
     * belépésre.
     */
    @Column(name = "token_hash")
    private String tokenHash;

    /**
     * A munkamenet lejárata; csúszó — lásd {@code hu.webshop.security.SessionService}.
     * A {@code token_hash}-sel EGYÜTT van kitöltve vagy üres; ezt adatbázis-megszorítás
     * őrzi ({@code users_session_pair_chk}).
     */
    @Column(name = "token_expires_at")
    private Instant tokenExpiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "role", nullable = false)
    private Role role = Role.CUSTOMER;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public void setTokenHash(String tokenHash) {
        this.tokenHash = tokenHash;
    }

    public Instant getTokenExpiresAt() {
        return tokenExpiresAt;
    }

    public void setTokenExpiresAt(Instant tokenExpiresAt) {
        this.tokenExpiresAt = tokenExpiresAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }
}
