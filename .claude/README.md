# `.claude/` — a repó skilljei, agentjei és hookjai

Ez a mappa egy önálló rendszer: **10 skill**, **11 agent** és **3 hook** (plusz egy közös modul,
a `futas-kozos.mjs`), amiket négy mechanizmus köt össze (frontmatter `skills:` mező, hook
mód-string, skillek egymásra hivatkozása, és egy skill, ami a többit menet közben behívja).
Ez a fájl a térkép — mi mire való, és mi mihez kapcsolódik.

> **Karbantartás:** a bekötések épségét gép ellenőrzi —
> `node .claude/skills/skill-iro/scripts/ellenoriz.mjs --mind`.
> A CI `lint` jobja is futtatja. Ha ebben a mappában bármit átírsz, ez a parancs a záró lépés.

---

## 1. A rendszer egy ábrán

```
  egy mondat
      │
      ▼
 ╔═ feature-full ═══════════════════════════════════════════════════════════╗
 ║  a teljes lánc EGY belépőből — 0–7. fázis, orchestrál, nem kódol         ║
 ║                                                                          ║
 ║  0. feature-spec-writer ──► spec/{feature}/     ⟵ ITT beszélgetsz        ║
 ║        (kikérdez, kihív; kapu: spec-ellenoriz.mjs zöld)                  ║
 ║                                                                          ║
 ║  2. feature-implement ──► a négyagentes implementációs lánc:             ║
 ║        spec-researcher ──► UI-kiválasztói szerződés befagyasztása        ║
 ║                │                                                         ║
 ║       ┌────────┴────────┐   két külön git-worktree, párhuzamosan         ║
 ║       ▼                 ▼                                                ║
 ║  spec-implementer   e2e-test-writer                                      ║
 ║       └────────┬────────┘                                                ║
 ║           integráció (merge) ──► e2e futtatás                            ║
 ║                │                                                         ║
 ║                ▼                                                         ║
 ║          spec-validator ──► ítélet-jelentés                              ║
 ║                ▲                  │ [nem teljesül] vagy piros e2e        ║
 ║                │                  ▼                                      ║
 ║                │   JAVÍTÓ KÖR — a FŐ fán, worktree nélkül, max 2×        ║
 ║                │     terméki hiba ──► spec-implementer                   ║
 ║                │     teszthiba    ──► e2e-test-writer (utólagos mód)     ║
 ║                │                  │                                      ║
 ║                └──────────────────┘   közben: e2e újrafuttatás           ║
 ║                                                                          ║
 ║  3. mérleg-kapu ──► kontextus- ÉS futásmérleg                            ║
 ║        (cost-reducer: mi megy BE · futas-merleg: mi FOGYOTT)             ║
 ║                                         ⟵ AZ EGYETLEN tervezett megállás ║
 ║                                                                          ║
 ║  4. java-unit-test-writer ──► unit tesztek, MÉRT áglefedettség           ║
 ║        (osztályonként egy futás; jelöltek: unit-jeloltek.mjs)            ║
 ║           ∥  PÁRHUZAMOSAN, kliens-only feature-nél IS:                   ║
 ║        docs-api-writer ──► gyökér README + OpenAPI-leíró                 ║
 ║           (kapu: dok-leltar.mjs — kód ↔ leíró ↔ README)                  ║
 ║  5. lefedettségi kapu ──► a pom.xml osztálylistájának bővítése           ║
 ║  6. zárókör ──► terméki hiba esetén spec-implementer → újravalidálás     ║
 ╚══════════════════════════════════════════════════════════════════════════╝
      │
      ▼
  kész, mért, e2e-vel ÉS unit teszttel fedett feature

  A 0., 2. és 3. fázis skilljei önmagukban is hívhatók — a `feature-full` csak
  a sorrendjükért, az átadásokért és a javító körökért felel.

  KONVENCIÓ-SKILLEK (tények, nem eljárás — a `skills:` mező tölti be)
    spec-konvenciok       ──► spec-researcher, spec-implementer, spec-validator,
                              java-unit-test-writer, docs-api-writer, test-runner
    e2e-vaz-konvenciok    ──► e2e-test-writer
    test-writer-java-unit ──► java-unit-test-writer  (munkafolyamat-skill, agentbe töltve)
    dokumentacio-iro      ──► docs-api-writer        (munkafolyamat-skill, agentbe töltve)

  ŐRHOOK (gépi kikényszerítés, nem próza)
    spec-guard.mjs   ──► impl-write / impl-bash / e2e-write / e2e-bash /
                         unit-test-write / unit-test-bash / docs-write / readonly-bash
                         (az agentek frontmatteréből, írást és parancsot korlátoz)
    futas-mero.mjs   ──► kapu   (a settings.json-ból, MINDEN delegálásra)
                         mér, és MEGÁLLÍTJA a láncot: keret / konvergencia / oszcilláció

  MÉRŐHOOK (nem tilt, csak rögzít)
    kontextus-mero.mjs ──► delegalas  (a settings.json-ból, MINDEN delegálásra)
                           a BEMENŐ prompt mérete; recept nélkül nem nyúl hozzá

  FÜGGETLEN ESZKÖZ
    skill-iro  (magát a `.claude/`-ot írja)
```

