---
name: spec-konvenciok
description: |
  A webshop kódbázisának kódtérképe és kötelező konvenciói a spec-alapú fejlesztési
  lánchoz (spec-researcher, spec-implementer, spec-validator), a unit-teszt-íróhoz
  (java-unit-test-writer), a dokumentáció-íróhoz (docs-api-writer), a teszt-futtatóhoz
  (test-runner), valamint a hibakeresőhöz (debugger) és a refaktoráló agenthez (refactorer).
  A nyolc agent a frontmatter `skills:` mezőjével tölti be indításkor — ez a konvenciók
  egyetlen forrása.
---

<!-- ellenoriz: meret-kivetel max=370 — konvenció-skill, amit az agentek a frontmatter skills: mezőjével egészben töltenek be; egy references mappába tett része egyikhez sem jutna el magától, és a projekttények egyetlen otthona szétesne -->

# Kódtérkép és konvenciók

Ezt a leírást a `spec-researcher`, a `spec-implementer`, a `spec-validator`, a
`java-unit-test-writer`, a `docs-api-writer`, a `test-runner`, a `debugger` és a `refactorer`
kapja meg indításkor. **Kiindulópont, nem bizonyíték:** minden állítást a tényleges fájlból kell
igazolni, mielőtt bárki épít rá. Ha eltérést találsz a leírás és a kód között, a **kód**
az igazság — és az eltérést jelenteni kell.

**A projekttények egyetlen otthona ez a fájl.** Az agentek szándékosan nem tartalmaznak
csomagnevet, annotációt, útvonalat, parancsot vagy portszámot: ők a szerepet, a módszert és
a kimeneti szerződést hordozzák, a projekt tényeit pedig innen veszik, szakasznévre
hivatkozva. Tudatos kivétel a `java-unit-test-writer` és a `spec-implementer`: néhány
projekttényt (tesztfa-útvonal, `IntegrationTest`, build-fájlnevek) inline is hordoznak — ha
egy ilyen változik, **mindkét** helyen igazítani kell. Ha egy tény két helyen él, előbb-utóbb szétcsúszik — ez a szétcsúszás már
megtörtént egyszer (a lint-parancs hiánya), ezért van így felosztva. **Új projekttény ide
kerül, ne az agent-fájlba.**

> **A backend Java/Spring Boot + PostgreSQL** (`server-java/`). A korábbi Node/Express +
> lowdb implementáció törölve lett ([ADR-0006](../../../docs/adr/0006-atvaltas-a-java-backendre.md)).
> Ha valahol `server/`, lowdb, `wrap()` vagy `requireAuth` middleware szerepel, az elavult
> hivatkozás — jelentsd.

---

## 1. Kódtérkép

### Backend — csomagok

A csomagok **funkció szerint** vannak vágva, nem réteg szerint: nincs `controller/`,
`service/`, `dto/`. Egy végpont megértéséhez egy mappát kell megnyitni.

| Csomag (`server-java/src/main/java/hu/webshop/`) | Tartalom |
|---|---|
| `auth/` | bejelentkezés, regisztráció, admin felhasználókezelés, rate limiting |
| `catalog/` | termékek: vásárlói és admin lekérdezés, szűrés, lapozás, validáció |
| `order/` | rendelés leadása, státuszváltás, lejárati ütemező |
| `review/` | értékelés beküldése, publikus lista, moderáció |
| `stock/` | készletfoglalás és fedezetellenőrzés |
| `security/` | munkamenet, hitelesítés, jogosultság (interceptor + argumentum-feloldó) |
| `bootstrap/` | induló állapot (seed katalógus, seed admin) + `db.json` importáló |
| `common/` | hibaszerződés: `ApiException`, `GlobalExceptionHandler`, `Messages` |
| `config/` | konfigurációs kulcsok (`AppProperties`), webréteg, Jackson |
| `domain/` · `repo/` | JPA entitások és Spring Data repositoryk — a közös kivételek |
| `ops/` | napló, e-mail, statikus kiszolgálás, életciklus |

A hozzáférés-vezérlés **útvonalminta alapján**, egyetlen ponton van bekötve: a
`config/WebConfig` két mintalistája két interceptorhoz köt — `PROTECTED_PATTERNS` →
`security/AuthInterceptor` (401), `ADMIN_PATTERNS` → `security/AdminInterceptor` (403) —, nem
végpontonkénti annotációval. Egy új `/api/admin/**` végpont tehát automatikusan védett.
Egy új, **nem admin**, de belépéshez kötött útvonal (pl. `/api/kuponok`) viszont **nem**: azt
a `PROTECTED_PATTERNS`-be fel kell venni, különben token nélkül is kiszolgálódik. Mindkét
esetet a `spec-validator`-nak mérnie kell (token nélkül 401, customer tokennel 403).

