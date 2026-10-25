# Megvalósítási terv

> **Ez a terv MEGVALÓSULT — a dokumentum történeti.** Mindkét fázis lezárult: a backend
> Java/Spring Boot + PostgreSQL alapon fut, a Node-implementáció törölve
> ([ADR-0006](../../docs/adr/0006-atvaltas-a-java-backendre.md)). Azt őrzi, **miért így**
> épült fel a rendszer — a mai norma a [`requirements.md`](./requirements.md), a végállapot
> mérése pedig az ADR-0006-ban van.

Két fázis: **A)** az akkori Node/Express backend (és a hozzá tartozó kliens) felzárkóztatása a
[`requirements.md`](./requirements.md) célállapotára, majd **B)** a backend újraírása Java/Spring
Boot + Postgres alapon. A feladatlista: [`tasks.md`](./tasks.md).

A fázishatár azért éles, mert az A fázis végén a Node-backend teljesíti a teljes
konformancia-katalógust — ettől kezdve **referenciaimplementáció**, amelyhez a Java-változat
válaszról válaszra hasonlítható.

---

# A fázis — a jelenlegi backend felzárkóztatása

## A.1 Alapelvek

- **A konformancia-katalógus vezérel.** Minden munkaegység egy vagy több `K-xx` esethez tartozik;
  kész az, ami zölddé teszi őket. Az `ÚJ` jelölésű esetek ma pirosak — ez a fázis munkája.
- **Test-first ott, ahol a viselkedés változik.** A meglévő tesztek nagy része a jelenlegi
  viselkedést rögzíti, tehát a változtatás előtt őket kell átírni.
- **A jelölések átvezetése a munka része.** Amint egy javítás elkészül, a `requirements.md`
  vonatkozó `ÚJ` jelölése `MA IS`-re vált (lásd
  [ADR-0002](../../docs/adr/0002-ketretegu-backend-spec.md)).

## A.2 Érintett fájlok

**Új szerver-modulok**

| Fájl | Felelősség |
|---|---|
| `server/src/reservations.ts` | Foglalás-számítás, elérhető mennyiség, fedezetellenőrzés. Tiszta függvények: `db` és HTTP nélkül tesztelhető — a `reviews.ts` mintájára. |
| `server/src/expiry.ts` | A lejárt `pending` rendelések `expired`-re állítása; az ütemező indítása és leállítása. |
| `server/src/loginAttempts.ts` | A bejelentkezési próbálkozás-számlálók tárolt kezelése, takarítással. |
| `server/src/cors.ts` | A `CORS_ORIGINS` értelmezése; üres érték esetén nincs middleware. |

**Módosuló szerver-modulok**

| Fájl | Változás |
|---|---|
| `server/src/types.ts` | `OrderStatus` bővítése `expired`-del; `CustomerProduct` (`RatedProduct` + `available`); `Order` + számolt `reservedUntil`; `User` + token-lejárat; új `LoginAttempt` típus; `DbData` bővítése. |
| `server/src/orderStatus.ts` | `ORDER_STATUSES` bővítése — az érvényes értékek egyetlen forrása. |
| `server/src/routes/orders.ts` | Kötelező `expectedTotal` (400/409); fedezetellenőrzés (409); a foglalás-ellenőrzés és a rendelés létrehozása egy megszakítás nélküli blokkban; `reservedUntil` a válaszban. |
| `server/src/routes/products.ts` | `available` a vásárlói válaszokban; az `inStock` szűrő átállítása. |
| `server/src/catalog.ts` | Az `inStock` szűrő az elérhető mennyiségre vonatkozik. |
| `server/src/routes/admin/orders.ts` | `delivered`-re váltásnál készletellenőrzés + levonás (409); a bővített státuszhalmaz elfogadása. |
| `server/src/routes/auth.ts` | Token-lejárat kiszámítása bejelentkezéskor; a jelszóhash **előrehozása** az egyediség-ellenőrzés elé; a rate limiting átkötése a tárolt számlálókra. |
| `server/src/auth.ts` | Lejárat-ellenőrzés és csúszó megújítás a `requireAuth`-ban. |
| `server/src/normalize.ts` | Az ismeretlen rendelési státusz kezelése a bővített halmazzal; a `loginAttempts` gyűjtemény pótlása. |
| `server/src/index.ts` | A `cors()` lecserélése; az ütemező indítása és a leállításba kötése. |

