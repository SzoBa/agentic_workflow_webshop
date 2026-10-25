# Digital twin: a rendelési értesítő külső függősége  

## Gmail API `users.messages.send` viselkedési specifikáció  

### Kérés formátuma  

```
POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
Authorization: Bearer <access_token>
Content-Type: application/json

{ "raw": "<base64url>" }
```

A `raw` tartalma:  
        "To: " + to,
        "From: " + from,
        "Subject: " + encodedSubject,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=\"utf-8\"",
        "Content-Transfer-Encoding: base64",
        "",
        body:
                "Új rendelés érkezett a webshopból.",
                "",
                "Rendelésazonosító: " + order.getId(),
                "Dátum: " + formatDate(order.getCreatedAt()),
                "",
                "Rendelő:",
                "  Felhasználónév: " + user.getUsername(),
                "  Email: " + user.getEmail(),
                "  Szállítási cím: " + order.getCustomerAddress(),
                "",
                "Tételek:",
                itemLines(order.getItems()),
                "",
                "Végösszeg: " + formatPrice(order.getTotal());  

Sikeres válasz:

```json
{ "id": "18f2c…", "threadId": "18f2c…", "labelIds": ["SENT"] }
```

### Viselkedési minták

| Szituáció | Valószínűség | Válasz | Késés |
|-----------|-------------|--------|-------|
| Sikeres | 90% | `200`, `{ id, threadId, labelIds: ["SENT"] }` | 150–900 ms (p50 ≈ 300 ms, p99 ≈ 3 s) |
| Felhasználói sebességkorlát | 3% | `403`, `{"error":{"code":403,"errors":[{"reason":"userRateLimitExceeded"}]}}` | 100–400 ms |
| Napi kvóta kimerült | 1% | `429`, `{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}` | 100–400 ms |
| Hiányzó jogosultság (`gmail.send` scope) | 1% | `403`, `{"reason":"insufficientPermissions"}` | 100–300 ms |
| Lejárt access token (verseny) | 1% | `401`, `{"status":"UNAUTHENTICATED"}` | 100–300 ms |
| Hibás `raw` (kódolási hiba) | 1% | `400`, `{"reason":"invalidArgument"}` | 100–300 ms |
| Backend-hiba | 2% | `500`/`503`, `{"reason":"backendError"}` | 300 ms – 5 s |
| Beragadt kapcsolat (időkorlátig) | 1% | nincs válasz → `SocketTimeoutException` | **20 s** |

A sebességkorlát nem véletlenszerű, hanem terhelésfüggő: a Gmail API felhasználónkénti
korlátja 250 kvótaegység/másodperc, egy `messages.send` pedig 100 egység — vagyis kb.
2,5 küldés/másodperc tartósan. Az iker akkor hasznos, ha ezt szabályként modellezi, nem
kockadobásként: ha egy másodpercen belül a harmadik küldés érkezik, a válasz `403
userRateLimitExceeded`. Ez az a viselkedés, amit egy rendelési csúcs valóban kivált — és amit
véletlen valószínűséggel sosem sikerül reprodukálni.  

---

## Amit az alkalmazás ebből lát

Ez a szakasz azért kell, mert enélkül az iker hűsége félreméri a rendszert. A
`GmailOrderNotifier` **minden kivételt elnyel** (`catch (Exception)`), az `OrderController`
pedig még egyszer körbezárja. Következésképp a fenti **nyolc hibaágból hét ugyanazt az egyetlen
megfigyelhető kimenetet adja**: egy `ERROR` naplósor a rendelésazonosítóval. A vevő válasza
mindegyiknél változatlan `201`.

Ebből három állítás következik az ikerre nézve:

1. **A státuszkód-hűség másodlagos.** Az iker értéke nem abban van, hogy `403`-at vagy `429`-et
   ad-e — az alkalmazás nem különbözteti meg őket. Az értéke a **késésben** és a **ragadós
   hibaállapotban** van: az előbbi a vevő válaszidejét rontja, az utóbbi azt méri, hogy
   sorozatnyi rendelés értesítése marad-e el csendben.
2. **A hiányzó konfiguráció külön ág, nem hibaág.** Ha az öt kulcs bármelyike üres, a hívás
   **el sem indul** (`log.warn("Gmail nincs konfigurálva, e-mail kihagyva")`), és 0 ms a
   késés. Az ikernek ezt is fel kell tudnia venni — ez a valós fejlesztői alapállapot, mert a
   `.env` kulcsai üresen vannak a sablonban.
3. **A megfigyelhetőség a mérés tárgya.** Ha hét megkülönböztethetetlen hibaág egyetlen
   naplósort ír, akkor az üzemeltető nem tudja megmondani, kell-e új OAuth-folyamat, vagy
   csak várni kell. Az iker legfőbb hozadéka nem egy teszt zöldre állítása, hanem ennek a
   vakfoltnak a kimutatása.

## Beillesztési pont

