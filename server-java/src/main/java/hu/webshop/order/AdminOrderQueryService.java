package hu.webshop.order;

import hu.webshop.catalog.Catalog;
import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.OrderStatus;
import hu.webshop.domain.UserEntity;
import hu.webshop.repo.OrderRepository;
import hu.webshop.repo.UserRepository;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Az admin rendeléslista OLVASÁSI útja: a TELJES rendeléshalmaz, szűrve és lapozva.
 *
 * <p>Szemben a {@code GET /api/orders}-szel (a hívó saját rendelései, beszúrási
 * sorrendben), ez a nézet felhasználótól függetlenül lát mindent, LEGÚJABB elöl — az
 * admin a friss rendeléseket keresi. A rendezőkulcs továbbra is a {@code seq}, csak az
 * iránya fordított, tehát a sorrend determinisztikus marad.
 *
 * <p>Miért itt, és nem a {@link OrderService}-ben: az a szolgáltatás a rendelés
 * ÉLETCIKLUSÁÉRT felel (leadás, teljesítés, zárolás, tranzakció-atomicitás). Egy tisztán
 * olvasó, lapozó lista mellé keverve mindkettő olvashatatlanabb lenne.
 *
 * <p><b>A szűrés és a lapozás a LEKÉRDEZÉSBEN dől el</b> (ADR-0009), szemben a
 * termékkatalógussal, amely memóriában szűr. A különbség nem stílus: a katalógus korlátos,
 * admin által gondozott halmaz, a rendelés viszont append-only és felhasználók hajtják — a
 * teljes halmaz betöltése ott olcsó, itt korlátlanul növekvő költség lenne.
 */
@Service
public class AdminOrderQueryService {

    /** Az admin táblázatos listát lát, nem kártyarácsot — ezért nagyobb lapméret. */
    private static final int ADMIN_PAGE_SIZE = 25;

    /**
     * A LIKE-minta menekítő jele. Nem a fordított perjel: az HQL sztringliterálban az külön
     * menekítést kívánna, a {@code !} viszont a LIKE-nak amúgy sem jelent semmit.
     *
     * <p>Ez a konstans csak a minta ELŐÁLLÍTÁSÁT írja le; a megfelelő {@code escape '!'} záradék
     * sztringliterálként él az {@link OrderRepository} két {@code @Query} annotációjában, és onnan
     * ez a mező nem hivatkozható. A kettő szétcsúszása néma hiba lenne (a menekített {@code %} és
     * {@code _} némán újra jokerré válna), ezért — a két predikátumhoz hasonlóan — TESZT őrzi:
     * {@code AdminOrderSearchPatternTest.repositoryQueriesEscapeWithTheSameCharacter}.
     */
    static final char LIKE_ESCAPE = '!';

    /** Az „üres keresés = nincs szűrés" szabály LIKE-alakja. */
    private static final String MATCH_ALL = "%";

    /** Az „ismeretlen status = teljes halmaz" szabály (AR-06) halmazként. */
    private static final List<OrderStatus> EVERY_STATUS = List.of(OrderStatus.values());

    private final OrderRepository orders;
    private final UserRepository users;
    private final OrderMapper mapper;

    public AdminOrderQueryService(OrderRepository orders, UserRepository users,
            OrderMapper mapper) {
        this.orders = orders;
        this.users = users;
        this.mapper = mapper;
    }

    /**
     * A teljes rendeléslista, szűrve és lapozva.
     *
     * <p>A státusz-szűrés, a {@code search} ÉS a lapozás egyaránt a LEKÉRDEZÉSBEN dől el:
     * egy kérés legfeljebb egy lapnyi rendelést tölt be (ADR-0009). A lapozás
     * query-paraméter-szemantikája viszont a rendszer szerződésének része, ezért a vágásokat
     * továbbra is a KÖZÖS {@link Catalog#window} adja — nem másolat.
     *
     * <p>Ebből következik a KÖTÖTT sorrend: előbb a darabszám, mert a {@code page} csak a
     * {@code totalPages} ismeretében vágható, és csak utána kérhető le a lap.
     */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public OrderPage<AdminOrderView> list(String page, String pageSize, String status,
            String search) {
        Collection<OrderStatus> statuses = statusesOf(status);
        String needle = likePattern(search);

        // A `total` a szerződésben `int`; a néma cast rossz értéket hazudna, ezért dobjon.
        int total = Math.toIntExact(orders.countAdminList(statuses, needle));
        Catalog.Window window = Catalog.window(total, page, pageSize, ADMIN_PAGE_SIZE);

        List<OrderEntity> pageItems = pageOf(statuses, needle, window);
        List<OrderResponse> responses = mapper.toResponses(pageItems);
        Map<String, String> usernames = usernamesOf(pageItems);

        // A userId hiányozhat (importált, fiók nélküli rendelés), ezért a keresés
        // null-tűrő: az üres térkép `get(null)` hívása egyébként elszállna.
        List<AdminOrderView> items = responses.stream()
                .map(order -> AdminOrderView.of(order,
                        order.userId() == null ? null : usernames.get(order.userId())))
                .toList();

        return new OrderPage<>(items, total, window.page(), window.pageSize(),
                window.totalPages());
    }