**Kliens**

| Fájl | Változás |
|---|---|
| `client/src/api.ts` | Típusok tükrözése (`available`, `expired`, `reservedUntil`); központi 401-kezelés. |
| `client/src/auth.tsx` | A 401-re a munkamenet törlése és bejelentkezésre irányítás. |
| `client/src/pages/ProductList.tsx`, `ProductDetail.tsx` | `available` alapú készletjelzés, „Elfogyott" állapot, letiltott kosárgomb. |
| `client/src/pages/Cart.tsx`, `Checkout.tsx` | A 409-es válaszok megjelenítése (készlet és ár külön üzenettel). |
| `client/src/pages/Orders.tsx` | `expired` felirat, foglalási visszaszámláló, újrarendelés gomb. |
| `client/src/pages/AdminProducts.tsx` | A `stock` melletti foglalás/elérhetőség megjelenítése. |

> **Típusszinkron.** A `server/src/types.ts` és a `client/src/api.ts` külön definiálja ugyanazokat
> az alakokat (nincs közös csomag) — minden shape-változást **egyszerre** kell átvezetni.

## A.3 Sorrend és indoklás

1. **Típusok és a foglalás-számítás** — tiszta függvényként, HTTP nélkül. Ez a fázis
   legkockázatosabb logikája; egységtesztekkel kezdődik.
2. **Rendelési út** (fedezet + `expectedTotal`) — a legtöbb `ÚJ` eset itt zöldül.
3. **Teljesítés** (`delivered` levonás + 409).
4. **Lejárat** (státusz, ütemező) — csak ezután, mert az előző lépések szabályaira épül.
5. **Hitelesítés** (token-lejárat, tárolt rate limit, regisztrációs atomicitás) — független sáv,
   bármikor párhuzamosítható.
6. **CORS** — önálló, néhány soros.
7. **Kliens** — a szerver kész szerződésére.

## A.4 Kockázatok

| Kockázat | Kezelés |
|---|---|
| A meglévő tesztek fixture-jei kis készlettel dolgoznak (`stock: 1`), így a mind-vagy-semmi szabály váratlanul buktatja őket. | A készletet érintő 13 tesztfájl átnézése **az** első lépésben, nem a végén. |
| A csúszó token-lejárat minden hitelesített kérésnél íráshoz vezethet. | Megújítás csak akkor, ha a hátralévő idő az élettartam felénél kevesebb. |
| A lejárati ütemező tesztekben nemdeterminisztikus. | Az ütemező függvénye külön exportálva, kézzel hívhatóan; a tesztek nem az időzítőre várnak. |
| A `db.write()` a teljes fájlt újraírja; az új írási utak (rate limit) növelik a terhelést. | Csak **sikertelen** bejelentkezés ír, ami ritka esemény. |

---

# B fázis — Java/Spring Boot + Postgres

Döntési háttér: [ADR-0004](../../docs/adr/0004-java-spring-postgres-migracio.md).

## B.1 Cél-stack

| Elem | Választás |
|---|---|
| Nyelv / futtatókörnyezet | **Java 25** |
| Keretrendszer | **Spring Boot** (Spring Web MVC) |
| Építés | **Maven** |
| Tárolás | **PostgreSQL**, Dockerrel |
| Séma kezelése | Verziózott migrációk (a séma sosem az alkalmazásból jön létre) |
| Tesztelés | JUnit 5 + **Testcontainers** (valódi Postgres a tesztekben) |
| Naplózás | Strukturált JSON a szabványos kimenetre |

## B.2 Fogalmi leképezés

