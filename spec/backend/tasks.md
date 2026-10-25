# Feladatlista

> **Ez a lista LEZÁRULT.** A migráció mindkét fázisa befejeződött: a backend Java/Spring Boot
> + PostgreSQL alapon fut, a Node-implementáció törölve
> ([ADR-0006](../../docs/adr/0006-atvaltas-a-java-backendre.md)). A dokumentum ettől kezdve
> **történeti**: azt őrzi, milyen sorrendben és milyen mércével készült el a rendszer.
> Új munkához ne innen indulj — a norma a [`requirements.md`](./requirements.md).
>
> Két munkaegység maradt nyitva, mindkettő a megszűnt referenciaimplementációt érintette
> (**A1.3**, **A7.1**): a 13 `⚙` esetet a Node oldalon soha nem sikerült HTTP-n mérhetővé
> tenni. A Java oldalon mind a 13 le van fedve integrációs teszttel, tehát a lefedettség
> ma teljes — a két pont már nem hajtható végre.

Két fázis, mérföldkövekre bontva. Minden munkaegység **önállóan verifikálható**: a „kész, ha"
sor konkrét konformancia-esetekre hivatkozik ([`konformancia.md`](./konformancia.md)) vagy
megnevezett tesztre.

Rövidítés: **JÁ** = a `requirements.md` érintett `ÚJ` jelölésének átvezetése `MA IS`-re.
Ez minden munkaegység utolsó lépése, nem külön feladat.

---

# A fázis — a jelenlegi backend felzárkóztatása

## A-M1 · Előkészítés

- [x] **A1.1** A készletet érintő 13 tesztfájl átnézése, a fixture-készletek megemelése ott, ahol
      a mind-vagy-semmi szabály miatt buknának.
      *Kész, ha:* a teljes teszt-készlet zöld, viselkedésváltozás nélkül.
      *Érintett:* `server/test/` (8 fájl), `client/test/` (5 fájl).
- [x] **A1.2** A konformancia-esetek végrehajtójának felállítása: a `K-xx` esetek futtathatók egy
      megadott base URL ellen, kizárólag HTTP-n keresztül.
      *Kész, ha:* a `MA IS` esetek zölden futnak a jelenlegi backend ellen, az `ÚJ`-ak pirosan.
      *Megvalósult:* `spec/backend/conformance/` — 54 HTTP-n futtatható eset, mind zöld a
      Node-backend ellen. Az `ÚJ` esetek (K-33, K-34) időközben megvalósultak, ezért zöldek.
      A 13 `⚙` eset az A1.3-ra vár.
- [ ] **A1.3** A `⚙` jelű esetekhez szükséges konfigurációs felülírások bevezetése (foglalási idő,
      token-élettartam rövidíthető; az ütemező kézzel futtatható).
      *Kész, ha:* K-29, K-53 futtatható másodperces beállításokkal.
      *Állapot:* a Node-backend olvassa az `ORDER_RESERVATION_HOURS` és `TOKEN_TTL_HOURS`
      kulcsokat, és az `expiry.ts` köre kézzel hívható — a **futtató** viszont nincs
      hozzákötve, ezért a 13 `⚙` eset a Node oldalon továbbra sem mérhető. A Java oldalon
      mind a 13 le van fedve integrációs teszttel (lásd `konformancia.md`), így ez a
      munkaegység már **csak a referenciaimplementációt** érinti.

## A-M2 · Készlet és foglalás

- [x] **A2.1** `Order.status` bővítése `expired`-del; az érvényes értékek egyetlen forrásának
      frissítése; a normalizálás igazítása.
      *Kész, ha:* a bővített státuszhalmaz megjelenik a `PATCH .../status` 400-as üzenetében,
      és a normalizálás nem állítja vissza `pending`-re az `expired` rendeléseket.
      *Érintett:* `types.ts`, `orderStatus.ts`, `normalize.ts`, `server/test/normalize.test.ts`.
- [x] **A2.2** `reservations.ts`: foglalás-számítás, `available`, fedezetellenőrzés — tiszta
      függvényekként, egységtesztekkel.
      *Kész, ha:* az új `server/test/reservations-unit.test.ts` lefedi a nulla/részleges/teljes
      fedezet és a lejárt rendelés eseteit.
- [x] **A2.3** `available` a vásárlói termékválaszokban; az `inStock` szűrő átállítása.
      *Kész, ha:* **K-11**, **K-27** zöld.
      *Érintett:* `types.ts`, `catalog.ts`, `routes/products.ts`, `client/src/api.ts`.
- [x] **A2.4** Fedezetellenőrzés a rendelés leadásánál, mind-vagy-semmi módon, 409-cel; az
      ellenőrzés és a létrehozás megszakítás nélküli blokkban (I-5).
      *Kész, ha:* **K-23**, **K-24**, **K-25** zöld.
