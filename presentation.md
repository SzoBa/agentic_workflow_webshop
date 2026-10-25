# Bemutató — két feladat, párhuzamos agentekkel, 30 percre

Két feladatot javaslunk. Mindkettőben **legalább három agent fut egyszerre**, és mindkettő
végigvihető nagyjából 30 perc alatt. A közös feltételek:

- **nincs spec-írás, nincs szerződésváltozás, nincs migráció, nincs új függőség** — ezért nem kell
  élő kérdezz-felelek, és nincs szekvenciális spec → kutató → implementáló lánc;
- **diszjunkt fájltulajdon**: minden ágnak saját fájljai vannak, a végén ütközés nélkül egyesíthetők;
- **mérhető kész-kritérium**: JaCoCo-szám, illetve zöld e2e futás — nem az agent saját állítása.

Az orchestrátor a fő session: ő osztja ki az ágakat, ő egyesít, és ő futtatja a záró mérést.
A korábbi két javaslat (admin értékelés-moderáció, rendelés-visszavonás) a
[`docs/backlog/feature-backlog.md`](docs/backlog/feature-backlog.md)-be került, B-8 és B-9
alatt. Mindkettő spec-írással kezdődik, ezért nem fér bele a 30 percbe — lásd a végén.

### Előfeltétel mindkettőhöz

- Docker fut (az 1. feladat záró `mvn clean test`-je Testcontainers-t indít — az iteráció maga
  Docker nélkül megy; a 2. feladat a teljes stacket kéri).
- A háttérben futó subagentek Bash-hívásai **nem kérhetnek engedélyt** — a háttérben senki nem
  válaszol rájuk. Lásd a `.claude/settings.json` `permissions.allow` listáját és a
  `spec-guard.mjs` 2026-11-06-i javítását (idézőjel-tudatos parancsbontás, `.claude/worktrees/`
  kezelése). A háttér-agent a worktree-ben `cd .claude/worktrees/<név> && <parancs>` alakban
  dolgozik — ez illeszkedik az engedélylistára. Régebbi checkoutból ne indítsd.

---

## 1. Unit-teszt legyező — három osztály egyszerre

**Agentek:** 3 × `java-unit-test-writer`, párhuzamosan, **mindegyik saját git worktree-ben**
(`.claude/worktrees/unit-legyezo-unit-<Osztály>`, a munkakönyvtáron belül, ezért ott sem kérdez a
Read/Edit). A futás neve `unit-legyezo-<ÉÉÉÉHHNN-ÓÓPP>`, a branch `feature/unit-legyezo`.

### Mit fed le

Az osztályokat a lánc saját jelöltválasztója adta
(`node .claude/skills/feature-full/scripts/unit-jeloltek.mjs --fajlok …`, mérve 2026-11-06):
mindhárom `JELÖLT`, egyik sincs a `jacoco:check` listáján, és egyik sem `@Transactional` (az
ilyet a script kizárja, mert a tranzakcióhatár integrációs teszt dolga).

| Ág | Osztály | Ág (becslés) | Miért ez |
|---|---|---|---|
| U1 | `auth/AccountService` | 4 | Profilszerkesztés és jelszócsere, a jelenlegi jelszóhoz kötve, találgatási korláttal. Ma **egyetlen** unit tesztje sincs; a repository és a validátor mockolandó együttműködő — itt látszik a Mockito-minta. |
| U2 | `config/AppProperties` | 9 | A spec 7.6 konfigurációs kulcsai: a hiányzó, nem szám, nem véges vagy tartományon kívüli érték **az alapértelmezésre cserélődik**, nem indulási hiba. Tiszta, elágazásos parse-logika, ma csak mellékesen fedi három másik teszt. |
| U3 | `catalog/Catalog` | 18 | A termékkatalógus memóriabeli szűrése és lapozása (`filter`, `paginate`, `categories`, `number`). A `window()`-t a `CatalogWindowTest` már méri, a többi ág ma csak integrációs úton fut. Új osztály: `CatalogTest` — a meglévőt nem írja át. |

