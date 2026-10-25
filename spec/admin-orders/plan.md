# Megvalósítási terv — admin rendeléskezelő

Ez a dokumentum két dolgot rögzít, és **mindkettő kötelező**:

1. az **interfész szerződését** — mindent, amiben a backend és a kliens munkacsomag ütközhetne,
2. a **felbontást** — melyik subagent melyik munkacsomagot kapja, és mihez nyúlhat.

A szerződés **előre** rögzül, mert a két implementálói futás kontextusa elkülönített: a
kliens-oldali munkacsomag nem látja a JPA-t és a Flyway-t, a backend nem látja a React-konvenciókat.
Ami itt le van írva, azt egyik oldal sem dönti át menet közben. Ha a szerződés hibásnak bizonyul,
azt **jelenteni** kell, nem javítani.

---

## 1. HTTP-szerződés

### `GET /api/admin/orders` — a teljes rendeléslista

Jogosultság: admin. A védelmet a `MEGLÉVŐ`, útvonalminta-alapú őr adja
(`config/WebConfig.java` + `security/AuthInterceptor`), tehát **nincs új hitelesítési kód**.
Az `AdminProductController` osztálydokumentációja pontosan ezt az elvet írja le
(`server-java/src/main/java/hu/webshop/catalog/AdminProductController.java:19-25`).

**Query paraméterek** — mind opcionális, mind `String`-ként kötődik:

| Név | Alap | Viselkedés |
|---|---|---|
| `page` | `1` | 1 és `totalPages` közé vágva |
| `pageSize` | `25` | 1…100 közé vágva |
| `status` | — | `pending` \| `expired` \| `delivered` \| `all`; **ismeretlen érték → `all`, nem 400** |
| `search` | — | kis/nagybetűre érzéketlen részlet a vevő nevében, e-mailjében vagy a rendelés azonosítójában; trimmelve |

A számparaméterek értelmezése a **meglévő** JS-`Number()` szemantikán megy át
(`catalog/Catalog.java:107-137`): az üres szöveg `0`, az `"abc"` `NaN` → marad az alapérték.
Ez a rendszer szerződésének része — **ne írj rá saját értelmezőt**.

**Válasz — 200**

```json
{
  "items": [ { "…OrderResponse minden mezője", "username": "vasarlo1" } ],
  "total": 42,
  "page": 1,
  "pageSize": 25,
  "totalPages": 2
}
```

- **`categories` mező NINCS.** A `ProductPage` record azért nem használható újra, mert van
  `categories` mezője, ami rendelésnél értelmetlen — a válaszba beszivárogva szerződéshiba lenne.
  Külön `OrderPage` record kell.
- Az elem alakja az `OrderResponse` (`order/OrderResponse.java`) **összes** mezője, azonos
  sorrendben, plusz a `username`.
- `reservedUntil` **kizárólag** `pending` státusznál — ez a szabály az `OrderMapper`-ben él
  (`order/OrderMapper.java:11-19`), és **ott is kell maradnia**. A lista a mapperen keresztül
  képez, nem külön ágon.
- `username`: a `userId`-hoz tartozó fiók neve. **Törölt fióknál a mező hiányzik** — nem `null`,
  nem üres szöveg. Ezt a globális Jackson `null`-elhagyás adja automatikusan
  (`order/OrderResponse.java:14-17`), nincs vele külön teendő.

**Rendezés:** `seq` **csökkenő** (legújabb elöl).

> A projekt kötelező konvenciója szerint „listázás mindig `ORDER BY seq`". Ez a terv **kifejezetten
> engedélyezi**, hogy a rendezés iránya itt fordított legyen: a kulcs továbbra is a `seq`, tehát a
> sorrend determinisztikus marad. Ez nem konvenciósértés, és nem kell jelenteni.

**Hibaüzenet: nincs új.** A [`hibakatalogus.md`](../backend/hibakatalogus.md) változatlan.
A végpontnak nincs olyan bemenete, ami 400-at okozna.

### `PATCH /api/admin/orders/{id}/status` — változatlan

`MEGLÉVŐ` végpont, teljes állapotgéppel és tesztkészlettel (`order/OrderTransitions.java`,
`order/AdminOrderStatusTest.java`). **Sem a viselkedése, sem a hibaüzenetei nem módosulnak.**
A kliens ezt hívja a státuszváltáshoz.

---

## 2. TypeScript-tükör

A Java válasz-DTO és a `client/src/api.ts` **külön** van definiálva (nincs közös csomag), ezért
együtt módosulnak. Az `api.ts` alábbi bővítése a **backend** munkacsomag felelőssége — így a
kliens-munkacsomag már kész, típusos felületre épít, és nem kell egyeztetnie.

