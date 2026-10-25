package hu.webshop.repo;

import hu.webshop.domain.ReviewEntity;
import hu.webshop.domain.ReviewStatus;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Értékelések.
 *
 * <p>A publikus láthatóság szabálya (I-7: csak {@code approved}) EGY helyen éljen —
 * ezért a publikus lekérdezések státuszra szűrnek, és a hívók nem szűrnek utólag.
 */
public interface ReviewRepository extends JpaRepository<ReviewEntity, String> {

    /** Minden értékelés, legújabb elöl (admin moderációs lista). */
    List<ReviewEntity> findAllByOrderByCreatedAtDescIdAsc();

    List<ReviewEntity> findByStatusOrderByCreatedAtDescIdAsc(ReviewStatus status);

    /** Egy termék publikus értékelései: rendezés createdAt csökkenő, azonos időnél id növekvő. */
    List<ReviewEntity> findByProductIdAndStatusOrderByCreatedAtDescIdAsc(
            String productId, ReviewStatus status);

    /** I-4: bármilyen státuszú korábbi értékelés blokkolja az újat. */
    boolean existsByProductIdAndAuthor(String productId, String author);

    /**
     * Értékelési aggregátumok termékenként, KIZÁRÓLAG a jóváhagyott értékelésekből.
     * A kerekítést a hívó végzi (egy tizedesre), hogy a szabály egy helyen legyen.
     */
    @Query("""
            select r.productId as productId, avg(r.rating) as average, count(r) as count
            from ReviewEntity r
            where r.status = hu.webshop.domain.ReviewStatus.APPROVED
              and r.productId in :productIds
            group by r.productId
            """)
    List<RatingRow> ratingsByProductIds(@Param("productIds") Collection<String> productIds);

    /** Egy sor az aggregátum-lekérdezésből. */
    interface RatingRow {
        String getProductId();

        double getAverage();

        long getCount();
    }
}