### Backend — séma

A séma **kizárólag** Flyway-migrációból jön
(`server-java/src/main/resources/db/migration`), az alkalmazás soha nem hozza létre
(`ddl-auto: validate`). Sémaváltozás = **új migrációs fájl**, a meglévő módosítása nélkül.

Két visszatérő döntés a sémában:
- `seq` oszlop a beszúrási sorrendhez — minden listázás `ORDER BY seq`, mert relációs
  tárolásnál a sorrendet semmi más nem garantálja, a listák sorrendje viszont szerződés.
- `order_items.product_id` és `orders.user_id` **szándékosan nem idegen kulcs**, a
  `name`/`unit_price` pedig másolat, nem vezetett adat: a rendelés önálló bizonylat
  ([ADR-0001](../../../docs/adr/0001-rendelesi-tetel-snapshot.md)).

### Kliens

`client/src/api.ts` (fetch-hívók **és** a tükrözött típusok) · `client/src/pages/*.tsx` ·
`client/src/{main,App,auth,cart,catalog,ui}.tsx` (belépő, útvonalak, kontextusok, közös
UI-elemek) · `client/src/{RequireAuth,RequireAdmin}.tsx` (útvonal-őrök) ·
`client/src/{AddToCart,CartDrawer,CatalogFilter,ProductReviews,ReservationStatus,Reorder,SessionExpiredNotice,Stars,ThemeToggle}.tsx`

A lista pillanatkép — új komponens előtt `Glob client/src/*.tsx`, hogy ne írj meglévő őrt
vagy UI-segédet újra.

Az újrafelhasználható komponensek **laposan** a `client/src/` alatt élnek (nincs
`components/`, `lib/`, `hooks/` mappa); csak a routolt képernyők vannak a `pages/`-ben.

### Tesztek

A tesztek **nem** a forrás mellett vannak:

- `server-java/src/test/java/hu/webshop/` — a főcsomagok tükre. Az integrációs tesztek a
  `support/IntegrationTest`-ből származnak: **valódi Postgres** (Testcontainers, singleton
  konténer) és **valódi HTTP** (`RANDOM_PORT` + `TestRestTemplate`). Minden teszt előtt
  ürülnek a táblák, majd lefut az induló állapot.
- `client/test/` — komponens- és unit tesztek, `client/test/dom-setup.ts` környezettel.

**Minden előfeltétel a publikus API-n keresztül épül** (a konformancia B-1…B-4 lépései).
Adatbázis-hozzáférés csak *állításhoz* használható, előfeltételhez nem.

### Egyéb mérvadó források

- `CLAUDE.md` — a projekt működési szabályai
- `CONTEXT.md` — fogalomtár; **a szóhasználat mérvadó forrása**
- `docs/adr/0001…0009` — architekturális döntések (rendelési tétel snapshot, kétrétegű
  backend-spec, invariánsok atomicitása, Java/Spring/Postgres migráció, készletfoglalás
  és lejárt rendelés, az átváltás, a kliens IP kiolvasása az `X-Forwarded-For` láncból,
  a munkamenet-token lenyomatként tárolása, az admin rendeléslista SQL-oldali lapozása és
  szűrése — listás feature előtt ezt olvasd). Ha egy kérdésre a spec nem válaszol, itt
  lehet a válasz.

---

## 2. Kötelező konvenciók

- **Hibaválasz:** mindig `{ error: "..." }`, **magyar** szöveggel — a szó szerinti üzenetek
  a `common/Messages`-ben, a katalógusuk a `spec/backend/hibakatalogus.md`-ben. Kezeletlen
  hiba → 500 `{ error: "Váratlan szerverhiba." }` a `GlobalExceptionHandler`-ből. A
  hibaválasz soha nem tartalmaz belső azonosítót, hasht, tokent, kivételtípust vagy vermet.
- **Szerződéses hiba:** `ApiException` a saját státuszkódjával; nincs szükség
  async-burkolóra, a keretrendszer kivételkezelője elkap mindent.
- **Auth:** a belépett felhasználó a `@CurrentUser` argumentumból jön, **soha** a kliens
  által küldött törzsből (pl. az értékelés `author` mezőjét a szerver a tokenből származtatja).
