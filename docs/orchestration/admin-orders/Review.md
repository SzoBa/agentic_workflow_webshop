# DOD ELLENŐRZÉSI SABLON — admin rendeléskezelő

A `spec/admin-orders/requirements.md` 5. szakaszának 18 kész-kritériuma, és hogy a lánc futása
során **ki** ellenőrizte őket ténylegesen.

Kapcsolódó: [`Running.md`](./Running.md) (futási napló) · [`Orchestrator.md`](./Orchestrator.md)
(a felbontás terve) · [`Decision.md`](./Decision.md) (kontextus-átadási döntések).

## Ki kicsoda

| Jelölés | Ki | Mit jelent, ha be van jelölve |
|---|---|---|
| **Orchestrátor** | a fő session | **Saját méréssel** vagy saját fájlolvasással igazolta. Egy jelentés elolvasása **nem** ellenőrzés — ott ez a doboz üres marad. |
| **Subagent** | `spec-implementer` (B/F) + `spec-validator` | Az implementáló önellenőrzése **és** a validátor független visszamérése. Ahol csak az egyik történt meg, azt külön jelzem. |
| **Senki** | — | Egyetlen szereplő sem mérte; legfeljebb valószínűsítettük. |

**Az első `[x]` a DoD-pont teljesülését jelöli** (a validátor ítélete szerint), a mögötte lévő
három doboz azt, hogy ki mérte.

---

## Végpont

[x] **AR-01** — 200; `items`/`total`/`page`/`pageSize`/`totalPages`, `categories` nélkül — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B önellenőrzés (`AdminOrderListTest:71`) + validátor: kód visszaolvasva (`OrderPage.java:14`) és **élő `curl`** a 3001-en.*

[x] **AR-02** — a rendelés minden mezője; `reservedUntil` csak `pending`-nél — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B (`:98`) + validátor: `AdminOrderView.java:20-29` visszaolvasva, élő válaszban ellenőrizve.*

[x] **AR-03** — `username` jelen; törölt fióknál hiányzik — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B (`:139`, `:158`) + validátor. A `:139` **eltérő `customer.name`-mel** dolgozik, tehát bizonyítja, hogy nem a snapshotból jön — ezt a validátor külön kiemelte.*

[x] **AR-04** — minden felhasználó rendelése, legújabb elöl — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B (`:180`) + validátor: az olvasási úton nincs `userId`-szűrés (`AdminOrderQueryService.java:86`).*

## Szűrés és lapozás

[x] **AR-05** — `status=pending|expired|delivered` szűr — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B (`:201`, mindhárom értékre külön asszerció) + validátor.*

[x] **AR-06** — `all` / hiányzó / **ismeretlen** → teljes halmaz, nincs 400 — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B (`:236`) + validátor: `OrderStatus.from` `null`-ága visszaolvasva, és **élő `curl`** `?status=barmi`-val.*

[x] **AR-07** — alap 25; 500→100, 0→1 — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B (`:261`) + validátor élő `?pageSize=500` → `"pageSize":100`.*

[x] **AR-08** — `page` 1…`totalPages` közé vág; `totalPages` ≥ 1 — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      **⚠ Részleges fedés.** A **felső** vágást (`page=999`) és az üres halmazt a `:285` teszt méri. Az **alsó** vágást (`page < 1`) **egyetlen teszt sem futtatja** — sem itt, sem a katalógusban. A validátor élő `curl`-lel pótolta, de egy **másik** végponton (`GET /api/products?page=0&pageSize=1` → `page:1`), ugyanazon a `Catalog.paginate`-en. Lásd lent a „Gyenge pontok" 1. tételét.
      **→ Lezárva (2026-07-31 rögzítve, a javítás 2026-07-27-én készült):** `AdminOrderListTest.clampsPageAndKeepsAtLeastOnePageWhenEmpty` (`:301-307`) immár a mért végponton méri az alsó vágást. A `Catalog.window` kiemelése óta a `CatalogWindowTest.windowClampsPageBelowOneUpToTheFirstPage` egységszinten is fedi.

