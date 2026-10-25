# A kliens IP-je az X-Forwarded-For lánc végétől számolt hop, nem a lánc első eleme

A bejelentkezési korlát (spec 7.2, K-51/K-52) IP-nként számol, tehát pontosan olyan jó, amilyen a
kulcs, amivel a számlálót indexeljük. Reverse proxy mögött a socket távoli címe a proxy-é, ezért a
valós kliens IP-t az `X-Forwarded-For` fejlécből kell kiolvasni — a fejléc viszont **lánc**, és a
konvenció szerint minden hop a saját peer-jének címét fűzi a lánc **jobb** végére, a beérkezett
tartalmat nem írja felül. Ebből következik, hogy a bizalom jobbról nő: a lánc bal széle az, amit a
kliens küldött, a jobb vége az, amit a saját proxyink írtak.

A megvalósítás ezért **nem indexel elölről**, hanem a lánc végétől számol vissza annyi hopot,
amennyi megbízható proxy tényleg a szerver előtt van (`TRUSTED_PROXY_HOPS`, alapból `0`). A
konfigurációs kulcs ezzel **be/ki kapcsolóból darabszámmá** vált: egy boolean csak arra tud
válaszolni, hogy ránézzünk-e a fejlécre, arra nem, hogy melyik eleme megbízható — és a támadás
szempontjából a második kérdés a döntő.

```
kliens 1.2.3.4  ──►  proxy 10.0.0.5  ──►  szerver
  „X-Forwarded-For: 9.9.9.9"          „X-Forwarded-For: 9.9.9.9, 1.2.3.4"
   (kitalált érték)                     ^^^^^^^ a kliens hazugsága
                                                 ^^^^^^^ a proxy írta: ez a valóság
```

A „végétől számolunk" szabály önmagában viszont **nem elég**: azt is ki kell mondani, hogy mi
számít láncnak. Az `X-Forwarded-For` **többször is szerepelhet** a kérésben, és van proxy,
amelyik nem a meglévő fejlécet bővíti, hanem új sort ír a saját észlelt címével (a HAProxy
`option forwardfor` alapból így viselkedik). Ha csak az első sort olvasnánk — a szervlet API
`getHeader`-e pontosan ezt adja —, a kliens saját sora maradna elöl, az ő egyelemű láncának a
vége pedig a saját hazugsága: a hamisítás visszatérne. Ezért az összes előfordulás **egyetlen,
összefűzött láncot** alkot (RFC 9110 5.3), és a hop-számolás ezen fut.

## Considered Options

- **A lánc ELSŐ eleme (a korábbi megvalósítás)** — a „lánc elején az eredeti kliens áll" feltevés
  igaz egy becsületes kliensnél, de a támadó dönti el, mi kerül oda. Kérésenként más értéket
  küldve minden próbálkozás **friss számlálót** kapna, és a 429 soha nem következne be: a korlát
  megkerülhető, a számláló tartóssága (K-52) értéktelen. Ez volt a hiba, amit ez az ADR javít.
- **Boolean `TRUST_PROXY` megtartása, csak a lánc végét olvasva** — a hamisítás ellen véd, de
  csak egyetlen proxyt tud kifejezni. Két hop esetén (pl. CDN + nginx) az utolsó elem már a belső
  proxy címe, tehát minden kérés ugyanarra a kulcsra esne — visszakapnánk azt a globális kizárást,
  ami miatt a fejléc olvasása egyáltalán kellett.
- **`server.forward-headers-strategy=FRAMEWORK`** — a Spring `ForwardedHeaderFilter`-e töltené a
  `getRemoteAddr()`-t, és a resolver egyetlen hívásra fogyna. **Nem alkalmas:** a
  `ForwardedHeaderUtils.parseForwardedFor` maga is `tokenizeToStringArray(forHeader, ",")[0]`-t
  vesz, tehát ugyanazt a bal szélső, hamisítható elemet adja — csak nem a mi kódunkban látszik.
  Ráadásul a beállítás nem függ a `TRUSTED_PROXY_HOPS`-tól, tehát a hamisíthatóságot **minden**
  telepítésre kiterjesztené, a proxy nélküliekre is.
