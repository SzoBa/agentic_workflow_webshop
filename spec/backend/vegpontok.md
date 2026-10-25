# Végpont-referencia

A webshop backend **22 végpontja**. A jelölések a [`requirements.md`](./requirements.md) szerint:
`MA IS` = a futó rendszer így működik, `ÚJ` = egy változtatási kör hozza. Jelenleg **minden itt
leírt viselkedés `MA IS`**.

Közös szabályok minden végpontra:

- A kérés- és választest **JSON**. A mezőnevek és típusok kötelezőek.
- Hibaválasz alakja **mindig** `{ "error": "<magyar szöveg>" }` — a szövegek a
  [`hibakatalogus.md`](./hibakatalogus.md)-ben.
- Kezeletlen hiba → **500** `{ "error": "Váratlan szerverhiba." }`.
- Az `/api/admin/*` névtér **minden** végpontja hitelesítést és admin szerepkört igényel:
  token nélkül **401**, customer tokennel **403**. Ez a táblázatokban nincs ismételve.
- Hitelesített végpontnál a fejléc: `Authorization: Bearer <token>`.

**Áttekintés**

| # | Metódus | Útvonal | Jogosultság |
|---|---|---|---|
| 1 | GET | `/api/health` | nyilvános |
| 2 | GET | `/api/products` | nyilvános |
| 3 | GET | `/api/products/:id` | nyilvános |
| 4 | GET | `/api/products/:id/reviews` | nyilvános |
| 5 | POST | `/api/auth/register` | nyilvános |
| 6 | POST | `/api/auth/login` | nyilvános |
| 7 | POST | `/api/auth/logout` | belépett |
| 8 | GET | `/api/auth/me` | belépett |
| 9 | GET | `/api/orders` | belépett |
| 10 | POST | `/api/orders` | belépett |
| 11 | POST | `/api/reviews` | belépett |
| 12 | GET | `/api/admin/products` | admin |
| 13 | POST | `/api/admin/products` | admin |
| 14 | PUT | `/api/admin/products/:id` | admin |
| 15 | PATCH | `/api/admin/products/:id/active` | admin |
| 16 | DELETE | `/api/admin/products/:id` | admin |
| 17 | GET | `/api/admin/users` | admin |
| 18 | PUT | `/api/admin/users/:id` | admin |
| 19 | DELETE | `/api/admin/users/:id` | admin |
| 20 | PATCH | `/api/admin/orders/:id/status` | admin |
| 21 | GET | `/api/admin/reviews` | admin |
| 22 | PATCH | `/api/admin/reviews/:id` | admin |

---

## Rendszer

### 1. `GET /api/health`

Egészség-ellenőrzés. Nincs paraméter.

| Státusz | Törzs |
|---|---|
| 200 | `{ "status": "ok" }` |

---

## Termékek (vásárlói nézet)

Mind a három végpont **kizárólag aktív** termékeken dolgozik.

### 2. `GET /api/products`

Lapozott, szűrhető terméklista.

**Query paraméterek** (mind opcionális)

| Név | Típus | Alap | Megjegyzés |
|---|---|---|---|
| `page` | egész | 1 | 1 és `totalPages` közé vágódik |
| `pageSize` | egész | 12 | 1…100 közé vágódik |
| `category` | szöveg | — | Pontos egyezés, trimmelve |
| `minPrice` / `maxPrice` | szám | — | Inkluzív; nem szám esetén kimarad |
| `search` | szöveg | — | Kis/nagybetűre érzéketlen, névben vagy leírásban |
| `inStock` | `"true"` | — | `MA IS` `available > 0` — az **elérhető**, nem a fizikai készletre szűr |

**Válasz — 200**

```json
{
  "items": [ { "...Termék", "ratingAvg": 4.3, "ratingCount": 7, "available": 12 } ],
  "total": 42, "page": 1, "pageSize": 12, "totalPages": 4,
  "categories": ["Ruházat", "Kiegészítők"]
}
```