Az iker helye az `OrderNotifier` interfész (`hu.webshop.ops.OrderNotifier`) — ide már ma is
mock kerül az `OrderNotificationFailureTest`-ben. Egy `TwinOrderNotifier implements
OrderNotifier` a fenti táblázatokat közvetlenül lejátssza, hálózat nélkül.

Amit **nem** lehet a termelési kód módosítása nélkül megtenni: HTTP-szinten leváltani a
Google-t. A `GmailOrderNotifier.gmail(...)` maga építi a transportot
(`GoogleNetHttpTransport.newTrustedTransport()`), és a `Gmail.Builder` gyökér-URL-je nincs
kivezetve — vagyis a valódi HTTP-réteg (a `raw` kódolása, a fejlécek, az újrapróbálkozás
hiánya) csak JVM-szintű proxybeállítással vagy egy új varrattal (injektálható
`HttpTransport` + `setRootUrl`) mérhető. Ez a választás következménye, nem hiba — de a
kettő közti különbséget érdemes tudatosan vállalni: az `OrderNotifier`-szintű iker a
**viselkedést** méri, a HTTP-szintű a **protokollt**.

## A valószínűségekről

A táblázatok „Valószínűség" oszlopa **tervezési feltevés, nem mérés** — ebben a projektben
nincs éles Gmail-forgalom, amiből eloszlást lehetne olvasni. A számok forrása: a Google
dokumentált kvótái (250 egység/mp/felhasználó, 100 egység/küldés), a dokumentált
hibakatalógus, és az a projektspecifikus tény, hogy a „Testing" állapotú OAuth-alkalmazás
refresh tokenje 7 naponta lejár. A késésértékek a Google HTTP kliens **alapértelmezett**
időkorlátjaihoz vannak horgonyozva (20 s kapcsolódás, 20 s olvasás), mert azt a kódbázis
nem írja felül. Ha valaha lesz éles forgalom, ezek az oszlopok cserélendők mért adatra.

---

## Gmail API `users.messages.send` Digital Twin — Ismert korlátok

Az iker megvalósítása: `test/mocks/msw/` (döntési mag + MSW adapter Node-hoz +
figyelő HTTP szerver a JVM-nek). Ez a szakasz azt rögzíti, **mit nem tud** — mert egy iker,
aminek a határai nincsenek leírva, pontosan ott téveszt meg, ahol a legdrágább.

