package hu.webshop.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Rendelés. Önálló bizonylat: a vevői adatok a leadáskori MÁSOLATOT őrzik (nem a
 * fiókra mutatnak), és a {@code userId} sem idegen kulcs — a felhasználó törlése
 * nem érintheti a korábbi rendeléseket (ADR-0001).
 *
 * <p>A {@code reservedUntil} SZÁMOLT mező, nem itt él: a foglalási idő
 * konfigurációból jön, és egy módosítás azonnal érvényes a már leadott
 * rendelésekre is.
 */
@Entity
@Table(name = "orders")
public class OrderEntity extends AssignedIdEntity {

    @Column(name = "user_id")
    private String userId;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "customer_email", nullable = false)
    private String customerEmail;

    @Column(name = "customer_address", nullable = false)
    private String customerAddress;

    /** A végösszeg forintban — MINDIG a szerver számolja a saját áraiból. */
    @Column(name = "total", nullable = false)
    private int total;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "status", nullable = false)
    private OrderStatus status = OrderStatus.PENDING;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("seq asc")
    private List<OrderItemEntity> items = new ArrayList<>();

    /** Tétel hozzáadása a kétirányú kapcsolat és a sorrend karbantartásával. */
    public void addItem(OrderItemEntity item) {
        item.setOrder(this);
        item.setSeq(items.size());
        items.add(item);
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getCustomerEmail() {
        return customerEmail;
    }

    public void setCustomerEmail(String customerEmail) {
        this.customerEmail = customerEmail;
    }

    public String getCustomerAddress() {
        return customerAddress;
    }

    public void setCustomerAddress(String customerAddress) {
        this.customerAddress = customerAddress;
    }

    public int getTotal() {
        return total;
    }

    public void setTotal(int total) {
        this.total = total;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public void setStatus(OrderStatus status) {
        this.status = status;
    }

    public List<OrderItemEntity> getItems() {
        return items;
    }

    public void setItems(List<OrderItemEntity> items) {
        this.items = items;
    }
}