[x] **AR-09** — `search` névre/e-mailre/azonosítóra, kis-nagybetű-független; `total` a szűrt halmaz — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B (`:312`, négy asszerció) + validátor.*

## Jogosultság

[x] **AR-10** — token nélkül 401, `{ error }` — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B (`:350`, tényleges HTTP-kérés) + validátor **élő `curl`**-lel is: `401 {"error":"Bejelentkezés szükséges."}`.*

[x] **AR-11** — customer tokennel 403, `{ error }` — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B (`:359`) + validátor élő `curl`. Egyik sem az interceptor **létére** hivatkozott — ez volt a spec kifejezett elvárása.*

## Kliens

[x] **AR-12** — `/admin/orders` `RequireAdmin` alatt; menülink adminnak, másnak nem — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *F (`:403`, `:417`, `:430`) + validátor: `App.tsx:84-91`, `:37`, `:40` visszaolvasva.*

[x] **AR-13** — a lista betöltése és a hat oszlop megjelenítése — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *F + validátor. **Mockolt `api` modullal** — a kritérium maga ezt kéri bizonyítéknak. A validátor kiemelte, hogy a `:189` a **valódi** `ORDER_STATUS_LABELS`-re asszertál, nem beégetett szövegre.*

[x] **AR-14** — a `PATCH` hívása; sikernél sorfrissítés, hibánál a szerver üzenete szó szerint — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *F (`:303`, `:321`, `:345`) + validátor: `AdminOrders.tsx:221-223` visszaolvasva — nincs átfogalmazás, nincs előtag.*

[x] **AR-15** — minden sor a `ReservationStatus`-t rendereli; nincs saját státusz-elágazás — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *F (`:219`, `:226`, `:233`) + validátor: **célzottan keresett** `status ===`, `reservedUntil`, `Date.now`, `getTime` mintákat a fájlban — egyetlen találat sem. Ez erősebb bizonyíték, mint a teszt.*

## Regresszió

[x] **AR-16** — a lapozó általánosítása nem változtatta meg a termék-lapozást — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B + validátor: `git diff` (csak szignatúra változott) és a surefire XML-ek per-osztály olvasása. A validátor **ellenőrizte** a jelentett `tests="0"` csapdát is (47 `<testcase>` a `@Nested` XML-ekben), nem fogadta el készpénznek.*

[x] **AR-17** — nincs új Flyway-fájl; a hibakatalógus változatlan — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B + validátor: `ls db/migration` → egyetlen `V1__init.sql`; `git diff --stat -- spec/` **üres**.*

## Zöld build

[x] **AR-18** — `mvn test` + `npm run build` + `npm test` zöld — ellenőrizte: [ ] Orchestrátor  [x] Subagent  [ ] Senki
      *B a backend + kliens felét, F a kliens felét, a validátor **mind a hármat újra**: 561/0/0 · vite build ok · 261/261.*

---

## Mérleg

| | Darab |
|---|---|
| Teljesül (validátori ítélet) | **18 / 18** |
| Ellenőrizte **subagent** (implementáló önellenőrzés + validátori független visszamérés) | **18** |
| Ellenőrizte **orchestrátor** saját méréssel | **0** |
| **Senki** nem ellenőrizte | **0** |

---

## Ha van feltétel, amelyet senki nem ellenőrzött: miért marad ki?

**Nincs ilyen: mind a 18 pontot mérte valaki**, és mindegyiket kétszer — egyszer az azt megíró
implementáló, egyszer a validátor, függetlenül. Ez azonban nem ugyanaz, mint hogy a lista
hibátlanul le lenne fedve. Négy dolgot kell kimondani, mert a puszta „18/18" elfedné őket.

### 1. Az orchestrátor egyetlen DoD-pontot sem ellenőrzött saját méréssel

Ez **szándékos**, nem mulasztás: a `feature-implement` skill alapszabálya, hogy az orchestrátor
nem ír kódot és nem méri a feature-t — a mérés a validátor dolga, és ha az orchestrátor is
mérne, a saját elvárása horgonyként hatna a validátor jelentésének olvasásakor.

