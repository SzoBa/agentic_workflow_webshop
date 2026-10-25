# Teendők — mi nincs még kész

> **Ez a fájl nem norma.** Nem specifikáció, nem kész-kritérium, és semmilyen agent nem
> hivatkozhat rá bizonyítékként. Egy **felmérés pillanatképe**: 2026-08-02, a
> `feature/pipeline` ág `cb3d771` commitján. A norma továbbra is a `spec/backend/` és a
> `spec/admin-orders/`; ütközés esetén azok nyernek.
>
> A méretbecslések nagyságrendet jelölnek, nem kötelezettséget:
> **XS** = egy fájl · **S** = tisztán kliens vagy tisztán teszt, séma nélkül ·
> **M** = új végpont vagy új nézet, migráció nélkül · **L** = séma- vagy állapotgép-változás,
> spec-írással kezdve.

---

## Ajánlott következő lépés — 1. tétel

Az **admin értékelés-moderáció képernyő** a legkisebb rés, ami közben egy **elvágott láncot** köt
össze.

A backend teljesen kész és tesztelt: 21. és 22. végpont
([`spec/backend/vegpontok.md`](./backend/vegpontok.md)), `AdminReviewController`,
`AdminReviewApiTest`, valamint konformancia-esetek a
[`conformance/cases/ertekeles.mjs`](./backend/conformance/cases/ertekeles.mjs)-ben.

A kliensen viszont **nulla** van belőle:

- `client/src/api.ts` — nincs `getAdminReviews`, nincs `updateAdminReview`
- `client/src/App.tsx` — nincs `/admin/reviews` útvonal
- az oldalsáv „Adminisztráció" blokkja három menüpontot sorol (Termékek, Rendelések, Ügyfelek)

**Mit jelent ez működésben:** a vevő beküld egy értékelést → az `pending` lesz
(`client/src/ProductReviews.tsx:87` — *„Moderálás után jelenik meg a terméknél."*) → és az
alkalmazásból **soha semmi nem tudja jóváhagyni**. A publikus értékeléslista így örökre üres, a
`ratingAvg` / `ratingCount` végig 0, a `Stars` komponens sosem mutat semmit. Moderálni ma csak
nyers HTTP-hívással vagy közvetlenül az adatbázisból lehet.

**Miért kicsi:** tisztán kliensmunka. Nincs Flyway-migráció, nincs új hibaüzenet, nincs
`spec/backend/` változás. Három meglévő minta majdnem szó szerint követhető: `AdminUsers.tsx`
(tábla + soronkénti művelet), `AdminOrders.tsx` (státusz-szűrő + státuszváltó vezérlő),
`RequireAdmin` + az `api.ts` admin-hívásai. A munka alakja: két függvény és a típusok az
`api.ts`-be, egy `AdminReviews.tsx` oldal, egy útvonal és egy menüpont, egy
`client/test/AdminReviews.test.tsx` — opcionálisan egy e2e feature-fájl.

Ugyanaz a hiányalak, mint amit az `admin-orders` betömött — csak ott a végpontot is meg kellett
írni, itt már megvan.

---

## Top 10

| # | Feature | Méret | Állapot ma |
|---|---|---|---|
| 1 | **Admin értékelés-moderáció UI** (`/admin/reviews`) | **S** | Backend 100%, kliens 0%. Az értékelés-lánc közepe hiányzik. |
| 2 | **`AR-19` lezárása** (admin-orders e2e) | **XS** | Az e2e szcenáriók megvannak (`e2e/features/admin-rendelesek-{lista,statusz}.feature`), de a spec mérlege még *20 teljesül / 1 teljesítetlen*. Futtatás + pipa + bizonyíték kell — lásd [`admin-orders/requirements.md`](./admin-orders/requirements.md) „Változásnapló". |
| 3 | **Alacsony készlet jelzése az admin terméklistán** | **S** | A `reserved` / `available` már megjelenik (`client/src/pages/AdminProducts.tsx:409-410`); csak a küszöb, a kiemelés és a szűrő hiányzik. Tisztán kliens. |
| 4 | **Vevői rendelés-részletoldal** | **S/M** | Az `Orders.tsx` egy lista, nincs `/orders/:id` útvonal. Új végpont nem kell — a `GET /api/orders` már minden mezőt visszaad. |
| 5 | **„Értékeléseim" nézet a vevőnek** | **M** | Nincs végpont. A beküldő ma soha nem tudja meg, jóváhagyták-e a véleményét. A historikus `spec/termek-felhasznaloi-ertekeles` `GET /api/products/:id/ratings/me`-t írt le — a Java átírás **nem** hozta át, és ott nincs `ratings` gyűjtemény sem. |
| 6 | **Saját fiókadatok szerkesztése + jelszóváltás** | **M** | Egyáltalán nincs végpont: a `vegpontok.md` 17. pontja kimondja, hogy felhasználó-létrehozásra nincs végpont és a jelszó nem módosítható. Írni ma csak admin tud, `PUT /api/admin/users/:id`-vel. |
| 7 | **Rendelés-visszavonás a vevő által** | **M/L** | `K-3`: készletet ma **csak admin** adhat vissza, kézi szerkesztéssel. Új státusz az állapotgépben, foglalás-felszabadítás, Flyway-migráció, hibakatalógus-bővítés. Speccel kezdődik. |
| 8 | **Kategória-kezelés** | **M** | `K-8`: a kategória szabad szöveg — elgépelés új kategóriát hoz létre, átnevezés nincs. Séma + admin felület. |
| 9 | **E2E lefedettség a vevői útra** | **M** | Ma három feature-fájl van, ebből egy önteszt. A teljes vásárlási út (katalógus → kosár → checkout → értékelés) nincs böngészőből mérve. |
| 10 | **Termékkép-feltöltés** | **L** | Ma az `imageUrl` szabad szöveges URL. Tárolás, méretkorlát, kiszolgálás, validáció — a lista legnagyobb tétele. |

---

## Nem feature, de adósság

Két ismert korlát, ami nem fért be a tízbe, mert nem új képességet ad, hanem meglévőt javít:

- **`K-6`** — az értesítő a rendelési kérés kiszolgálása közben megy ki, **egyetlen**
  próbálkozással. Átmeneti hiba esetén az értesítés véglegesen elvész, és a külső szolgáltató
  lassúsága a vevő válaszidejét is lassítja.
- **`K-4`** — egyidejű termékszerkesztésnél az utolsó mentés nyer. Nincs zárolás és nincs
  ütközésjelzés.

---

## Hogyan tovább egy tétellel

A `spec/` alá kerülő új feature-nek **spec-mappa kell**, nem közvetlen implementáció. Az
1. tételnél ez a `feature-spec-writer` skill (`spec/admin-orders/` a minta) → `spec/admin-reviews/`
→ onnan a `feature-implement` lánc.

A 3. és 4. tétel elfér spec-mappa nélkül is: nincs bennük szerződésváltozás, a
[`spec/backend/vegpontok.md`](./backend/vegpontok.md) meglévő válaszaiból dolgoznak.