---

## 2. A két skill-család

Ez a repó legfontosabb megkülönböztetése — aki új darabot vesz fel, ezzel kezdje.

| | **Konvenció-skill** | **Munkafolyamat-skill** |
|---|---|---|
| Mit tartalmaz | **tényeket**: útvonalak, parancsok, metódusnevek, portok | **eljárást**: fázisok, döntési szabályok, kimeneti szerződés |
| Ki tölti be | egy agent a frontmatter `skills:` mezőjével, indításkor | a fejlesztő hívja meg (`/név`), vagy egy másik skill hívja be a `Skill` eszközzel |
| Példa | `spec-konvenciok`, `e2e-vaz-konvenciok` | `feature-full`, `feature-implement`, `feature-spec-writer`, `test-writer-java-unit`, `skill-iro`, `cost-reducer`, `futas-merleg` |

A `test-writer-java-unit` az a kivétel, ami a szabályt erősíti: **eljárást** tartalmaz (tehát
munkafolyamat-skill), de a `java-unit-test-writer` agent a `skills:` mezőjével tölti be — úgy,
ahogy egy konvenció-skillt. Ez azért nem sérti a szabályt, mert hordozható: a repó tényeit ő
sem tartalmazza, azokat az agent a `spec-konvenciok`-ból kapja mellé.

**A szabály: projekttény a konvenció-skillbe megy, soha nem az agent-fájlba.** Az agentek
szándékosan hordozhatók — szerepet, módszert és kimeneti szerződést tartalmaznak, csomagnevet
és parancsot nem. Ez nem esztétika: két megtörtént szétcsúszásból származik (egy elavult
World-metóduslista duplikált fixture-építőt okozott; egy hiányzó lint-parancs miatt a „kész"
CI-pirosat jelentett). A `skill-iro` validátorának 5. ellenőrzése (*ténykiszivárgás*) pont ezt
figyeli.

---

## 3. Agentek

### 3.1 A spec-lánc négy agentje

Ezek dolgoznak együtt, a `feature-implement` vezényletében. Mindegyik hordozható; a projekt
tényeit a `skills:` mezőn át kapják.

| Agent | Szerep | Eszközök | Modell | Betöltött skill | `spec-guard` mód |
|---|---|---|---|---|---|
| `spec-researcher` | Implementálás **előtt** felderíti a kódbázis konvencióit, fájl:sor hivatkozásokkal ad eligazítást. Kódot nem ír. | `Read, Grep, Glob` | `sonnet` | `spec-konvenciok` | — (nincs író eszköze) |
| `spec-implementer` | A `tasks.md` munkaegységeit sorrendben kóddá váltja, a terv interfészét (útvonal, státuszkód, szó szerinti hibaüzenet) betartva. | `Read, Write, Edit, Grep, Glob, Bash` | `inherit` | `spec-konvenciok` | `impl-write`, `impl-bash` |
| `e2e-test-writer` | A kész-kritériumokból Gherkin szcenáriót + lépésdefiníciót ír az `e2e/` vázra, és lefuttatja. **Csak** az `e2e/`-t írja. | `Read, Write, Edit, Grep, Glob, Bash` | `inherit` | `e2e-vaz-konvenciok` | `e2e-write`, `e2e-bash` |
| `spec-validator` | Friss szemmel végigméri a kész-kritériumokat, feltételenként ítél **bizonyítékkal**. Nem javít, fájlt nem módosít. | `Read, Grep, Glob, Bash` | `opus`, `effort: high` | `spec-konvenciok` | `readonly-bash` |

Két szándékos aszimmetria a láncban:

- **A validátor mindig `opus`.** Ő a lánc bizalmi horgonya — egy gyenge validátor hamis
  „teljesül"-t ad, amire a lánc készként épít tovább.
- **A validátor nem örökli az implementáló feltevéseit.** Az implementációs jelentés
  *mutató a bizonyítékhoz*, nem maga a bizonyíték.

### 3.2 A unit-teszt agent

| Agent | Szerep | Eszközök | Modell | Betöltött skill | `spec-guard` mód |
|---|---|---|---|---|---|
| `java-unit-test-writer` | **Egy** Java osztályhoz ír JUnit 5 + Mockito unit teszteket, metódusonként, és a lefedettséget **méri**, nem becsli (90%-os ágkapu). | `Read, Write, Edit, Grep, Glob, Bash` | `inherit`, `effort: high` | `test-writer-java-unit`, `spec-konvenciok` | `unit-test-write`, `unit-test-bash` |

A `feature-full` 4. fázisa hívja, **osztályonként külön futásban** — a skill egész ökonómiája
erre a felosztásra épül. Amit soha nem tesz: produkciós kódot módosít (varrat-hiányt
**jelent**, nem refaktorál), és a `pom.xml`-hez sem nyúl. A lefedettségi osztálylista bővítése
szándékosan az orchestrátoré: különben egy elakadt teszt-kör legkényelmesebb kiútja lenne.

### 3.3 A dokumentációs agent

