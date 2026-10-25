package hu.webshop.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import hu.webshop.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * A számlálási kulcs kiolvasása az {@code X-Forwarded-For} láncból.
 *
 * <p>Ez a bejelentkezési korlát biztonsági magja: ha a kulcs hamisítható, a
 * {@link LoginAttemptService} perzisztens számlálója értéktelen, mert a támadó
 * kérésenként friss sort kap. Az itteni esetek azt szögezik le, hogy a lánc melyik
 * eleme számít — a végponti hatást (a 429 tényleg bekövetkezik) az
 * {@link AuthRateLimitSpoofTest} és az {@link AuthRateLimitTest} igazolja valódi
 * HTTP-n.
 *
 * <p>Miért {@code MockHttpServletRequest} és nem mock keretrendszer: a fejléc és a
 * socket-cím az egyetlen bemenet, ezeket a Spring saját teszt-duplikátuma valósághűen
 * adja — nincs mit stubolni, és a fejléc-kiolvasás nem is stub-viselkedés. Egyetlen
 * kivétel a {@link #missingHeaderEnumerationFallsBackToSingleLine()} környéke: azt az
 * ágat a teszt-duplikátum nem tudja előállítani (lásd ott).
 */
class ClientIpResolverTest {

    private static final String PROXY_SOCKET = "203.0.113.7";

    private static final String FORWARDED_FOR = "X-Forwarded-For";

    private ClientIpResolver resolverWithHops(String hops) {
        AppProperties properties = new AppProperties();
        properties.setTrustedProxyHops(hops);
        return new ClientIpResolver(properties);
    }

    /** Egyetlen {@code X-Forwarded-For} fejlécsor (a {@code null} azt jelenti: nincs fejléc). */
    private String resolve(String hops, String forwardedFor) {
        return forwardedFor == null
                ? resolveLines(hops)
                : resolveLines(hops, forwardedFor);
    }

    /**
     * TÖBB önálló {@code X-Forwarded-For} fejlécsor — ezt a {@code getHeader} nem látná,
     * csak az elsőt adná vissza.
     */
    private String resolveLines(String hops, String... forwardedForLines) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setRemoteAddr(PROXY_SOCKET);
        for (String line : forwardedForLines) {
            request.addHeader(FORWARDED_FOR, line);
        }
        return resolverWithHops(hops).resolve(request);
    }

    // --- Nincs megbízható proxy (alapállapot): a fejléc TELJESEN irreleváns. ---

    /**
     * Proxy nélkül a fejléc hamisítása semmit nem ér: a kulcs a TCP-kapcsolat címe.
     * Ez az alapértelmezett telepítés, tehát ez az eset védi a fejlesztői és a proxy
     * nélküli éles üzemet is.
     */
    @Test
    void ignoresSpoofedHeaderWithoutProxy() {
        assertThat(resolve(null, "9.9.9.9")).isEqualTo(PROXY_SOCKET);
        assertThat(resolve("0", "9.9.9.9")).isEqualTo(PROXY_SOCKET);
    }

    /**
     * Érvénytelen konfiguráció a BIZTONSÁGOS ágra esik (0 hop), nem a bizalomra.
     * A korábbi boolean kulcs értéke ({@code true}) is ide fut be.
     */
    @Test
    void invalidHopCountGrantsNoTrust() {
        assertThat(resolve("true", "9.9.9.9")).isEqualTo(PROXY_SOCKET);
        assertThat(resolve("-1", "9.9.9.9")).isEqualTo(PROXY_SOCKET);
        assertThat(resolve("", "9.9.9.9")).isEqualTo(PROXY_SOCKET);
    }

    // --- Egy megbízható proxy: a lánc VÉGE a valóság. ---

    /**
     * A döntő eset. A proxy a saját peer-jét (a valódi klienst) a lánc JOBB végére
     * fűzi, a bal szélső elem a kliens hazugsága. Ha innen olvasnánk — ahogy a korábbi
     * implementáció és a Spring FRAMEWORK strategy is teszi —, a kulcs hamisítható lenne.
     */
    @Test
    void oneProxyMakesChainEndTheClient() {
        assertThat(resolve("1", "9.9.9.9, 1.2.3.4")).isEqualTo("1.2.3.4");
    }

    /**
     * A támadó a lánc HOSSZÁT tudja növelni, a végtől mért távolságot nem: a beszúrt
     * elemek a valódi címet csak jobbra tolják.
     */
    @Test
    void insertedElementsDoNotShiftTheClient() {
        assertThat(resolve("1", "9.9.9.9, 8.8.8.8, 7.7.7.7, 1.2.3.4")).isEqualTo("1.2.3.4");
    }

    /** Becsületes kliens, aki egyáltalán nem küld fejlécet: a proxy egyetlen elemet ír. */
    @Test
    void withoutSpoofingTheProxyWrittenElementIsUsed() {
        assertThat(resolve("1", "1.2.3.4")).isEqualTo("1.2.3.4");
    }

    /** A lánc elemei körül szóköz állhat — a fejléc konvenciója szerint ez normális. */
    @Test
    void trimsWhitespace() {
        assertThat(resolve("1", "9.9.9.9,   1.2.3.4  ")).isEqualTo("1.2.3.4");
    }

    // --- Több önálló fejlécsor: az összes EGY lánc. ---

    /**
     * A KÜLÖN FEJLÉCSOROS eset. Van proxy, amelyik nem bővíti a kliens fejlécét, hanem
     * új sort ír a saját észlelt címével (pl. HAProxy {@code option forwardfor}). Ilyenkor
     * a kliens sora marad ELÖL, a proxyé hátul — az RFC 9110 szerint a kettő együtt
     * egyetlen, vesszővel összefűzött lánc.
     *
     * <p>Ha csak az első sort néznénk ({@code getHeader}), a támadó egyelemű láncot
     * küldve maga írná a kulcsot: a „lánc végéről olvasunk" szabály önmagában nem védene,
     * mert a saját láncának a vége is a saját hazugsága.
     */
    @Test
    void multipleHeaderLinesFormOneChain() {
        assertThat(resolveLines("1", "9.9.9.9", "1.2.3.4")).isEqualTo("1.2.3.4");
    }

    /** A hamisított sor több elemet is tartalmazhat — a proxy sora akkor is hátul van. */
    @Test
    void multiElementSpoofedLineDoesNotShiftTheClient() {
        assertThat(resolveLines("1", "9.9.9.9, 8.8.8.8", "1.2.3.4")).isEqualTo("1.2.3.4");
    }

    /** Két hop és két fejlécsor: a számolás az ÖSSZEFŰZÖTT láncon megy. */
    @Test
    void countsFromTheEndOfTheJoinedChain() {
        assertThat(resolveLines("2", "9.9.9.9", "1.2.3.4, 10.0.0.5")).isEqualTo("1.2.3.4");
    }

    // --- Két megbízható proxy (pl. CDN + nginx): eggyel beljebb. ---

    /**
     * Kételemű megbízható lánc: az utolsó elemet a második proxy írta (az első proxy
     * címe), a klienst az ELSŐ proxy fűzte oda — tehát a végtől a másodikat kell venni.
     */
    @Test
    void twoProxiesMakeSecondFromEndTheClient() {
        assertThat(resolve("2", "9.9.9.9, 1.2.3.4, 10.0.0.5")).isEqualTo("1.2.3.4");
    }

    // --- Visszaesés a socket címére. ---

    /** Bekapcsolt proxy-bizalom mellett is kell kulcs, ha a fejléc hiányzik. */
    @Test
    void missingHeaderFallsBackToSocketAddress() {
        assertThat(resolve("1", null)).isEqualTo(PROXY_SOCKET);
        assertThat(resolve("1", "   ")).isEqualTo(PROXY_SOCKET);
    }

    /**
     * A kiszámolt pozíción ÜRES elem áll (pl. „1.2.3.4, ” — a proxy vesszőt írt, címet
     * nem). Az üres sztring használhatatlan számlálási kulcs: egyetlen közös vödörbe
     * gyűjtene minden ilyen kérést, ezért itt is a socket címére esünk vissza.
     */
    @Test
    void emptyChainElementFallsBackToSocketAddress() {
        assertThat(resolve("1", "9.9.9.9, ")).isEqualTo(PROXY_SOCKET);
        assertThat(resolve("2", "1.2.3.4,  , 10.0.0.5")).isEqualTo(PROXY_SOCKET);
    }

    /**
     * A láncban kevesebb elem van, mint a beállított hop-szám: ez hibás konfiguráció
     * (vagy nem szabályos proxy). Ilyenkor a socket címére esünk vissza — inkább legyen
     * szigorúbb a számlálás, mint hamisítható a kulcs.
     */
    @Test
    void chainShorterThanHopCountFallsBackToSocketAddress() {
        assertThat(resolve("2", "1.2.3.4")).isEqualTo(PROXY_SOCKET);
        assertThat(resolve("3", "9.9.9.9, 1.2.3.4")).isEqualTo(PROXY_SOCKET);
    }

    /** Ha még a socket címe sem derül ki, közös kulcson számolunk tovább. */
    @Test
    void withoutSocketAddressUsesSharedKey() {
        assertThat(resolveWithSocket(null)).isEqualTo("unknown");
    }

    /**
     * A csak fehérkaraktert tartalmazó socket-cím ugyanaz az eset, mint a hiányzó: a
     * {@code " "} kulcson számolni ugyanolyan használhatatlan lenne.
     */
    @Test
    void blankSocketAddressUsesSharedKey() {
        assertThat(resolveWithSocket("   ")).isEqualTo("unknown");
    }

    private String resolveWithSocket(String remoteAddr) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setRemoteAddr(remoteAddr);
        return resolverWithHops("0").resolve(request);
    }

    // --- Fejléc-felsorolás nélküli konténer (védelmi ág). ---

    /**
     * A szervlet-specifikáció nem kötelezi a konténert fejléc-FELSOROLÁS adására: a
     * {@code getHeaders} {@code null}-t is visszaadhat. Ilyenkor az egysoros olvasásra
     * esünk vissza, különben egy ilyen konténeren a proxy-bizalom csendben kikapcsolna,
     * és minden kérés a proxy címén számolna.
     *
     * <p>Ezt az ágat a {@code MockHttpServletRequest} NEM tudja előállítani (mindig ad
     * felsorolást), ezért itt — és csak itt — mock keretrendszert használunk.
     */
    @Test
    void missingHeaderEnumerationFallsBackToSingleLine() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn(PROXY_SOCKET);
        when(request.getHeaders(FORWARDED_FOR)).thenReturn(null);
        when(request.getHeader(FORWARDED_FOR)).thenReturn("9.9.9.9, 1.2.3.4");

        assertThat(resolverWithHops("1").resolve(request)).isEqualTo("1.2.3.4");
    }

    /** Se felsorolás, se egysoros fejléc: marad a socket címe. */
    @Test
    void neitherEnumerationNorHeaderFallsBackToSocketAddress() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn(PROXY_SOCKET);
        when(request.getHeaders(FORWARDED_FOR)).thenReturn(null);
        when(request.getHeader(FORWARDED_FOR)).thenReturn(null);

        assertThat(resolverWithHops("1").resolve(request)).isEqualTo(PROXY_SOCKET);
    }
}
