package hu.webshop.auth;

/**
 * A regisztráció és a bejelentkezés válasza: {@code { "user": {...}, "token": "..." }}.
 *
 * <p>Ez az EGYETLEN hely, ahol munkamenet-token válaszba kerül — és kizárólag a
 * sajátja, annak, aki épp most hitelesítette magát.
 */
public record AuthResponse(PublicUserResponse user, String token) {
}
