package hu.webshop.order;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rendeléslista és -teljesítés (admin). A hozzáférés-vezérlést az {@code /api/admin}
 * névtérre bekötött interceptor intézi (401, majd 403) — itt már minden kérés admin jogú.
 *
 * <p>A teljesítés az EGYETLEN mód arra, hogy egy rendelés kiszállítottá váljon — enélkül
 * senki nem írhatna értékelést, mert az „ellenőrzött vásárló" szabály kiszállított
 * rendelést kér. A lista pedig az egyetlen mód arra, hogy az admin MEGTALÁLJA a
 * teljesítendő rendelést.
 */
@RestController
@RequestMapping("/api/admin/orders")
public class AdminOrderController {

    private final OrderService orders;
    private final AdminOrderQueryService query;

    public AdminOrderController(OrderService orders, AdminOrderQueryService query) {
        this.orders = orders;
        this.query = query;
    }

    /**
     * A TELJES rendeléshalmaz, legújabb elöl (alap lapméret 25).
     *
     * <p>Minden query paraméter {@code String}-ként kötődik, és az értelmezésük a
     * szerződés része: egy elgépelt {@code ?page=abc} az első oldalt adja, nem 400-at,
     * egy ismeretlen {@code status} pedig a teljes halmazt.
     */
    @GetMapping
    public OrderPage<AdminOrderView> list(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search) {
        return query.list(page, pageSize, status, search);
    }

    /** Body: {@code { "status": "pending" | "expired" | "delivered" }}. */
    @PatchMapping("/{id}/status")
    public OrderResponse updateStatus(@PathVariable String id,
            @RequestBody(required = false) JsonNode body) {
        return orders.updateStatus(id, body);
    }
}
