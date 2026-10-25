# Admin rendeléskezelő — spec-en túli észrevételek

A `spec/admin-orders/` lánca lefutott: **18/18 kész-kritérium teljesül, 0 javító kör**
([`Running.md`](../orchestration/admin-orders/Running.md)). A négy jelentés viszont **13 olyan
észrevételt** hagyott hátra, ami egyetlen `AR-xx` ponthoz sem tartozott — ezért a lánc
szabályosan **nem** foglalkozott velük („ne lépj túl a spec keretein").

Ez a dokumentum összeszedi őket, mielőtt elvesznének a jelentések szövegében.

## Honnan jöttek

| Forrás | Melyik szakaszból |
|---|---|
| `spec-researcher` | „Eltérések, kockázatok, nyitott kérdések" — **maradéktalanul lezárult**, nem hagyott hátra tételt |
| `spec-implementer` (B, backend) | „Spec-en túli javaslatok" |
| `spec-implementer` (F, kliens) | „Spec-en túli javaslatok" |
| `spec-validator` | „Spec-en túli észrevételek" |
| [`Review.md`](../orchestration/admin-orders/Review.md) | „Ha van feltétel, amelyet senki nem ellenőrzött" |

**Egyetlen tétel sem utólagos ötlet** — mindegyik elhangzott a láncban, és a „Forrás" oszlop
visszakereshetővé teszi. Ahol **két** szereplő egymástól függetlenül jelezte ugyanazt (A3, C1),
azt külön kiemelem: az erősebb jelzés, mint egy magányos javaslat.

---

## Áttekintés

| # | Tétel | Forrás | Méret | Útvonal | Állapot |
|---|---|---|---|---|---|
| **A1** | Az `AR-08` alsó lapszám-vágásának (`page < 1`) nincs tesztje | `Review.md` + validátor | XS | azonnal | **✅ kész** |
| **A2** | A validátor mérési mellékhatásainak takarítása | validátor | XS | azonnal | ⏸ döntésre vár |
| **A3** | E-mail a vevő cellájában | F **és** validátor | XS | azonnal | **✅ kész** |
| **A4** | Elavult Node-hivatkozások triázsa (34 találat) | validátor | M | azonnal | **✅ kész** |
| **B1** | `AdminOrderQueryService` unit teszt-fedés | B | S | skill | nyitott |
| **B2** | A keresőmező nem debounce-ol (2 képernyő) | F | S | kis fejlesztés | nyitott |
| **B3** | `pageSize`-választó a felületen | validátor | S | kis fejlesztés | nyitott |
| **B4** | Szűrő-eltérés jelzése státuszváltás után | F | S | kis fejlesztés | nyitott |
| **C1** | A státuszváltó gomb `delivered` soron is látszik | validátor **és** F | XS kód / M döntés | **döntés kell** | **✅ kész** |
| **D1** | End-to-end fedés hiánya | `Review.md` | M | spec kell | nyitott (`AR-19`) |
| **D2** | Szűrés a vevő rendeléseire | F | M | spec kell | nyitott |
| **D3** | A `search` lekérdezésbe tolása (index **nélkül** — lásd lent) | B | L | spec + ADR kell | **✅ kész** |
| **E1** | A lánc bizalmi egypontja és a teszt-önigazolás | `Review.md` | — | folyamat | nyitott |

---

# A · Azonnal elvégezhető

## A1 — Az `AR-08` alsó lapszám-vágásának nincs tesztje

**Mit vett észre.** A `page < 1` esetet **egyetlen teszt sem futtatja** — sem az
`AdminOrderListTest`-ben, sem a katalógus tesztjei között (a `CatalogConformanceTest` csak a
`page=abc` *fallbacket* méri, ami más ág). A validátor élő `curl`-lel pótolta, de egy **másik
végponton** (`GET /api/products?page=0&pageSize=1`), arra hivatkozva, hogy bizonyítottan
ugyanaz a `Catalog.paginate` fut alattuk.

**Miért számít.** Az érvelés érvényes, de nem ugyanaz, mint a mért végpont mérése. Ez
**spec-írói hiba, nem implementálói**: az `AR-08` „Bizonyíték" sora csak a `page=999`-et és az
üres `search`-öt nevezte meg, az implementáló pontosan azt fedte le — helyesen.

**Javasolt lépés.** Egy `?page=0&pageSize=1` eset az `AdminOrderListTest`-be, és az `AR-08`
bizonyíték-sorának bővítése a `spec/admin-orders/requirements.md`-ben.

**Kész, ha:** a `page=0` kérés `page: 1`-et ad **miközben** `totalPages > 1` (ez különbözteti
meg az alsó vágást a felsőtől), és az `AR-08` bizonyíték-sora megnevezi ezt az esetet.

> **✅ Kész (2026-07-27).** Az `AR-08` bizonyíték-sora javítva, és a teszteset elkészült:
> `AdminOrderListTest.clampsPageAndKeepsAtLeastOnePageWhenEmpty` immár a `?page=0&pageSize=1`
> kérést is méri (`page: 1` **miközben** `totalPages: 3`). Mérve: `mvn test` — 561 teszt, 0 bukás.

## A2 — A validátor mérési mellékhatásainak takarítása

**Mit vett észre.** A validátor maga jelentette: az élő `curl`-ös ellenőrzésekhez elindította a
fejlesztői Postgrest és a backendet. A backend folyamatot leállította, a **konténert a projekt
konvenciója szerint futni hagyta**, és a fejlesztői adatbázisba a **publikus API-n**
regisztrálódott egy `validatorvevo` fiók (közvetlen adatbázisírás nem történt).

**Miért számít.** Egy ismeretlen fiók a fejlesztői adatbázisban a következő fejlesztőt
elbizonytalanítja — nem tudja, honnan van, és nem meri törölni.

**Javasolt lépés.** `cd server-java && docker compose down -v` — visszaáll a seed adatokra
(8 demo termék + a seed admin). Ha a jelenlegi dev adat kell, akkor helyette a `validatorvevo`
fiók törlése a `DELETE /api/admin/users/{id}` végponton.

**Kész, ha:** a `GET /api/admin/users` nem tartalmaz `validatorvevo` nevű fiókot.

## A3 — E-mail a vevő cellájában

**Mit vett észre.** *Az F-implementáló és a validátor egymástól függetlenül.* A `search`
illeszkedik a vevő e-mailjére (`AdminOrderQueryService`), de a táblázat csak a nevet és a
felhasználónevet mutatja — a `requirements.md` 3.2 felsorolása szerint, tehát ez nem
spec-sértés.

**Miért számít.** E-mail-találat esetén az admin **nem látja, mi miatt jött a sor**. Keres egy
e-mailre, kap egy sort, és semmi a képernyőn nem magyarázza az egyezést.

**Javasolt lépés.** Az e-mail megjelenítése a vevő cellájában, halványan, a felhasználónév
mellé (a meglévő `.admin-order-username` stílus mintájára).

**Kész, ha:** az e-mailre keresve a találati sorban látszik az egyező e-mail-cím.

> **✅ Kész (2026-07-27).** A vevő cellája a leadáskori e-mailt is mutatja, halványan, a
> felhasználónév fölött (`AdminOrders.tsx`, `.admin-order-email` az `index.css`-ben — az
> osztály a meglévő `.admin-order-username`-mel közös szabályt kapott). Új teszteset:
> „a leadáskori e-mailt is mutatja, törölt fióknál is" (`AdminOrders.test.tsx`), plusz a
> meglévő sor-asszerció is ellenőrzi. Mérve: `npm test` — 262 teszt, 0 bukás.

## A4 — Elavult Node-hivatkozások triázsa

**Mit vett észre.** A validátor **két** helyszínt nevezett meg (`Catalog.java:19`,
`client/src/api.ts:144`), és a `CLAUDE.md` szabályára hivatkozott: *„Ha találsz hivatkozást a
`server/`-re, lowdb-ra vagy »reference implementation«-re, az elavult — javítsd."*

**A teljes sweep viszont 34 találatot ad** (8 `server/src/...` fájlhivatkozás + 27
`referenciaimplementáció`/`lowdb` említés, egy átfedéssel).

**Miért számít — és miért nem szabad egyben javítani.** A `CLAUDE.md` szabálya egyben
alkalmazva **rossz eredményt adna**: a találatok egy része élő funkciót ír le, egy másik része
pedig valódi tervezési indoklást hordoz, amit törölni veszteség lenne. Három kategória:

| Kategória | Db | Mi ez | Teendő |
|---|---|---|---|
| **Élő** | 3 | A legacy `db.json` import **ma is működő** funkció — a `CLAUDE.md` a `FORRÁS` markereket kifejezetten élőnek mondja. `DbJsonImporter` (2 hely), `AppProperties` `IMPORT_FILE` | **Marad**, hozzá sem nyúlunk |
| **Törött mutató** | 8 | Konkrét fájlra hivatkozik, mintha megnyitható lenne — de a `server/` mappa nem létezik a repóban | **Egyértelműen javítandó** |
| **Történeti indoklás** | 23 | Jelen időben beszél a Node-ról, mintha futna: „a referenciaimplementáció ugyanígy konvertál" | **Múlt időre átírva**, egyetlen ADR-0006 hivatkozással |

A **8 törött mutató** pontosan:

```
server-java/.../catalog/Catalog.java                    -> server/src/catalog.ts
server-java/.../config/AppProperties.java               -> server/src/envNumber.ts
server-java/.../ops/GmailOrderNotifier.java             -> server/src/email.ts
server-java/.../ops/LogLevelEnvironmentPostProcessor.java -> server/src/logger.ts
server-java/.../ops/RequestLoggingFilter.java           -> server/src/index.ts
client/src/api.ts (3 hely)                              -> server/src/types.ts
                                                        -> server/src/reviews.ts
                                                        -> server/src/routes/auth.ts
```

**A harmadik kategória a fontos döntés.** Ezek a kommentek **valódi tervezési indoklást
hordoznak**: miért bájtra egyező a válasz (`Messages`, `OrderResponse`), miért ez a
hibaüzenet-sorrend (`ReviewService`), miért `Number` a visszatérési típus
(`CustomerProductView`). **Kivágni őket veszteség lenne** — a *miért* értékes, csak a jelen idő
hamis. Átfogalmazás, nem törlés: „a Node referenciaimplementáció ugyanígy konvertál" →
„a korábbi Node implementáció ugyanígy konvertált ([ADR-0006](../adr/0006-atvaltas-a-java-backendre.md))".

**Kész, ha:** a `grep -rn "server/src/"` a forrásfájlokon **nulla** találatot ad; a
`referenciaimplementáció` említések vagy múlt idejűek, vagy a `db.json` importhoz tartoznak;
és a `mvn test` + `npm test` változatlanul zöld (kommentmódosítás nem érinthet viselkedést).

> **✅ Kész (2026-07-27).** Mind a 34 találat átnézve:
>
> - **8 törött mutató** megszűnt — a `grep -rn "server/src/"` a forrásfájlokon **0 találat**.
> - **23 történeti indoklás** múlt időre átírva; ahol a *miért* önmagában is fontos, oda
>   ADR-0006 hivatkozás került (`Catalog`, `Messages`, `OrderResponse`, `ReviewResponse`,
>   `AppProperties`, `LogLevelEnvironmentPostProcessor`, `GmailOrderNotifier`). **Egyetlen
>   indoklás sem lett törölve** — a `Messages` és a `CustomerProductView` esetében a szöveg
>   ki is egészült azzal, hogy a szabály MA IS miért kötelező.
> - **3 élő** hivatkozás (`DbJsonImporter` ×2, `AppProperties` `IMPORT_FILE`) megmaradt; a
>   `DbJsonImporter` jelszó-bekezdése annyit változott, hogy „a régi tároló scryptet
>   **használt**" — a funkció él, csak a jelen idő volt hamis.
> - Öt további, jelen idejű „Node" említést is javítottam, amit az eredeti sweep nem fogott
>   meg (`PublicReviewResponse`, `LogLevelEnvironmentPostProcessor` ×2, `RequestLoggingFilter` ×2).
>
> Mérve: `mvn test` 561 teszt / 0 bukás, `npm run build` ok, `npm test` 262 teszt / 0 bukás —
> a kommentmódosítás viselkedést nem érintett.

---

# B · Skill vagy kis fejlesztés

## B1 — `AdminOrderQueryService` unit teszt-fedés

**Mit vett észre.** *A B-implementáló.* A szűrő- és lapozáslogika ma **kizárólag integrációs
úton** van mérve (`AdminOrderListTest`, valódi Postgres + valódi HTTP). A branchy
`filter`/`usernamesOf` rész — üres minta, három illesztési mező, üres azonosítólista,
feloldhatatlan `userId` — így ágankként tízszer lassabban mérődik, mint kellene.

**Miért számít.** A projekt konvenciója szerint a „branchy pure logic" unit tesztbe való,
integrációs tesztbe nem: *„egy integrációs teszt ugyanazokat az ágakat mérné tízszer lassabban."*

**Javasolt lépés.** A `test-writer-java-unit` skill futtatása az `AdminOrderQueryService`-re
(JUnit 5 + Mockito, 90% JaCoCo branch-gate). A skill **nem** módosít éles kódot: ha az osztály
varratot igényelne a tesztelhetőséghez, azt jelenti, nem refaktorálja.

**Kész, ha:** a JaCoCo **mért** branch-lefedettsége az osztályra ≥ 90%, és a terv a
`.scratch/test-writer/AdminOrderQueryService.md`-ben van.

> **Részben elévült (2026-07-31), a tétel marad nyitva.** A **D3** javítása közben a `filter()` és a
> `contains()` megszűnt: a szűrés a lekérdezésbe került. A helyükre lépő tiszta függvénynek már van
> unit tesztje (`AdminOrderSearchPatternTest`, 19 eset), a lapozás vágásainak szintén
> (`CatalogWindowTest`). Ami **hátravan**: az `usernamesOf` (üres azonosítólista, feloldhatatlan
> `userId`) és a `statusesOf` továbbra is csak integrációs úton mérődik, és a mért JaCoCo
> branch-szám az osztályra nincs kimondva. A tétel tehát szűkebb lett, nem tűnt el.

## B2 — A keresőmező nem debounce-ol

**Mit vett észre.** *Az F-implementáló.* Minden leütés új kérést indít.

**Ellenőrizve — és két képernyőt érint.** Sem az `AdminOrders`, sem az `AdminProducts` nem
debounce-ol: mindkettőnél a `search` a `load` `useCallback` dep-tömbjében van, amit egy
`useEffect` figyel. Az `AdminOrders` konzisztens a meglévő mintával — **a minta maga a hiba**.

**Miért számít.** Egy tízbetűs keresés tíz HTTP-kérés, és a válaszok sorrendje nem garantált:
egy lassabb korábbi válasz felülírhatja a frissebbet.

**Javasolt lépés.** Közös `useDebounced` hook, mindkét képernyőn alkalmazva. **Ne** csak az
`AdminOrders`-en — a két képernyő azonos hibája külön javítva szétcsúszik.

**Kész, ha:** gyors gépelésnél egyetlen kérés megy ki a gépelés végén, mindkét képernyőn, és a
meglévő `AdminProducts.test.tsx` zöld marad.

## B3 — `pageSize`-választó a felületen

**Mit vett észre.** *A validátor.* Az `AdminOrderQuery.pageSize` mező létezik az `api.ts`-ben,
és a szerver 1…100 között értelmezi — de a képernyő **sosem küldi el**, tehát mindig a
szerveroldali 25-ös alapérték él. A `plan.md` ezt nem tiltja, csak senki nem kötötte be.

**Miért számít.** Egy fél-implementált szerződés: a típus és a végpont készen áll, a felület
nem használja. A következő olvasó vagy azt hiszi, hogy működik, vagy feleslegesnek hiszi a mezőt.

**Javasolt lépés.** Lapméret-választó a lapozó mellé (pl. 25 / 50 / 100), a szűrőkkel azonos
módon visszaugorva az 1. lapra.

**Kész, ha:** a választó értéke megjelenik a kérésben, és a válasz `pageSize` mezője követi.

## B4 — Szűrő-eltérés jelzése státuszváltás után

**Mit vett észre.** *Az F-implementáló.* Státuszváltás után a lista **nem** töltődik újra, csak
az érintett sor frissül — ezt a `requirements.md` 3.3 kéri így.

**Miért számít.** Aktív státusz-szűrő mellett a sor a helyén marad, holott a szűrőnek már nem
felel meg: `status=pending` szűrésnél egy kiszállítottá tett rendelés továbbra is látszik, a
következő betöltésig. Ez nem hiba, hanem a szándékos „ne ugráljon a lista" viselkedés
mellékhatása — de magyarázat nélkül zavaró.

**Javasolt lépés.** Halvány jelzés a soron („a szűrőnek már nem felel meg"), **nem** a sor
eltüntetése — az visszahozná a lista ugrálását.

**Kész, ha:** aktív szűrő mellett a szűrőn kívülre került sor megkapja a jelzést, szűrő nélkül
nem.

---

# C · Előbb döntés kell

## C1 — A státuszváltó gomb `delivered` soron is látszik

**Mit vett észre.** *A validátor és az F-implementáló egymástól függetlenül.* A „Kiszállítottá
tétel" gomb minden soron megjelenik; egy `delivered` soron a kattintás vagy idempotens sikert,
vagy a szerver 409-es végállapot-üzenetét adja (a kliens teszt le is fedi).

**Miért nem lehet egyszerűen megcsinálni.** Két spec-szöveg feszül egymásnak:

- A `plan.md` **4.6** *megengedi*: „a felület legfeljebb elrejtheti a nyilvánvalóan értelmetlen
  műveletet, de az ítéletet a szervertől veszi."
- Az **`AR-15`** viszont azt méri, hogy „a képernyő **nem** ágazik el a státuszra".

Az F-implementáló a **mérhető** kritériumot választotta (nulla státusz-elágazás), és ezt
jelentette is. A validátor szándékosan **nem** mondott róla ítéletet: az `AR-15` szövegében a
gomb láthatósága nem szerepel követelményként, tehát a pont teljesül.

**A döntés tétje.** Ha elrejtjük a gombot, a kliens **elkezd státuszra ágazni** — pontosan azt,
amit a 4.6 korlátozni akart. A használhatóság javul, az elv sérül.

**Amit a döntés együtt jár.** Ha az „elrejtjük" irány nyer, az **`AR-15` szövegét pontosítani
kell**: az elágazás-tilalom a `ReservationStatus` használatára vonatkozik, nem a gomb
láthatóságára. Enélkül a következő futás implementálója ugyanebbe a kétértelműségbe fut bele.

**Nincs javasolt lépés — ez a spec gazdájának döntése.**

> **✅ Kész (2026-07-31).** A döntés: **elrejtjük**, és az `AR-15` szövegét pontosítottuk. Egy külső
> review ugyanezt a következtetést hozta ki, azzal az érveléssel, hogy két spec-mondat ütközését a
> **specben** kell feloldani, nem az implementáló ítéletére bízni — mert az implementáló és a
> validátor védhető olvasata is szétmehet, és pontosan ez történt.
>
> Amit tettünk: (1) az `AR-15` hatóköre a **foglalás-megjelenítésre** szűkült, ahogy eredetileg
> szánva volt; (2) új **`AR-20`** mondja ki mérhetően, hogy a `delivered` soron nincs vezérlő;
> (3) a `plan.md` 4.6 megengedő mondata („elrejtheti") mérhető állítássá élesedett.
>
> Miért nem sérül a 4.6 elve: a kliens továbbra sem dönti el, **melyik** átmenet érvényes — csak
> azt, hogy egy **végállapotú** soron nincs mit felkínálni. Az ítélet minden felkínált műveletnél
> a szerveré marad.
>
> **Ráadás, amit a lánc nem vett észre:** a `client/test/AdminOrders.test.tsx` korábbi esete a
> `delivered` soron **409-es elutasítást mockolt** („A kiszállított rendelés státusza már nem
> módosítható."), holott az `OrderTransitions` engedi a `delivered → delivered` átmenetet, és az
> `OrderService` idempotenssé teszi (K-36) — a valódi szerver **200**-zal felel. A teszt tehát nem
> létező szerver-viselkedést rögzített. Ez a mockolt tesztek ismert kockázata (lásd **D1**), és
> most javítva lett.

---

# D · Külön spec kell

## D1 — End-to-end fedés hiánya

**Mit vett észre.** *A [`Review.md`](../orchestration/admin-orders/Review.md) záró elemzése.*
Az `AR-12`…`AR-15` **mockolt `api` modullal** van igazolva, az `AR-01`…`AR-11` HTTP-n, de
kliens nélkül. A validátor futtatott élő `curl`-t a végponton, de **senki nem nyitotta meg a
`/admin/orders` oldalt futó backend ellen.**

**Miért számít.** A mock azt adja vissza, amit a teszt írója **elképzelt** a szerverről, nem
azt, amit a szerver ad. Itt ezt két dolog tompítja — a típusok mindkét oldalon ugyanabból a
`plan.md` szerződésből származnak, és a válaszalakot a validátor élőben látta —, de a lánc ezt
**nem bizonyította**. Ez nem az ellenőrzés hiánya, hanem a **DoD-listáé**: a 18 pont között
egyetlen end-to-end feltétel sem volt.

**Kemény korlát a megoldásra.** A repóban **nincs böngésző-alapú tesztfuttató**, és új
függőséget nem veszünk fel kérdés nélkül (sem npm, sem Maven). Ezért a javasolt lépés **nem**
egy e2e keretrendszer bevezetése, hanem egy **dokumentált kézi füstteszt-forgatókönyv**: a
`./start.sh` (Windowson `.\start.cmd`) felhozza a teljes stacket, és a forgatókönyv végigvezet
a lista betöltésén, egy szűrésen, egy keresésen és egy státuszváltáson.

> Az ehhez tartozó **`AR-19`** kritérium már bekerült a `spec/admin-orders/requirements.md`-be —
> lásd a változásnaplót. A forgatókönyv megírása maradt hátra.

## D2 — Szűrés a vevő rendeléseire

**Mit vett észre.** *Az F-implementáló.* Az admin listán hasznos lenne a rendelés `userId`-jára
szűrni — például a vevő nevére kattintva.

**Miért számít.** A mai `search` a **snapshot** mezőkre illeszkedik (leadáskori név, e-mail),
tehát ha a vevő időközben nevet változtatott, a régi és az új rendelései nem jönnek együtt. A
`userId`-alapú szűrés ezt megoldaná — de ez **új query paraméter**, tehát új szerződés.

**Miért kell spec.** Új végpont-paraméter → `vegpontok.md`-szintű változás, új `AR-xx` pontok,
és el kell dönteni, mi történik törölt fiók esetén.

## D3 — A `search` lekérdezésbe tolása + index

**Mit vett észre.** *A B-implementáló.* Ma a teljes rendeléshalmaz betöltődik, és a `search` +
lapozás memóriában fut. „A katalógusnál ez a méret miatt biztonságos, a rendeléseknél nem
örökre."

**Miért nem most.** Ez **sémaváltozás**: `LOWER()` index a `customer_name` / `customer_email`
mezőkre → **új Flyway-migráció**. A B-implementáló ezért nem is csinálta meg — a spec tiltotta.

**És miért kell hozzá valószínűleg ADR.** A `Catalog` osztálydokumentációja **kifejezetten
indokolja, miért nem SQL-ben szűrünk**: a szűrés/lapozás szemantikája a HTTP-szerződés része a
legapróbb részletekig — a `category` a paramétert **és** az értéket is trimmelve hasonlítja, a
nem szám `minPrice` némán kimarad, a `page` vágódik. SQL-be fordítva minden ilyen apróság külön
elcsúszási pont lenne (`LIKE` és kollációk, `OFFSET` az utolsó oldal mögött, `NULL`-kezelés).

Ezt az indoklást **felülírni csak tudatosan szabad**, és a rendelés-listánál más a helyzet, mint
a katalógusnál (a rendelésszám monoton nő, a termékszám nem). A döntést és a határt — hány
rendelésnél éri meg — ADR-be érdemes írni, az [ADR-0005](../adr/0005-keszletfoglalas-es-lejart-rendeles.md)
mintájára, ami szintén egy tudatosan vállalt korlátot rögzít.

> **✅ Kész (2026-07-31), egy fontos korrekcióval.** A `search`, a státusz-szűrés **és** a lapozás
> átkerült a lekérdezésbe; a HTTP-szerződés karakterre változatlan (`AdminOrderListTest` érintetlen
> asszertálásokkal zöld). Az indoklás: [ADR-0009](../adr/0009-admin-rendeleslista-sql-lapozas.md).
> A tétel egy külső review nyomán került sorra, amely ugyanezt a hiányosságot találta meg — és
> helyesen mutatott rá a `@EntityGraph` + `Pageable` csapdára is (`HHH90003004`).
>
> **A tétel címében szereplő „+ index" viszont téves volt, és nem valósult meg.** A javasolt
> `LOWER()` btree index ezen a lekérdezésen **semmit nem érne**: a minta `%needle%` alakú, vezető
> jokerrel, amit btree nem tud kiszolgálni. Aki ezt a sort a jövőben olvassa, ne induljon el a
> `CREATE INDEX ... (LOWER(customer_name))` irányba — nem az a megoldás.
>
> Ezért **nem** készült Flyway-migráció (így az `AR-17` sem sérült). A refaktor nyeresége nem az
> I/O, hanem hogy megszűnt a teljes halmaz **materializálása** JPA entitásként — 50 000 rendelésnél
> tételenként hárommal ez nagyságrendileg 200 000 sor volt egy 25 soros lap kiszolgálásához.
>
> **Ami tényleg hátravan, ha egyszer index kell** (új tétel, külön spec): `pg_trgm` GIN index a
> `lower(customer_name)` / `lower(customer_email)` kifejezésekre a vezető jokeres kereséshez, és
> egy `orders (seq)` index a rendezéshez — ma csak `(user_id, seq)` és `(status)` létezik. Mindkettő
> migrációt kíván, tehát nem fér bele egy „nincs sémaváltozás" keretbe.

---

# E · Folyamat — a láncról, nem a feature-ről

## E1 — A lánc bizalmi egypontja és a teszt-önigazolás

**Mit vett észre.** *A [`Review.md`](../orchestration/admin-orders/Review.md).* Két szerkezeti
megfigyelés, amit a „18/18" elfedne:

1. **Az orchestrátor egyetlen DoD-pontot sem ellenőrzött saját méréssel** — ez szándékos (a
   skill alapszabálya), de a következmény, hogy a teljes mérleg **egyetlen ügynök
   becsületességén** nyugszik. Ha a validátor hamis `[teljesül]`-t adna, ebben a láncban semmi
   nem fogná el.
2. **A teszteket ugyanaz az ügynök írta, mint a kódot.** Egy félreértett követelmény így
   *egyszerre* kerül a kódba és a tesztbe, és a teszt zöld lesz. Ellene a validátor azt nézte,
   hogy a megnevezett teszt **tényleg azt asszertálja-e**, amit a kritérium kér — de független
   tesztet **nem írt**, mert a definíciója tiltja a fájlmódosítást.

**Lehetséges válasz — nem javaslat, megfontolandó.** Egy `test-runner` kör a validátor **után**,
ami független tesztet írhat a leggyengébben fedett kritériumokra. Ez viszont a lánc hosszát és
költségét is növeli, és a `spec-validator` „csak olvas" elvének a szépsége épp az, hogy nem
keveredik bele a bizonyítékok előállításába. **Ez terméktulajdonosi döntés a láncról**, nem
hibajavítás.

---

## Mi NEM került a listára, és miért

- **A `spec-researcher` „nyitott kérdései"** (a lekérdező szolgáltatás neve, az `AdminOrderView`
  felépítése) — az implementálás során **lezárultak**, a jelentett javaslat szerint.
- **A B-implementáló „eltérései"** (`npm ci` futtatása, a `status="all"` elhagyása a kérésből,
  a null-`userId` védelem) — ezek **magyarázatok** a megvalósult megoldáshoz, nem hátralévő
  munka. Az `npm ci`-t a validátor `git diff`-fel igazolta: függőség nem változott.
- **A `ProductFilterTest` `tests="0"` surefire-jelensége** — mérési **olvasási csapda**, nem
  hiba. A validátor ellenőrizte: 47 `<testcase>` a `@Nested` XML-ekben, mind zöld.
- **Bármi, ami nem hangzott el a láncban.** Ez a dokumentum a jelentések desztillátuma, nem
  ötletgyűjtő.