- **`server.forward-headers-strategy=NATIVE`** (Tomcat `RemoteIpValve`) — ez valóban jobbról balra
  dolgozza fel a láncot, és a `internal-proxies` mintára nem illeszkedő peer esetén hozzá sem nyúl
  a fejléchez. Működő megoldás, de a Boot alapértelmezett `internal-proxies` regexe a **teljes**
  10/8, 192.168/16, 172.16/12 és 127/8 tartományt megbízhatónak tekinti, amit szűkíteni kellene;
  a biztonsági döntés így a konfigurációba csúszna, ahol nincs teszt-fogása. A hop-szám ezzel
  szemben egy explicit, unit-tesztelhető szabály a `ClientIpResolver`-ben.
- **Fiókhoz kötött korlát IP helyett** — a hamisítás kérdését megszüntetné, de a fiókzárolás azt
  is lehetővé tenné, hogy bárki kizárjon bárkit, akinek ismeri a felhasználónevét: a védekezésből
  támadási felület lenne. (Ez a `LoginAttemptService` eredeti döntése, nem itt dőlt el.)

## Consequences

- A `server.forward-headers-strategy` **szándékosan beállítatlan** (`NONE`). Ez nem hiányosság: a
  bekapcsolása visszahozná a bal szélső elem olvasását, ezért az `application.yml`-ben megjegyzés
  őrzi az okot. A `getRemoteAddr()` így mindig a nyers TCP-peer címe, amire a resolver
  visszaeséskor épít.
- Hibás konfiguráció a **szigorúbb** ágra esik, nem a bizalomra: érvénytelen, negatív vagy
  hiányzó `TRUSTED_PROXY_HOPS` = `0` (a fejlécet nem olvassuk), és a hop-számnál rövidebb lánc
  esetén is a socket címére esünk vissza. A vállalt korlát ennek az árnyoldala: rosszul beállított
  hop-szám mellett a proxy mögötti kliensek **közös** számlálóra kerülhetnek, tehát egymást
  zárhatják ki. A választás tudatos — az együtt-kizárás észrevehető és javítható üzemeltetési
  hiba, a megkerülhető korlát viszont csendes.
- A `TRUSTED_PROXY_HOPS` **túl nagy** értéke önmagában sebezhetőség: ha többet írsz be, mint
  ahány proxy valóban előtted van, az index a kliens által küldött részbe csúszik. A dokumentáció
  ezért mindenhol azt hangsúlyozza, hogy csak a tényleg üzemeltetett proxykat kell számolni.
- A korábbi `TRUST_PROXY` kulcs **megszűnt**. Aki `TRUST_PROXY=true`-val üzemel, annak
  `TRUSTED_PROXY_HOPS=1`-re kell váltania; a régi kulcs csendben figyelmen kívül marad, és a
  szerver a socket címére esik vissza (biztonságos, de proxy mögött közös számláló).
- A katalógus új elfogadási esettel bővült (**K-56**): kérésenként más hamisított
  `X-Forwarded-For` mellett a 11. bejelentkezés is 429. Az eset `⚙`, mert a K-51-gyel ugyanazt a
  rate limit vödröt fogyasztja, tehát HTTP-n nem futtatható vele egy körben — integrációs teszt
  fedi (`auth/AuthRateLimitSpoofTest.java`).
- A `ClientIpResolver` mostantól **unit-tesztelhető** a `ClientIpResolverTest`-ben: a lánc melyik
  elemét olvassuk, az explicit szabály, nem egy keretrendszeri beállítás mellékhatása.
- A resolver `getHeaders`-szel olvas, nem `getHeader`-rel, tehát a **több fejlécsoros** telepítés
  is helyesen viselkedik. Ennek ára, hogy a lánc hossza a sorok összegéből jön: aki egy
  új-sort-író proxyt (HAProxy `option forwardfor`) tesz egy bővítő proxy (nginx
  `$proxy_add_x_forwarded_for`) mellé, annak a `TRUSTED_PROXY_HOPS`-ban **mindkettőt** számolnia
  kell. Ez nem új kockázat — a hop-szám eddig is a valós topológiát írta le —, de a hibázás
  könnyebb, ezért a `.env.example` külön kiemeli.