- **Tranzakció és zárolás:** a fedezetellenőrzés és a rendelés beszúrása **egy**
  tranzakcióban, a termék sorát zárolva (I-5, [ADR-0003](../../../docs/adr/0003-invariansok-atomicitasa.md)).
  Az invariánsokat, ahol lehet, **adatbázis-megszorítás** védi (`LOWER()`-es unique index a
  felhasználónévre és e-mailre, `(product_id, author)` unique index, `CHECK` a mennyiségekre)
  — nem csak alkalmazásszintű ellenőrzés.
- **Query paraméterek `String`-ként** kötődnek, és az értelmezésük a szerződés része (nem
  szám érték kihagyása, `page` vágása). `Integer`-ként kötve egy elgépelt `?page=abc` 400-at
  adna az „első oldal" helyett.
- **Típusok:** a Java válasz-DTO-k és a `client/src/api.ts` **külön** definiálja ugyanazt az
  alakot (nincs közös csomag) — shape-változásnál **mindkettő** módosul.
- **A `Product` alakját ne módosítsd:** a kliens és a localStorage-kosár erre támaszkodik.
- **Árak:** integer HUF (forint), tizedesjegy nélkül. A rendelés végösszegét a szerver
  **újraszámolja** a DB-árakból, a klienstől kapott árat sosem hiszi el.
- **Kliens TS-cél:** a `client/tsconfig.json` `lib` értéke **ES2020** — az `Array#at`,
  `Object.hasOwn` és társaik elbuktatják a `tsc`-t. Index-aritmetikát használj.
- **Nyelv:** a felhasználónak szánt szövegek, a kódkommentek és a naplóüzenetek **magyarul**.
- **Függőségek:** új függőséget felvenni és meglévőt frissíteni **csak előzetes egyeztetés
  után** szabad (`CLAUDE.md`) — sem npm, sem Maven oldalon.
- **Hitelesítő adat kizárólag környezetből** származhat, forráskódba nem kerülhet (spec 7.6).

---

## 3. Ellenőrző parancsok

**Ez a lista a kanonikus forrás** — a spec-lánc agentjei erre a szakaszra hivatkoznak, és
nem tartanak saját másolatot belőle. A parancsokat futtatás előtt így is a
**`package.json`-ból és a `pom.xml`-ből ellenőrizd**, ne fejből idézd.

| Hol | Parancs | Mit csinál |
|---|---|---|
| gyökér | `npm test` | a kliens Vitest suite-ja egyszer |
| gyökér | `npm run build` | a kliens fordítása (`tsc && vite build`) |
| gyökér | `npm run lint` | ESLint a `client/`, a `spec/backend/conformance/` és az `e2e/**/*.mjs` felett (`lint:fix` az autofix). Worktree-ben a **munkafa** gyökeréből futtasd (`cd .claude/worktrees/<név> && npm run lint`): a fő fa lintje a `.claude/worktrees/**`-t kihagyja. A láncban a mérvadó lint a merge utáni, fő fán futó (`feature-implement` 4. lépés) |
| gyökér | `npx tsc --noEmit -p client/tsconfig.json` | típusellenőrzés — a lint típus-tudatos szabályai szándékosan ki vannak kapcsolva, a típushibát **ez** fogja meg |
| gyökér | `npm run dev` | a kliens dev szervere (`5173`) |
| `server-java/` | `mvn clean test` | a teljes JUnit suite — **Dockert igényel**. A `test` fázisra egy `jacoco:check` kapu is kötve van (90% ág a `pom.xml` `check-unit-tested-classes` listájának osztályain), tehát egy lefedettség-csökkenés is piros build |
| `server-java/` | `mvn -o jacoco:check@check-unit-tested-classes` | csak a lefedettségi kapu, a meglévő `jacoco.exec`-ből, a suite újrafuttatása nélkül — **pontosan ebben az alakban**, további kapcsoló nélkül (az engedélylista ezt a teljes parancsot engedi). Az ítélete csak egy előző **szűretlen**, tiszta futás után mérvadó |
| `server-java/` | `docker compose up -d` | fejlesztői Postgres (`down -v` = teljes reset) |
| `server-java/` | `mvn spring-boot:run -Dspring-boot.run.profiles=dev` | a backend (`3001`). A `dev` profil nélkül el sem indul: a `DATABASE_PASSWORD`-nek nincs alapértéke |
| gyökér | `./start.sh` | adatbázis + backend + kliens egyben (Ctrl+C mindet leállítja) |
| gyökér | `.\start.cmd` | ugyanaz Windows terminálból — a `start.sh`-t hívja Git Bashsel |

