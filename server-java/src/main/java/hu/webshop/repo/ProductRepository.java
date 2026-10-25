package hu.webshop.repo;

import hu.webshop.domain.ProductEntity;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Termékek. MINDEN listázás {@code seq} szerint rendez: a beszúrási sorrend a
 * szerződés része, és relációs tárolásnál csak explicit rendezés garantálja.
 */
public interface ProductRepository extends JpaRepository<ProductEntity, String> {

    /** A teljes katalógus beszúrási sorrendben (admin nézet). */
    List<ProductEntity> findAllByOrderBySeqAsc();

    /** Csak az aktív termékek, beszúrási sorrendben (vásárlói nézet). */
    List<ProductEntity> findByActiveTrueOrderBySeqAsc();

    /** Egy AKTÍV termék. Az inaktív ugyanúgy „nincs", mint a nem létező (404). */
    Optional<ProductEntity> findByIdAndActiveTrue(String id);

    /**
     * A megadott termékek SOR SZINTEN ZÁROLVA (I-5).
     *
     * <p>A rendelés fedezetellenőrzése és beszúrása egy tranzakcióban, ezzel a
     * zárolással történik — enélkül két egyidejű kérés ugyanazt a darabot foglalná le.
     * A rendezés a holtpont elkerüléséhez kell: minden hívó ugyanabban a sorrendben zárol.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from ProductEntity p where p.id in :ids order by p.seq asc")
    List<ProductEntity> lockAllByIdIn(@Param("ids") Collection<String> ids);
}