### Miért kell a worktree

A `mvn test` a `target/`-be fordít, a `jacoco.exec` pedig **hozzáfűz** a korábbi futásokhoz
(`CLAUDE.md`). Közös munkafában a három ág egymás fordítását írná felül, és egymás lefedettségi
adatait mérné. Három worktree, három `target/` — három tiszta mérés.

### Hogyan iterál az agent — Docker nélkül

A skill minden produkciós metódushoz `@Nested` osztályt ír, a `-Dtest` szűrő pedig `@Nested`-et
**nem** futtat (`Tests run: 0`, és zöld). Ezért az iteráció a skill mért, opcionális **unit-only
receptjével** megy (`test-writer-java-unit/references/coverage-jacoco.md`):

```text
cd .claude/worktrees/unit-legyezo-unit-<Osztály>/server-java && mvn clean test -Dsurefire.excludesFile=<repó>/.scratch/unit-only/excludes.txt
```

Ez kizárja az `IntegrationTest`-leszármazottakat, `-Dtest` nélkül fut (a `@Nested` osztályok is
lefutnak), nem indít Testcontainers-t, és mérve kb. 17 s. A kizáró listát az orchestrátor
**induláskor egyszer** állítja elő a fő fa `.scratch/unit-only/` mappájába. Az agent a
worktree-ben mért számot csak iteráláshoz használja, **nem jelenti** — számot az összefésült fán
futó egyetlen teljes `mvn clean test` ad.

### Fájltulajdon

| Ág | Írhat | Nem nyúlhat |
|---|---|---|
| U1–U3 | a saját `server-java/src/test/java/hu/webshop/<csomag>/<Osztály>Test.java` fájlját és a `docs/test-plans/<Osztály>.md` tervet | produkciós kód, `pom.xml`, `.claude/` — ezt a `unit-test-write` / `unit-test-bash` guard gépileg tiltja |
| orchestrátor | a branch, a worktree-k, az átvétel, a `pom.xml` JaCoCo include-listája | — |

### Menet (kb. 30 perc)

| Idő | Lépés |
|---|---|
| 0–3' | Branch (`git switch -c feature/unit-legyezo`), futásjelző, kiinduló `git status`. A kizáró lista a `.scratch/unit-only/`-ba. Három worktree (`git worktree add .claude/worktrees/unit-legyezo-unit-<Osztály> -b wt/unit-legyezo-unit-<Osztály>-<ÉÉÉÉHHNN-ÓÓPP> HEAD`), és a három delegálás **egy üzenetben**. |
| 3–23' | A három agent párhuzamosan dolgozik, metódusonként, a fenti unit-only futással iterálva. |
| 23–26' | Átvétel ágonként: `git -C <munkafa> add -A && git -C <munkafa> commit`, majd a fő fán `git checkout <ág> -- <a tesztfájl> <a terv>` (a `feature-full/references/unit-teszt-kor.md` 4/b. szerint). Ha az ág a saját két fájlján kívül mást is írt, állj meg. |
| 26–30' | Egyetlen teljes `cd server-java && mvn clean test` (Docker kell). A `pom.xml` listájára csak az az osztály kerül, amelyik ebben a futásban mérten ≥ 90% ágon áll; utána még egy `mvn clean test` a kapuval. Záró commit, a futásjelző törlése. |

### Mit mutat meg

- **Valódi fan-out:** három delegálás egy üzenetben, három worktree; a `futas-mero.mjs` a
  három párhuzamos delegálást egy futás költségeként könyveli.
- **A guard dolgozik:** ha egy osztály varrat híján nem tesztelhető, az agent nem írja át a
  produkciós kódot, hanem javaslatként jelenti — a guard meg sem engedné.
- **Szám, nem állítás:** a lefedettséget a `jacoco.csv` adja, nem az agent jelentése. A teljes
  suite száma az integrációs tesztek ágait is tartalmazza; a unit-only szám mellette mutatja,
  mennyit fednek maguk az új tesztek.

### Kész, ha

