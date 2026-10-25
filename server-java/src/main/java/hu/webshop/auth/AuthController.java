package hu.webshop.auth;

import hu.webshop.common.OkResponse;
import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.domain.UserEntity;
import hu.webshop.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Hitelesítési végpontok: regisztráció, bejelentkezés, kijelentkezés, saját profil
 * megtekintése és szerkesztése, jelszócsere.
 *
 * <p>A {@code /logout}, a {@code /me} és a {@code /password} védett — a 401-et az
 * {@code AuthInterceptor} adja útvonalminta alapján, ezért itt nincs
 * jogosultság-ellenőrzés. A névtér egésze NEM védett: a regisztráció és a
 * bejelentkezés nyilvános, ezért a mintákat végpontonként kell felvenni
 * ({@code WebConfig}).
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final AccountService accountService;
    private final ClientIpResolver clientIp;

    public AuthController(AuthService authService, AccountService accountService,
            ClientIpResolver clientIp) {
        this.authService = authService;
        this.accountService = accountService;
        this.clientIp = clientIp;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@RequestBody(required = false) JsonNode body) {
        return authService.register(body);
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody(required = false) JsonNode body,
            HttpServletRequest request) {
        return authService.login(body, clientIp.resolve(request));
    }

    @PostMapping("/logout")
    public OkResponse logout(@CurrentUser UserEntity user) {
        return authService.logout(user.getId());
    }

    @GetMapping("/me")
    public PublicUserResponse me(@CurrentUser UserEntity user) {
        return PublicUserResponse.of(user);
    }

    /**
     * A saját fiókadatok mentése. A módosítandó felhasználó MINDIG a tokenből jön —
     * a törzsben küldött azonosítót és szerepkört a szolgáltatás nem veszi figyelembe.
     */
    @PutMapping("/me")
    public PublicUserResponse updateMe(@CurrentUser UserEntity user,
            @RequestBody(required = false) JsonNode body) {
        return accountService.updateProfile(user.getId(), body);
    }

    /** Jelszócsere. A válasz új munkamenet-tokent hoz (a régi érvénytelenné válik). */
    @PostMapping("/password")
    public AuthResponse changePassword(@CurrentUser UserEntity user,
            @RequestBody(required = false) JsonNode body) {
        return accountService.changePassword(user.getId(), body);
    }
}
