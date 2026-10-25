package hu.webshop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Termék. A {@code stock} a FIZIKAI raktárkészlet — nem azonos azzal, amit most meg
 * lehet rendelni: az {@code available} a foglalásokkal csökkentett érték, és nem itt
 * él, hanem számolt mező (lásd {@code hu.webshop.stock.ReservationService}).
 */
@Entity
@Table(name = "products")
public class ProductEntity extends AssignedIdEntity {

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "description", nullable = false)
    private String description;

    /** Ár forintban, egész, szigorúan nagyobb, mint 0. */
    @Column(name = "price", nullable = false)
    private int price;

    @Column(name = "image_url", nullable = false)
    private String imageUrl;

    @Column(name = "stock", nullable = false)
    private int stock;

    @Column(name = "category", nullable = false)
    private String category;

    /** Inaktív termék a vásárlói felület számára NEM létezik (404, mint a nem létező). */
    @Column(name = "active", nullable = false)
    private boolean active = true;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public int getPrice() {
        return price;
    }

    public void setPrice(int price) {
        this.price = price;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public int getStock() {
        return stock;
    }

    public void setStock(int stock) {
        this.stock = stock;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