**A lint nem elhagyható:** a CI-nak külön, **blokkoló** `lint` jobja van (ESLint + `tsc` +
shellcheck + sorvég-őr). Egy „zöld build és zöld teszt" jelentés lintelés nélkül olyan kódot
nyilváníthat késznek, amin a CI piros.

**Friss worktree-ben `npm ci`, sosem `npm install`.** A lánc munkafái (`.claude/worktrees/…`)
`node_modules` nélkül indulnak: build, teszt és lint előtt `npm ci` a munkafa gyökerében (az
`e2e/`-ben külön). A `ci` a lockfile-hoz ragaszkodik; az `install` átírhatja a
`package-lock.json`-t — az függőségváltozás, és a `spec-guard.mjs` tiltja is.

**`mvn test -Dtest=…` csapda:** a `-Dtest` szűrő **nem futtatja a `@Nested` osztályokat** —
a surefire kiválasztja a külső osztályt, `Tests run: 0`-t ír, és **zölden lép ki**. Kilenc
unit-teszt osztály így van felépítve. Egy szűrt futás, ami `Tests run: 0`-t ír, **bukás,
ami sikernek látszik** — teljes `mvn test` a mérce. Egy szűrt futás ráadásul a `jacoco:check`
kaput is pirosra futtathatja (a lista többi osztálya 0%-on áll): iteráláshoz
`-Djacoco.skip=true`, a mért számhoz szűretlen `mvn clean test`.

**A futó API mérése — health és `curl`.** Mielőtt bármit a futó backend ellen mérsz, nézd
meg, fut-e: `curl -s http://localhost:3001/api/health`. Ha nem válaszol, a futásidejű ítélet
`[kétséges]` (vagy a hívónak jelentett akadály), nem bukás. A `curl` alakja **kötött**: az URL
áll **közvetlenül** a `curl -s` után, minden kapcsoló utána — mert az engedélylista mintája
`Bash(curl -s http://localhost:3001/*)` (`.claude/settings.json`), és egy `curl -X POST -s …` vagy
`curl -H … http://…` alak nem illeszkedik rá (a háttérben futó agent engedélykérésen akad el):

```bash
curl -s http://localhost:3001/api/... -X POST -H "Content-Type: application/json" -d '{"…": "…"}'
curl -s http://localhost:3001/api/... -o /dev/null -w "%{http_code}"     # csak a státuszkód
```

Tokent igénylő hívásnál a `-H "Authorization: Bearer <token>"` szintén az URL **után** jön.

**A szerződés HTTP-szintű ellenőrzése** egy futó backend ellen (a 70 esetből 54; a maradék
16 `⚙` az `mvn test`-ben van). A futtató kapcsolói (`spec/backend/conformance/run.mjs`
fejléce): `--base-url <url>`, `--clean-store`, `--skip-rate-limit`, `--only K-01,K-20`.

- **A láncban — használt adatbázison — így:**
  `node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --skip-rate-limit`,
  `--clean-store` **nélkül**.
- **A `--clean-store` nem töröl semmit**: azt állítja, hogy a backend **friss, üres**
  adattárolóval indult, és ezzel bekapcsolja a darabszám-érzékeny eseteket (K-05, K-48, K-49,
  K-77). Használt adatbázison ezek a korábbi futások adatain hamisan buknak; nélküle
  kimaradnak (`⊘`). **Csak friss** adatbázison használd — `cd server-java && docker compose
  down -v` és a backend újraindítása után.
