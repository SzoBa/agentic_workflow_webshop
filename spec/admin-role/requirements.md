# Admin szerepkör

> **Történeti spec — nem élő norma.** 2026-07-22-én készült, a **Node/Express + lowdb**
> backendre. A feature megvalósult, de a mai kód a Java/Spring backend ([ADR-0006](../../docs/adr/0006-atvaltas-a-java-backendre.md)),
> ezért a dokumentumban szereplő `server/…` útvonalak és lowdb-részletek **elavultak** — a
> szándékot és az indoklásokat olvasd belőle, a fájlneveket ne.
> A backend viselkedésének élő normája a [`spec/backend/`](../backend/requirements.md), az admin
> végpontok mai listája a [`vegpontok.md`](../backend/vegpontok.md)-ben van.
> Az alakja is korábbi: a `node .claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs admin-role` hibákat jelent rá (hiányzó
> kritérium-azonosítók és `*Kész, ha:*` sorok), mert a validátor konvenciói később születtek.
> Utólag ne írd át — a `feature-implement` lánc bemenetének **nem** alkalmas.

## Kontextus
A jelenlegi webshopban szükség van olyan jogosultságokkal rendelkező felhasználóra, aki termékek és felhasználók adatait tudja szerkeszteni. Az admin a customer fölé rendelt szerepkör: mindent megtehet, amit egy customer, és emellett hozzáfér a szerkesztő felületekhez.

A dokumentum fogalmai a [CONTEXT.md](../../CONTEXT.md) szótárát követik. A rendelések változatlanságát biztosító adatmodell-döntést az [ADR-0001](../../docs/adr/0001-rendelesi-tetel-snapshot.md) rögzíti.

## User story-k
- Üzemeltetőként szeretném, hogy jogosultsági szintek legyenek a webshopban, customer és admin típusokkal.
- Üzemeltetőként szeretném, hogy az admin jogosultsági szint a customer jogosultság felett legyen, vagyis az admin a vásárlói funkciókat is használhassa.
- Üzemeltetőként szeretném, ha külön oldalon tudná az admin a felhasználók adatait megtekinteni, szerkeszteni és törölni.
- Üzemeltetőként szeretném, ha külön oldalon tudná az admin a termékek adatait megtekinteni, felvenni, szerkeszteni és törölni.
- Üzemeltetőként szeretném, ha a termékek külön oldalán kereshető és szűrhető formában láthatná az admin a termékeket.
- Üzemeltetőként szeretném, ha a termékek külön oldalán inaktívra is tudná az admin állítani a termékeket, nem csak törölni.
- Üzemeltetőként szeretném, ha az admin a felhasználók szerepkörét is láthatná és szerkeszthetné.
- Üzemeltetőként szeretném, ha az adatszerkesztési külön oldalakat csak az admin jogú felhasználó láthatná és szerkeszthetné.

## Constraints

### Szerepkörök
- A regisztráláskor a felhasználók mind customer szerepkört kapnak. A saját szerepkörüket a felületen sehol nem látják megjelenítve.
- Egy felhasználónak egyszerre egy szerepköre lehet, és kell legyen.
- A rendszerben több admin jogú felhasználó is lehet, de **legalább egynek mindig lennie kell**: az a művelet, amely az utolsó admin szerepkörét megszüntetné (lefokozás vagy törlés), hibaüzenettel elutasításra kerül. A védelem egyidejűleg érkező kérésekre is érvényes: két párhuzamos művelet sem viheti nullára az adminok számát.
- Az adatszerkesztő felületek védelme szerveroldali; a kliensoldali elrejtés csak kényelmi funkció.

### Termékek
- Az inaktív státuszú termék a vásárlói felület számára nem létezik: nem jelenik meg a listákban, közvetlen hivatkozással sem érhető el, és nem is rendelhető meg. Kizárólag az admin szerkesztési oldalán látszik.
- Ha a megrendelés pillanatában a kosár inaktív vagy időközben törölt terméket tartalmaz, a megrendelés hibaüzenettel elutasításra kerül. A hibaüzenet a termék nevét tartalmazza, nem a belső azonosítóját.
- Ha a vevő által jóváhagyott végösszeg eltér a szerver által számolttól (mert időközben átárazták a kosárban lévő terméket), a megrendelés hibaüzenettel elutasításra kerül. A vevő soha ne fizessen más összeget, mint amit a képernyőn jóváhagyott.
- A termék törlése végleges, és különbözik az inaktiválástól. Törlés előtt megerősítést kér a felület.
- Az inaktiválás önálló művelet: akkor is elvégezhető, ha a termék valamelyik **egyéb** adata nem felel meg a mai validációs szabályoknak. Egy régebbi, hibás adatú terméknél épp az elrejtés a legsürgősebb művelet, ezért nem függhet olyan mező kijavításától, amihez az admin nem nyúlt.
- Már leadott rendelések termékekre vonatkozó tartalma nem változik meg, ha a termékek adatait az admin módosítja vagy a terméket törli.

