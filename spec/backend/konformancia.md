# Konformancia-esetek

Nyelvfüggetlen elfogadási esetek. Bármely backend-implementáció ezekkel igazolja, hogy megfelel
a [`requirements.md`](./requirements.md)-nek — és ugyanezekkel hasonlítható össze két
implementáció viselkedése.

## Használat

- **Minden előfeltétel kizárólag publikus API-hívásokból épül fel.** Nincs szükség adatbázis-
  hozzáférésre vagy teszt-hátsóajtóra: az implementáció ugyanazt a felületet mutatja a tesztnek,
  mint a valódi kliensnek.
- Ahol ez nem lehetséges, az eset **`⚙`** jelet kap, és megnevezi a szükséges környezeti
  beavatkozást (konfiguráció, óraállítás, újraindítás, hibainjektálás). Ezek az esetek nem
  futtathatók pusztán HTTP-n keresztül.
- `MA IS` = a jelenlegi backendnek is teljesítenie kell · `ÚJ` = a javítási fázis után teljesül.
  Az A fázis lezárult, ezért **minden eset `MA IS`** — a jelölés már csak a katalógus
  olvasástörténetét őrzi.
- Az azonosítók számozásában szándékosan vannak hézagok (K-16…K-19, K-37…K-39, K-59), hogy
  új esetek beszúrhatók legyenek a meglévők átszámozása nélkül.
- Minden esethez tartozik **tiszta kiinduló állapot**: üres adattároló, amelyen a rendszer
  lefuttatta az induló állapot létrehozását (lásd `requirements.md` 8.).

## Bootstrap

Ezekre a lépésekre a legtöbb eset épül; rövidítve `B-1`…`B-4` néven hivatkozunk rájuk.

| # | Lépés |
|---|---|
| B-1 | `POST /api/auth/login` a seed adminnal (`adminisztrator` / `admin123`) → admin token |
| B-2 | `POST /api/auth/register` egyedi névvel → customer token |
| B-3 | `POST /api/admin/products` (B-1 tokenjével) → ismert `stock`-ú, aktív termék |
| B-4 | B-2 tokenjével rendelés a termékre → majd B-1 tokenjével `PATCH /api/admin/orders/:id/status` `delivered`-re |

---

## Katalógus

| # | Előfeltétel | Kérés | Elvárt | |
|---|---|---|---|---|
| K-01 | B-1, B-3, majd a termék `active: false` | `GET /api/products` | 200; a termék **nincs** az `items` között | `MA IS` |
| K-02 | mint K-01 | `GET /api/products/{id}` | 404, `{ error }` | `MA IS` |
| K-03 | mint K-01 | `GET /api/products/{id}/reviews` | 404 | `MA IS` |
| K-04 | — | `GET /api/products/nemletezik` | 404 — **azonos válasz**, mint K-02 | `MA IS` |
| K-05 | B-1, 13 aktív termék felvétele | `GET /api/products` | 200; `items.length = 12`, `pageSize = 12`, `totalPages = 2` | `MA IS` |
| K-06 | mint K-05 | `GET /api/products?pageSize=500` | 200; `pageSize = 100` | `MA IS` |
| K-07 | mint K-05 | `GET /api/products?page=99` | 200; `page = totalPages`, az `items` **nem üres** | `MA IS` |
| K-08 | B-1; termékek `Otthon` és `Iroda` kategóriában | `GET /api/products?category=%20Otthon%20` | 200; csak az `Otthon` kategóriájú termékek | `MA IS` |
| K-09 | B-1; 1000, 2000, 3000 Ft-os termékek | `GET /api/products?minPrice=2000&maxPrice=3000` | 200; a 2000 és a 3000 Ft-os is benne van (inkluzív) | `MA IS` |
| K-10 | B-1; `name: "Kulacs"`, `description: "…kulacsos…"` | `GET /api/products?search=KULACS` | 200; **mindkét** termék szerepel | `MA IS` |
| K-11 | B-1, B-3 (`stock: 1`), majd B-2-vel rendelés 1 db-ra | `GET /api/products?inStock=true` | 200; a termék **nincs** benne (`available = 0`) | `MA IS` |
| K-12 | B-1; `Otthon` kategóriában csak inaktív termék | `GET /api/products` | 200; az `Otthon` **nincs** a `categories` között | `MA IS` |
| K-13 | B-4; 3 értékelés (`5`, `4`, `4`), mind `approved` | `GET /api/products/{id}` | 200; `ratingAvg = 4.3`, `ratingCount = 3` | `MA IS` |
| K-14 | B-3 | `GET /api/products/{id}` | 200; `ratingAvg = 0`, `ratingCount = 0` | `MA IS` |
| K-15 | B-1, B-3 | `GET /api/admin/products` | 200; az `items` elemein **nincs** `ratingAvg` / `ratingCount` | `MA IS` |

