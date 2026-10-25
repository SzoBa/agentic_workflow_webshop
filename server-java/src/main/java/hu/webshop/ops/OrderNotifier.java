package hu.webshop.ops;

import hu.webshop.domain.OrderEntity;
import hu.webshop.domain.UserEntity;

/**
 * Rendelési értesítő az ÜZEMELTETŐNEK (a vevő nem kap visszaigazolást).
 *
 * <p>Azért interfész, mert a rendelési út nem függhet a küldés részleteitől: a
 * hívó egyetlen dolgot garantál — az értesítés BÁRMILYEN hibája csak naplóba
 * kerül, a vevő válasza változatlan (spec 4.2 / 8. lépés, K-75).
 *
 * <p>A megvalósítás soha nem dob: hiányos konfiguráció esetén kecsesen kimarad
 * (figyelmeztető naplóbejegyzéssel, K-73, K-74).
 */
public interface OrderNotifier {

    /**
     * Értesítés egy újonnan létrejött rendelésről.
     *
     * @param order a mentett rendelés (tételekkel együtt)
     * @param user  a rendelést leadó felhasználó
     */
    void notifyNewOrder(OrderEntity order, UserEntity user);
}
