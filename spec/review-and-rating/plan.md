# Termékértékelés — Implementation Plan

## Architekturális döntések
- A `reviews` külön tömbként kerül a lowdb `DbData`-ba (mint a `products` és `orders`),
  mert az adatmodell konzisztens marad, és a `db.write()` ugyanúgy működik.
  INDOK: nincs relációs DB, a lowdb tömb a bevett minta ebben a repóban.
- A validáció a route handlerben történik (nincs külön service-réteg a repóban),
  hogy illeszkedjen a meglévő `products.ts` / `orders.ts` stílusához.
  INDOK: ne vezessünk be új réteget egy MVP-hez; kövessük a meglévő konvenciót.
- A moderációs státusz string-literál union: "pending" | "approved" | "rejected" | "removed".
  INDOK: TypeScript típusbiztonság, nincs szükség enum-táblára. A `removed` a soft-delete.
- Identitás: session-alapú GUID-t a **kliens** ad; a szerver ezt átveszi az `author`
  mezőbe (review és order). Nincs auth, nincs users tábla.
  INDOK: MVP; a szerver továbbra sem bízik meg a kliensben árszámításnál, de az
  identitás MVP-szinten hamisítható — tudatosan vállalt korlát.
- Átlag és darabszám nem tárolt, hanem **lekérdezéskor számolt** és a termék-válaszba
  ágyazott (`ratingAvg`, `ratingCount`), csak approved review-kból.
  INDOK: nincs denormalizáció-karbantartás; kis adatnál olcsó a számítás.

## Az implementáció sorrendje
1. types.ts: `Review` típus, `ReviewStatus`, `DbData.reviews`, `Order.status` + `Order.author`,
   valamint `ProductWithRating` a válaszokhoz.
2. db.ts: seed default kiegészítése `reviews: []`-vel és `delivered` seed-rendelésekkel
   (ismert seed-GUID-del), a meglévő seed-rendelések `status` mezővel.
3. db.json: a már létező adatfájl kézi kiegészítése (`reviews: []`, seed delivered
   rendelések, `status` a meglévő rendelésen), mert a seed csak új fájlnál fut le.
4. reviews.ts router: POST / (verified-purchase + duplikátum-check, pending),
   PATCH /:id (moderáció). Segédfüggvények: `publicReviews`, `ratingSummary`.
5. products.ts: GET /:id/reviews (csak approved, csökkenő), és a GET / + GET /:id
   válaszok kiegészítése a rating-aggregátumokkal.
6. index.ts: a reviews router bekötése (`/api/reviews`).

## Érintett fájlok
- Módosított: server/src/types.ts — Review, ReviewStatus, DbData, Order bővítés
- Módosított: server/src/db.ts — reviews: [] + delivered seed rendelések
- Módosított: server/data/db.json — reviews: [], seed rendelések, status mező
- Új: server/src/routes/reviews.ts — POST + PATCH + segédfüggvények
- Módosított: server/src/routes/products.ts — GET /:id/reviews + rating aggregátumok
- Módosított: server/src/index.ts — a reviews router bekötése

## Végpontok
- `POST /api/reviews` — body: `{ productId, author, rating, body? }`
  - 400: rating nem egész / tartományon kívül, vagy body > 500
  - 404: nem létező productId
  - 403: az author-nak nincs delivered rendelése a termékre
  - 409: az author már értékelte a terméket
  - 201: a létrehozott review (`status: "pending"`)
- `PATCH /api/reviews/:id` — body: `{ status }`, ahol status ∈ approved|rejected|removed
  - 400: hibás status; 404: nincs ilyen review; 200: a frissített review
- `GET /api/products/:id/reviews` — approved review-k, createdAt csökkenő, teljes lista
- `GET /api/products` és `GET /api/products/:id` — `ratingAvg`, `ratingCount` beágyazva

## Lezárt (korábbi nyitott) kérdések
- Identitás: session-GUID az `author`-ban (kliens adja). ✔
- Verified purchase: a rendelést is GUID-del jelöljük, `delivered` státusz szükséges. ✔
- Order status: `pending | delivered`, seedelünk delivered rendelést. ✔
- Komment: opcionális, max 500. ✔
- Státuszok: pending | approved | rejected | removed (removed = soft delete). ✔
- Szerkesztés: nincs (a review beküldés után nem módosítható). ✔
- Átlag/darab: beágyazva a termék-válaszba. ✔
- Lapozás: nincs, teljes lista. ✔
- Moderáció jogosultság: MVP-ben bárki. ✔
- Scope: backend-only. ✔
