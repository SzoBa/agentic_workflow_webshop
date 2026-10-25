# Termékértékelés

> **Történeti spec — nem élő norma.** 2026-07-23-án készült, a **Node/Express + lowdb**
> backendre; 2026-08-02-án került ide a `week3/Review and rating/` alól. A feature megvalósult, de
> a mai kód a Java/Spring backend ([ADR-0006](../../docs/adr/0006-atvaltas-a-java-backendre.md)):
> a vélemények a `server-java/src/main/java/hu/webshop/review/` csomagban élnek, három végponttal
> — `GET /api/products/:id/reviews`, `POST /api/reviews`, `PATCH /api/admin/reviews/:id`. Az itt
> leírt `server/…` útvonalak, a lowdb-tömb és a `db.json` **elavultak**.
> Az „MVP, nincs felhasználókezelés" premissza is megdőlt: a véleményíráshoz ma belépés kell.
> A backend viselkedésének élő normája a [`spec/backend/`](../backend/requirements.md).
> Az alakja is korábbi: a `tasks.md` kipipált checkboxai az eredeti munkanaplóból maradtak (ma a
> `spec/` a norma, nem munkanapló), és a `node .claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs review-and-rating` emiatt is
> hibákat jelent rá. Utólag ne írd át — a `feature-implement` lánc bemenetének **nem** alkalmas.

## Kontextus
A jelenlegi webshop (`ai-native-webshop`) egy MVP: termékeket listáz, és rendeléseket vesz fel. A vásárlónak nincs semmilyen visszajelzési csatornája, és a terméklistán nincs olyan társadalmi bizonyíték (social proof), ami a vásárlási döntést támogatná. Ez a feature ezt pótolja.

Illeszkedés a meglévő rendszerhez:
- A vélemények a termék alá ágyazva érhetők el. Az oldal kap egy vélemény-listát és egy beküldő űrlapot, és látszik egy átlag.
- A vélemények moderáltak: jóváhagyás nélkül semmi nem válik publikussá.
- Jelenleg nincs felhasználó kezelés.

## MVP-döntések (auth helyett)
Mivel ez MVP, nincs bejelentkezés. Helyette:
- A kliens a böngésző megnyitásakor generál egy random GUID-t, ami a session élettartamáig a felhasználó azonosítója (`author`). Kilépéskor eldobódik.
- Ez a GUID kerül mind a review-hoz, mind a checkoutkor a rendeléshez (`Order.author`).
- Az "ellenőrzött vásárló" szabály ezért session-en belül él: a review-hoz tartozó GUID-nek kell legyen `delivered` rendelése az adott termékre.
- Moderálni MVP-ben bárki tud (nincs jogosultság-ellenőrzés).
- **Scope: kizárólag backend.** Frontend (csillag-vizualizáció, űrlap, "Nincs értékelés" felirat) nem része ennek a feladatnak, de az API úgy készül, hogy ezt később ki lehessen szolgálni.

## User story-k
- Vásárlóként szeretném, hogy egy termék oldalán 1–5 csillagot és opcionális szöveges véleményt adhassak.
- Vásárlóként szeretném látni a termékhez tartozó értékeléseket és az átlagos csillagot, hogy vásárlás előtt tájékozódhassak.
- Fejlesztőként szeretném, hogy az értékelések alapértelmezetten pending státusszal jönnek létre, és csak approved státuszú értékelések jelennek meg a frontenden.
- Látogatóként szeretném a terméklistán és a termékoldalon látni az átlagos csillagszámot és az értékelések számát, hogy gyorsan összehasonlíthassam a termékeket.
- Látogatóként szeretném látni a korábbi szöveges véleményeket a terméklapon, hogy megalapozott döntést hozhassak a vásárlás előtt.
- Tulajdonosként azt szeretném, ha csak ellenőrzött vásárlók küldenének be véleményeket, hogy a termékértékelések megbízhatóak maradjanak.
- Moderátorként szeretném az új értékeléseket elfogadni vagy elutasítani, hogy csak megfelelő tartalom jelenjen meg.
- Moderátorként szeretnék egy már jóváhagyott véleményt utólag eltávolítani (removed), hogy egy tévedés azonnal javítható legyen (a publikus listából és az átlagból is azonnal eltűnjön).

## Constraints
- A user csak akkor értékelhet egy terméket, ha a GUID-jéhez tartozik olyan rendelés, amely tartalmazza a terméket, és a rendelés státusza `delivered`.
- A szöveges vélemény nem kötelező, de ha megadják, maximum **500** karakter.
- Értékelést csak azonosítóval (GUID `author`) rendelkező felhasználó küldhet be; azonosító nélkül csak olvasható a lista.
- Az értékelés csak egész szám lehet 1 és 5 között.
- Egy felhasználó (GUID) egy termékhez csak egy értékelést adhat.
- Az értékelés **nem módosítható** a beküldés után (MVP).
- Csak létező termékhez adható értékelés.
- A `removed` státuszú review nem jelenik meg publikusan és nem számít az átlagba, de az adatbázisban megmarad (soft delete, nem hard delete).
- "Nincs értékelés" állapot: ha egy terméknek nincs approved értékelése, `ratingCount = 0` és `ratingAvg = 0`.

## Adatmodell
- `Review = { id, productId, author, rating, body?, status, createdAt, updatedAt }`
- `status: "pending" | "approved" | "rejected" | "removed"` (alapérték `pending`).
- `Order` kiegészül: `status: "pending" | "delivered"` (alapérték `pending`) és `author?: string` (a leadó GUID-je).

## Definition of Done
- [ ] A `GET /api/products` és `GET /api/products/:id` válasza tartalmaz `ratingAvg` és `ratingCount` mezőt (csak approved review-kból).
- [ ] `GET /api/products/:id/reviews` csak az approved véleményeket adja vissza, createdAt szerint csökkenő sorrendben (legújabb elöl), a teljes listát (nincs lapozás).
- [ ] Ha nem egész számot vagy 1–5 tartományon kívüli értéket küldünk ratingnek, a szerver 400-at ad.
- [ ] Ha a body 500 karakternél hosszabb, a szerver 400-at ad.
- [ ] Ellenőrzött vásárló (delivered rendelés az adott termékre, azonos GUID) létező terméket értékelni tud 1 és 5 közötti egész számmal; a review `pending` státusszal jön létre.
- [ ] Nem ellenőrzött (nincs delivered rendelése a termékre) beküldés 403-at kap.
- [ ] Ugyanaz a GUID ugyanahhoz a termékhez másodszor nem tud értékelni (409).
- [ ] Moderátor egy review státuszát `approved` / `rejected` / `removed` értékre tudja állítani; `removed`/`rejected` azonnal eltűnik a publikus listából és az átlagból.