**A következmény viszont vállalt kockázat:** a teljes DoD-mérleg **egyetlen ügynök
becsületességén** nyugszik. Ha a validátor hamis `[teljesül]`-t adna, azt ebben a láncban
semmi nem fogná el — nincs második, független mérő. Ez a `spec-validator` definíciójának is a
központi félelme („a hamis `[teljesül]` a legrosszabb kimenet"), és ezért fut mindig `opus`-on.
Amit az orchestrátor **ténylegesen** ellenőrzött, az nem DoD-pont: az `api.ts` tényleges alakja
a `plan.md` szerződéséhez képest (kozmetikai eltérés), a fájltulajdon betartása, és a spec
`fájl:sor` hivatkozásainak létezése a spec megírásakor.

### 2. Az `AR-08` alsó vágását helyettesítő méréssel igazoltuk

A `page < 1` esetet **egyetlen teszt sem futtatja** — sem az `AdminOrderListTest`-ben, sem a
katalógus tesztjei között. A validátor élő `curl`-lel pótolta, de egy **másik végponton**
(`GET /api/products?page=0`), arra hivatkozva, hogy bizonyítottan ugyanaz a `Catalog.paginate`
fut mindkettő alatt. Ez érvényes érvelés, de nem ugyanaz, mint a mért végpont mérése.

**Miért maradt ki:** mert a kritérium saját „Bizonyíték" sora — amit én írtam — csak a
`page=999`-et és az üres `search`-öt nevezte meg. **Spec-írói hiba, nem implementálói.** Az
implementáló pontosan azt fedte le, amit kértem tőle. Javítás: egy `?page=0&pageSize=1` eset az
`AdminOrderListTest`-be, és az `AR-08` bizonyíték-sorának bővítése.

> **✅ Lezárva.** Mindkét javítás elkészült (2026-07-27), és a lezárás 2026-07-31-én került ide
> vissza. A mért végponton: `AdminOrderListTest.clampsPageAndKeepsAtLeastOnePageWhenEmpty`
> (`:301-307`). Egységszinten azóta a `CatalogWindowTest.windowClampsPageBelowOneUpToTheFirstPage`
> is fedi. **Ez a gyenge pont tehát már nem áll fenn** — a szöveg a futás állapotának
> dokumentálásáért marad meg.

### 3. A kliens és a szerver együttműködését end-to-end senki nem mérte

Az `AR-12`…`AR-15` **mockolt `api` modullal** van igazolva, az `AR-01`…`AR-11` pedig HTTP-n, de
kliens nélkül. A validátor futtatott élő `curl`-t a végponton, de **senki nem nyitotta meg a
`/admin/orders` oldalt egy futó backend ellen.**

**Miért marad ki:** mert **nincs rá kritérium.** Ez nem az ellenőrzés hiánya, hanem a
DoD-listáé — a 18 pont közt nincs egyetlen end-to-end feltétel sem. A kockázat konkrét és
nevesíthető: a mock azt adja vissza, amit a teszt író elképzelt a szerverről, nem azt, amit a
szerver valóban ad. Itt ezt két dolog tompítja — a típusok mindkét oldalon ugyanabból a
`plan.md` szerződésből származnak, és a szerver válaszalakját a validátor élőben látta —, de a
lánc ezt **nem bizonyította**.

### 4. A tesztek írója és a kód írója ugyanaz az ügynök volt

Az `AR-01`…`AR-11`-et igazoló `AdminOrderListTest`-et ugyanaz a B csomag írta, amelyik a
végpontot. Ez a szokásos fejlesztői helyzet, de érdemes kimondani: egy félreértett követelmény
így **egyszerre** kerül a kódba és a tesztbe, és a teszt zöld lesz.

**Amit ez ellen tettünk:** a validátor nem a tesztek zöldségét nézte, hanem azt, hogy a
megnevezett teszt **tényleg azt asszertálja-e**, amit a kritérium kér — és több ponton
(`AR-03`, `AR-13`, `AR-15`) épp ezt emelte ki. **Amit nem tettünk:** a validátor nem írt
független tesztet. A definíciója tiltja is (nem módosít fájlt), tehát ez a lánc szerkezeti
korlátja, nem egy elfelejtett lépés.