```ts
export type AdminOrder = Order & { username?: string };

export type AdminOrderQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
};

export type AdminOrderPage = {
  items: AdminOrder[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function getAdminOrders(q?: AdminOrderQuery): Promise<AdminOrderPage>;
export function updateAdminOrderStatus(id: string, status: OrderStatus): Promise<Order>;
```

Két megjegyzés:

- **`updateAdminOrderStatus` is új.** A `PATCH` végponthoz ma egyetlen kliensoldali hívó sincs —
  az `api.ts` egyetlen `admin/orders` előfordulást sem tartalmaz.
- Az `Order`, `OrderStatus` és `ORDER_STATUS_LABELS` **meglévő** exportok
  (`client/src/api.ts:118-141`); ezeket használd, ne definiálj újat.
- A `client/tsconfig` **ES2020**-at céloz: `Array#at`, `Object.hasOwn` és társaik a buildet
  megbuktatják. Index-aritmetikát használj.

---

## 3. Fájltulajdon — ki mihez nyúlhat

Ez a táblázat teszi ütközésmentessé a két implementálói futást. Ami nincs a saját sorodban, ahhoz
**nem nyúlsz** — ha úgy tűnik, muszáj lenne, azt jelented.

| Munkacsomag | Kizárólagos tulajdon |
|---|---|
| **B — backend** | `server-java/src/main/java/hu/webshop/order/**` · `repo/OrderRepository.java` · `catalog/Catalog.java` (általánosítás) · `catalog/ProductQueryService.java` (csak a hívások igazítása) · `server-java/src/test/java/hu/webshop/order/**` · **`client/src/api.ts`** · `client/test/api.test.ts` |
| **F — kliens** | `client/src/pages/AdminOrders.tsx` (új) · `client/src/App.tsx` · `client/test/AdminOrders.test.tsx` (új) · `client/src/index.css` (ha stílus kell) |

Az `api.ts` szándékosan a **backend** csomagé: ott születik a DTO alakja. A kliens-csomag ezt
**olvassa**, de nem írja.

Amihez **egyik csomag sem nyúl**: `spec/**` (norma), `db/migration/**` (nincs sémaváltozás),
`package.json`, `pom.xml` (nincs új függőség), `client/src/api.ts` `Product`-alakja.

---

## 4. Megvalósítási döntések

Ezek **döntések**, nem javaslatok — az implementálónak nem kell újra végiggondolnia őket.

### 4.1 Nincs Flyway-migráció

