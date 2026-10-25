package hu.webshop.auth;

import hu.webshop.common.OkResponse;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin felhasználó-végpontok.
 *
 * <p>A hitelesítést és az admin szerepkört az {@code AuthInterceptor} intézi az
 * {@code /api/admin/**} minta alapján (K-70, K-71) — itt már minden kérés admin jogú.
 */
@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final UserAdminService userAdminService;

    public AdminUserController(UserAdminService userAdminService) {
        this.userAdminService = userAdminService;
    }

    @GetMapping
    public List<AdminUserResponse> list() {
        return userAdminService.list();
    }

    @PutMapping("/{id}")
    public AdminUserResponse update(@PathVariable String id,
            @RequestBody(required = false) JsonNode body) {
        return userAdminService.update(id, body);
    }

    @DeleteMapping("/{id}")
    public OkResponse delete(@PathVariable String id) {
        return userAdminService.delete(id);
    }
}