---

## Rendelés és készlet

| # | Előfeltétel | Kérés | Elvárt | |
|---|---|---|---|---|
| K-20 | B-2, B-3 (`price: 1000`) | `POST /api/orders`, a tételben `unitPrice: 1` | 201; a rendelés `total`-ja a **szerver** ára szerint számolódik | `MA IS` |
| K-21 | B-2, B-3 | `POST /api/orders` `expectedTotal` **nélkül** | 400 | `MA IS` |
| K-22 | B-2, B-3 (`price: 1000`), 1 db | `POST /api/orders`, `expectedTotal: 1` | 409 | `MA IS` |
| K-23 | B-2, B-3 (`stock: 2`) | `POST /api/orders`, `quantity: 3` | 409; az üzenet tartalmazza a termék **nevét** és a **2** darabszámot | `MA IS` |
| K-24 | B-2; A termék `stock: 5`, B termék `stock: 0` | `POST /api/orders` mindkét tétellel | 409; **egyik** tétel sem jön létre, rendelés nem keletkezik | `MA IS` |
| K-25 | B-2, B-3 (`stock: 5`), rendelés 2 db-ra | `GET /api/admin/products` (B-1) | 200; a termék `stock`-ja **változatlanul 5** | `MA IS` |
| K-26 | mint K-25, majd `stock` 1-re állítása | `PATCH /api/admin/orders/{id}/status` → `delivered` | 409; a rendelés státusza **marad** `pending` | `MA IS` |
| K-27 | B-2, B-3 (`stock: 5`), rendelés 2 db-ra | `GET /api/products/{id}` | 200; `stock = 5`, `available = 3` | `MA IS` |
| K-28 | B-2, B-3, rendelés | `GET /api/orders` | 200; a `pending` rendelésen van `reservedUntil`; `delivered` rendelésen **nincs** | `MA IS` |
| K-29 ⚙ | mint K-28; a foglalási idő letelte (óraállítás vagy rövid `ORDER_RESERVATION_HOURS`) + az ütemező lefutása | `GET /api/orders` | 200; a rendelés státusza `expired` | `MA IS` |
| K-30 ⚙ | mint K-29 (`stock: 1`, a rendelés 1 db-ra szólt) | `POST /api/orders` másik felhasználóval, 1 db | 201 — a lejárt rendelés **nem foglal** | `MA IS` |
| K-31 ⚙ | mint K-29; a készlet fedezi a tételeket | `PATCH /api/admin/orders/{id}/status` → `delivered` | 200; a státusz `delivered`, a `stock` csökken | `MA IS` |
| K-32 | Két külön regisztrált felhasználó, mindkettő rendelt | `GET /api/orders` az egyikük tokenjével | 200; **kizárólag** a saját rendelése(i) | `MA IS` |
| K-33 | B-2, B-3 (`stock: 0`) | `POST /api/orders`, `quantity: 1`, `expectedTotal: 1` | 409; az üzenet a **készlethiányról** szól, nem az árról | `MA IS` |
| K-34 ⚙ | mint K-29 (lejárt rendelés) | `PATCH /api/admin/orders/{id}/status` → `pending` | 409; a státusz **marad** `expired` | `MA IS` |
| K-35 | B-2, B-3, rendelés, majd `delivered`-re állítás | `PATCH /api/admin/orders/{id}/status` → `pending` | 409; a státusz **marad** `delivered` | `MA IS` |
| K-36 | mint K-35 | `PATCH /api/admin/orders/{id}/status` → `delivered` (ismét) | 200; a `stock` **nem** csökken újra | `MA IS` |

---

## Felhasználók és hitelesítés