- `items[]`: a termék minden mezője + `ratingAvg`, `ratingCount` (`MA IS`), `available` (`MA IS`).
- `categories`: a **szűretlen aktív** halmaz kategóriái.
- `totalPages` üres találathalmaznál is legalább `1`.

### 3. `GET /api/products/:id`

Egyetlen termék.

| Státusz | Törzs |
|---|---|
| 200 | Termék + `ratingAvg`, `ratingCount` (`MA IS`), `available` (`MA IS`) |
| 404 | Nem létező **vagy inaktív** termék — a kettő megkülönböztethetetlen |

### 4. `GET /api/products/:id/reviews`

A termék publikus értékelései. Bejelentkezés nem kell.

| Státusz | Törzs |
|---|---|
| 200 | Értékelések tömbje **`author` mező nélkül** |
| 404 | Nem létező vagy inaktív termék |

- Kizárólag `approved` státuszú értékelések.
- Rendezés: `createdAt` **csökkenő** (legújabb elöl); azonos időbélyegnél `id` növekvő.
- Nincs lapozás: a teljes lista.

---

## Hitelesítés

### 5. `POST /api/auth/register`

**Kérés:** `{ username, email, address, password }`

| Státusz | Törzs |
|---|---|
| 201 | `{ "user": { id, username, email, address, role }, "token": "..." }` |
| 400 | Validációs hiba vagy foglalt felhasználónév / e-mail |

- `username` 8–50 karakter, `email` érvényes formátum, `address` nem üres, `password` legalább
  8 karakter.
- Az egyediség kis/nagybetűtől független.
- Az új fiók szerepköre **mindig** `customer`.
- `MA IS` Az egyediség-ellenőrzés és a létrehozás atomi (I-1, I-2).

### 6. `POST /api/auth/login`

**Kérés:** `{ username, password }`

| Státusz | Törzs |
|---|---|
| 200 | `{ "user": { ... }, "token": "..." }` |
| 401 | Hibás felhasználónév **vagy** jelszó — egységes üzenet |
| 429 | Túl sok sikertelen próbálkozás (IP-nként 10 / 15 perc) |

- A felhasználónév kis/nagybetűtől függetlenül illeszkedik.
- Ismeretlen névnél is lefut egy álhash-ellenőrzés (időzítés-alapú felderítés ellen).
- Sikeres belépés **új tokent** ad, és érvényteleníti a korábbit (I-6).
- Sikeres belépés nullázza a próbálkozás-számlálót.

### 7. `POST /api/auth/logout`

Nincs kéréstörzs.

| Státusz | Törzs |
|---|---|
| 200 | `{ "ok": true }` |
| 401 | Hiányzó vagy érvénytelen token |

### 8. `GET /api/auth/me`

| Státusz | Törzs |
|---|---|
| 200 | `{ id, username, email, address, role }` |
| 401 | Hiányzó, érvénytelen vagy `MA IS` lejárt token |

---

## Rendelések

### 9. `GET /api/orders`

A **saját** rendelések listája.

| Státusz | Törzs |
|---|---|
| 200 | Rendelések tömbje; `pending` státuszúaknál `MA IS` `reservedUntil` mezővel |
| 401 | Hiányzó vagy érvénytelen token |

### 10. `POST /api/orders`

**Kérés**

```json
{
  "items": [ { "productId": "p1", "quantity": 2, "name": "opcionális" } ],
  "customer": { "name": "...", "email": "...", "address": "..." },
  "expectedTotal": 12470
}
```

| Státusz | Mikor |
|---|---|
| 201 | Sikeres rendelés — a teljes rendelés a válaszban |
| 400 | Üres/hibás tétellista; hiányzó vevői adat; ismeretlen vagy inaktív termék; hibás mennyiség; `MA IS` hiányzó vagy nem szám `expectedTotal` |
| 401 | Hiányzó vagy érvénytelen token |
| 409 | `MA IS` Elégtelen elérhető készlet; `MA IS` az `expectedTotal` eltér a szerver által számolt összegtől |

