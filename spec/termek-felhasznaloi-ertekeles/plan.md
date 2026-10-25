# Termék felhasználói értékelése — technikai terv

## Áttekintés
Új, olvasó végpont a meglévő `products` erőforrás alatt, amely a **belépett** felhasználó egy adott termékre
adott értékelését adja vissza. A hitelesítés a rendeléseknél már használt Bearer-token mintát követi
(`requireAuth`), az adat egy új `ratings` lowdb-kollekcióban él. A kliensoldali API-hívó opcionális (a
termékoldal használhatja), de a lényeg a backend szerződés.

## API szerződés
- **Metódus + útvonal:** `GET /api/products/:id/ratings/me`
  - `:id` — a termék azonosítója (`Product.id`, pl. `p3`).
  - A „me" a tokenből azonosított belépett felhasználót jelenti — a userId **nem** kerül az útvonalba
    (privát adat, csak a saját tokennel érhető el).
- **Request:**
  - Fejléc: `Authorization: Bearer <token>` (kötelező).
  - Nincs query paraméter, nincs body.
- **Response:**
  - `200 OK` — létező termék, létező saját értékelés:
    ```json
    { "productId": "p3", "userId": "u1", "value": 4, "createdAt": "2026-07-21T10:00:00.000Z" }
    ```
    (A belső `Rating.id` a válaszban nem szükséges — a saját értékelés a productId+userId párral egyértelmű.)
  - `404 Not Found` — a termék nem létezik: `{ "error": "A termék nem található." }`.
  - `404 Not Found` — a termék létezik, de a felhasználónak nincs rá értékelése: `{ "error": "Nincs értékelés." }`.
  - `401 Unauthorized` — hiányzó/érvénytelen token: `{ "error": "Bejelentkezés szükséges." }` (a `requireAuth`
    adja).
- **Auth:** szükséges — a `requireAuth` middleware (`server/src/auth.ts`) a kérésre teszi a `user`-t
  (`AuthedRequest`).

> Megjegyzés a route-sorrendhez: a `productsRouter` már tartalmaz egy `GET /:id`-t. A `/:id/ratings/me` külön
> szegmensszámú útvonal, így nem ütközik a `/:id`-vel — de a defenzív sorrend kedvéért a `/:id/ratings/me`
> handlert a `/:id` **elé** vagy mellé érdemes felvenni, és mindenképp tesztelni.

## Érintett fájlok
- `server/src/types.ts` **és** `client/src/api.ts` — új `Rating` típus (id, productId, userId, value,
  createdAt) mindkét oldalon; a `DbData` bővítése `ratings: Rating[]` mezővel (ez utóbbi csak szerveroldal).
  A válasz alakjához opcionálisan egy `MyRatingResponse` (productId, userId, value, createdAt) típus is
  felvehető mindkét oldalon.
- `server/src/db.ts` — a `seedProducts` mellé a preset default kap egy `ratings: []` kulcsot; a `users`-höz
  hasonló **migráció**: ha egy korábbi `db.json`-ban nincs `ratings`, indításkor `db.data.ratings = []` +
  `db.write()`. (Seed értékelést nem feltétlenül kell adni; ha a demóhoz kell, néhány `Rating` beszúrható.)
- `server/src/routes/products.ts` — az új `GET /:id/ratings/me` handler a `productsRouter`-en, `requireAuth`
  middleware-rel és a `wrap` async-wrapperrel (bár szinkron olvasás esetén a `wrap` elhagyható; a projekt
  mintáját követve konzisztens marad). Magyar hibaüzenetek.
- `client/src/api.ts` — (opcionális) egy `getMyProductRating(productId, token)` hívó függvény, ha a
  termékoldal használja.

## Adatmodell
Új kollekció a lowdb-ben:
```ts
export type Rating = {
  id: string;          // pl. `${productId}:${userId}` vagy generált id
  productId: string;   // Product.id
  userId: string;      // User.id
  value: number;       // 1..5 egész
  createdAt: string;   // ISO időbélyeg
};
// DbData: { products: Product[]; orders: Order[]; users: User[]; ratings: Rating[] }
```
- Invariáns: egy `(productId, userId)` párra legfeljebb egy `Rating`. A GET csak olvas, de a lekérdezés erre az
  egyediségre épít (`find`, nem `filter`).
- A termék létezését a `db.data.products`-ban kell ellenőrizni (a meglévő `GET /:id` mintája szerint), mielőtt
  a `ratings`-ben keresünk — így a „nem létező termék" (404) és a „nincs értékelés" (404) megkülönböztethető
  a hibaüzenettel.

## Biztonsági / üzleti megkötések
- A saját értékelés privát: a userId a tokenből jön (`req.user.id`), **soha** nem a kliens által küldött
  paraméterből — így egy felhasználó nem kérdezheti le más értékelését.
- Az árak/összeg szerveroldali újraszámolásának elve itt közvetlenül nem érintett (nincs ár a válaszban), de a
  tágabb elv itt is érvényes: a kliens által küldött adatot nem hisszük el, a választ a DB-ből építjük.
- Integer HUF megkötés itt nem releváns (nincs pénzérték a válaszban); az érték 1–5 egész.
- A `stock` nem érintett.

## Tesztelési stratégia
- Backend integrációs teszt a meglévő minta szerint (`server/test/products.test.ts` bővítése vagy új
  `server/test/ratings.test.ts`; segédek: `server/test/helpers.ts`). Lefedendő esetek:
  1. `200` — belépett felhasználó, létező termék, létező saját értékelés → helyes törzs.
  2. `404` „Nincs értékelés." — belépett felhasználó, létező termék, de nincs saját értékelés.
  3. `401` — token nélküli kérés.
  4. `404` „A termék nem található." — érvényes token, ismeretlen `:id`.
  Ahol kell, a teszt előbb hoz létre felhasználót + tokent (auth teszt-helper mintája) és beszúr egy `Rating`-et
  a db-be.
- Kliens oldali teszt csak akkor, ha a `client/src/api.ts` bővül (`client/test/api.test.ts` mintája).

## Nyitott kérdések / kockázatok
- A `Rating.id` formátuma (`${productId}:${userId}` vs. generált) — a GET-et nem befolyásolja, de a későbbi
  POST/PUT egyediség-kezelését igen; érdemes már most egyértelműsíteni.
- Kell-e seed értékelés a demóhoz, vagy induljon üres `ratings`-szel (a tesztek maguk szúrnak be adatot).
- A későbbi bővítés (POST/PUT saját értékelés, összesített átlag `GET /api/products/:id/rating`) külön spec —
  az itteni adatmodell ezekkel kompatibilis.