Minden megjelenítendő adat megvan a `orders`, `order_items` és `users` táblákban. A `username`
futásidejű feloldás. **Ne írj migrációs fájlt.** (Ezt azért kell kimondani, mert az implementáló
kötelező konvenciója szerint „sémaváltozás = ÚJ migráció" — itt viszont nincs sémaváltozás.)

### 4.2 A lapozó segédfüggvény általánosítása

A `Catalog.paginate` ma `List<ProductEntity>`-re van kötve, és a `Catalog.Slice` record is
(`catalog/Catalog.java:107-118`). A rendelés-lapozáshoz **általánosítani kell** típusparaméterrel
(`paginate(List<T>, …)` → `Slice<T>`), hogy a query-paraméter-értelmezés **egy** helyen maradjon.

- A változás **viselkedés-megőrző**: csak a típus általánosodik, a számítás nem.
- Két hívási helye van, mindkettő a `ProductQueryService`-ben.
- Az `AR-16` regressziós pont pontosan ezt méri: a katalógus tesztek maradjanak zöldek.

Az alternatíva — a paginálás lemásolása a rendelés-csomagba — **el van utasítva**: a JS-`Number()`
szemantika a szerződés része, és két példányban előbb-utóbb szétcsúszik.

### 4.3 A `username` feloldása kötegelt

Egyetlen `UserRepository.findAllById(...)` hívás a megjelenített **lap** `userId`-jaira, `Map`-be
gyűjtve. **Rendelésenkénti lekérdezés (N+1) tilos.** A `UserRepository` a
`repo/UserRepository.java`-ban van; a `JpaRepository`-ból örökölt `findAllById` elég, nem kell új
lekérdezést írni.

### 4.4 A leképezés az `OrderMapper`-en megy át

Az admin nézet az `OrderMapper.toResponse` eredményét **bővíti** a `username`-mel, nem épít párhuzamos
leképezést. Indok: a „`reservedUntil` csak `pending`-nél" szabálynak egy helyen kell élnie — a
mapper osztálydokumentációja (`order/OrderMapper.java:11-19`) éppen ezt indokolja meg. Egy negyedik
hívó, ami kikerüli, előbb-utóbb lemarad a szabályról.

### 4.5 A szűrés helye

A státusz-szűrés, a `search` és a lapozás **egyaránt a lekérdezésben** dől el: egy kérés legfeljebb
egy lapnyi rendelést tölt be. A tételeket `@EntityGraph`-fal együtt kell tölteni — az
`open-in-view` ki van kapcsolva —, de a gyűjtemény-fetch és a lapozás **nem kerülhet egy
lekérdezésbe**: a Hibernate azt nem tudja SQL-ben lapozni, `HHH90003004`-gyel némán az egész
halmazt behúzza. Ezért kétlépcsős: előbb a lap azonosítói (fetch join nélkül, `limit`/`offset`-tel,
plusz egy `count`), utána a tételek betöltése csak ezekre az azonosítókra.

A lapozás **matematikája** ettől függetlenül közös marad a katalógussal (`Catalog.window`) — a
vágások szemantikája a HTTP-szerződés része, és két példányban biztosan szétcsúszna.

> **Ez a szakasz 2026-07-31-én megváltozott.** Eredetileg a `search` és a lapozás memóriában futott,
> „ahogy a katalógus is teszi", kimondott premisszával: „a rendelésszám nagyságrendje ezt
> megengedi". A premissza **nem áll** — a katalógus korlátos, admin által gondozott halmaz, a
> rendelés viszont append-only és felhasználók hajtják. Az indoklás és a következményei:
> [ADR-0009](../../docs/adr/0009-admin-rendeleslista-sql-lapozas.md).

### 4.6 A kliens nem másolja az állapotgépet

A `pending → {pending, expired, delivered}` / `expired → {expired, delivered}` /
`delivered → {delivered}` átmenettábla a szerveren él. Az átmenettábla lemásolása a kliensbe
**tiltott**: két helyen karbantartva biztosan szétcsúszik. Az **ítéletet minden esetben a
szervertől** vesszük, és a hibaüzenetét szó szerint mutatjuk.

Egyetlen, **mérhetően körülírt** kivétel van: a `delivered` **végállapot**, ezért azon a soron a
státuszváltó vezérlő nem jelenik meg (lásd `AR-20`). Ez nem az átmenettábla másolása — nem
*melyik* átmenet megengedett kérdését dönti el a kliens, hanem azt, hogy egy végállapotú soron
nincs mit felkínálni. Minden más soron a gomb megjelenik, és az ítélet a szerveré.

---

## 5. Felbontás — a subagentek munkamegosztása

Választott logika: **C — hibrid**. Szerep szerinti lánc, de az implementálói lépés **két
réteg-hatókörű futásra** bomlik, amiket a fenti szerződés köt össze.

```
spec-researcher  →  spec-implementer (B)  →  spec-implementer (F)  →  spec-validator
   felderítés          backend + api.ts         AdminOrders.tsx          átvétel
```

Négy delegálás, mind **szekvenciális**. A két implementálói futás azért nem párhuzamos, mert az
F csomag a B által megírt `api.ts`-re épül — de a **kontextusuk elkülönített**: egyik sem kapja
meg a másik réteg konvencióit.

| Lépés | Subagent | Mit kap | Mit ad vissza |
|---|---|---|---|
| 1 | `spec-researcher` | ez a spec-mappa | eligazítás `fájl:sor` hivatkozásokkal |
| 2 | `spec-implementer` | a kutató jelentése + a **B** munkacsomag | backend + `api.ts`, zöld `mvn test` |
| 3 | `spec-implementer` | a szerződés (2. szakasz) + az `api.ts` tényleges alakja + az **F** munkacsomag | `AdminOrders.tsx`, zöld `npm test` |
| 4 | `spec-validator` | a spec-mappa + mindkét jelentés **mutatóként** | `AR-01…AR-19` tételes ítélet |

A felbontás indoklása és a kontextus-átadási döntések:
[`docs/orchestration/admin-orders/`](../../docs/orchestration/admin-orders/). Azt a mappát
**egyik subagent sem kapja meg** — az az orchestrátor könyvelése.

---

## 6. Kockázatok

| Kockázat | Kezelés |
|---|---|
| A `Catalog.paginate` általánosítása megtöri a termék-lapozást. | `AR-16` külön regressziós pont; a katalógus tesztek zöldben tartása feltétel. |
| Az implementáló feleslegesen ír Flyway-migrációt („sémaváltozás" reflexből). | 4.1 explicit tiltás + `AR-17`. |
| Az ismeretlen `status` értékből 400 lesz (validációs reflex). | `AR-06` külön esetként méri. |
| A kliens lemásolja az állapotgépet vagy újrafogalmazza a hibaüzenetet. | 4.6 + `AR-14`. |
| Az `api.ts` mindkét munkacsomagban módosul → ütközés. | 3. szakasz: az `api.ts` **kizárólag** a B csomagé. |
| N+1 lekérdezés a `username` feloldásánál. | 4.3 explicit döntés. |