- A `quantity` egészre csonkítva legalább 1.
- A `total`-t **mindig a szerver** számolja a saját áraiból.
- A tételek megőrzik a leadáskori `name` és `unitPrice` értéket (snapshot).
- Az ismeretlen termékről szóló hibaüzenet a termék **nevét** nevezi meg, nem az azonosítót.
- `MA IS` A készletellenőrzés **mind-vagy-semmi**; a 409-es üzenet megnevezi a terméket és az
  elérhető darabszámot.
- `MA IS` Az ellenőrzés és a létrehozás atomi (I-5).
- Az új rendelés státusza `pending`; a `stock` mező **nem** változik.
- A rendelési értesítő hibája **nem** befolyásolja a választ.

---

## Értékelések

### 11. `POST /api/reviews`

**Kérés:** `{ productId, rating, body? }`

| Státusz | Mikor |
|---|---|
| 201 | Létrejött értékelés (teljes rekord, `author` mezővel, `status: "pending"`) |
| 400 | `rating` nem 1–5 közötti egész; `body` nem szöveg vagy 500 karakternél hosszabb |
| 401 | Hiányzó vagy érvénytelen token |
| 403 | Nincs a felhasználónak `delivered` rendelése a termékre |
| 404 | Nem létező vagy inaktív termék |
| 409 | A felhasználó ezt a terméket már értékelte |

- Az `author` **mindig** a tokenből származik; a kérésben küldött érték figyelmen kívül marad.
- Az üres vagy csak whitespace `body` esetén a mező a válaszban **nem szerepel**.
- A 409 akkor is érvényes, ha a korábbi értékelés `rejected` vagy `removed` státuszú (I-4).

---

## Admin — termékek

### 12. `GET /api/admin/products`

A **teljes** katalógus, az inaktív termékekkel együtt.

**Query:** `page`, `pageSize` (alap **25**, max 100), `category`, `minPrice`, `maxPrice`,
`search`, valamint `status` = `active` \| `inactive` \| `all` (ismeretlen érték → `all`).

**Válasz — 200:** `{ items, total, page, pageSize, totalPages, categories }`.

Az `items` elemei a termék mezőin túl **két számolt mezőt** hordoznak:

| Mező | Jelentés |
|---|---|
| `reserved` | A `pending` rendelések által lefoglalt darabszám. |
| `available` | `stock` − `reserved`, sosem negatív. |

Enélkül az admin nem tudná megmagyarázni, miért utasít el a bolt egy rendelést olyan termékre,
amelyből a táblázat szerint van készlet. Értékelési aggregátumot az admin lista **nem**
tartalmaz. A `categories` a **teljes** katalógusból származik (az inaktív termékek kategóriáit is
beleértve).

### 13. `POST /api/admin/products`

**Kérés:** `{ name, description, price, imageUrl, stock, category, active? }`

| Státusz | Törzs |
|---|---|
| 201 | A létrejött termék |
| 400 | Validációs hiba |

Az `active` alapértéke **igaz**. A szöveges mezők trimmelve tárolódnak.

### 14. `PUT /api/admin/products/:id`

Teljes csere; **minden** mezőt újravalidál.

| Státusz | Törzs |
|---|---|
| 200 | A módosított termék |
| 400 | Validációs hiba |
| 404 | Nem létező termék |

Egyidejű szerkesztésnél az utolsó mentés nyer (K-4 korlát).

### 15. `PATCH /api/admin/products/:id/active`

**Kérés:** `{ active: true|false }` — kizárólag az aktivitás váltása.

| Státusz | Törzs |
|---|---|
| 200 | A módosított termék |
| 400 | Az `active` nem logikai érték |
| 404 | Nem létező termék |

Azért különálló végpont, mert a teljes csere (14.) a termék minden mezőjét újravalidálja: egy
hibás adatú régi termék különben nem lenne elrejthető, amíg ki nem javítunk egy tőle független
mezőt — pedig épp a hibás adatú terméknél a legsürgősebb az elrejtés.