| Agent | Szerep | Eszközök | Modell | Betöltött skill | `spec-guard` mód |
|---|---|---|---|---|---|
| `docs-api-writer` | A munkafa gyökerében lévő README-t és OpenAPI-leírót igazítja a **kódhoz**, és gépi végpontleltárral zár. | `Read, Write, Edit, Grep, Glob, Bash` | `inherit`, `effort: high` | `dokumentacio-iro`, `spec-konvenciok` | `docs-write`, `readonly-bash` |

A `feature-full` 4. fázisa hívja, **a unit-teszt körrel párhuzamosan** és **egyetlen**
futásban. A két ág nem ütközik: az egyik a teszt-forrásfába ír, ez a gyökér két
dokumentumába. Kliens-only feature-nél is elindul — a README nem csak végpontokat ír le.

Két szabály hordozza az egész szerepet:

- **A kód az igazság, a dokumentum követi.** Egyetlen kivétel fordítva működik: ha az eltérés
  a `spec/`-hez képest áll fenn, akkor a **kód** a gyanús, és ilyenkor nem javít, hanem jelent.
- **A záró kaput nem szabad kézzel zöldíteni.** Ha piros marad, mert a kódban van a hiba, az a
  `feature-full` zárókörének bemenete — nem dokumentációs feladat.

Miért nem a `docs-writer` csinálja ezt: az általános, egyszeri dokumentálásra való, csak az
alap `impl-write` őrrel és leltár-kapu nélkül. Ez a két fájl viszont **szerződés** — a leltár-kapu miatt mérhető, hogy fedi-e a
kódot —, és ezt egy hatókör nélküli agent nem tudja vállalni.

### 3.4 Általános agentek

Az alapkészlet, a spec-lánchoz nem kapcsolódnak: `debugger`, `docs-writer`, `refactorer`,
`reviewer`, `test-runner`. A `test-runner` kivételével nincs `skills:` bekötésük — egyszeri, önálló
feladatokra valók (hibakeresés, dokumentálás, diff-review, tesztfuttatás). Ha egy feladat a
`spec/{feature}` normára hivatkozik, nem ezek valók rá, hanem a lánc.

Alapőrt viszont kapnak (2026-10-25, bővítve 2026-11-06): a `reviewer` a `readonly-bash` módot,
mert a neve szerint csak olvas; a `debugger`, a `refactorer` és a `test-runner` az `impl-bash`
módot (commit-, telepítés- és branch-törlés-tilalom) **és** az `impl-write` Edit-őrt; a
`docs-writer` (Bash-eszköze nincs) az `impl-write`-ot. Így egyik író agent sem írhatja a
`spec/`-et, egy már kiadott migrációt vagy a `.git/`-et — szimlinken vagy junctionön át sem. Mind a négy író `permissionMode: acceptEdits`-szel
fut, magyarul jelent, a `test-runner` betölti a `spec-konvenciok`-ot, és a leírásuk
kölcsönösen kizárja a lánc-agenteket (`test-runner` ↔ `java-unit-test-writer`/`e2e-test-writer`,
`debugger` ↔ `spec-implementer`, `reviewer` ↔ `spec-validator`, `test-runner` ↔ `spec-validator`).
Integrációs tesztet (`IntegrationTest`-váz) a `test-runner` ír. A `.claude/` (hookok, agentek,
skillek, settings) és a költségkapu küszöbfájljai egyik agentnek sem írhatók — ezt a guard
minden módban tiltja.

---

## 4. Skillek

| Skill | Család | Mire való | Bemenet ► Kimenet |
|---|---|---|---|
| `feature-full` | munkafolyamat | A **teljes** lánc egy belépőből: spec → implementáció → kontextus-mérleg → unit tesztek → újravalidálás. A többi skillt **behívja**, nem másolja. | ötlet ► kód + e2e + unit tesztek + futási napló |
| `feature-spec-writer` | munkafolyamat | Egy mondatból spec-mappát érlel: felderít, **egyesével kikérdez**, és megtámadja a kimondatlan premisszákat. Meglévő spec-mappához nem nyúl. | ötlet ► `spec/{feature}/` (`requirements.md`, `plan.md`, `tasks.md`) |
| `feature-implement` | munkafolyamat | A spec-mappát kóddá váltja a fenti négyagentes lánccal, két külön worktree-ben, javító hurokkal. | `spec/{feature}/` ► kód + e2e + ítélet-jelentés |
| `spec-konvenciok` | konvenció | A webshop kódtérképe és kötelező konvenciói. **A projekttények egyetlen otthona** a lánc számára. | — (a 3 spec-agent, a unit-teszt, a dokumentációs agent és a `test-runner` tölti be) |
| `e2e-vaz-konvenciok` | konvenció | Az `e2e/` Gherkin + Cucumber + Playwright váz szerkezete, API-ja, futtatása. | — (az `e2e-test-writer` tölti be) |
| `test-writer-java-unit` | munkafolyamat | JUnit 5 + Mockito unit tesztek egy Java osztályra, metódusonként, **mért** JaCoCo branch-lefedettséggel (90% kapu). Terméki kódot soha nem módosít. | egy `.java` osztály ► tesztosztály + terv (`docs/test-plans/`, verziókövetett) |
| `dokumentacio-iro` | munkafolyamat | A gyökér README-t és OpenAPI-leírót hozza szinkronba a kóddal: leltár → leíró → README → **gépi kapu**. Hiányzó leírót az EGÉSZ projektre hoz létre, nem csak a feature-re. | feature (vagy semmi) ► `README.md` + `openapi.yaml` + leltár-jelentés |
| `skill-iro` | munkafolyamat | Új skillt/agentet vesz fel **ebbe** a mappába: fedésvizsgálattal indít, eldönti az alakot, validálással zár. | igény ► `.claude/skills/…` vagy `.claude/agents/…` |
| `cost-reducer` | munkafolyamat | A delegálásoknak átadott kontextust méri és — **csak jóváhagyott recept alapján** — szűkíti. | mérések ► javaslat ► jóváhagyott recept |
| `futas-merleg` | munkafolyamat | A futás **fogyasztását** méri (valódi token, költség, idő) és a validátorkörökből konvergenciagörbét számol. A hookja **meg is állítja** a láncot, ha a keret elfogyott vagy a javítás körbe-körbe jár. | átirat ► mérleg + ítélet |