- [x] **A2.5** `expectedTotal` kötelezővé tétele: hiány → 400, eltérés → 409.
      *Kész, ha:* **K-21**, **K-22** zöld, és **K-20** változatlanul zöld.
- [x] **A2.6** `delivered`-re váltás: készletellenőrzés és tényleges levonás, fedezethiánynál 409.
      *Kész, ha:* **K-26**, **K-31** zöld.
      *Érintett:* `routes/admin/orders.ts`.

## A-M3 · Lejárat

- [x] **A3.1** `expiry.ts`: a lejárt `pending` rendelések `expired`-re állítása, kézzel hívható
      függvényként. `ORDER_RESERVATION_HOURS` beolvasása (alap 72).
      *Kész, ha:* egységteszt igazolja, hogy csak a lejárt `pending` rendeléseket érinti, és
      idempotens.
- [x] **A3.2** Az ütemező bekötése az indításba és a szabályos leállásba.
      *Kész, ha:* **K-29**, **K-30** zöld; a szerver leállása nem ragad be a futó időzítő miatt.
      *Érintett:* `index.ts`.
- [x] **A3.3** Számolt `reservedUntil` a `pending` rendelések válaszaiban.
      *Kész, ha:* **K-28** zöld.

## A-M4 · Hitelesítés

*(Az A-M2/M3-tól független sáv, párhuzamosítható.)*

- [x] **A4.1** Token-lejárat: `TOKEN_TTL_HOURS` (alap 168), lejárati időbélyeg a bejelentkezésnél,
      ellenőrzés a hitelesítésnél.
      *Kész, ha:* **K-53** zöld, és a lejárt token ugyanazt a 401-es választ kapja, mint az
      érvénytelen.
- [x] **A4.2** Csúszó megújítás írás-fékezéssel (csak ha a hátralévő idő < 50%).
      *Kész, ha:* **K-54** zöld, és egy egyszerű `GET /api/auth/me` sorozat **nem** ír minden
      kérésnél.
- [x] **A4.3** Tárolt bejelentkezési számlálók (`loginAttempts.ts`), 15 perc / 10, takarítással.
      *Kész, ha:* **K-51** változatlanul zöld, **K-52** zöld.
- [x] **A4.4** A regisztrációs versenyablak megszüntetése: a jelszóhash előrehozása az
      egyediség-ellenőrzés elé, majd megszakítás nélküli ellenőrzés + beszúrás (I-1, I-2).
      *Kész, ha:* **K-47** zöld, és **K-46** változatlanul zöld.

## A-M5 · CORS

- [x] **A5.1** `CORS_ORIGINS` értelmezése; üres érték esetén nincs CORS middleware.
      *Kész, ha:* **K-76** zöld, és a fejlesztői proxyval, illetve az éles static kiszolgálással
      futó kliens változatlanul működik.

## A-M6 · Kliens

- [x] **A6.1** Központi 401-kezelő: a tárolt munkamenet törlése és bejelentkezésre irányítás.
      *Kész, ha:* lejárt tokennel a felület kilépteti a felhasználót, nem hibaüzenetek sorát
      mutatja. Teszt: `client/test/auth.test.tsx` bővítés.
- [x] **A6.2** `available` alapú készletjelzés, „Elfogyott" állapot, letiltott kosárgomb.
      *Teszt:* `ProductList.test.tsx`, `ProductDetail.test.tsx`.
- [x] **A6.3** A 409-es válaszok megkülönböztetett megjelenítése a pénztárnál (készlethiány vs.
      árváltozás).
      *Teszt:* `Checkout.test.tsx`.
- [x] **A6.4** `expired` felirat és kiemelés a rendeléslistán; foglalási visszaszámláló a
      `reservedUntil` alapján.
      *Teszt:* új `client/test/Orders.test.tsx`.
- [x] **A6.5** Újrarendelés gomb lejárt rendelésnél: a tételek kosárba helyezése az **aktuális**
      árakkal és elérhetőséggel.
      *Kész, ha:* a kosár a mai árat mutatja, nem a rendelésen tárolt snapshotot.
- [x] **A6.6** Az admin terméklistán a foglalt és az elérhető mennyiség megjelenítése a fizikai
      készlet mellett.
      *Teszt:* `AdminProducts.test.tsx`.

## A-M7 · Lezárás

- [ ] **A7.1** A teljes konformancia-katalógus zöld a Node-backend ellen (67 eset).
      *Részben:* az 54 HTTP-n futtatható eset zöld (`spec/backend/conformance/`). A maradék
      13 `⚙` eset az **A1.3** konfigurációs felülírásaira vár — enélkül nem futtathatók.
      *Mérés (2026-07-26):* 54 / 54 zöld, tiszta adattárolóval.