- **A valószínűségek BECSÜLTEK, nem mért adaton alapulnak.** Egyetlen szám sem éles
  forgalomból származik; a forrásuk a Google dokumentált kvótája, a dokumentált hibakatalógus
  és a projekt OAuth-beállítása (lásd „A valószínűségekről"). Ez alól **egy** kivétel van: a
  sebességkorlát nem becslés, hanem a dokumentált kvótából levezetett *szabály* (250 egység/mp
  ÷ 100 egység/küldés → tartósan ~2,5 küldés/mp), ezért az iker azt kvótavödörrel modellezi,
  nem kockadobással. A 90/3/1/1/1/1/2/1 oszlop viszont **feltevés** — ha lesz éles forgalom,
  cserélendő. Az iker `DEFAULT_WEIGHTS` és `DEFAULT_LATENCY` blokkja pont ezért van egy helyen.

- **Amit a twin nem reprodukál — és miért nem:**
  - **A kézbesítést.** A `200` a valódi API-tól sem azt jelenti, hogy a levél megérkezett, hanem
    hogy a Gmail *átvette*. Visszapattanó (bounce) levél, késleltetett kézbesítés, spam-mappa,
    tiltólistás címzett — ezek mind a küldés UTÁN, aszinkron történnek, és ezen a végponton a
    valódi szolgáltatás sem jelzi őket. Az iker tehát nem azért nem modellezi, mert egyszerűsít,
    hanem mert **ezen a varraton nincs mit modellezni**. Aki kézbesítési garanciát akar mérni,
    rossz helyen méri (spec 7.4: az értesítő üzemeltetői kényelem, nem üzleti garancia).
  - **A termelési kód HTTP-rétegét.** A `GmailOrderNotifier.gmail(...)` maga építi a transportot
    (`GoogleNetHttpTransport.newTrustedTransport()`), és a `Gmail.Builder` gyökér-URL-je nincs
    kivezetve. Amíg nincs injektálható `HttpTransport` + `setRootUrl` varrat, a valódi `raw`
    kódolás, a fejlécek és az újrapróbálkozás hiánya **csak** JVM-szintű proxybeállítással
    mérhető. Az `OrderNotifier`-szintű iker a *viselkedést* méri, a HTTP-szintű a *protokollt*;
    a kettő közti rés tudatosan vállalt, nem hiba.
  - **A TLS- és hálózati hibaosztályt.** Tanúsítványhiba, DNS-hiba, kapcsolatvisszautasítás,
    fél-nyitott kapcsolat: az iker ezekből egyetlen alakot ismer, a beragadt kapcsolatot. Mivel
    a hívó **minden** kivételt elnyel, ezek úgyis egyetlen naplósorrá esnek össze — a
    megkülönböztetésük az ikerben nem hozna új megfigyelhető kimenetet.
  - **A megosztott, folyamatok közti kvótát.** Az iker vödre **példányonkénti és memóriabeli**.
    A valódi kvóta felhasználónként érvényes az ÖSSZES kliensre együtt, elosztott elszámolással.
    Két párhuzamos backend-példány az ikerben kétszer annyit küldhet, mint a valóságban.
  - **A napi levélszám-korlátot.** A Gmail a kvótaegységen felül fióktípustól függő napi
    *levélszám*-korlátot is érvényesít. Az iker ezt csak ragadós `quotaExhausted` ágként ismeri,
    valódi számlálóként nem — tehát „hány rendelés után áll le egy nap" kérdésre nem válasz.
  - **A méret- és tartalomkorlátokat.** A `raw` méretkorlátja, a MIME-mélység, a tiltott
    csatolmánytípusok: az iker csak *strukturálisan* ellenőriz (base64url, `To`/`From`/`Subject`,
    üres sor a törzs előtt). Ez szigorúbb is, lazább is a valódi parsernél.

- **Ami a twin viselkedésétől eltér a valódi szolgáltatáshoz képest:**
  - **A sebességkorlát élesebb.** Az ikerben a másodpercen belüli harmadik küldés *mindig* 403.
    A valódi elszámolás elosztott és közelítő: van burst-tűrés, néha átenged, néha `429`-cel
    válaszol `403` helyett. Az iker itt **szándékosan élesebb a valóságnál** — ez teszi
    reprodukálhatóvá azt, amit egy rendelési csúcs kivált.
  - **A ragadós állapotok abszolútak.** Az ikerben a `quotaExhausted` pontosan UTC éjfélig tart,
    a lejárt token pedig `reauthorize()`-ig. A valóságban a napi kvóta gördülő ablakban áll
    vissza, nem éjfélkor, és egy hitelesítési hiba lehet átmenetileg villódzó is.
  - **A hibatörzsek normalizáltak.** Az iker teljes Google-alakú hibaborítékot ad
    (`error.code/message/status/errors[].reason`), amelyben a fenti táblázat rövidített mezői
    szó szerint benne vannak — de a `message` szövegek **közelítések**, nem a Google szó szerinti
    üzenetei. Erre tesztben ne illessz mintát; a `reason` és a státuszkód a stabil felület.
  - **A késés korrelálatlan.** Az iker minden kérésre függetlenül húz. Éles rendszerben a
    válaszidők autokorreláltak: egy lassú periódus lassú marad. Az iker ezért **alulbecsli** a
    torlódásos együttállásokat, és nem tartalmaz TLS-kézfogást, kapcsolatfelépítést, hidegindulást
    vagy földrajzi szórást sem.
  - **A siker sora önellentmondó volt, és fel kellett oldani.** A „150–900 ms" tartomány és a
    „p99 ≈ 3 s" nem fér el egy eloszlásban. Az iker döntése: a tömeg (99%) a 150–900 sávban,
    p50 = 300 ms-ra hangolva, a felső 1% nyúlik 900 → 3000 ms-ig. Így **p99 ≈ 900 ms, p100 ≈ 3 s**
    — vagyis aki a táblázat „p99 ≈ 3 s" celláját olvassa, mást kap, mint amit az iker ad.
  - **Az üzenetazonosító alakja nem hiteles.** Az iker 16 hexa karaktert generál; a valódi Gmail
    azonosítók formátuma ettől eltér. Azonosítóra épülő állítást ne tegyél.

- **API verziókövetés: ha a szolgáltatás megváltozik, a twin manuálisan frissítendő.** Nincs
  szerződéstesztünk a valódi Google API ellen, és nincs is honnan lennie: éles hitelesítés nélkül
  nem lehet lefuttatni. Ezért a klón és a valóság elcsúszása **csendes** — semmi nem fogja
  jelezni. Amit ilyenkor frissíteni kell: a `twin-core.mjs` `SCENARIO` / `DEFAULT_WEIGHTS` /
  `DEFAULT_LATENCY` blokkja, a hibaborítékok alakja, és ez a szakasz. A klón verziófüggő
  horgonya a `server-java/pom.xml`-ben álló generált kliens: ha azt emeljük, ezt a dokumentumot
  is felül kell vizsgálni.

- **Utolsó frissítés: 2026-08-01** — referencia API verzió: **Gmail API v1**, generált Java
  kliens `google-api-services-gmail:v1-rev20240520-2.0.0` (discovery revízió: 2024-05-20),
  `google-api-client:2.7.0`, `google-auth-library-oauth2-http:1.24.1`.

# Reflexiós kérdés  

AI-al írattam meg, mert az olyan részletes infót, mint napi kvóta vagy sebességkorlát sokkal ésszerűbb volt így összeszedni, a valószínűségről nem is beszélve.  