| # | Előfeltétel | Kérés | Elvárt | |
|---|---|---|---|---|
| K-40 | — | `POST /api/auth/register`, `username: "rovid"` | 400 | `MA IS` |
| K-41 | — | ugyanaz, 51 karakteres névvel | 400 | `MA IS` |
| K-42 | — | ugyanaz, `email: "nem-email"` | 400 | `MA IS` |
| K-43 | — | ugyanaz, `address: "   "` | 400 | `MA IS` |
| K-44 | — | ugyanaz, 7 karakteres jelszóval | 400 | `MA IS` |
| K-45 | B-1, B-2 | `PUT /api/admin/users/{id}`, `username: "rovid"` | 400 — **ugyanaz** a szabály, mint regisztrációnál | `MA IS` |
| K-46 | Regisztrált `Teszt.Elek` | `POST /api/auth/register`, `username: "teszt.elek"` | 400 | `MA IS` |
| K-47 ⚙ | Két **egyidejű** regisztrációs kérés azonos névvel | párhuzamos `POST /api/auth/register` | Pontosan **egy** 201, a másik 400; egyetlen fiók jön létre | `MA IS` |
| K-48 | Tiszta állapot (egyetlen admin) | `DELETE /api/admin/users/{seed admin id}` | 400; a fiók megmarad | `MA IS` |
| K-49 | ugyanaz | `PUT /api/admin/users/{seed admin id}`, `role: "customer"` | 400; a szerepkör marad `admin` | `MA IS` |
| K-50 | Regisztrált felhasználó | `POST /api/auth/login` ismeretlen névvel, illetve létező névvel + rossz jelszóval | Mindkettő 401, **azonos** törzzsel; a válaszidők nem térnek el érdemben | `MA IS` |
| K-51 | — | 10 sikertelen `POST /api/auth/login`, majd a 11. | A 11. válasza 429 | `MA IS` |
| K-52 ⚙ | mint K-51, majd a szerver újraindítása | `POST /api/auth/login` ugyanarról a kliensről | 429 — a korlát **túléli** az újraindítást | `MA IS` |
| K-53 ⚙ | B-2; a token élettartamának letelte (óraállítás vagy rövid `TOKEN_TTL_HOURS`) | `GET /api/auth/me` | 401 | `MA IS` |
| K-54 ⚙ | B-2; az élettartam felénél több eltelt, majd egy hitelesített kérés | várakozás, majd `GET /api/auth/me` | 200 — a munkamenet **meghosszabbodott** | `MA IS` |
| K-55 | B-1, B-2 | `GET /api/auth/me`, `GET /api/admin/users`, `POST /api/auth/register` | Egyik válasz sem tartalmaz jelszóhasht, sót vagy más felhasználó tokenjét | `MA IS` |
| K-56 ⚙ | Alapértelmezett konfiguráció (nincs megbízható proxy) | 10 sikertelen `POST /api/auth/login`, **kérésenként más** hamisított `X-Forwarded-For` fejléccel, majd a 11. | A 11. válasza 429 — a fejléc **nem** ad friss számlálót | `MA IS` |
| K-57 ⚙ | B-2; közvetlen olvasás az adattárolóból | Bejelentkezés, majd a felhasználó tárolt munkamenet-mezőjének megtekintése | A tárolt érték **nem** a kiadott token, hanem annak lenyomata; a kiadott token közben érvényes marad | `MA IS` |
| K-58 ⚙ | Nem üres kiszolgálási útvonalprefix (context path) beállítva | Az admin névtér végpontjai customer tokennel, illetve token nélkül | 403, illetve 401 — a védelem az útvonalprefixtől függetlenül érvényes | `MA IS` |

---

## Értékelés és moderáció

| # | Előfeltétel | Kérés | Elvárt | |
|---|---|---|---|---|
| K-60 | B-2, B-3; a felhasználónak **nincs** rendelése | `POST /api/reviews` | 403 | `MA IS` |
| K-61 | B-4 | `POST /api/reviews`, `rating: 5` | 201; `status: "pending"`, `author` a belépett felhasználó | `MA IS` |
| K-62 | mint K-61, egy értékelés már létezik | `POST /api/reviews` ugyanarra a termékre | 409 | `MA IS` |
| K-63 | mint K-62, de az értékelés `removed` státuszra állítva | `POST /api/reviews` ugyanarra a termékre | 409 — a moderáció nem kerülhető meg | `MA IS` |
| K-64 | mint K-61 | `GET /api/products/{id}/reviews` | 200; üres lista — a `pending` nem publikus | `MA IS` |
| K-65 | Három értékelés: `approved`, `rejected`, `removed` | `GET /api/products/{id}/reviews` | 200; **kizárólag** az `approved` szerepel | `MA IS` |
| K-66 | Két `approved` értékelés, eltérő időpontban | `GET /api/products/{id}/reviews` | 200; a **későbbi** áll elöl | `MA IS` |
| K-67 | mint K-65 | `GET /api/products/{id}/reviews` | 200; egyik elemen **sincs** `author` mező | `MA IS` |
| K-68 | Létező értékelés | `PATCH /api/admin/reviews/{id}`, `status: "pending"` | 400 | `MA IS` |
| K-69 | Létező értékelés | `PATCH /api/admin/reviews/{id}`, `status: "approved"` | 200; az `updatedAt` **megváltozott**, a `createdAt` nem | `MA IS` |

---

## Jogosultság és hibakezelés