- [x] **A7.2** Minden `ÚJ` jelölés átvezetve `MA IS`-re a `requirements.md`-ben, `vegpontok.md`-ben
      és `hibakatalogus.md`-ben.
- [x] **A7.3** `README.md` és `.env.example` frissítése az új konfigurációs kulcsokkal
      (`ORDER_RESERVATION_HOURS`, `TOKEN_TTL_HOURS`, `CORS_ORIGINS`).
- [x] **A7.4** A `CONTEXT.md` és a kód szóhasználatának összevetése (foglalás, elérhető
      mennyiség, lejárt rendelés).

---

# B fázis — Java/Spring Boot + Postgres

> Előfeltétel: az **A7.1** teljesült. Ettől kezdve a Node-backend a referencia.

## B-M1 · Váz és tárolás

- [x] **B1.1** Maven-projekt Java 25-tel, Spring Boot alappal, futtatható alkalmazással.
      *Kész, ha:* `GET /api/health` → `200 {"status":"ok"}`.
- [x] **B1.2** Postgres Dockerrel; Testcontainers-alapú integrációs tesztváz.
      *Kész, ha:* egy üres teszt valódi adatbázissal indul és leáll.
- [x] **B1.3** Séma első migrációja: `products`, `orders`, `order_items`, `users`, `reviews`,
      `login_attempts`, a `plan.md` B.3 szerinti megszorításokkal.
      *Kész, ha:* a migráció tiszta adatbázison lefut, és az egyedi indexek élnek.
- [x] **B1.4** Indításkori bootstrap: seed katalógus (`p1`…`p8`) és a „legalább egy admin"
      invariáns, idempotensen, tranzakcióban.
      *Kész, ha:* **K-77**, **K-78** zöld; kétszeri indítás nem duplikál.

## B-M2 · Hitelesítés

- [x] **B2.1** Jelszóhash-elés és tokenkezelés; a bejelentkezési válaszok szerződés szerinti alakja.
      *Kész, ha:* **K-50**, **K-55** zöld.
- [x] **B2.2** Hitelesítési és admin-jogosultsági réteg, útvonalminta alapján bekötve (nem
      végpontonként).
      *Kész, ha:* **K-70**, **K-71** zöld — **minden** admin végpontra.
- [x] **B2.3** Token-lejárat és csúszó megújítás.
      *Kész, ha:* **K-53**, **K-54** zöld.
- [x] **B2.4** Tárolt bejelentkezési korlátozás, valós kliens IP proxy mögött.
      *Kész, ha:* **K-51**, **K-52** zöld.
- [x] **B2.5** Regisztráció és validáció; az egyediség adatbázis-szintű megszorítással.
      *Kész, ha:* **K-40**…**K-47** zöld.

## B-M3 · Katalógus

- [x] **B3.1** Vásárlói terméklekérdezések: aktivitás-szűrés, lapozás, szűrők, determinisztikus
      rendezés.
      *Kész, ha:* **K-01**…**K-12** zöld.
- [x] **B3.2** Értékelési aggregátumok (csak `approved`, egy tizedes, oldalankénti számítás).
      *Kész, ha:* **K-13**…**K-15** zöld.
- [x] **B3.3** Admin termékkezelés: lista `status` szűrővel, létrehozás, teljes csere, aktivitás-
      váltás külön végponton, végleges törlés.
      *Kész, ha:* a 12–16. végpont minden státuszkódja megegyezik a referenciáéval.

## B-M4 · Rendelés és készlet

- [x] **B4.1** Rendelés leadása: validáció, termékfeloldás az aktív halmazon, szerveroldali
      összegszámítás, snapshot mezők.
      *Kész, ha:* **K-20**, **K-32** zöld.
- [x] **B4.2** Ár-egyeztetés (400/409).
      *Kész, ha:* **K-21**, **K-22** zöld.
- [x] **B4.3** Foglalás-számítás és fedezetellenőrzés **tranzakcióban**, a termék sorának
      zárolásával (I-5).
      *Kész, ha:* **K-23**…**K-25**, **K-27** zöld, és egy párhuzamos terheléses próba nem visz
      negatívba készletet.
- [x] **B4.4** Teljesítés: `delivered` levonással, fedezethiánynál 409.
      *Kész, ha:* **K-26**, **K-31** zöld.
- [x] **B4.5** Lejárat ütemezett feladattal; `reservedUntil` a válaszban.
      *Kész, ha:* **K-28**…**K-30** zöld.

## B-M5 · Értékelés és moderáció

- [x] **B5.1** Beküldés: ellenőrzött vásárló szabály, egyszeri értékelés adatbázis-szintű
      megszorítással, `author` a tokenből.
      *Kész, ha:* **K-60**…**K-64** zöld.