- **A `--skip-rate-limit`** kihagyja a K-50 / K-51 esetet. A K-51 **15 percre kizárja** a
  futtató IP-címét a bejelentkezésből, és a korlát perzisztens (a szerver újraindítását is
  túléli) — enélkül a lánc további lépései (újravalidálás, az e2e futás bejelentkezései) 429-be
  futnak. A futtató ilyenkor `2`-vel lép ki („a seed admin bejelentkezése 429-et kapott").

**Docker hiánya nem kódhiba:** ha a Testcontainers `Could not find a valid Docker
environment` hibával áll le, azt jelenteni kell, nem a feature bukásaként értelmezni.

**Portütközés:** a `3001` / `5173` / `5432` ütközhet más futó projekttel. Ha a port foglalt,
vagy nem a mi szerverünk válaszol, azt **jelenteni** kell — nem szabad belőle a feature-re
következtetni.

---

## 4. Statikus ellenőrzési fogódzók

Amit egy állítás igazolásakor a leggyakrabban elnéznek ebben a kódbázisban — ezért lesz
hamis a jelentés:

- **A teljes útvonal** az osztály `@RequestMapping`-jéből **és** a metódus leképezéséből áll
  össze. A metóduson látott `/{id}` önmagában nem útvonal.
- **Jogosultság:** útvonalminta alapján, a `config/WebConfig` két listájában
  (`PROTECTED_PATTERNS` → `AuthInterceptor`, `ADMIN_PATTERNS` → `AdminInterceptor`). Egy új
  admin végpont *elvileg* automatikusan védett; egy új, nem admin védett útvonal csak akkor,
  ha a `PROTECTED_PATTERNS`-ben szerepel. Mindkettőt **mérni kell**: token nélkül 401,
  customer tokennel 403.
- **Séma:** sémaváltozáshoz **új** Flyway-migráció kell. Ha a JPA entitás új mezőt kapott
  migráció nélkül, az indulás `ddl-auto: validate` mellett elszáll — ezt egy zöld unit teszt
  nem feltétlenül mutatja meg.
- **Megszorítás vs. kód:** ha az invariánst csak alkalmazásszintű `if` védi, holott
  kifejezhető unique indexszel vagy `CHECK`-kel, azt jelezni kell — versenyhelyzetben az
  `if` nem tart.
- **Típustükrözés:** a Java válasz-DTO és a `client/src/api.ts` **külön** van definiálva;
  a tükrözés elmaradása valódi hiba.
- **Tesztek:** nem az a kérdés, létezik-e a megkövetelt teszteset, hanem hogy **tényleg azt
  asszertálja-e**. Egy létező, de mást mérő teszt nem bizonyíték. Az integrációs teszt
  előfeltétele **kizárólag** a publikus API-n épülhet; a közvetlen adatbázisírás
  előfeltételként hamis zöldet ad.

`Grep`-pel megerősíthető konkrétumok: a szó szerinti magyar hibaüzenetek (`error:`,
`Messages.`), a státuszkódok (`ApiException`, `HttpStatus`), az auth-bekötés
(`@CurrentUser`), az útvonalak (`@GetMapping`, `@RequestMapping`), a tranzakcióhatár
(`@Transactional`).

---

## 5. A spec-mappa: fájlszerepek és jelölések

A `spec/{feature}/` mappa mérete nem kötött. A tipikus szerepek:

| Szerep | Tipikus fájlnév | Mit ad |
|---|---|---|
| követelmény | `requirements.md` | a viselkedés normája, kész-kritériumok |
| terv | `plan.md` | fázisok, érintett fájlok, az interfész szerződése |
| feladatlista | `tasks.md` | munkaegységek, „kész, ha" feltételek |
| végpont-referencia | `vegpontok.md` | útvonalak, kérés/válasz alakok, státuszkódok |
| hibakatalógus | `hibakatalogus.md` | a **szó szerinti** hibaüzenetek és státuszkódok |
| elfogadási esetek | `konformancia.md` | számozott esetek (`K-xx`), nyelvfüggetlenül |

**A mellékletek is normatívak** — sőt, a végpont viselkedését gyakran pontosabban írják le,
mint a fő követelményfájl. A tesztek a hibakatalógus szövegeire asszertálnak.

**Kész-kritérium keresési sorrendje:** `- [ ]` DoD lista → „Kész, ha:" sorok a
feladatlistában → számozott konformancia-esetek (`K-xx`) → `MA IS` / `ÚJ` jelölések.

**`*Gazda:*` sorok és a foglalt `V`:** a `tasks.md` `*Gazda:* X` sora mondja meg, melyik
munkacsomag hajtja végre a munkaegységet; a csomagok fájltulajdona a `plan.md` 3. szakaszában,
a függőségeik az 5. szakaszban („Munkacsomagok és függőségeik") vannak. A **`V` betű foglalt**:
a záró átvételi blokké, amit a `spec-validator` mér — implementálói csomag nem kaphatja, és az
implementáló a `*Gazda:* V` munkaegységeket nem hajtja végre.

**Jelölések a `spec/backend/`-ben:** a `MA IS` / `ÚJ` **történeti** — ma minden szabály
`MA IS`, a címkék csak a dokumentum olvasási történetét őrzik. A `FORRÁS` viszont **élő**:
a régi, sémátlan JSON-tároló sajátosságait írja le, amelyek egy `db.json` importálásakor
ma is érvényesek (`bootstrap/DbJsonImporter`).

### Nem minden `spec/*/` mappa élő norma

A `spec/*/` listázása ma hat mappát ad, és ebből három **történeti** — **nem** megbízás:

| Mappa | Állapot |
|---|---|
| `spec/backend/` | **élő norma** — a backend viselkedésének szerződése |
| `spec/admin-orders/` | **élő** feature-spec, a lánc mai kimeneti mintája — a `plan.md` 5. szakaszát kivéve, ami a régi, delegálást leíró alak. A validátor 4 ismert HIBA-t ad rá: `AR-17`, `AR-20`, `AR-21` munkaegység nélkül (lásd a változásnaplóját), és a régi alakú 5. szakasz (10. ellenőrzés) |
| `spec/edit-user-data/` | **élő**, megvalósult — de **szándékosan rontott** minőségű gyakorló spec (`modifs.md`); a validátor 29 HIBA-jából 28 ebből jön, várt, a 29. a régi alakú 6. („Felbontás") szakasz. A rontás előtti alak és az audit: `docs/edit-user-data/` |
| `spec/admin-role/` | történeti (2026-07-22, Node/lowdb) — megvalósult |
| `spec/review-and-rating/` | történeti (2026-07-23, Node/lowdb) — megvalósult |
| `spec/termek-felhasznaloi-ertekeles/` | történeti (2026-07-25, Node/lowdb) — **a leírt végpont ma nem létezik** |

Mindhármuk `requirements.md`-je idézetblokkos státuszfejléccel kezdődik, ami ezt kimondja
— **ezt olvasd el először**, ha egy ilyen mappa a bemeneted. Amit tudni kell róluk:

- A bennük szereplő `server/…` útvonalak, a lowdb és a `db.json` a **törölt** Node
  backendre utalnak (ADR-0006). Ha egy ilyen fájlt hivatkozol, azt kódtérképnek ne vedd.
- Az **alakjuk** is korábbi: kipipált checkboxok, hiányzó kritérium-azonosítók és
  `*Kész, ha:*` sorok. A spec-validátor
  (`.claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs`) mindhármat elutasítja
  — ez **várt**, nem javítandó regresszió.
- Utólag **nem** írjuk át őket (a `spec-guard.mjs` gépileg is tiltja). Ha a tartalmuk újra
  kell, az **új** feature: új spec-mappa a `feature-spec-writer`-rel.
- Ha a fejlesztő nem mondta meg, melyik mappára gondol, a visszakérdezésben a hármat
  jelöld történetiként — ne ajánld őket megvalósításra.

---

## 6. Prózanyelv

**A projekt prózanyelve magyar.** Ide tartozik minden felhasználónak szánt szöveg, a
kódkomment, a naplóüzenet, a Gherkin-próza és **az agentek jelentései** is.

Az egyetlen kivétel az **azonosítók** szintje: a Java teszt-metódusnevek és a `@Nested`
osztálynevek **angolok** (`rejectsInvalidField`, `class PriceAspects`). A `@DisplayName`
szövege, a kommentek és — nem alku tárgya — **a várt hibaüzenetek** magyarul maradnak, szó
szerint a hibakatalógusból. A kivétel a Gherkinre **nem** terjed ki: a `.feature` fájlok
magyarok, `# language: hu` fejléccel.

---

## 7. Ismert csapdák

Ezek **szándékos** tulajdonságok, nem hibák — ne "javítsd" őket, ha a spec nem kéri:

- A rendelés leadása nem csökkenti a `stock`-ot, hanem **foglalást** hoz létre. A pénztárnál
  az `available` (= `stock` − aktív `pending` foglalások) dönt, a `stock` pedig csak a
  `delivered`-re váltáskor csökken. A `stock` önmagában tehát sosem mondja meg, mi vehető
  meg — az `available`-t kell nézni.
- A lejárt foglalás addig foglal, amíg az ütemező át nem állítja `expired`-re. Az emiatti
  alulértékesítés egy söprési cikluson át **tudatosan vállalt** — lásd ADR-0005.
- A localStorage-kosár teljes `Product` pillanatképet tárol (árral, készlettel), ami a
  szerverhez képest elavulhat a következő frissítésig.
- A `spec/backend/` jelöléseiről (`MA IS` / `ÚJ` / `FORRÁS`) lásd az 5. szakaszt.