### A `references/` mappák

A skillek nem egyetlen fájlból állnak; a hosszabb, ritkábban kellő anyag `references/`-be
kerül. Amelyik a legtöbbet ér:

- `feature-spec-writer/references/kihivas-katalogus.md` — **nyolc spec-írási hibaosztály, amik
  itt tényleg megtörténtek**, mindegyik bizonyítékkal. Az `admin-orders` review-jai azt találták,
  hogy a hiba a kritériumok szövegében volt, nem az implementációban.
- `cost-reducer/references/mit-nem-szabad-elvenni.md` — hat kategória, amit sosem szabad kivágni.
  Mind a hat *redundánsnak látszik* — pont ezért vágják ki őket.
- `futas-merleg/references/kapu-szabalyok.md` — a négy leállító szabály szemantikája, a fail-open
  esetek, és **miért nem szabad a küszöböt lejjebb vinni**, ha a kapu bekattan. Benne a mért példa
  arra, amit a puszta darabszám elrejt: `3 → 1` javulás, közben egy már teljesült kritérium bukik.
- `feature-full/references/unit-teszt-kor.md` — a 4–6. fázis, benne a **négyféle találat**
  táblázata azzal, hogy melyiket ki javítja: terméki hiba ► `spec-implementer` javító kör;
  rossz teszt ► újra-delegálás; varrat-hiány és a specnek **nem** ellentmondó gyanú ► csak
  jelentés. Összekeverni őket a mérés elrontása.
- `feature-full/references/futasi-naplo-sablon.md` — a `Running.md` váza és a tilalmai.
- `feature-implement/references/` — a lánc lépéseinek mechanikája (2026-11-06-án kiszervezve a
  783 soros SKILL.md-ből): felbontás, git-kiindulás, modellválasztás, naplóvezetés,
  worktree-k és delegálás, munkacsomagok, integráció, e2e futtatás, futásmérleg-kapu, jelentés.
  A SKILL.md lépésszámai (0/c., 3/a., 4/6. …) változatlanok, és minden lépés elején egy
  **kötelező olvasmány** mutat a fájljára; az összefoglaló a „soha” szabályokat ott is tartja.
- `skill-iro/references/skill-vagy-agent.md` — az alakválasztás döntési fája.
- `test-writer-java-unit/references/` — eset-levezetés, JaCoCo, Mockito-minták, parametrizált minták.

---

## 5. Hookok

A hook az a pont, ahol egy szabály **próza helyett gépi** lesz. Egy Bash-t kapó agentet a
prompt szövege nem véd meg attól, hogy átirányítással bármit felülírjon.

### `spec-guard.mjs` — a lánc őre

`PreToolUse`, az **agentek frontmatterében** bekötve (nem a `settings.json`-ban). Nyolc mód:

| Mód | Ki használja | Mit tilt |
|---|---|---|
| `impl-write` | `spec-implementer`, `debugger`, `refactorer`, `test-runner`, `docs-writer` | írás a `spec/` alá és a **meglévő** Flyway-migrációkba (új `V<n>__` fájl létrehozható); a függőségleírók (`package.json`, lockfájlok, `pom.xml`) írására **`ask`** |
| `impl-bash` | `spec-implementer`, `debugger`, `refactorer`, `test-runner` | git-mutáció (commit, push, pull, revert, apply, am, új branch, branch-törlés, worktree, ref-átírás, alias), függőségtelepítés, a leírót megkerülő letöltés (`npx -y`/`-p`, `npm exec`, `dlx`, `mvn dependency:get`, `versions:*`, `pip install`), `Start-Process` → `ask`; és a parancs **írási céljaira** (átirányítás, `tee`, `sed -i`, `cp`/`mv`, `rm`, PowerShell fájl-cmdletek) ugyanaz, mint az `impl-write`-nál |
| `e2e-bash` | `e2e-test-writer` | az `impl-bash` minden tiltása, és a Bash-írási célokra az `e2e-write` engedélylistája (a `/tmp` is tilos — `.scratch/` a hely) |
| `unit-test-bash` | `java-unit-test-writer` | az `impl-bash` minden tiltása, és a Bash-írási célokra a `unit-test-write` engedélylistája |
| `e2e-write` | `e2e-test-writer` | minden írás az `e2e/` (és `.scratch/`) mappán kívülre; az `e2e/package.json` és a lockfájl írására **`ask`** |
| `unit-test-write` | `java-unit-test-writer` | minden írás a `server-java/src/test/`, a `docs/test-plans/<Osztály>.md` (a mappa `README.md`-je nem) és a `.scratch/` kívülre — a tesztelt produkciós osztály **és** a `pom.xml` is |
| `docs-write` | `docs-api-writer` | minden írás a **gyökér** `README.md`-n, a gyökér OpenAPI-leírón (és a `.scratch/`-en) kívülre — a leírt rendszer forrása és az almappák README-i is |
| `readonly-bash` | `spec-validator`, `docs-api-writer`, `reviewer` | **engedélylistás**: ami nincs a listán, az `ask` (az ok megnevezi a bukott szegmenst); minden írási cél `deny`; a `node` csak repó-beli scripttel vagy `--test`-tel, az `npx tsc` csak `--noEmit`-tel, a `vitest` csak `run`-nal megy át. A listán: az olvasó/mérő `mvn` célok (`clean` is), `npm run <script>` (`*fix*` nélkül), `npx tsc/vitest/eslint` (író kapcsoló nélkül), a git olvasó alakjai (`-C <út>`-tal is), `curl` (`-o` nélkül), `docker ps/logs`, idézett `cd`/`Set-Location` |

Amit érdemes tudni róla:

- **Idézőjel-tudatos tokenizálóval** bont (sh, PowerShell, cmd nyelvjárás), és a szabályok az
  argv-n futnak: a `2>&1`, a `grep "a|b"`, az idézett szóközös útvonal nem hamis jelzés; a
  `$(…)`/backtick, `bash -c`, `cmd /c`, `powershell -Command`, `eval`/`iex`, `find -exec` törzse
  külön vizsgált szegmens, a parancsfej normalizált (`git.exe`, `"C:/…/git.exe"`, `./mvnw`).
- **Worktree-ben is helyesen relativizál:** a legközelebbi git-gyökérhez, de egy `.git` fájlos
  mappát csak akkor fogad el munkafának, ha a `gitdir:` a projekt `.git/worktrees/` alá mutat. A
  lánc worktree-i a `.claude/worktrees/` alatt vannak. A `/d/…` alakot `D:/…`-ra fordítja.
- **Sosem ad `allow`-t** — amire hallgat, azt a `.claude/settings.json` szűk `permissions.allow`
  listája vagy a normál engedélyezés dönti el. Az `ask`/`deny` az allow-szabály fölött áll.
- **Regressziós tesztek:** `node --test "test/hooks/*.test.mjs"` (Node 24-en a mappa-argumentum
  nem működik).

- **Nem sandbox, és nem is akar az lenni.** A tiltólistás vizsgálat elvi okból hiányos — egy
  tiltólista véges felsorolás egy végtelen halmazról. Azt fogja el, ami a gyakorlatban
  előfordul (véletlen commit vagy telepítés). Nem látja a folyamaton belüli írást (`node -e`,
  npm-script, Maven-plugin), a `bash script.sh` tartalmát, és a változóból összerakott
  parancsfejet (`$GIT push`).
- **A `readonly-bash` szándékosan szigorúbb**, mert engedélylistával dolgozik. Az `impl-*`
  módok illeszkedés nélkül kimenet nélkül engednek tovább (belül „nincs ítélet”, kimenet nélküli
  exit 0 — a kiadott `defer` 2.1.310 óta elhalasztaná a hívást, ezért egyik hook sem ad ki ilyet).
- **Az `ask` auto módban nem állít meg.** Mérve 2026-10-25-én: háttér-subagentnél, auto
  engedélymódban a `readonly-bash` 20 `ask`-ja mind jóváhagyás nélkül lefutott. Az `ask` tehát
  interaktív módban véd; auto módban jelzés, nem kapu. Ez tudatos döntés (az `ask` marad). A két írási gyökér-mód (`e2e-write`,
  `unit-test-write`) szintén engedélylistás — ott a *gyökér* a véges felsorolás.

### `kontextus-mero.mjs` — a `cost-reducer` gépi fele

`PreToolUse`, a `.claude/settings.json`-ban bekötve (`matcher: "Agent|Task|SendMessage"`). **Minden**
delegálást megmér, és **kizárólag jóváhagyott receptet** alkalmaz — recept nélkül a prompt
érintetlenül megy tovább. Kikapcsolás egy futásra: `COST_REDUCER=0`.

Három **mért** tény a mechanizmusról (2026-08-01, Claude Code 2.1.220), mindegyik ellentmond a
dokumentációnak, és mindegyik némán hibázik:

