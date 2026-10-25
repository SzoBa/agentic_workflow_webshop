# Admin rendeléskezelő — követelmények

Az admin megkapja azt a nézetet, amivel a rendeléseket látja és teljesíti. A rendszer általános
normája a [`spec/backend/requirements.md`](../backend/requirements.md); ez a dokumentum azt
**kiegészíti**, nem váltja fel.

## 0. Hogyan olvasd

### Jelölések

- **`ÚJ`** — a viselkedést ez a feature hozza. A dokumentumban **minden** szabály `ÚJ`, mert a
  végpont és a képernyő ma nem létezik.
- **`MEGLÉVŐ`** — a hivatkozott viselkedés már a rendszer része, és **változatlanul** kell
  maradnia. Ahol ilyen szerepel, az regressziós elvárás, nem megvalósítandó munka.

### Mi normatív

1. Ez a fájl — a viselkedés normája és a kész-kritériumok (5. szakasz).
2. [`plan.md`](./plan.md) — az **interfész szerződése**: útvonal, query paraméterek, válasz-alak,
   TypeScript-tükör, fájltulajdon. Ami ott rögzítve van, azt nem lehet menet közben átdönteni.
3. [`tasks.md`](./tasks.md) — a végrehajtási sorrend és a munkacsomag-gazdák.

Amit **ez a mappa nem ír felül**: a hibaválasz alakja (`{ "error": "..." }`), a szó szerinti magyar
hibaüzenetek ([`spec/backend/hibakatalogus.md`](../backend/hibakatalogus.md)), az admin névtér
jogosultsági szabálya és a rendelés-állapotgép. Ütközés esetén **a `spec/backend/` nyer**.

---

## 1. Probléma és cél