### Termékadatok validációja
- A termék neve kötelező, legfeljebb 50 karakter.
- A leírás kötelező, legfeljebb 100 karakter.
- Az ár egész szám és nullánál nagyobb.
- A készlet megadása kötelező, egész szám és nem negatív.
- A kategória kötelező, szabadon megadható szöveg.
- A kép megadása kötelező, és 400*300 méretűnek kell lennie. A kép hivatkozásként (URL) kerül megadásra; a méretellenőrzés a szerkesztő felületen történik.

### Felhasználói adatok
- Az admin a felhasználókat megtekintheti, szerkesztheti és törölheti. **Új felhasználó felvételére nincs mód** — fiók kizárólag regisztrációval keletkezik, mivel a jelszó nem adható meg az admin felületen.
- A felhasználók jelszava nem módosítható.
- A felhasználónév és az e-mail cím egyedi, kis- és nagybetűtől függetlenül. Szerkesztéskor az egyediség vizsgálata a szerkesztett felhasználót figyelmen kívül hagyja.
- A felhasználóra ugyanazok az adatszabályok érvényesek, mint regisztrációkor.
- A felhasználó törlése a korábbi rendeléseit nem törli: a rendelés önálló bizonylat, amely megőrzi a leadáskori vevői adatokat.

## Definition of Done
- [ ] A customer szerepkörű vagy be nem jelentkezett felhasználó nem fér hozzá a termékek és a felhasználók adatait szerkesztő oldalakhoz.
- [ ] Az admin hozzáfér a termékek adatait szerkesztő oldalhoz.
- [ ] Az admin módosításai a termékek adatait szerkesztő oldalon elmentődnek.
- [ ] Az admin szűrni és keresni tud a termékek adatait szerkesztő oldalon a termékek adatai alapján, beleértve az aktív/inaktív állapot szerinti szűrést.
- [ ] Az admin hibaüzenetet kap, ha egy termékadat módosítás vagy új termék felvétel esetén nem megfelelő adatokat ad meg.
- [ ] Az admin egy terméket inaktívra tud állítani, és az inaktív termék eltűnik a vásárlói felületről.
- [ ] Az admin hozzáfér a felhasználók adatait szerkesztő oldalhoz.
- [ ] Az admin hibaüzenetet kap, ha egy felhasználói adatmódosítás esetén nem megfelelő adatokat ad meg.
- [ ] Az admin módosításai a felhasználók adatait szerkesztő oldalon elmentődnek.
- [ ] Az admin hibaüzenetet kap, ha a művelete az utolsó admin szerepkörét szüntetné meg — akkor is, ha két ilyen kérés egyszerre érkezik.
- [ ] A vásárló érthető hibaüzenetet kap, és nem jön létre rendelés, ha a kosarában időközben inaktívvá vált vagy törölt termék van.
- [ ] A vásárló érthető hibaüzenetet kap, és nem jön létre rendelés, ha a kosarában lévő termék ára időközben megváltozott.
- [ ] A bejelentkezett customer-ek és a be nem jelentkezett felhasználók nem férnek hozzá a termékek adatait szerkesztő oldalhoz.
- [ ] A bejelentkezett customer-ek és a be nem jelentkezett felhasználók nem férnek hozzá a felhasználók adatait szerkesztő oldalhoz.
- [ ] Egy korábban leadott rendelés tartalma változatlan marad a benne szereplő termék átnevezése, átárazása vagy törlése után is.

## Nem célok
Az alábbiak tudatosan kívül esnek ezen a követelményen, és külön feladatba tartoznak:

- **Rendelés-adminisztráció.** Az admin nem kap felületet mások rendeléseinek megtekintésére vagy kezelésére; továbbra is csak a saját rendeléseit látja.
- **A kosár proaktív frissítése.** Ha egy kosárban lévő termék adatai megváltoznak vagy a termék inaktívvá válik, ez a vásárló számára a megrendelés leadásakor derül ki, nem korábban. A megrendelés ilyenkor elutasításra kerül (lásd a termékekre vonatkozó constraintek között), de a kosár tartalmát a rendszer nem frissíti magától.
- **Az admin saját belépési adatainak védelme.** Az utolsó admin elronthatja a saját felhasználónevét, és mivel a bejelentkezés felhasználónévvel történik és nincs jelszó-visszaállítás, ezzel kizárhatja magát. Ez ismert, vállalt korlát: a védelem a *szerepkör* megszűnése ellen véd, nem a fiók elérhetetlenné válása ellen.
- **Egyidejű szerkesztés kezelése.** Ha két admin egyszerre szerkeszti ugyanazt a terméket vagy felhasználót, az utolsó mentés nyer. Nincs zárolás és nincs ütközésjelzés — kivéve az adminok számára vonatkozó invariánst, amely egyidejű kérésekre is véd.
- **A készlet kezelése rendeléskor.** A rendelés leadása továbbra sem csökkenti a készletet.
- **Fájlfeltöltés.** A képek hivatkozásként kerülnek megadásra, nem feltöltéssel.
