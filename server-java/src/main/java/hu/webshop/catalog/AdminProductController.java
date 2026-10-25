package hu.webshop.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.common.OkResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin termékkezelés.
 *
 * <p>A hozzáférés-vezérlés NEM itt van: az {@code /api/admin/**} névteret egyetlen
 * útvonalminta védi (lásd {@code WebConfig} és {@code AuthInterceptor}), így minden kérés
 * hitelesített és admin jogú, mire ideér — és egy új végpontnál nem felejthető el
 * (K-70, K-71).
 *
 * <p>Miért külön kontroller a vásárlói mellett: a kettő MÁS nézetet szolgál ki (a
 * vásárlói csak aktívat, csak olvasásra), és az összeolvasztásuk hozná vissza a kerülendő
 * {@code if (admin)} elágazást.
 *
 * <p>A kéréstörzs nyers {@code JsonNode}: a szerződés különbséget tesz a hiányzó és a
 * rossz típusú mező között, és az üzeneteknek a hibakatalógus szerinti SORRENDBEN kell
 * jönniük — ezt a {@link ProductValidator} adja, nem a keretrendszer kötése.
 */
@RestController
@RequestMapping("/api/admin/products")
public class AdminProductController {

    private final ProductQueryService products;
    private final ProductAdminService admin;

    public AdminProductController(ProductQueryService products, ProductAdminService admin) {
        this.products = products;
        this.admin = admin;
    }

    /** A TELJES katalógus, az inaktív termékekkel együtt (alap lapméret 25). */
    @GetMapping
    public ProductPage<AdminProductView> list(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String pageSize,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String minPrice,
            @RequestParam(required = false) String maxPrice,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {
        return products.adminList(page, pageSize,
                ProductFilter.admin(category, minPrice, maxPrice, search, status));
    }

    /** Új termék felvétele. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductView create(@RequestBody(required = false) JsonNode body) {
        return admin.create(body);
    }

    /** Meglévő termék teljes cseréje. */
    @PutMapping("/{id}")
    public ProductView replace(@PathVariable String id,
            @RequestBody(required = false) JsonNode body) {
        return admin.replace(id, body);
    }

    /** Kizárólag az aktivitás váltása — a többi mező validálása nélkül. */
    @PatchMapping("/{id}/active")
    public ProductView setActive(@PathVariable String id,
            @RequestBody(required = false) JsonNode body) {
        return admin.setActive(id, body);
    }

    /** Végleges törlés. A korábbi rendelések tartalmát nem érinti. */
    @DeleteMapping("/{id}")
    public OkResponse delete(@PathVariable String id) {
        admin.delete(id);
        return new OkResponse(true);
    }
}