| # | Előfeltétel | Kérés | Elvárt | |
|---|---|---|---|---|
| K-70 | — | Minden `/api/admin/*` végpont token nélkül | 401 — **mindegyik**, kivétel nélkül | `MA IS` |
| K-71 | B-2 | Ugyanezek customer tokennel | 403 — **mindegyik** | `MA IS` |
| K-72 ⚙ | Hibainjektálás egy kéréskezelési útvonalon | Az érintett végpont hívása | 500, `{ error }` semleges üzenettel; a szerver a következő kérést **kiszolgálja** | `MA IS` |

---

## Üzemeltetés

| # | Előfeltétel | Kérés | Elvárt | |
|---|---|---|---|---|
| K-73 ⚙ | Hiányzó e-mail konfiguráció (**bármelyik** kulcs hiánya külön ellenőrizve) | `POST /api/orders` | 201; a rendelés létrejön, **semmilyen** e-mail nem megy ki | `MA IS` |
| K-74 ⚙ | mint K-73 | ugyanaz | A naplóban figyelmeztető bejegyzés; hitelesítő adat nélkül | `MA IS` |
| K-75 ⚙ | Érvénytelen e-mail hitelesítő adatok | `POST /api/orders` | 201; a vevő válasza **változatlan**, a hiba a naplóba kerül a rendelésazonosítóval | `MA IS` |
| K-76 ⚙ | Üres `CORS_ORIGINS` | Tetszőleges kérés `Origin` fejléccel | A válaszban **nincs** `Access-Control-Allow-Origin` fejléc | `MA IS` |
| K-77 | Üres adattároló, indítás | `GET /api/products` | 200; `total = 8`, minden termék aktív | `MA IS` |
| K-78 | Üres adattároló, indítás | `POST /api/auth/login` a seed adminnal | 200; a felhasználó `role`-ja `admin` | `MA IS` |

---

## Lefedettségi térkép

| Terület | Esetek | Ebből az A fázis hozta |
|---|---|---|
| Katalógus | K-01…K-15 (15) | 1 |
| Rendelés és készlet | K-20…K-36 (17) | 13 |
| Felhasználók és hitelesítés | K-40…K-58 (19) | 4 |
| Értékelés és moderáció | K-60…K-69 (10) | 0 |
| Jogosultság és hibakezelés | K-70…K-72 (3) | 0 |
| Üzemeltetés | K-73…K-78 (6) | 1 |
| **Összesen** | **70** | **19** |

**Környezeti beavatkozást igénylő esetek (`⚙`):** K-29, K-30, K-31, K-34, K-47, K-52, K-53,
K-54, K-56, K-57, K-58, K-72, K-73, K-74, K-75, K-76 — összesen 16. Ezekhez az implementációnak
támogatnia kell a konfigurációs értékek tesztidejű felülírását (foglalási idő,
token-élettartam, CORS, e-mail, kiszolgálási útvonalprefix), az adattároló közvetlen olvasását,
és biztosítania kell egy módot az óra előreállítására vagy az ütemező kézi futtatására.

Ezek **HTTP-n nem futtathatók**, ezért a konformancia-futtató (`conformance/run.mjs`) csak
nyilvántartja őket. A Java-implementációban mind a 16 le van fedve integrációs teszttel — a
Testcontainers-környezet pont azt a beavatkozást engedi meg, amit a katalógus kér:

| Eset | Beavatkozás | Hol |
|---|---|---|
| K-29, K-30, K-31, K-34 | rövid foglalási idő + az ütemező kézi hívása | `order/OrderExpiryTest.java` |
| K-47 | két egyidejű regisztráció | `auth/AuthApiTest.java` |
| K-52 | **második alkalmazáspéldány** ugyanarra az adatbázisra | `auth/AuthRateLimitRestartTest.java` |
| K-53, K-54 | rövid token-élettartam | `auth/AuthSessionExpiryTest.java` |
| K-56 | hamisított proxy-fejléc a rate limit vödrére | `auth/AuthRateLimitSpoofTest.java` |
| K-57 | a tárolt munkamenet-mező közvetlen olvasása | `auth/SessionTokenStorageTest.java` |
| K-58 | nem üres `server.servlet.context-path` | `auth/AdminContextPathTest.java` |
| K-72 | hibainjektálás a lekérdező szolgáltatásba | `ops/ErrorContractTest.java` |
| K-73, K-74, K-76 | beállítatlan e-mail és CORS | `ops/OpsIntegrationTest.java` |
| K-75 | bukó értesítés injektálása | `order/OrderNotificationFailureTest.java` |

A Node-backendnél ezek **nincsenek lefedve**: a referenciaimplementáció nem kínál tesztidejű
óravezérlést. Ez tudatosan vállalt különbség — a katalógus nyelvfüggetlen marad, a lefedettséget
pedig az implementáció saját tesztjei egészítik ki.