- [x] **B5.2** Publikus lista: csak `approved`, rendezés, `author` elhagyása.
      *Kész, ha:* **K-65**…**K-67** zöld.
- [x] **B5.3** Moderációs végpontok.
      *Kész, ha:* **K-68**, **K-69** zöld.

## B-M6 · Peremek

- [x] **B6.1** Strukturált naplózás, szintbeállítás, a hibakatalógus naplószakasza szerinti
      eseményekkel; hitelesítő adat nélkül.
- [x] **B6.2** Globális hibakezelő: 500 + szerződéses üzenet, a szerver fut tovább.
      *Kész, ha:* **K-72** zöld.
- [x] **B6.3** CORS a `CORS_ORIGINS` alapján.
      *Kész, ha:* **K-76** zöld.
- [x] **B6.4** Rendelési értesítő: azonos tartalom és formátum, kecses kihagyás hiányos
      konfiguráció esetén, a rendelést nem buktató hibakezelés.
      *Kész, ha:* **K-73**…**K-75** zöld.
- [x] **B6.5** Szabályos leállás időkorláttal; a lefordított frontend kiszolgálása SPA-
      visszaeséssel.

## B-M7 · Átállás

- [x] **B7.1** A teljes konformancia-katalógus zöld a Java-backend ellen (67 eset).
      *Mérés (2026-07-26):* az 54 HTTP-n futtatható eset **54 / 54 zöld** tiszta adattárolóval;
      a 13 `⚙` esetet integrációs teszt fedi (`konformancia.md` ⚙-táblázat). Java teszt-készlet:
      **220 zöld**.
- [x] **B7.2** Válasz-összehasonlítás: minden eset lefuttatva **mindkét** backend ellen, az
      eltérések tételes indoklásával.
      *Mérés (2026-07-26):* `conformance/compare.mjs`, 58 lépés, **0 érdemi eltérés**.
      A 6 kulcssorrend-eltérés indoklása a
      [ADR-0006](../../docs/adr/0006-atvaltas-a-java-backendre.md)-ban.
- [x] **B7.3** Meglévő `db.json` importálása a `plan.md` B.4 szerinti szabályokkal; ellenőrzés,
      hogy a régi rendelések snapshot mezői sértetlenek.
      *Megvalósult:* `hu.webshop.bootstrap.DbJsonImporter` (`IMPORT_FILE`), 9 teszt +
      élő importálás egy valódi `db.json`-ból. **A jelszavak nem jönnek át** (scrypt → BCrypt),
      az importált fiókoknak új jelszó kell.
- [x] **B7.4** A meglévő kliens működésének igazolása az új backend ellen, **kódmódosítás nélkül**.
      *Igazolva:* a `client/` érintetlen; katalógus, bejelentkezés, admin nézet, SPA-visszaesés
      és mélylink működik. Egy meglévő **kliensoldali** hiba előjött — ld. a jegyzőkönyvet.
- [x] **B7.5** Átváltás; a `server/` mappa eltávolítása és a `CLAUDE.md` frissítése.
      *Megtörtént:* a `server/` törölve, a gyökér `package.json` egyetlen workspace-t
      (`client`) tart, a Vitest csak a klienst futtatja. Döntés és jegyzőkönyv:
      [ADR-0006](../../docs/adr/0006-atvaltas-a-java-backendre.md).

---

## Nyomonkövetés

| Fázis | Munkaegység | Konformancia-lefedettség | Állapot |
|---|---|---|---|
| A-M1 | 3 | felállítás | 2/3 — **A1.3 nyitva** |
| A-M2 | 6 | K-11, K-20…K-27, K-31 | kész |
| A-M3 | 3 | K-28…K-30 | kész |
| A-M4 | 4 | K-46, K-47, K-51…K-54 | kész |
| A-M5 | 1 | K-76 | kész |
| A-M6 | 6 | kliensoldali tesztek | kész |
| A-M7 | 4 | mind a 67 | 3/4 — **A7.1 tárgytalan** (54/67 mérve a Node-on) |
| B-M1…B-M6 | 22 | mind a 67 | kész |
| B-M7 | 5 | mind a 67, kétszer futtatva | kész |

**Záró mérés (2026-07-26), közvetlenül az átváltás előtt.** Node: 623 teszt zöld,
konformancia 54/54. Java: 220 teszt zöld, konformancia 54/54, válasz-összehasonlítás
**0 érdemi eltérés** 58 lépésen. Az összehasonlítás azóta nem megismételhető — a
referenciaimplementáció törölve. Jegyzőkönyv:
[ADR-0006](../../docs/adr/0006-atvaltas-a-java-backendre.md).

Az átváltás után: `npm test` = a kliens 233 tesztje · `cd server-java && mvn test` = 220 teszt.