- **U-1** három új tesztosztály van (`AccountServiceTest`, `AppPropertiesTest`, `CatalogTest`),
  angol metódusnevekkel és szó szerinti magyar hibaüzenetekkel;
- **U-2** a teljes `mvn clean test` után a `jacoco.csv` szerint mindhárom osztály BRANCH-lefedettsége
  ≥ 90% — és a unit-only receptből mért szám is a jelentésben van;
- **U-3** a `pom.xml` include-listája 10 → 13 osztály, és a `mvn -B test` zöld;
- **U-4** három terv van a `docs/test-plans/` alatt;
- **U-5** `git diff --stat main -- server-java/src/main` **üres**.

### Indítás

```text
Három párhuzamos java-unit-test-writer, mindegyik saját worktree-ben (.claude/worktrees/):
AccountService, AppProperties, Catalog. Iterálás a unit-only recepttel; a végén átvétel,
egy teljes mvn clean test, a 90%-ot mérten elérő osztályok a pom jacoco:check listájára.
```

---

## 2. Vevői út e2e-ben — három szcenárió-csomag egyszerre

**Agentek:** 3 × `e2e-test-writer`, párhuzamosan, **mindegyik saját worktree-ben**
(`.claude/worktrees/vevo-e2e-<ág>`), egy közös futó stack ellen. Ez a backlog **B-5** tétele: a
vásárlási utat ma böngészőből semmi nem méri. A futás neve `vevo-e2e-<ÉÉÉÉHHNN-ÓÓPP>`, a branch
`feature/vevo-e2e`.

A felület kész, tehát itt nincs mit implementálni. **A kód az igazság**: az e2e-író a meglévő
viselkedést rögzíti, és ha a felület eltér a `spec/backend/`-től, azt jelenti, nem igazítja.

### Miért külön worktree, ha a fájlok diszjunktak

A Cucumber **minden** futásnál **minden** lépésfájlt betölt (`e2e/cucumber.mjs`:
`import: ["steps/**/*.mjs"]`). Közös munkafában bármelyik ág félkész fájlja — egy szintaxishiba
vagy egy duplikált lépésszöveg — a másik kettő saját futását is elbuktatja (`Ambiguous` vagy
betöltési hiba), és ők a másik fájljához nem nyúlhatnak. Külön munkafában minden ág csak a
meglévő vázat és a saját fájljait látja. Minden worktree saját `e2e/node_modules`-t kap
(`cd .claude/worktrees/vevo-e2e-<ág>/e2e && npm ci`); a Playwright-böngésző a közös cache-ből jön.

### A három csomag és a kész-kritériumai

| Ág | Kész, ha (azonosítóval — ezt kapja az e2e-író szó szerint) | Ami benne a csapda |
|---|---|---|
| E1 — katalógus és kosár | **E1-1** a terméklistáról a saját fixture-termék termékoldala megnyílik; **E1-2** „Kosárba” után a kosároldalon a termék 1 db-bal, helyes egységárral szerepel; **E1-3** a mennyiség növelése után a végösszeg = egységár × mennyiség | A kosár `localStorage`-ben él, teljes `Product` pillanatképpel. |
| E2 — checkout és foglalás | **E2-1** belépett vevő a kosárból leadja a rendelést, és a visszaigazolás megjelenik; **E2-2** a rendelés státusza `pending`; **E2-3** az API szerint a termék `available` értéke a mennyiséggel csökkent, a `stock` változatlan | **`stock` ≠ `available`** (`CLAUDE.md` 1. csapda): az E2-3 az API-n mér, nem a felület szövegéből. |
| E3 — rendeléseim és újrarendelés | **E3-1** a meglévő rendelés (`this.ujRendeles()`) megjelenik a „Rendeléseim” listán; **E3-2** a rendelés „Végösszeg”-e a rendeléskori árból számolt, tárolt összeg (a tételsor csak nevet és mennyiséget mutat); **E3-3** az ár megváltoztatása után az újrarendelés a **mai** áron teszi a tételt a kosárba | A rendelés tételei **pillanatképek** (ADR-0001), az újrarendelés viszont a mai áron dolgozik (`client/src/Reorder.tsx`). És az újrarendelés gombja **csak `expired` rendelésen** jelenik meg (`Reorder.tsx`: `order.status !== "expired"` → nincs gomb), a `this.ujRendeles()` viszont `pending` rendelést ad — az E3-3 előfeltétele ezért a `this.lejaratas(rendeles)` World-metódus, nem a lejárati ütemező kivárása. |