- A `PreToolUse` **lefut** az `Agent` eszközre, és a `tool_input` tartalmazza a teljes `prompt`-ot.
- A `SubagentStart` **nem** kapja meg a promptot — átírásra alkalmatlan.
- Az `updatedInput` **csak** `permissionDecision: "allow"` mellett érvényesül. `defer` mellett a
  hook lefut, kiadja az átírást, és a subagent mégis az eredetit kapja — némán.

Az utolsónak ára van: az átírás megkerüli az adott delegálás engedélykérését. Ezért a hook
`allow`-t **csak akkor** ad, ha ténylegesen alkalmazott egy receptet.

### `futas-mero.mjs` — a `futas-merleg` gépi fele

`PreToolUse`, a `.claude/settings.json`-ban bekötve, **ugyanarra a
`matcher: "Agent|Task|SendMessage"`-ra**, mint a `kontextus-mero.mjs`. Egy mód: `kapu`.
Kikapcsolás egy futásra: `FUTAS_KERET=0`.

Két dolgot csinál egy híváson belül: **egyeztet** (a delegálás előtt lezárja az összes korábbi,
még nem rögzített delegálást — valódi token, költség, idő, konvergencia), majd **kaput tart**
(keret · konvergencia-megállás · oszcilláció). `allow`-t **soha** nem ad, csak `deny`-t, vagy
kimenet nélkül zár (mérési hiánynál `systemMessage`-et ad, ítélet nélkül), így nem kerüli meg egy delegálás engedélykérését, és nem ütközik a `kontextus-mero.mjs`
átírás-`allow`-jával. A közös fele a `futas-kozos.mjs`, amit a skill riport-szkriptje is hív —
ezért nem támaszkodik egyetlen ellenőrizetlen hook-eseményre sem (se `PostToolUse`, se `Stop`).

Három **mért** tény (2026-08-04, Claude Code 2.1.221), mindegyik némán hibázik:

- A hook-payload tartalmazza a **`transcript_path`**-ot és a **`tool_use_id`**-t. A session-átirat
  mellett van egy `<session>/subagents/` mappa (`agent-<id>.jsonl` + `.meta.json`), és a
  `.meta.json` **`toolUseId`** mezője visszaköt a delegáláshoz. **Innen jön a valódi tokenszám** —
  lásd a 6. szakasz javítását.
- A `toolUseResult.totalTokens` **NEM a delegálás fogyasztása**, hanem az utolsó kör
  kontextusmérete. Mérve: 175 120 vs. a körök tényleges összege 10 281 395 — **hatvanszoros**
  alábecslés, és nem hibaüzenet, hanem egy hihető szám. A naplóban ezért `zaro_kontextus` a neve.
- A `toolUseResult.status` **hazudik a megszakadásról**: egy session-limitbe futott, feladatát be
  nem fejező validátor `status`-a is `completed`. A csonkaságot csak a jelentés szövege árulja el.
- *(2026-10-25, 2.1.310)* **Egy API-válasz több átiratsor**: az üzenet minden tartalomblokkja
  külön sor, és mindegyik ugyanazt a `usage`-et hordozza. A kör egysége ezért a `message.id`.
  Soronkénti összeadással egy futás 5,07 M egységnek látszott 2,02 M helyett.
- *(2026-10-25, 2.1.310)* **A háttér-delegálás a fő átiratban láthatatlan**: a `toolUseResult`
  `{ isAsync: true, status: "async_launched", agentId }`, `agentType` és jelentés nélkül. Az
  `agentType` és a `finished` a `.meta.json`-ból jön, a jelentés a `SubagentHandback`
  tool_use-ból, a SendMessage-dzsel folytatott rész pedig `folytatas` sorként kerül a naplóba.

> **A közös csapda:** ismeretlen mód-stringre a `spec-guard.mjs` ítélet nélkül, kimenet nélkül
> enged tovább, a két mérőhook pedig csak egy `systemMessage`-et ad. Egy elgépelt mód egy agent
> frontmatterében vagy a `settings.json`-ban tehát **kikapcsolja az őrt** — a futás zöld, a
> védelem nulla. Ezt az `ellenoriz.mjs --mind` 4. ellenőrzése fogja el (a frontmatterben és a
> `settings.json`-ban is).

> **Két hook, egy matcher.** A `kontextus-mero.mjs` és a `futas-mero.mjs` ugyanarra a delegálásra
> fut. Egy `deny` terminális, tehát a kapu felülírja a másik `allow`-ját — viszont a
> `kontextus-mero.mjs` a saját mérési sorát akkor is megírja, ha a delegálás végül nem indult el.
> A `meresek.jsonl`-ben ezért lehet olyan prompt, ami sosem ment el; a `futasok.jsonl` az, ami
> ténylegesen megtörtént delegálásokat tartalmaz.

### Hová írnak a mérőhookok

A tár a `docs/orchestration/_kontextus/`, és **verziókövetett** — a döntések (receptek, küszöbök,
árak) ugyanúgy review tárgyai, mint egy `Decision.md`. Prompt-szöveget **egyik fájl sem** tartalmaz.