A rendelés kiszállítottá tétele (`PATCH /api/admin/orders/{id}/status`, `delivered`) az **egyetlen**
mód arra, hogy a `stock` ténylegesen csökkenjen, és hogy a vásárló egyáltalán értékelést írhasson
(„ellenőrzött vásárló" szabály). A rendszerben mégsincs semmi, amivel az admin **megtalálná** a
rendelést: nincs listázó végpont, nincs admin rendelés-képernyő, és a kliens API-rétegében egyetlen
admin-rendelés hívás sincs.

Ma az admin csak úgy tud teljesíteni, ha valahonnan — adatbázisból vagy a vevőtől — kézzel
megszerzi a rendelés azonosítóját. A funkció-lánc közepe hiányzik: a rendelés leadható és a
státusza váltható, de a kettő között nincs átjárás.

**Cél:** az admin egy képernyőn lássa az összes rendelést, státusz szerint szűrve, és onnan váltson
státuszt. A státuszváltás logikája **nem** változik — az megvan és tesztelt.

---

## 2. Viselkedés — végpont `ÚJ`

### 2.1 A lista tartalma

- A végpont a **teljes** rendeléshalmazt látja, felhasználótól függetlenül. (Szemben a
  `GET /api/orders`-szel, ami `MEGLÉVŐ` módon kizárólag a hívó saját rendeléseit adja.)
- Egy listaelem a rendelés **minden** mezőjét hordozza, ugyanabban az alakban, ahogy a
  `GET /api/orders` adja: `id`, `items`, `customer`, `total`, `createdAt`, `userId`, `status`.
- `MEGLÉVŐ` szabály, amit itt is tartani kell: a `reservedUntil` **kizárólag `pending`** státuszú
  rendelésnél van jelen. Lejárt és kiszállított rendelésnél nincs mit visszaszámolni.
- Ezen felül minden elem **`username`** mezőt kap: a `userId`-hoz tartozó fiók felhasználóneve.
  Ez az egyetlen új mező, és pusztán kényelmi: a rendelés `customer` blokkja a leadáskori
  **másolat**, ami eltérhet a fiók mai adataitól.
- Ha a fiókot időközben törölték, a `username` **hiányzik** a válaszból (nem `null`, nem üres
  szöveg). A rendelés önálló bizonylat — a fiók hiánya nem hiba (ADR-0001).

### 2.2 Rendezés

Legújabb elöl. A rendezőkulcs a beszúrási sorrend (`seq`), **csökkenő** irányban. Az admin a friss
rendeléseket keresi; a `GET /api/orders` növekvő sorrendje `MEGLÉVŐ` és **változatlan** marad.

### 2.3 Szűrés és lapozás

- **`status`** — `pending`, `expired` vagy `delivered` esetén csak az adott státuszú rendelések.
  Az `all`, a hiányzó és az **ismeretlen** érték egyaránt a teljes halmazt adja. Ismeretlen érték
  **nem hiba**: ez a `GET /api/admin/products` `status` paraméterének `MEGLÉVŐ` viselkedése, és
  a két admin lista nem viselkedhet másképp ugyanazon a néven.
- **`search`** — kis/nagybetűre érzéketlen részletegyezés a vevő **nevében**, **e-mailjében**
  vagy a rendelés **azonosítójában**. Trimmelve; üres érték = nincs szűrés. A minta karakterei
  **irodalmiak**: a `%` és a `_` keresett szöveg, nem joker. A kis/nagybetű-függetlenség ékezetes
  nagybetűkre is áll (`KOVÁCS` megtalálható `kovács` mintával).
- **`page` / `pageSize`** — a katalógusnál `MEGLÉVŐ` szabályok szerint: alap lapméret **25**
  (admin táblázat, nem kártyarács), 1…100 közé vágva; a `page` 1 és `totalPages` közé vágódik;
  a `totalPages` üres találathalmaznál is legalább `1`.
- A `total` a **szűrt** halmaz mérete, nem a teljes rendelésszám.
- **A szűrés és a lapozás a lekérdezésben dől el**, nem memóriában: egy kérés legfeljebb egy
  lapnyi rendelést tölt be. Ez a *viselkedésen* nem változtat — a fentiek maradéktalanul állnak —,
  de kizárja, hogy a rendelésszám növekedésével a végpont költsége korlátlanul nőjön
  ([ADR-0009](../../docs/adr/0009-admin-rendeleslista-sql-lapozas.md)).

### 2.4 Adatmodell

**Nincs adatmodell-változás, és nincs új Flyway-migráció.** Minden megjelenítendő adat megvan a
meglévő `orders`, `order_items` és `users` táblákban. A `username` futásidejű feloldás, nem tárolt
mező.

### 2.5 Jogosultság

A végpont az `/api/admin/**` névtérben van, ezért a `MEGLÉVŐ`, útvonalminta-alapú őr védi: token
nélkül **401**, customer tokennel **403**. Új hitelesítési kód nem kell — de a viselkedést
**mérni kell**, nem feltételezni.

### 2.6 Hibák

Új hibaüzenet **nincs**. A [`hibakatalogus.md`](../backend/hibakatalogus.md) változatlan marad.
A végpontnak nincs olyan bemenete, ami 400-at okozhatna: minden query paraméter hibás értéke az
alapértelmezésre esik vissza.

---

## 3. Viselkedés — kliens `ÚJ`

### 3.1 Elérés

- Új útvonal: **`/admin/orders`**, a `MEGLÉVŐ` `RequireAdmin` őr alatt.
- A fejléc admin menüjében megjelenik a **„Rendelések"** link, a „Termékek" és az „Ügyfelek"
  mellett. Nem-admin felhasználónak nem látszik. `MEGLÉVŐ` elv: a menü elrejtése kényelmi funkció,
  az érdemi védelem a szerveren van.

### 3.2 A képernyő

Táblázatos lista, soronként: **azonosító**, **leadás dátuma**, **vevő** (név + felhasználónév, ha
van), **tételek** (név × darabszám), **végösszeg**, **státusz**.

- A státuszcímkék a `MEGLÉVŐ` `ORDER_STATUS_LABELS` térképből jönnek — nincs új magyar szöveg
  ugyanarra a fogalomra.
- A foglalás állapota a `MEGLÉVŐ` `ReservationStatus` komponenssel jelenik meg, **minden**
  soron. A megjelenítést a komponens dönti el a rendelés státusza alapján: `pending`-nél
  visszaszámláló, `expired`-nél a lejárat magyarázata, egyébként semmi. Új
  visszaszámláló-logikát vagy státusz-elágazást írni **nem szabad** — a komponens `Order`
  típusú propot vár, amibe az `AdminOrder` beleillik. Ez a tilalom a **foglalás
  megjelenítésére** szól; a státuszváltó vezérlő elrejtése (3.3, `AR-20`) nem esik alá.
- Szűrő-vezérlők: státusz-választó és kereső mező. Lapozó a lista alatt, ha egynél több lap van.

### 3.3 Státuszváltás

- Soronkénti vezérlő váltja a státuszt a `MEGLÉVŐ` `PATCH /api/admin/orders/{id}/status`
  végponton keresztül. Sikeres váltás után az érintett sor frissül.
- Hiba esetén a **szerver magyar hibaüzenete** jelenik meg, változtatás nélkül. A kliens nem
  fogalmaz újra és nem tompítja: a 409-es szövegek (fedezethiány, végállapot) éppen azt mondják
  meg az adminnak, miért nem sikerült.
- A kliens **nem** dönti el, melyik átmenet érvényes — ez a szerver állapotgépe. Egyetlen,
  mérhetően körülírt kivétel van: a `delivered` **végállapot**, ezért azon a soron a vezérlő
  **nem jelenik meg** (`AR-20`). Minden más soron megjelenik, és a választ a szervertől veszi.

---

## 4. Nem cél

- Rendelés **szerkesztése** vagy törlése adminként. A rendelés bizonylat.
- **Új státusz** bevezetése (pl. `cancelled`) és a vásárlói lemondás — külön feature.
- Rendelés-**export** (CSV/PDF), forgalmi statisztika, árbevétel-riport.
- Értesítő e-mail a státuszváltásról.
- A `GET /api/orders` (saját rendelések) bármilyen változtatása.
- A [`konformancia.md`](../backend/konformancia.md) bővítése új `K-xx` esetekkel. Az a katalógus
  lezárt; ennek a feature-nek a mércéje az alábbi `AR-xx` lista.

---

## 5. Definition of Done

A feature akkor kész, ha az alábbiak **mindegyike** külön-külön igazolható. Minden pont **egy**
állítás, hogy pontonként ítélhető legyen. A „Bizonyíték" oszlop megnevezi, minek kell igazolnia —
ha az nincs meg, a pont **nem** teljesült, akkor sem, ha a kód látszólag helyes.

### Végpont

- [ ] **AR-01** — `GET /api/admin/orders` admin tokennel **200**-at ad, és a válasz `items`, `total`, `page`, `pageSize`, `totalPages` mezőket tartalmaz; `categories` mező **nincs** benne.
      *Bizonyíték:* `AdminOrderListTest` integrációs eset.
- [ ] **AR-02** — Egy listaelem hordozza a rendelés `id`, `items`, `customer`, `total`, `createdAt`, `userId`, `status` mezőit; `reservedUntil` **csak** `pending` státuszúnál van jelen.
      *Bizonyíték:* `AdminOrderListTest` — egy `pending` és egy `delivered` rendelés összevetése.
- [ ] **AR-03** — Minden listaelem `username` mezőt hordoz a `userId`-hoz tartozó fiók nevével; törölt fiók esetén a mező **hiányzik** a válaszból.
      *Bizonyíték:* `AdminOrderListTest` — rendelés leadása, majd a fiók törlése `DELETE /api/admin/users/{id}`-vel.
- [ ] **AR-04** — A lista minden felhasználó rendelését tartalmazza (nem csak a hívó adminét), **legújabb elöl**.
      *Bizonyíték:* `AdminOrderListTest` — két különböző vevő rendelése, sorrend-asszerció.

### Szűrés és lapozás

- [ ] **AR-05** — `status=pending`, `status=expired` és `status=delivered` kizárólag az adott státuszú rendeléseket adja vissza.
      *Bizonyíték:* `AdminOrderListTest`, mindhárom értékre külön asszerció.
- [ ] **AR-06** — `status=all`, a hiányzó `status` és egy **ismeretlen** érték (pl. `status=barmi`) egyaránt a teljes halmazt adja; egyik sem ad 400-at.
      *Bizonyíték:* `AdminOrderListTest` — három kérés, azonos `total`.
- [ ] **AR-07** — Az alap `pageSize` **25**; a 100 fölötti kért érték 100-ra, az 1 alatti 1-re vágódik.
      *Bizonyíték:* `AdminOrderListTest` — `pageSize` elhagyva, `pageSize=500`, `pageSize=0`.
- [ ] **AR-08** — A `page` 1 és `totalPages` közé vágódik **mindkét irányban**, és a `totalPages` üres találathalmaznál is legalább `1`.
      *Bizonyíték:* `AdminOrderListTest` — három eset: **felső** vágás (`page=999`), **alsó** vágás (`page=0&pageSize=1` → `page: 1`, miközben `totalPages > 1` — ez különbözteti meg az alsó vágást a felsőtől), és egy biztosan üres `search`.
- [ ] **AR-09** — A `search` kis/nagybetűre érzéketlenül illeszkedik a vevő nevére, e-mailjére és a rendelés azonosítójára; a `total` a **szűrt** halmaz mérete.
      *Bizonyíték:* `AdminOrderListTest` — mindhárom mezőre egy-egy találat, eltérő betűzéssel.
- [ ] **AR-21** — A szűrés és a lapozás a **lekérdezésben** dől el: egy kérés legfeljebb egy lapnyi rendelést tölt be, és a válasz szerződése változatlan. A `search` mintájában a `%` és a `_` **irodalmi** karakter (nem joker), a kis/nagybetű-függetlenség pedig ékezetes nagybetűkre is áll.
      *Bizonyíték:* `AdminOrderSearchAndPagingTest` — (a) `a_b` keresés nem talál rá az `axb`-re, (b) nagybetűs ékezetes név kisbetűs mintával megtalálható, (c) a lapok együtt hézag- és átfedésmentesen adják ki a szűrt halmazt, (d) a `total` megegyezik a lapokon visszaadott elemek számával. Továbbá az `AdminOrderListTest` **változatlan** asszertálásokkal zöld — ez a szerződés érintetlenségének bizonyítéka.

### Jogosultság

- [ ] **AR-10** — `GET /api/admin/orders` token nélkül **401**-et ad, `{ error }` törzzsel.
      *Bizonyíték:* `AdminOrderListTest` — ténylegesen lefuttatott kérés, nem az interceptor létére hivatkozás.
- [ ] **AR-11** — `GET /api/admin/orders` customer tokennel **403**-at ad, `{ error }` törzzsel.
      *Bizonyíték:* `AdminOrderListTest`.

### Kliens

- [ ] **AR-12** — Létezik `/admin/orders` útvonal `RequireAdmin` alatt, és a fejléc admin menüjében megjelenik a rá mutató link; nem-admin felhasználónak nem.
      *Bizonyíték:* `client/test/AdminOrders.test.tsx` és/vagy a meglévő `RequireAdmin.test.tsx` mintája.
- [ ] **AR-13** — Az oldal betöltéskor lekéri a listát, és soronként megjeleníti az azonosítót, a dátumot, a vevőt, a tételeket, a végösszeget és a magyar státuszcímkét az `ORDER_STATUS_LABELS`-ből.
      *Bizonyíték:* `client/test/AdminOrders.test.tsx` — mockolt `api` modul, megjelenített szövegek asszertálása.
- [ ] **AR-14** — A státuszváltó vezérlő meghívja a `PATCH` végpontot, sikernél frissíti a sort, hibánál a **szerver hibaüzenetét** jeleníti meg változtatás nélkül.
      *Bizonyíték:* `client/test/AdminOrders.test.tsx` — egy sikeres és egy 409-es (elutasított) ág.
- [ ] **AR-15** — Minden sor a meglévő `ReservationStatus` komponenst rendereli a rendeléssel; a **foglalás állapotának megjelenítésében** a képernyő **nem** ágazik el a státuszra és nem számol saját hátralévő időt.
      *Bizonyíték:* `client/test/AdminOrders.test.tsx` — egy `pending` sor visszaszámlálóval és egy `expired` sor a lejárat-magyarázattal.
      *Hatóköre:* a kritérium a **foglalás-megjelenítésre** vonatkozik, nem a képernyő egészére — az `AR-20` státuszfüggő vezérlő-elrejtése nem sérti. (Az eredeti, globálisan is olvasható megfogalmazás kétértelmű volt; lásd `Running.md:102-110`.)
- [ ] **AR-20** — A státuszváltó vezérlő (`Kiszállítottá tétel`) **nem** jelenik meg olyan soron, amelynek státusza `delivered`; `pending` és `expired` soron megjelenik.
      *Bizonyíték:* `client/test/AdminOrders.test.tsx` — három sor egy listában (`pending`, `expired`, `delivered`), soronkénti gomb-jelenlét asszertálása.
      *Miért kritérium:* `delivered` végállapot, tehát a gomb ott látszólag cselekvőképes, de semmit nem változtat (a szerver idempotens sikerrel válaszol). A `plan.md` 4.6 ezt egy megengedő mondattal kezelte („elrejtheti"), amiből két védhető olvasat következett — ez most mérhető állítás.

### Regresszió

- [ ] **AR-16** — A lapozó segédfüggvény általánosítása **nem** változtat a termék-lapozás viselkedésén: a katalógus tesztek (`CatalogConformanceTest`, `AdminProductTest`, `ProductFilterTest`) változatlanul zöldek.
      *Bizonyíték:* a `mvn test` tényleges kimenete.
- [ ] **AR-17** — Nincs új Flyway-migrációs fájl, és a [`hibakatalogus.md`](../backend/hibakatalogus.md) egyetlen üzenete sem változott, nem is bővült.
      *Bizonyíték:* a `db/migration` könyvtár tartalma és a `git diff` a `spec/backend/` alatt (üres).

### Zöld build

- [ ] **AR-18** — `cd server-java && mvn test` zöld, és `npm run build` + `npm test` a repó gyökeréből zöld.
      *Bizonyíték:* a parancsok **tényleges** kimenete.

### End-to-end

- [ ] **AR-19** — A képernyő **futó backend ellen** is működik: a lista betöltődik, a státusz-szűrő és a keresés a szerver válaszát tükrözi, és egy státuszváltás végigmegy.
      *Bizonyíték:* egy **dokumentált, kézi** füstteszt-forgatókönyv végigjátszása a `./start.sh` (Windowson `.\start.cmd`) által felhozott teljes stacken, a lépések és a látott eredmény rögzítésével.
      *Miért kézi:* a repóban nincs böngésző-alapú tesztfuttató, és új függőséget a projekt szabálya szerint nem veszünk fel kérdés nélkül. Az `AR-13`…`AR-15` **mockolt** `api` modullal mér, az `AR-01`…`AR-11` pedig kliens nélkül — a kettő találkozását egyik sem bizonyítja.

---

## 6. Változásnapló

Ez a spec egy lezárt lánc-futás után módosult. A nyom megőrzése kötelező: enélkül a javítás
visszamenőleg meghamisítaná a mérleget.

### 2026-07-27 — a lánc lefutása után

**A `spec-validator` ítélete (`18 teljesül / 0 nem teljesül / 0 kétséges`) a dokumentum
KORÁBBI, `AR-01`…`AR-18`-as szövegére vonatkozik**, nem az itt olvashatóra. A mérleg
részletei: [`docs/orchestration/admin-orders/Running.md`](../../docs/orchestration/admin-orders/Running.md)
és [`Review.md`](../../docs/orchestration/admin-orders/Review.md).

Két javítás, mindkettőt a `Review.md` **spec-írói hibaként** azonosította — nem az implementáló
tévedett, hanem a kritérium szövege volt hiányos:

| Mi változott | Miért |
|---|---|
| **`AR-08`** bizonyíték-sora bővült az **alsó** lapszám-vágással (`page=0&pageSize=1`) | Az eredeti szöveg csak a `page=999`-et és az üres `search`-öt nevezte meg, ezért az implementáló pontosan azt fedte le — helyesen. A `page < 1` ágat egyetlen teszt sem futtatta; a validátor élő `curl`-lel, **másik végponton** pótolta. |
| **Új `AR-19`** end-to-end kritérium | A 18 pont között egyetlen ilyen sem volt. A kliensoldali pontok mockolt `api` modullal, a backendoldaliak kliens nélkül igazolódtak — senki nem nyitotta meg a `/admin/orders`-t futó backend ellen. |

**Az `AR-08` azóta teljesül**, az `AR-19` még nem. A hozzájuk tartozó munka a
[`docs/backlog/admin-orders-followups.md`](../../docs/backlog/admin-orders-followups.md)
**A1** és **D1** tételében van.

| Mikor | Mérleg | Mi történt |
|---|---|---|
| a lánc futásakor | 18 / 18 (a **régi**, 18 pontos szövegre) | a `spec-validator` ítélete |
| a spec bővítése után | 17 teljesül / **2 teljesítetlen** | az `AR-08` kiegészült, az `AR-19` új |
| 2026-07-27 | **18 teljesül / 1 teljesítetlen** | az `AR-08` alsó vágásának tesztje elkészült (`AdminOrderListTest.clampsPageAndKeepsAtLeastOnePageWhenEmpty`, `page=0&pageSize=1` → `page: 1`, `totalPages: 3`); mérve: `mvn test` 561 teszt, 0 bukás |

### 2026-07-31 — külső review nyomán

Négy review érkezett a `feature/orchestrator` ágra. Kettő olyan pontot talált, amit ez a spec
**maga tett kétértelművé vagy premisszára alapozott** — mindkettő spec-írói hiba, nem implementálói.
A harmadik és negyedik naplóhibát jelzett; azok a `docs/orchestration/` alatt javultak.

| Mi változott | Miért |
|---|---|
| **`AR-15`** hatóköre a **foglalás-megjelenítésre** szűkült | Az eredeti szöveg („a képernyő **nem** ágazik el a státuszra") globálisan is olvasható volt, holott a `ReservationStatus` komponensre szólt. Az implementáló emiatt a mérhető olvasatot választotta, a validátor pedig ítélet nélkül hagyta — két védhető olvasat, ami pontosan azt a kétértelműséget okozta, amit a `Running.md:102-110` diagnosztizált. |
| **Új `AR-20`** — a státuszváltó vezérlő elrejtése `delivered` soron | A `plan.md` 4.6 megengedő mondata („elrejtheti") nem volt mérhető, ezért nem is lehetett rajta ítéletet mondani. Most állítás, nem lehetőség. |
| **Új `AR-21`** — a szűrés és a lapozás a lekérdezésben | A `plan.md` 4.5 kimondott premisszája („a rendelésszám nagyságrendje ezt megengedi") **nem áll**: a katalógus korlátos halmaz, a rendelés append-only. A premissza leírása önmagában érdem volt — de ellenőrizhető alakban kellett volna leírni. Indoklás: [ADR-0009](../../docs/adr/0009-admin-rendeleslista-sql-lapozas.md). |

| Mikor | Mérleg | Mi történt |
|---|---|---|
| **most** | **20 teljesül / 1 teljesítetlen** | az `AR-20` és az `AR-21` a fenti változtatásokkal együtt megvalósult és mérve van |

A hátralévő egyetlen pont az **`AR-19`** (end-to-end forgatókönyv).
