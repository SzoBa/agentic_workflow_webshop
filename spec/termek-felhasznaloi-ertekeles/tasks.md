# Termék felhasználói értékelése — feladatlista

Minden feladat kicsi, önállóan tesztelhető, és visszavezethető egy requirements user story-ra / DoD pontra.

## Adatmodell
- [x] `Rating` típus felvétele `server/src/types.ts`-ben (id, productId, userId, value: 1–5 egész, createdAt),
      és a `DbData` bővítése `ratings: Rating[]` mezővel — tükrözve `client/src/api.ts`-ben a `Rating`
      (és opcionálisan `MyRatingResponse`) típussal. → *DoD: Rating típus mindkét oldalon*
- [x] `server/src/db.ts`: a `JSONFilePreset` default kap `ratings: []` kulcsot, és a `users`-höz hasonló
      migráció (ha `db.data.ratings === undefined`, akkor `= []` + `await db.write()`), hogy meglévő `db.json`
      is működjön. → *DoD: db.json migráció*

## Backend
- [x] `GET /:id/ratings/me` handler a `productsRouter`-en (`server/src/routes/products.ts`), `requireAuth`
      middleware-rel; a userId a `req.user.id`-ból, nem a kliensből. A `wrap` mintát követve. → *user story:
      saját értékelés lekérése; privát adat*
- [x] Termék létezésének ellenőrzése a `db.data.products`-ban a meglévő `GET /:id` mintája szerint; ha nincs →
      `404 { error: "A termék nem található." }`. → *DoD: ismeretlen termék 404*
- [x] Saját `Rating` keresése `(productId, userId)` párra (`find`); ha nincs → `404 { error: "Nincs
      értékelés." }`, ha van → `200` a `{ productId, userId, value, createdAt }` törzzsel. → *DoD: 200 saját
      értékeléssel / 404 nincs értékelés*
- [x] Auth nélkül a `requireAuth` `401 { error: "Bejelentkezés szükséges." }`-t ad (nincs külön teendő, de
      teszttel igazolandó). → *DoD: 401 auth nélkül*
- [x] Backend teszt (`server/test/products.test.ts` bővítése vagy új `server/test/ratings.test.ts`,
      `helpers.ts`-szel): mind a négy eset (200, 404-nincs-értékelés, 401, 404-ismeretlen-termék). → *DoD:
      teszt mind a négy esetre*

## Kliens (opcionális — csak ha a termékoldal használja)
- [x] `getMyProductRating(productId, token)` hívó függvény `client/src/api.ts`-ben (a 404-et „nincs
      értékelés" állapotként kezelve).
- [x] Kliens teszt `client/test/api.test.ts`-ben, ha a hívó függvény bekerült.

## Ellenőrzés
- [x] `npm run build` sikeres (server + client).
- [x] Minden Definition of Done pont teljesül és teszttel fedett.