### Fájltulajdon és a World

| Ág | Írhat | Nem nyúlhat |
|---|---|---|
| E1 | `e2e/features/vevo-kosar.feature`, `e2e/steps/vevo_kosar_lepesek.mjs` | `e2e/steps/vilag.mjs`, `e2e/steps/horgok.mjs`, `e2e/support/`, és minden az `e2e/`-n kívül |
| E2 | `e2e/features/vevo-checkout.feature`, `e2e/steps/vevo_checkout_lepesek.mjs` | ugyanaz |
| E3 | `e2e/features/vevo-rendeleseim.feature`, `e2e/steps/vevo_rendeleseim_lepesek.mjs` | ugyanaz |

A World **befagyasztása** a promptban kimondott felülbírálás: az `e2e-vaz-konvenciok` szerint
új World-metódus egyébként szabad. Itt azért tilos, mert három párhuzamos ág ugyanazt a
segédet háromszor írná meg (a `CLAUDE.md` egy valódi esetet ír le). Ami ehhez a feladathoz kell,
az **induláskor** kerül be, nem a végén: az E3-3-hoz **két** World-metódus, mindkettő a meglévő
`keszletModositas` mintájára, admin API-hívással —

- `arModositas(termek, ujAr)` — a `PUT /api/admin/products/:id` teljes cseréje, az ár kivételével
  változatlan mezőkkel;
- `lejaratas(rendeles)` — `PATCH /api/admin/orders/:id/status` `{ "status": "expired" }` törzzsel,
  `200`-at vár. A `pending` → `expired` váltást az állapotgép engedi
  (`server-java/src/main/java/hu/webshop/order/OrderTransitions.java`); visszafelé `409`.

A második nélkül az E3-3 nem teljesíthető: a `this.ujRendeles()` `pending` rendelést ad, az
újrarendelés gombja pedig csak `expired` rendelésen jelenik meg. A lejárati ütemezőt kivárni
nem megoldás: egy friss rendelés foglalása alapból 72 óráig él (`AppProperties.DEFAULT_RESERVATION_HOURS`),
a söprés pedig 5 percenként fut — a szcenárió órákig várna, vagy időzítésfüggő lenne.
Ha egy ágnak ezen felül is kellene World-metódus, azt jelenti, és a saját lépésfájljában helyi
segéddel oldja meg.

A Cucumber lépésregisztere **globális**: az összefésülés után két ágban ugyanaz a lépésszöveg
`Ambiguous` hibát ad. Ezért az orchestrátor induláskor mindhárom ágnak átadja a meglévő
lépésszövegek listáját (ami létezik, azt újrahasználja), és az új lépések szövegében szerepel az
ág tárgya.

### Miért futhat párhuzamosan egy közös stack ellen

Az `e2e/README.md` két csapdája itt dől el:

1. **A szerverállapot soha nem áll vissza.** Minden ág saját fixture-t gyárt
   (`this.ujTermek()`, `this.ujVasarlo()`), egyedi névvel. E2 a **saját** termékének a készletét
   méri, így a másik két ág foglalásai nem zavarják.
2. **A login rate limit IP-re szól, és perzisztens.** A belépés az API-n át történik
   (`this.bejelentkezveMint(...)`), és hibás jelszavas szcenárió nincs.

A *futtatás* a vázban soros marad (`parallel: 0`); a párhuzamosság az *írásra* vonatkozik. Mindhárom
ág a saját munkafájában a saját feature-fájlját futtatja, a záró, teljes futás egyetlen soros menet
az összefésült fán.