    /**
     * Egy lapnyi rendelés, tételekkel — KÉT lekérdezésben.
     *
     * <p>Azért kettő, mert a gyűjtemény-fetch és a lapozás nem fér egy lekérdezésbe (lásd
     * {@code OrderRepository.findAdminListIdPage}). Az üres ág mindkettőt kihagyja: a
     * {@code limit == 0} PONTOSAN az üres találathalmazt jelenti (a {@code CatalogWindowTest}
     * méri), tehát nincs mit lekérdezni.
     */
    private List<OrderEntity> pageOf(Collection<OrderStatus> statuses, String needle,
            Catalog.Window window) {
        if (window.limit() == 0) {
            return List.of();
        }
        List<String> ids = orders.findAdminListIdPage(statuses, needle,
                PageRequest.of(window.page() - 1, window.pageSize()));
        return ids.isEmpty() ? List.of() : orders.findAllWithItemsByIdIn(ids);
    }

    /**
     * A szűrt státuszok. Az ISMERETLEN {@code status} érték NEM hiba: az {@code all}, a
     * hiányzó és az ismeretlen érték egyaránt a teljes halmazt adja — ez a
     * {@code GET /api/admin/products} meglévő viselkedése, és a két admin lista nem
     * viselkedhet másképp ugyanazon a néven.
     *
     * <p>Miért halmaz, és nem nullázható paraméter: az {@code o.status in :statuses} az ÖSSZES
     * enum-értékkel bizonyíthatóan a teljes halmaz, mert a séma szerint a
     * {@code status NOT NULL CHECK (status IN ('pending', 'expired', 'delivered'))}. Egy
     * {@code (:status is null or ...)} alak ezzel szemben tipizálatlan {@code null}-t kötne,
     * ami Postgresen paramétertípus-hibába fut.
     */
    private static Collection<OrderStatus> statusesOf(String status) {
        OrderStatus known = OrderStatus.from(status);
        return known == null ? EVERY_STATUS : List.of(known);
    }

    /**
     * A szabadszavas minta SQL {@code LIKE} alakja — a vevő NEVÉRE, E-MAILJÉRE és a rendelés
     * AZONOSÍTÓJÁRA illeszkedik majd. A vevői mezők a leadáskori snapshotból jönnek: az admin
     * azt keresi, ami a bizonylaton áll, nem a fiók mai adatait.
     *
     * <p>A minta trimmelve dől el, és Java kisbetűsíti ({@code Locale.ROOT}) — az oszlopot a
     * Postgres {@code lower()}-je. A két oldal egyezése MÉRT előfeltevés, nem feltételezés
     * (ADR-0009): {@code en_US.utf8} kolláció mellett a nagybetűs ékezetes szöveg is helyesen
     * hajtódik le, és ezt az {@code AdminOrderSearchAndPagingTest} őrzi.
     *
     * <p>A {@code %}, az {@code _} és maga a menekítő jel MENEKÍTVE kerül a mintába: enélkül egy
     * {@code a_b} keresés az {@code axb}-re is illeszkedne, ami néma viselkedésváltozás lenne a
     * korábbi {@code String.contains} szemantikájához képest.
     *
     * <p>Az üres (vagy csak szóközből álló) érték nem szűr: a {@code "%"} minta minden sorra
     * illeszkedik, mert az {@code id} elsődleges kulcs, tehát sosem {@code null}.
     */
    static String likePattern(String search) {
        if (search == null) {
            return MATCH_ALL;
        }
        String needle = search.trim().toLowerCase(Locale.ROOT);
        if (needle.isEmpty()) {
            return MATCH_ALL;
        }
        StringBuilder pattern = new StringBuilder(needle.length() + 2).append('%');
        for (int i = 0; i < needle.length(); i++) {
            char character = needle.charAt(i);
            if (character == LIKE_ESCAPE || character == '%' || character == '_') {
                pattern.append(LIKE_ESCAPE);
            }
            pattern.append(character);
        }
        return pattern.append('%').toString();
    }

    /**
     * A megjelenített LAP felhasználóneve azonosító szerint, EGYETLEN lekérdezéssel.
     * Rendelésenkénti keresés (N+1) nem jöhet szóba: egy 25 soros lap 25 külön
     * lekérdezést jelentene.
     *
     * <p>A törölt fiók egyszerűen nem szerepel a térképben — a hívó {@code null}-t kap,
     * és a mező kimarad a válaszból.
     */
    private Map<String, String> usernamesOf(List<OrderEntity> page) {
        List<String> ids = page.stream()
                .map(OrderEntity::getUserId)
                .filter(id -> id != null)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<String, String> byId = new HashMap<>();
        for (UserEntity user : users.findAllById(ids)) {
            byId.put(user.getId(), user.getUsername());
        }
        return byId;
    }
}
