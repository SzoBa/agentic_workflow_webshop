package hu.webshop.auth;

import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;
import java.time.Instant;

/**
 * A felhasználó ADMIN nézete: a publikus mezők + {@code createdAt}.
 *
 * <p>Jelszóhash és token itt sem szerepel (K-55) — az admin felület sem kap többet,
 * mint amire a listázáshoz és a szerkesztéshez szüksége van.
 */
public record AdminUserResponse(
        String id,
        String username,
        String email,
        String address,
        Role role,
        Instant createdAt) {

    public static AdminUserResponse of(UserEntity user) {
        return new AdminUserResponse(user.getId(), user.getUsername(), user.getEmail(),
                user.getAddress(), user.getRole(), user.getCreatedAt());
    }
}