| Fájl | Ki írja | Mi van benne |
|---|---|---|
| `meresek.jsonl` | `kontextus-mero.mjs` | delegálásonként a **bemenő prompt** mérete, blokk-hashek, az alkalmazott vagy elutasított recept |
| `receptek.json` | a fejlesztő (a `cost-reducer` javaslatára) | a jóváhagyott szűkítések. `jovahagyva` dátum nélkül **inert** — így is kell visszavonni |
| `futasok.jsonl` | `futas-mero.mjs` | delegálásonként a **tényleges fogyasztás**: token, költség, idő, modell, konvergencia |
| `keretek.json` | a fejlesztő | küszöbök és súlyok. Mért futásból kalibrálva, a levezetés az `alap` mezőben |
| `arak.json` | a fejlesztő | modellenkénti ártábla, **kötelező** `ervenyes` dátummal |

A nyers prompt-szöveg és a blokk-előnézetek a gitignore-olt `.scratch/cost-reducer/` alá mennek.
Ami **nincs** a tárban: az orchestrátor saját fogyasztása — mindkét hook csak a delegálásokat
látja, a fő szálat nem.

---

## 6. Scriptek

Mind zéró függőségű Node ESM — a `.claude/` egyik build rendszernek sem tagja, ide egy csomag
nem tud „csak úgy" bekerülni.

| Script | Skill | Mit csinál |
|---|---|---|
| `skill-iro/scripts/leltar.mjs` | `skill-iro` | Leltár a meglévő skillekről/agentekről. `--keres "…"` szóátfedést számol — a **fedésvizsgálat belépője**, nem az ítélete. |
| `skill-iro/scripts/ellenoriz.mjs` | `skill-iro` | A `.claude/` készlet validátora, 8 ellenőrzés: frontmatter, holt/árva `references/` hivatkozás, nem létező `skills:` bekötés, **ismeretlen hook-mód** (a `settings.json`-ban is), ténykiszivárgás, méret, `--mind`-dal minden hook **lefuttatása** (HIBA, ha `defer`-t ír a stdout-ra vagy összeomlik), és az **engedélyminták** összevetése az előírt parancsalakokkal (a záró ` *`/`:*` szóhatárt követel). `--mind` vagy egy név. |
| `skill-iro/scripts/kozos.mjs` | `skill-iro` | Közös segédek (repógyökér, szűk YAML-frontmatter-parser). Nem futtatható önmagában. |
| `feature-spec-writer/scripts/spec-ellenoriz.mjs` | `feature-spec-writer` | Egy `spec/{feature}/` mappa validátora, 9 ellenőrzés: hiányzó fájl, azonosító nélküli/duplikált kritérium, hiányzó `*Bizonyíték:*`, **kritérium amire egy feladat sem hivatkozik**, hiányzó `*Kész, ha:*`, kipipált checkbox, megengedő megfogalmazás, holt link, ütköző (kis/nagybetűs) fájlnevek a tervben. |
| `feature-full/scripts/unit-jeloltek.mjs` | `feature-full` | A megváltozott produkciós Java osztályokat rangsorolja unit-teszt jelöltként (`JELÖLT` / `MÁR FIGYELT` / `GYENGE` / `KIZÁRVA`), soronkénti indokkal. **Tanácsadó, nem kapu** — mindig 0-val lép ki. |
| `dokumentacio-iro/scripts/dok-leltar.mjs` | `dokumentacio-iro` | Végpont-leltár három forrásból — a controllerek leképezés-annotációiból, a gyökér OpenAPI-leíróból és a README-ből —, és összeveti őket. **Kapu, nem tanácsadó:** eltérésnél 1-gyel lép ki. A hiányon kívül a *fölösleget* is jelzi (a dokumentumban van, a kódban nincs) — az a rosszabb: a hiányzó végpontot az olvasó megkeresi, a nem létezőt meghívja. |
| `cost-reducer/scripts/merleg.mjs` | `cost-reducer` | A delegálás-mérések mérlege: típusonkénti méretek, ismétlődő blokkok, az aktív receptek **mért** hatása, az elutasított átírások. |
| `futas-merleg/scripts/futas-merleg.mjs` | `futas-merleg` | A futás mérlege: **valódi** token, költség és idő delegálásonként, konvergenciagörbe, a legdrágább delegálások, a kapu állása. `--atirat` mellett előbb egyeztet, csak utána jelent — de a session-átirat a munkaterületen kívül van, ezért csak a fejlesztő jóváhagyásával. |

Amit a `merleg.mjs` **nem** tud kiírni: tokenszám (csak ≈4 karakteres becslés), cache-találati
arány, pénz. Aki ezekre hivatkozva állít **prompt-megtakarítást**, nem mért.

> **JAVÍTVA (2026-08-04).** Itt korábban az állt, hogy ezeket „a harness nem adja ki". **Kiadja** —
> csak nem a hook payloadjában, hanem a `transcript_path`-on át elérhető
> `<session>/subagents/agent-*.jsonl` átiratokban, ahol minden `assistant` sor valódi `usage`-et
> hoz. Ezt a `futas-merleg` méri; a `merleg.mjs` korlátja megmarad, mert az a **bemenő promptot**
> méri, nem a fogyasztást — a két szám nem ugyanaz, és nem is helyettesíti egymást.

