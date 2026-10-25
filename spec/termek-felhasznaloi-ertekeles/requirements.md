# Termék felhasználói értékelése — saját értékelés lekérése (GET)

> **Történeti spec — nem élő norma, és a leírt végpont ma NEM létezik.** 2026-07-25-én készült, a
> **Node/Express + lowdb** backendre; 2026-08-02-án került ide a `week3/` alól. A `tasks.md`
> kipipált checkboxai szerint akkor megvalósult, de a Java-újraírás
> ([ADR-0006](../../docs/adr/0006-atvaltas-a-java-backendre.md)) **nem vitte át**: külön `ratings`
> kollekció nincs, az értékelés a vélemény egyik mezője (`ReviewEntity.rating`), és a
> [22 végpont](../backend/vegpontok.md) között nincs `GET /api/products/:id/ratings/me`.
> A dokumentumban szereplő `server/…` útvonalak és lowdb-részletek **elavultak**.
> A backend viselkedésének élő normája a [`spec/backend/`](../backend/requirements.md).
> Ha a saját értékelés lekérése újra kell, az **új** feature: `feature-spec-writer`, új
> spec-mappa. Ezt ne írd át, és a `feature-implement` láncnak se add be — az alakja is korábbi
> (kipipált checkboxok, hiányzó `*Kész, ha:*` sorok), a spec-validátor (`.claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs`) elutasítja.

## Kontextus
A webshopban jelenleg nincs értékelés (rating) fogalom: a `Product` típuson nincs értékelési mező, és a
lowdb adatbázisban nincs `ratings` kollekció. Ez a feature az első lépés a termékértékelés bevezetése felé:
egy **olvasó** végpont, amellyel a **belépett** felhasználó lekérheti, hogy egy adott terméket ő maga hogyan
értékelt korábban (1–5 csillag). Erre a termékoldalon van szükség, hogy a felhasználó lássa és később
szerkeszthesse a saját értékelését.

A végpont a meglévő `products` erőforrás alá illeszkedik (`server/src/routes/products.ts`), és a
rendeléseknél már használt Bearer-token alapú hitelesítést veszi át (`server/src/auth.ts`).

Ez a spec **csak az olvasó (GET) végpontra** vonatkozik. Az értékelés létrehozása/módosítása (POST/PUT) és az
összesített átlagértékelés külön feature — itt nem tárgyaljuk, de az adatmodellt úgy tervezzük, hogy ezekre
később bővíthető legyen.

## User story-k
- Belépett felhasználóként szeretném lekérni a saját, egy adott termékre adott értékelésemet, hogy a
  termékoldalon lássam, hány csillagot adtam korábban.
- Belépett felhasználóként, ha még nem értékeltem az adott terméket, egyértelmű „nincs értékelés" választ
  (404) szeretnék kapni, hogy a UI a „még nem értékelted" állapotot tudja megjeleníteni.
- Rendszerként el kell utasítanom a hitelesítés nélküli kérést (401), hogy egy felhasználó ne férhessen hozzá
  más értékeléséhez.
- Rendszerként el kell utasítanom a nem létező termékre irányuló lekérést (404), hogy a hibás termékazonosító
  ne adjon félrevezető választ.

## Constraints
- **Technikai:**
  - Új `Rating` típus és `ratings` kollekció kell a lowdb-ben (`server/src/types.ts` `DbData` bővítése +
    `server/src/db.ts` seed/migráció). A `server/data/db.json` generált és gitignore-olt — nem commitolható.
  - Az értékelés értéke **1–5 közötti egész** szám. Egy felhasználó / termék legfeljebb **egy** értékelés.
  - Shape változásnál a `server/src/types.ts` és `client/src/api.ts` típusokat **egyszerre** frissíteni kell
    (nincs közös csomag).
  - NodeNext modulfeloldás: a lokális importok `.js` kiterjesztéssel hivatkoznak (pl. `../db.js`).
  - A meglévő `requireAuth` middleware (`server/src/auth.ts`) és `wrap` async-wrapper (`server/src/wrap.ts`)
    mintáját kövessük; új függőség nem adható hozzá.
  - Nem módosítható a `Product` alakja (a kliens és a localStorage-kosár is erre a shape-re támaszkodik) —
    az értékelés külön kollekcióban él, nem a `Product`-on.
- **Üzleti:**
  - A saját értékelés privát: kizárólag a token tulajdonosa férhet hozzá a saját értékeléséhez.
  - Felhasználónak szánt szövegek (hibaüzenetek) magyarul.

## Definition of Done
- [ ] `GET /api/products/:id/ratings/me` érvényes Bearer tokennel, létező `:id`-vel, amelyre a felhasználó
      korábban `value=4` értékelést adott → `200` és a törzs `{ productId: ":id", userId, value: 4, createdAt }`.
- [ ] Ugyanez, ha a felhasználó **még nem** értékelte a terméket → `404` és `{ error: "Nincs értékelés." }`
      (a kliens ebből tudja a „még nem értékelted" állapotot).
- [ ] Bearer token nélküli (vagy érvénytelen tokenes) kérés → `401` és `{ error: "Bejelentkezés szükséges." }`
      (a `requireAuth` viselkedése).
- [ ] Nem létező termék `:id`-re, érvényes tokennel → `404` és `{ error: "A termék nem található." }`.
- [ ] `Rating` típus szerepel a `server/src/types.ts`-ben és tükrözve a `client/src/api.ts`-ben; a `DbData`
      tartalmaz `ratings: Rating[]` mezőt, és egy korábban `ratings` nélkül létrejött `db.json` migrálódik
      (a hiányzó kulcs pótlódik indításkor).
- [ ] A válasz `value` mezője mindig 1–5 közötti egész (a tárolt adatból), a `createdAt` ISO időbélyeg.
- [ ] Backend teszt (`server/test/products.test.ts` bővítése vagy új `ratings.test.ts`) lefedi mind a négy
      esetet (200 saját értékeléssel, 404 nincs értékelés, 401 auth nélkül, 404 ismeretlen termék).
