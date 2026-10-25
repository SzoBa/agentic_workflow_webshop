package hu.webshop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Termékértékelés. Beküldés után a TARTALMA nem módosítható, ezért az
 * {@code updatedAt} kizárólag a moderációs státuszváltást jelöli.
 *
 * <p>Az {@code author} a beküldő felhasználó azonosítója, és mindig a tokenből
 * származik — sosem a kérés törzséből.
 */
@Entity
@Table(name = "reviews")
public class ReviewEntity extends AssignedIdEntity {

    @Column(name = "product_id", nullable = false)
    private String productId;

    @Column(name = "author", nullable = false)
    private String author;

    /** Csillagok száma: 1 és 5 közötti egész. */
    @Column(name = "rating", nullable = false)
    private int rating;

    /** Opcionális szöveges vélemény, legfeljebb 500 karakter; üres helyett {@code null}. */
    @Column(name = "body")
    private String body;

    @Column(name = "status", nullable = false)
    private ReviewStatus status = ReviewStatus.PENDING;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public String getProductId() {
        return productId;
    }

    public void setProductId(String productId) {
        this.productId = productId;
    }

    public String getAuthor() {
        return author;
    }

    public void setAuthor(String author) {
        this.author = author;
    }

    public int getRating() {
        return rating;
    }

    public void setRating(int rating) {
        this.rating = rating;
    }

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body;
    }

    public ReviewStatus getStatus() {
        return status;
    }

    public void setStatus(ReviewStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
