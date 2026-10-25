package hu.webshop.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import hu.webshop.catalog.ProductValidator.ProductFields;
import hu.webshop.common.ApiException;
import hu.webshop.common.Messages;
import hu.webshop.domain.ProductEntity;
import hu.webshop.repo.ProductRepository;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A katalógus ÍRÁSI műveletei (admin): létrehozás, teljes csere, aktivitásváltás, törlés.
 *
 * <p>Miért külön szolgáltatás az olvasásitól: más a tranzakciós igény (írás vs. csak
 * olvasás), és a két oldal MÁS fogalommal dolgozik — az olvasás nézeteket állít elő
 * szűréssel/lapozással, az írás egyetlen rekord állapotát váltja át.
 *
 * <p>Egyidejű szerkesztésnél az utolsó mentés nyer: nincs zárolás és nincs ütközésjelzés
 * — tudatosan vállalt, dokumentált korlát (K-4).
 */
@Service
public class ProductAdminService {

    private static final Logger log = LoggerFactory.getLogger(ProductAdminService.class);

    private final ProductRepository products;

    public ProductAdminService(ProductRepository products) {
        this.products = products;
    }

    /** Új termék. Az azonosító UUID (a seed termékek {@code p1}…{@code p8} kivételek). */
    @Transactional
    public ProductView create(JsonNode body) {
        ProductFields fields = ProductValidator.validate(body);

        ProductEntity product = new ProductEntity();
        product.setId(UUID.randomUUID().toString());
        apply(product, fields);
        // Az új termék alapértelmezés szerint AKTÍV, hacsak az admin mást nem kér.
        product.setActive(fields.active() == null || fields.active());
        products.save(product);

        log.info("Új termék létrehozva: {}", product.getId());
        return ProductView.of(product);
    }

    /**
     * Teljes csere. MINDEN mező újravalidálódik — a részleges frissítés a
     * {@code PATCH .../active} dolga.
     *
     * <p>A létezés ellenőrzése MEGELŐZI a validációt: egy nem létező termék hibás adatokkal
     * is 404-et kap, nem 400-at — a válasz arról szól, hogy nincs mit szerkeszteni.
     */
    @Transactional
    public ProductView replace(String id, JsonNode body) {
        ProductEntity product = require(id);
        ProductFields fields = ProductValidator.validate(body);
        apply(product, fields);
        // Az aktivitás csak akkor változik, ha a kérés kifejezetten nyilatkozott róla:
        // egy `active` nélküli csere nem hozhat vissza a boltba egy elrejtett terméket.
        if (fields.active() != null) {
            product.setActive(fields.active());
        }
        products.save(product);
        return ProductView.of(product);
    }

    /**
     * KIZÁRÓLAG az aktivitás váltása.
     *
     * <p>Miért külön művelet a csere mellett: a csere a termék minden mezőjét
     * újravalidálja, így egy régebbi, kézzel felvett termék (túl hosszú név, nem http(s)
     * kép) nem lenne elrejthető a vásárlók elől anélkül, hogy előbb kijavítanánk egy olyan
     * mezőt, amihez semmi közünk. Az elrejtés viszont épp hibás adatnál a legsürgősebb.
     */
    @Transactional
    public ProductView setActive(String id, JsonNode body) {
        ProductEntity product = require(id);
        product.setActive(ProductValidator.requiredActive(body));
        products.save(product);
        return ProductView.of(product);
    }

    /**
     * VÉGLEGES törlés (különbözik az inaktiválástól).
     *
     * <p>A korábbi rendelések tartalmát nem érinti: a tételek a leadáskori nevet és
     * egységárat snapshotként őrzik, és az {@code order_items.product_id} szándékosan nem
     * idegen kulcs (ADR-0001).
     */
    @Transactional
    public void delete(String id) {
        products.delete(require(id));
        log.info("Termék törölve: {}", id);
    }

    /** A termék, vagy 404. Az admin nézetben az inaktív termék is létezőnek számít. */
    private ProductEntity require(String id) {
        return products.findById(id)
                .orElseThrow(() -> ApiException.notFound(Messages.PRODUCT_NOT_FOUND));
    }

    /**
     * A validált mezők átvezetése. Az {@code active}-ot SZÁNDÉKOSAN nem érinti: arról a két
     * hívó másképp dönt (létrehozáskor alapérték, cserénél csak kifejezett kérésre változik).
     */
    private static void apply(ProductEntity product, ProductFields fields) {
        product.setName(fields.name());
        product.setDescription(fields.description());
        product.setPrice(fields.price());
        product.setImageUrl(fields.imageUrl());
        product.setStock(fields.stock());
        product.setCategory(fields.category());
    }
}