### Menet (kb. 30 perc)

| Idő | Lépés |
|---|---|
| 0–5' | `./start.sh` (vagy `.\start.cmd`). Branch, futásjelző, kiinduló `git status`. Az orchestrátor felveszi az `arModositas` és a `lejaratas` World-metódust, és a branch-re commitolja (a worktree-k a HEAD-ből ágaznak). Kigyűjti a meglévő lépésszövegeket, létrehozza a három worktree-t, és a három delegálást **egy üzenetben** indítja — mindegyik a saját azonosítós kritériumlistájával. |
| 5–23' | A három agent párhuzamosan dolgozik: `cd .claude/worktrees/vevo-e2e-<ág>/e2e && npm ci`, majd szerep és címke szerinti kiválasztással (`getByRole`, `getByLabel` — `data-testid` a kliensben nincs, és nem is lesz) zöldre futtatja a saját feature-fájlját. |
| 23–30' | Átvétel (worktree-commit, `git checkout <ág> -- <a két fájl>`), a gyökérből `npm run lint`, és egy teljes `cd e2e && npm run e2e`: a meglévő négy feature és a három új, `retry: 0` mellett. Záró commit, a futásjelző törlése. |

### Kész, ha

- mind a kilenc kritérium (E1-1 … E3-3) teljesül, bizonyítékkal;
- három új feature-fájl van, magyarul, `# language: hu` fejléccel;
- a teljes `npm run e2e` zöld, `retry: 0` mellett, és a meglévő négy feature is zöld; az `npm run lint` zöld;
- `git status` szerint csak az `e2e/features/` és az `e2e/steps/` alatt keletkezett fájl (plusz az
  orchestrátor saját `arModositas`-a és `lejaratas`-a);
- ha egy elem szerep vagy címke alapján elérhetetlen, az **akadálymentességi hiányként** a
  jelentésbe kerül. Nem kerül rá `data-testid`.

### Indítás

```text
Három párhuzamos e2e-test-writer a vevői útra (backlog B-5), mindegyik saját worktree-ben, egy
közös futó stack ellen: E1 katalógus és kosár, E2 checkout és foglalás (available csökken, stock
nem), E3 rendeléseim és újrarendelés. Induláskor az arModositas és a lejaratas World-metódus; a World egyébként
befagyasztva; a végén átvétel, lint és egy teljes e2e futás.
```

---

## Miért éppen ez a kettő

| | 1. Unit-teszt legyező | 2. Vevői út e2e |
|---|---|---|
| Párhuzamos agentek | 3 × `java-unit-test-writer` | 3 × `e2e-test-writer` |
| Elszigetelés | 3 worktree (közös `target/` miatt) | 3 worktree (a Cucumber minden lépésfájlt betölt) |
| Mi védi a határt | `unit-test-write`/`-bash` guard (produkciós kód tiltva) | `e2e-write`/`-bash` guard (`e2e/`-n kívül tiltva) + befagyasztott World |
| Záró mérés | `mvn clean test` + `jacoco:check` (10 → 13 osztály) | teljes `npm run e2e`, `retry: 0` |
| Backlog-tétel, amit lezár | — (három, ma unit teszt nélküli osztály a kapulistára) | `feature-backlog` **B-5** |

A kettő a lánc két rétegét mutatja meg, ugyanazzal a mintával: fan-out, fájltulajdon,
egyesítés, gépi záró mérés. Az egyik a Java-oldalon fut, a másik a böngészőben.

## Ami szándékosan kimaradt

- **Admin értékelés-moderáció** (B-8) és **rendelés-visszavonás** (B-9): mindkettő
  spec-írással indul, interaktív kérdezz-felelekkel, és a lánc egy része szükségszerűen
  szekvenciális (spec → kutató → implementáló). A visszavonás mért becslése egy óra és
  10–30 USD.
- **A kliens apró javításai** (`admin-orders-followups` B2–B4): mindhárom az
  `AdminOrders.tsx`-be nyúl, tehát nem párhuzamosíthatók ütközés nélkül.
