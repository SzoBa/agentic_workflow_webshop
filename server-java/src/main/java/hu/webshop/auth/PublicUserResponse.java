package hu.webshop.auth;

import hu.webshop.domain.Role;
import hu.webshop.domain.UserEntity;

/**
 * A felhasználó PUBLIKUS nézete (bejelentkezési és profil-válaszok).
 *
 * <p>Miért külön típus és nem az entitás: a jelszóhash és a munkamenet-token
 * SEMMILYEN válaszban nem jelenhet meg (K-55). Egy külön record esetén ez nem
 * elfelejthető annotáció kérdése — a mező egyszerűen nem létezik.
 *
 * <p>A {@code role} szándékosan publikus: a kliens ebből dönti el, mutassa-e az
 * admin menüpontokat. Ez csak kényelmi funkció, az érdemi védelem szerveroldali.
 */
public record PublicUserResponse(
        String id,
        String username,
        String email,
        String address,
        Role role) {

    public static PublicUserResponse of(UserEntity user) {
        return new PublicUserResponse(user.getId(), user.getUsername(), user.getEmail(),
                user.getAddress(), user.getRole());
    }
}