| Jelenlegi (Node/Express) | Cél (Java/Spring) |
|---|---|
| `requireAuth` / `requireAdmin` middleware | Interceptor vagy szűrő; a belépett felhasználó argumentum-feloldóval |
| Admin névtér router szintű őrrel | Egyetlen ponton bekötött útvonalminta-alapú védelem — **nem** végpontonkénti annotáció |
| `wrap()` async-burkoló | **Szükségtelen**: a keretrendszer kivételkezelője elkapja |
| Központi hibakezelő | Globális kivételkezelő; a szerződéses 500-as válasz megőrzésével |
| `lowdb` + `db.data` tömbök | Repository-k + entitások |
| `normalizeDb` séma-pótlás | **Elhagyandó** — relációs sémán ezek az esetek nem állhatnak elő |
| Seed katalógus + seed admin | Indításkori bootstrap, tranzakcióban, idempotensen |
| `scrypt` jelszóhash | Erős jelszóhash-elés a platform szabványos eszközével |
| In-memory rate limit | Adatbázis-tábla (az A fázisban már így viselkedik) |
| `setInterval` lejáratkezelő | Ütemezett metódus |
| Gmail API kliens | A szolgáltató hivatalos Java kliense, azonos viselkedéssel |

## B.3 Adatbázis-séma vázlat

Táblák: `products`, `orders`, `order_items`, `users`, `reviews`, `login_attempts`.

Megkötések, amelyek **kötelezők**, mert invariánst hordoznak:

- `users.username` és `users.email` — **egyedi index**, kis/nagybetűtől független (I-1, I-2).
- `reviews (product_id, author)` — **egyedi index** (I-4).
- `products.price > 0`, `products.stock >= 0` — ellenőrző megszorítás.
- `order_items.quantity >= 1`.
- Az „legalább egy admin" (I-3) **nem** fejezhető ki megszorítással: tranzakcióban, a sor
  zárolásával kell érvényesíteni.

Amire külön figyelni kell:

- **Sorrend.** A jelenlegi listák beszúrási sorrendben jönnek vissza; ezt relációs tárolásnál
  csak explicit rendezés garantálja. Minden listázó lekérdezés kapjon determinisztikus rendezést.
- **Azonosítók.** Szöveges azonosítók maradnak (a seed termékek `p1`…`p8` értéke része a
  szerződésnek); nem cserélhetők automatikus egész kulcsra.
- **Snapshot mezők.** Az `order_items.name` és `unit_price` **nem** idegen kulcson keresztül
  vezetett adat, hanem másolat — ne „normalizálja ki" senki
  ([ADR-0001](../../docs/adr/0001-rendelesi-tetel-snapshot.md)).
- **Foglalás.** Számolt érték; összesítő lekérdezés a `pending` rendelésekre. A fedezetellenőrzés
  és a rendelés beszúrása **egy tranzakcióban**, a termék sorának zárolásával (I-5).

## B.4 Átállási stratégia

**Big-bang, párhuzamos verifikációval.** A Node-backend a teljes B fázis alatt fut és
referenciaként szolgál.

1. A Java-implementáció épül, mérföldkövenként.
2. A konformancia-katalógus **mindkét** backend ellen fut ugyanazzal a végrehajtóval, csak a
   cél-URL különbözik.
3. Eltérés esetén a Node válasza a mérvadó — kivéve, ha a `requirements.md` az adott ponton
   mást ír elő.
4. Átváltás akkor, amikor **minden** eset zöld mindkét oldalon.
5. A `server/` mappa csak ezután távolítható el.

**Adatátvétel.** Meglévő `db.json` importálásakor a `requirements.md` 8. fejezetének `FORRÁS`
szabályai érvényesek: hiányzó gyűjtemények, hiányzó `active`/`role`, ismeretlen rendelési státusz
kezelése — egyszeri importáló feladat, nem az alkalmazás futásidejű viselkedése.

## B.5 Amit a migráció nem változtathat meg

- A HTTP-útvonalak, státuszkódok, mezőnevek — a meglévő kliens változatlanul működik.
- A `/api/health` válasza.
- A seed katalógus és a seed admin belépési adatai (a konformancia-bootstrap ezekre épül).
- Az üzemeltetési viselkedés: rate limiting, szabályos leállás, naplózási elvek, az értesítő
  kecses kihagyása hiányos konfiguráció esetén.
