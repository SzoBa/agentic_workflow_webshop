# Termékértékelés — Tasks

Scope: backend-only. Identitás: session-GUID az `author` mezőben (kliens adja).

## [x] 1. Adatmodell
- [x] 1.1 types.ts: `ReviewStatus = "pending" | "approved" | "rejected" | "removed"`
- [x] 1.2 types.ts: `Review` típus (id, productId, author, rating, body?, status, createdAt, updatedAt)
- [x] 1.3 types.ts: `Order` bővítése `status: "pending" | "delivered"` és `author?: string` mezőkkel
- [x] 1.4 types.ts: `DbData` bővítése `reviews: Review[]`-vel
- [x] 1.5 types.ts: `ProductWithRating = Product & { ratingAvg, ratingCount }` a válaszokhoz
- [x] 1.6 db.ts: a JSONFilePreset default értéke kapjon `reviews: []`-t
      — RÉSZBEN: a `reviews: []` megvan. Seed `delivered` rendelést NEM
      készítettünk: a specifikáció írása óta bekerült a felhasználókezelés, így
      a rendelés hitelesített felhasználóhoz tartozik, és egy ismert GUID-del
      seedelt rendelés senkihez sem tartozna. Helyette a rendelés teljesítése
      valós művelet lett: `PATCH /api/admin/orders/:id/status`.
- [x] 1.7 db.json: kézi kiegészítés helyett a `normalizeDb` pótolja a hiányzó
      `reviews` tömböt és az `Order.status`-t (`pending` alapértékkel) — így a
      már létező adatfájl kézi szerkesztés nélkül, automatikusan a séma
      szerintivé válik. A hiányzó státusz szándékosan `pending`, nem
      `delivered`: régi rendelésről nem tudjuk, kiszállították-e.

## [x] 2. Létrehozás
- [x] 2.1 Új reviews.ts router, POST / kezelő
- [x] 2.2 Validáció: rating egész 1–5 között, különben 400
- [x] 2.3 Validáció: body opcionális, ha van, max 500 karakter, különben 400
- [x] 2.4 Ellenőrzés: a productId létező termékre mutat, különben 404
- [x] 2.5 Verified purchase: az author-nak van delivered rendelése a termékre, különben 403
- [x] 2.6 Duplikátum: az author még nem értékelte a terméket, különben 409
- [x] 2.7 Új review mentése status="pending"-gel, createdAt=updatedAt, db.write()

## [x] 3. Megjelenítés
- [x] 3.1 products.ts: GET /:id/reviews — csak status==="approved", createdAt szerint csökkenő, teljes lista

## [x] 4. Moderáció
- [x] 4.1 reviews.ts: PATCH /:id — status váltás approved|rejected|removed, updatedAt frissül (400/404 kezelés)

## [x] 5. Átlag és review mennyiség (beágyazva)
- [x] 5.1 Segédfüggvény: approved review-k darabszáma és átlaga terméknként (removed/rejected/pending kihagyva)
- [x] 5.2 products.ts: GET / és GET /:id válasza tartalmazza a `ratingAvg` és `ratingCount` mezőket

## [x] 6. Bekötés
- [x] 6.1 index.ts: a reviews router regisztrálása `/api/reviews` alatt
