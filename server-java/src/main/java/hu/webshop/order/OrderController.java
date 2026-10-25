package hu.webshop.order;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.UserEntity;
import hu.webshop.ops.OrderNotifier;
import hu.webshop.security.CurrentUser;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Vásárlói rendelés-végpontok. A hitelesítést az interceptor intézi (401), ide már csak
 * belépett felhasználó jut el.
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    private final OrderService orders;
    private final OrderMapper mapper;
    private final OrderNotifier notifier;

    public OrderController(OrderService orders, OrderMapper mapper, OrderNotifier notifier) {
        this.orders = orders;
        this.mapper = mapper;
        this.notifier = notifier;
    }

    /** A belépett felhasználó SAJÁT rendelései (K-32). */
    @GetMapping
    public List<OrderResponse> list(@CurrentUser UserEntity user) {
        return orders.listOwn(user.getId());
    }

    /**
     * Új rendelés leadása.
     *
     * <p>Az értesítés SZÁNDÉKOSAN a szolgáltatás tranzakciója UTÁN megy ki: az értesítő
     * csak véglegesített rendelésről szólhat, és a küldés ideje alatt nem tarthatunk
     * sorzárat a termékeken. A hibája kizárólag naplóba kerül — a vevő válasza
     * változatlan (K-75).
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse place(@CurrentUser UserEntity user,
            @RequestBody(required = false) JsonNode body) {
        OrderEntity order = orders.place(user, body);
        try {
            notifier.notifyNewOrder(order, user);
        } catch (Exception ex) {
            log.error("Rendelési e-mail küldése sikertelen (rendelés: {})", order.getId(), ex);
        }
        return mapper.toResponse(order);
    }
}