### 16. `DELETE /api/admin/products/:id`

Végleges törlés (nem azonos az inaktiválással).

| Státusz | Törzs |
|---|---|
| 200 | `{ "ok": true }` |
| 404 | Nem létező termék |

A korábbi rendelések tartalmát nem érinti: a tételek snapshotot őriznek.

---

## Admin — felhasználók

Új felhasználó létrehozására **nincs végpont**, és a jelszó nem módosítható.

### 17. `GET /api/admin/users`

**200** — felhasználók tömbje: `id`, `username`, `email`, `address`, `role`, `createdAt`.
Jelszóhash, só és token **soha** nem szerepel.

### 18. `PUT /api/admin/users/:id`

**Kérés:** `{ username, email, address, role? }`

| Státusz | Mikor |
|---|---|
| 200 | A módosított felhasználó (admin nézet) |
| 400 | Validációs hiba; foglalt név/e-mail; érvénytelen szerepkör; az utolsó admin lefokozása |
| 404 | Nem létező felhasználó |

Az egyediség vizsgálata a szerkesztett felhasználót kihagyja. A szerepkör csak `customer` vagy
`admin` lehet. Az utolsó admin szerepköre nem vehető el (I-3).

### 19. `DELETE /api/admin/users/:id`

| Státusz | Mikor |
|---|---|
| 200 | `{ "ok": true }` |
| 400 | Az utolsó admin törlése (I-3) |
| 404 | Nem létező felhasználó |

A felhasználó korábbi rendelései **megmaradnak**: a rendelés önálló bizonylat, amely megőrzi a
leadáskori vevői adatokat.

---

## Admin — rendelések

### 20. `PATCH /api/admin/orders/:id/status`

**Kérés:** `{ status: "pending" | "delivered" }` · `MA IS` `| "expired"`

| Státusz | Mikor |
|---|---|
| 200 | A módosított rendelés |
| 400 | Érvénytelen státuszérték |
| 404 | Nem létező rendelés |
| 409 | `MA IS` `delivered`-re váltás, de a fizikai készlet nem fedezi a tételeket |
| 409 | `MA IS` Kísérlet egy `delivered` rendelés más státuszra állítására (végállapot) |
| 409 | `MA IS` Kísérlet egy `expired` rendelés `pending`-re állítására |

- `MA IS` A `delivered`-re váltás **levonja** a tételek mennyiségét a `stock`-ból.
- `MA IS` Érvényes átmenetek — minden más **409**:
  `pending → {pending, expired, delivered}`, `expired → {expired, delivered}`,
  `delivered → {delivered}`. A `pending → expired` váltást rendes körülmények között az
  ütemező végzi; az azonos státuszra állítás mindenhol idempotens (és nem von le újra).
- `MA IS` Ez az egyetlen mód arra, hogy egy rendelés kiszállítottá váljon — enélkül senki nem
  írhatna értékelést.

---

## Admin — moderáció

### 21. `GET /api/admin/reviews`

**Query:** `status` (opcionális) = `pending` \| `approved` \| `rejected` \| `removed`.
Üres vagy hiányzó érték esetén minden értékelés.

**200** — értékelések tömbje **teljes** rekordokkal (az `author` mezővel együtt), legújabb elöl.

### 22. `PATCH /api/admin/reviews/:id`

**Kérés:** `{ status: "approved" | "rejected" | "removed" }`

| Státusz | Mikor |
|---|---|
| 200 | A módosított értékelés |
| 400 | Érvénytelen státuszérték |
| 404 | Nem létező értékelés |

- A `pending` **szándékosan nem** állítható be: a moderálatlan állapot a kezdet, oda visszalépni
  értelmetlen.
- A művelet frissíti az `updatedAt` mezőt — az értékelés tartalma nem módosítható, ezért ez
  kizárólag a moderációs lépést jelöli.
- A `removed` **soft delete**: az értékelés megmarad, de sem a publikus listában, sem az átlagban
  nem szerepel.