Amit az `unit-jeloltek.mjs` `ág≥` oszlopa **nem**: JaCoCo-ág. **Alsó becslés**, ami a `?:`-t, a
lambdákban rejlő elágazást és a nyíl-alakú `switch`-et szándékosan nem számolja — sorrendnek jó,
számnak nem. A mérce mindig a mért lefedettség.

---

## 7. Hogyan kapcsolódnak — a négy kötés

Ha ebben a mappában bármit átírsz, ez a négy hely csúszhat szét:

1. **`skills:` a frontmatterben** — az agent indításkor betölti a konvenció-skillt.
   Nem létező névre a validátor 3. ellenőrzése szól.
2. **hook mód-string a frontmatterben** — az agent `hooks:` blokkja mód-stringgel hivatkozik a
   hookra. Elgépelve **némán** kikapcsol; a validátor 4. ellenőrzése az egyetlen, ami elfogja.
3. **skill hivatkozik skillre a leírásában** — a `feature-spec-writer` és a `feature-implement`
   nevesítve átadja egymásnak a munkát (spec írása ► spec megvalósítása), és a `description`
   mezőjükben *negatívan* is elhatárolódnak („NE induljon…"). A leírás irányítószabály: ez dönti
   el, melyik skill indul el egy kérésre. A `feature-full` mindkettőtől elhatárolódik: ha csak a
   spec kell, vagy ha a lánc a validátor ítéletével véget is ér, nem ő indul.
4. **skill *behív* egy másik skillt a `Skill` eszközzel** — a `feature-full` így használja a
   `feature-spec-writer` (0.), a `feature-implement` (2.) és a `cost-reducer` (3/a.) fázisait.
   **Nem másolja át őket**, és ez a kötés lényege: a worktree-kezelés, a modell-triázs, a
   guard-módok és az e2e futtatás egy helyen élnek. Egy ide bemásolt tény ebben a repóban már
   kétszer csúszott szét.

   A `futas-merleg` (3/b.) szándékosan **kivétel**: a `feature-full` a *szkriptjét* futtatja, nem
   a skillt hívja be. A számokhoz nem kell a skill ítélő fele — az akkor kell, ha a fejlesztő
   kérdez rá, vagy ha a kapu megállította a láncot. A **mérés** amúgy is magától történik, a
   hookban; ez a fázis csak elolvassa.

Új darab felvételéhez ne kézzel szerkessz — hívd a `skill-iro` skillt. Fedésvizsgálattal indul
(nehogy egy meglévő képesség duplikálódjon), és a validátor zöldjével zár.

---

## 8. Ami itt szándékosan nincs

- **`isolation: "worktree"` az `Agent` híváson.** A `feature-implement` **kézzel** hoz létre
  worktree-t `HEAD`-ből, mert a beépített paraméter a repó alapértelmezett branchéből
  (`main`) ágaztat: a subagent így nem látná sem a specet, sem a `.claude/` mai állapotát —
  a guard a saját módját sem ismerné fel. Ez a 2026-07-30-i `admin-orders` próbafutáson derült ki.
- **Automatikus rövidítés a delegálásokban.** A `kontextus-mero.mjs` sosem talál ki vágást.
  Egy modell által kitalált rövidítés pont azt viheti el, amitől a subagent utána
  magabiztosan téved.
- **A javítókör-korlát gépi kikényszerítése.** A „legfeljebb 2 kör" a `feature-implement`
  prózájában él, és ott is marad — a `keretek.json` `kor_korlat` mezője `null`. Tudatos döntés:
  a körszám önmagában rossz mérce (egy hosszú, haladó kör értékesebb, mint két rövid toporgás),
  és amit valóban el akarunk kapni — a nem haladó ismétlődést —, azt a konvergencia- és az
  oszcilláció-szabály pontosabban fogja meg. A hely megvan, ha egy későbbi döntés bekapcsolná.
- **Tiltás mérési adat nélkül.** A `futas-mero.mjs` fail-open: hiányzó vagy olvashatatlan átirat,
  első delegálás, kettőnél kevesebb validátorkör → nincs ítélet (kimenet nélküli exit 0). Validátort **sosem** tilt, mert a
  megállt konvergencia épp az az eset, amikor a záró mérés a legfontosabb. Egy elromlott műszer
  ne állítson meg munkát; a tiltáshoz bizonyíték kell.
- **Terméki kód a skillek kezében.** A `skill-iro` csak a `.claude/` alá ír, a
  `test-writer-java-unit` sosem módosít terméki osztályt, a `spec-validator` semmit.
- **Build-fájl az agentek kezében.** A lefedettségi kapu osztálylistáját (`pom.xml`) a
  `feature-full` 5. fázisa bővíti, **mért** számok alapján — sosem az az agent, akinek épp nem
  sikerült a 90%. A küszöböt lejjebb venni egyik szerepnek sem szabad.
- **A 0. fázis automatizálása.** A `feature-spec-writer` kikérdezése akkor is interaktív marad,
  ha a `feature-full` hívja: a repó lezárt lánc-futásainak tanulsága szerint a hibák nagyobb
  része **spec-írói** hiba volt, nem implementálói.
