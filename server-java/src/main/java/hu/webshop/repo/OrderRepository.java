package hu.webshop.repo;

import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderStatus;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Rendelések. A tételeket mindenhol együtt töltjük be (a válasz úgyis tartalmazza őket). */
public interface OrderRepository extends JpaRepository<OrderEntity, String> {

    /** Egy felhasználó saját rendelései, beszúrási sorrendben. */
    @EntityGraph(attributePaths = "items")
    List<OrderEntity> findByUserIdOrderBySeqAsc(String userId);

    @EntityGraph(attributePaths = "items")
    List<OrderEntity> findByStatusOrderBySeqAsc(OrderStatus status);

    /**
     * Az admin lista TALÁLATSZÁMA (ADR-0009).
     *
     * <p>A {@code total} a SZŰRT halmaz mérete, és a lap vágásához előbb a darabszám kell
     * ({@code page} csak a {@code totalPages} ismeretében vágható) — ezért külön lekérdezés.
     *
     * <p>A feltétel SZÓ SZERINT azonos a {@link #findAdminListIdPage}-ével. A kettő egyezését
     * az {@code AdminOrderSearchAndPagingTest} méri: {@code @Query} sztringekből nem lehet
     * kiemelni a közös részt, tehát csak teszt őrzi a szétcsúszástól.
     *
     * <p>Ugyanez áll az {@code escape '!'} záradékra: a minta menekítését a
     * {@code AdminOrderQueryService.LIKE_ESCAPE} végzi, de az a konstans innen nem hivatkozható.
     * A két oldal egyezését az {@code AdminOrderSearchPatternTest} olvassa vissza EBBŐL az
     * annotációból — a záradék átírása ott bukik el, nem futásidőben, néma rossz találatokként.
     */
    @Query("""
            select count(o)
            from OrderEntity o
            where o.status in :statuses
              and (lower(o.customerName) like :needle escape '!'
                or lower(o.customerEmail) like :needle escape '!'
                or lower(o.id) like :needle escape '!')
            """)
    long countAdminList(@Param("statuses") Collection<OrderStatus> statuses,
            @Param("needle") String needle);

    /**
     * Az admin lista egy LAPJA — csak az AZONOSÍTÓK, tételek nélkül, legújabb elöl.
     *
     * <p>Miért nem itt töltjük a tételeket: a Hibernate a gyűjtemény-fetchet NEM tudja SQL-ben
     * lapozni. {@code @EntityGraph} és {@code Pageable} együtt {@code HHH90003004}
     * figyelmeztetéssel némán behúzná az EGÉSZ halmazt, és memóriában vágna — pontosan az a
     * költség, amit el akarunk kerülni. Ezért a lapozás azonosítókon fut, a tételeket a
     * {@link #findAllWithItemsByIdIn} hozza egy második lekérdezésben.
     *
     * <p>A visszatérési típus SZÁNDÉKOSAN {@code List}, nem {@code Page}: a {@code Page} mellé a
     * Spring Data a sajátját is elindítaná a {@link #countAdminList} mellé, két count-ot futtatva.
     */
    @Query("""
            select o.id
            from OrderEntity o
            where o.status in :statuses
              and (lower(o.customerName) like :needle escape '!'
                or lower(o.customerEmail) like :needle escape '!'
                or lower(o.id) like :needle escape '!')
            order by o.seq desc
            """)
    List<String> findAdminListIdPage(@Param("statuses") Collection<OrderStatus> statuses,
            @Param("needle") String needle, Pageable pageable);

    /**
     * A megjelenített LAP rendelései, tételekkel együtt (az {@code open-in-view} ki van
     * kapcsolva). A halmaz korlátos — legfeljebb egy lapnyi —, ezért itt a gyűjtemény-fetch
     * már veszélytelen.
     *
     * <p>A rendezés itt is {@code seq desc}, mert az {@code in} feltétel sorrendje nem garantált.
     */
    @EntityGraph(attributePaths = "items")
    @Query("select o from OrderEntity o where o.id in :ids order by o.seq desc")
    List<OrderEntity> findAllWithItemsByIdIn(@Param("ids") Collection<String> ids);

    /**
     * A lejárati körhöz: a megadott időpontnál régebben létrehozott {@code pending}
     * rendelések. A lejárat pillanata {@code createdAt + foglalási idő}, ezért a
     * hívó a küszöböt visszafelé számolja.
     */
    @EntityGraph(attributePaths = "items")
    List<OrderEntity> findByStatusAndCreatedAtLessThanEqualOrderBySeqAsc(
            OrderStatus status, Instant createdAtOrBefore);

    /**
     * Az „ellenőrzött vásárló" szabály (K-60): van-e a felhasználónak KISZÁLLÍTOTT
     * rendelése, amely tartalmazza a terméket. Enélkül bárki értékelhetne bármit.
     */
    @Query("""
            select count(i) > 0
            from OrderItemEntity i
            where i.order.userId = :userId
              and i.order.status = hu.webshop.domain.OrderStatus.DELIVERED
              and i.productId = :productId
            """)
    boolean existsDeliveredItem(@Param("userId") String userId,
            @Param("productId") String productId);

    /**
     * Termékenként lefoglalt darabszám: a {@code pending} rendelések tételeinek összege.
     *
     * <p>A foglalás a TÁROLT státuszra épül, nem az időbélyegre — egy lejárt rendelés
     * addig foglal, amíg az ütemező át nem állítja (tudatosan vállalt korlát, ADR-0005).
     */
    @Query("""
            select i.productId as productId, sum(i.quantity) as quantity
            from OrderItemEntity i
            where i.order.status = hu.webshop.domain.OrderStatus.PENDING
              and i.productId in :productIds
            group by i.productId
            """)
    List<ReservedRow> reservedByProductIds(@Param("productIds") Collection<String> productIds);

    /** Egy sor a foglalás-összesítésből. */
    interface ReservedRow {
        String getProductId();

        long getQuantity();
    }
}
