package hu.webshop.catalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Termékvégpontok a VÁSÁRLÓI nézethez. Nyilvános: bejelentkezés nélkül olvasható.
 *
 * <p>Mindkét végpont kizárólag AKTÍV termékeken dolgozik — ezt a lekérdező szolgáltatás
 * garantálja, nem itt eldöntött feltétel.
 *
 * <p>A query paraméterek szándékosan {@code String} típusúak: az értelmezésük (nem szám
 * érték kihagyása, üres kategória, {@code page} vágása) a szerződés része, és a
 * {@link ProductFilter} / {@link Catalog} végzi. Ha {@code Integer}-ként kötnénk be, a
 * keretrendszer egy elgépelt {@code ?page=abc} kérésre 400-at adna a referencia szerinti
 * „első oldal" helyett.
 */
@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductQueryService products;

    public ProductController(ProductQueryService products) {
        this.products = products;
    }

    /** Lapozott, szűrhető terméklista (alap lapméret 12). */
    @GetMapping
    public ProductPage<CustomerProductView> list(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String pageSize,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String minPrice,
            @RequestParam(required = false) String maxPrice,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String inStock) {
        return products.customerList(page, pageSize,
                ProductFilter.customer(category, minPrice, maxPrice, search, inStock));
    }

    /** Egyetlen termék. Nem létező VAGY inaktív termék esetén ugyanaz a 404. */
    @GetMapping("/{id}")
    public CustomerProductView get(@PathVariable String id) {
        return products.customerProduct(id);
    }
}
