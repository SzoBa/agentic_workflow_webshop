package hu.webshop.auth;

import hu.webshop.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.Enumeration;
import org.springframework.stereotype.Component;

/**
 * A kérő kliens IP-címe — a bejelentkezési korlát számlálási kulcsa.
 *
 * <p>Reverse proxy mögött a socket távoli címe a PROXY-é: enélkül minden kérés
 * ugyanazzal a kulccsal számolna, és egyetlen kliens az összes felhasználót
 * kizárhatná. Ezért proxy mögött az {@code X-Forwarded-For} fejlécből olvasunk.
 *
 * <p><b>A fejléc melyik elemét — ez a biztonsági döntés.</b> Az
 * {@code X-Forwarded-For} egy LÁNC, és a konvenció szerint minden hop a saját
 * peer-jének a címét fűzi a lánc JOBB végére; a beérkezett fejlécet nem írja
 * felül. Vagyis a lánc bal széle az, amit a kliens küldött — tehát szabadon
 * hamisítható —, a jobb vége pedig az, amit a saját proxyink írtak oda:
 *
 * <pre>
 * kliens 1.2.3.4  ──►  proxy 10.0.0.5  ──►  szerver
 *   „X-Forwarded-For: 9.9.9.9"          „X-Forwarded-For: 9.9.9.9, 1.2.3.4"
 *    (kitalált érték)                     ^^^^^^^ a kliens hazugsága
 *                                                  ^^^^^^^ a proxy írta: ez a valóság
 * </pre>
 *
 * <p>A bal szélső elem olvasása ezért a bejelentkezési korlát megkerülését
 * jelentené: a támadó kérésenként más értéket küldve minden próbálkozásra FRISS
 * számlálási kulcsot kapna, és a {@link LoginAttemptService#MAX_ATTEMPTS} plafon
 * soha nem lépne életbe. Ugyanezért nincs bekapcsolva a Spring
 * {@code forward-headers-strategy=FRAMEWORK} sem: az is a bal szélső elemet
 * teszi a {@code getRemoteAddr()}-be (lásd {@code application.yml}).
 *
 * <p>A bizalom tehát JOBBRÓL nő, és ezért nem indexelünk elölről: a lánc
 * végétől számolunk vissza annyi hopot, amennyi megbízható proxy tényleg
 * előttünk van ({@code TRUSTED_PROXY_HOPS}). Ez az egyetlen adat, amit a támadó
 * nem tud befolyásolni — a lánc HOSSZÁT ugyanis igen, elemek beszúrásával, de a
 * beszúrt elemek a valódi kliens-IP-t csak jobbra tolják, a végtől mért
 * távolságát nem változtatják meg.
 *
 * <p><b>A fejléc TÖBBSZÖR is szerepelhet a kérésben</b>, és ilyenkor az összes
 * előfordulás EGYETLEN láncot alkot (RFC 9110 5.3: az ismételt fejlécmezők a
 * vesszővel összefűzött értékkel egyenértékűek). Ezért nem
 * {@code getHeader}-rel olvasunk: az csak az ELSŐ előfordulást adná, azt pedig a
 * kliens küldi. Van proxy, amelyik nem a meglévő fejlécet bővíti, hanem ÚJ
 * fejlécsort ír a saját észlelt címével (pl. a HAProxy {@code option forwardfor}
 * alapból így működik) — ott a kliens által küldött sor marad elöl, és a lánc
 * végéről olvasás önmagában nem védene: a támadó saját, egyelemű láncának a vége
 * a saját hazugsága. Az összefűzéssel viszont a proxy sora hátulra kerül, ahogy
 * kell.
 */
@Component
public class ClientIpResolver {

    private static final String FORWARDED_FOR = "X-Forwarded-For";

    /** Ha még a socket címe sem derül ki, közös kulcson számolunk tovább. */
    private static final String UNKNOWN = "unknown";

    private final AppProperties properties;

    public ClientIpResolver(AppProperties properties) {
        this.properties = properties;
    }

    public String resolve(HttpServletRequest request) {
        String socketAddress = socketAddress(request);
        int hops = properties.trustedProxyHops();
        if (hops <= 0) {
            // Nincs megbízható proxy: a fejlécre RÁ SEM NÉZÜNK. Közvetlen kitettség
            // mellett bárki bármit küldhet benne, a socket címe viszont a TCP
            // kapcsolatból jön, azt nem lehet meghamisítani.
            return socketAddress;
        }
        String forwarded = forwardedFor(forwardedForChain(request), hops);
        return forwarded != null ? forwarded : socketAddress;
    }

    /**
     * A kérés ÖSSZES {@code X-Forwarded-For} fejlécsora egyetlen láncba fűzve, a
     * beérkezési sorrendben. Lásd az osztálykommentet: egyetlen sor olvasása a
     * több fejlécsort író proxyk mögött a kliens saját értékét adná vissza.
     */
    private static String forwardedForChain(HttpServletRequest request) {
        Enumeration<String> values = request.getHeaders(FORWARDED_FOR);
        if (values == null) {
            // A szervlet-konténer nem köteles fejléc-felsorolást adni; ilyenkor
            // marad az egysoros olvasás.
            return request.getHeader(FORWARDED_FOR);
        }
        return String.join(",", Collections.list(values));
    }

    /**
     * A valódi kliens az {@code X-Forwarded-For} láncban a végétől {@code hops}-adik
     * elem: {@code hops} darab megbízható proxy pontosan {@code hops} darab elemet
     * fűzött a láncra, és ezek közül a LEGBALSÓ az, amit a hozzánk legközelebbi
     * megbízható lánc első tagja a klienstől látott.
     *
     * @param joinedChain a kérés összes {@code X-Forwarded-For} sora egyetlen,
     *     vesszővel elválasztott láncként (lásd {@link #forwardedForChain})
     * @return a kliens címe, vagy {@code null}, ha a fejléc hiányzik, üres, vagy
     *     rövidebb a beállított hop-számnál (ilyenkor a hívó a socket címére esik
     *     vissza — hibás konfigurációból inkább szigorúbb, mint hamisítható kulcs
     *     legyen)
     */
    private static String forwardedFor(String joinedChain, int hops) {
        if (joinedChain == null || joinedChain.isBlank()) {
            return null;
        }
        String[] chain = joinedChain.split(",");
        int clientIndex = chain.length - hops;
        if (clientIndex < 0) {
            return null;
        }
        String client = chain[clientIndex].trim();
        return client.isEmpty() ? null : client;
    }

    private static String socketAddress(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? UNKNOWN : remote;
    }
}
