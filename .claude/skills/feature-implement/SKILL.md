---
name: feature-implement
description: |
  Egy spec/{feature} mappa alapján implementálja a feature-t subagent-lánccal:
  kutató → (implementáló ∥ e2e-teszt-író, külön worktree-ben) → integráció → e2e futás
  → validáló, munkacsomagokra bontva, ha a spec úgy kéri.
  Ha van docs/orchestration/{feature}/ felbontási terv, a lánc alakját az szabja meg,
  és a futásról naplót vezet. Aktiválódjon, ha a fejlesztő egy MÁR MEGLÉVŐ spec-mappát
  akar megvalósítani (a `feature-spec-writer` skill a specet írja meg, ez a skill a
  spec meglététől indul). Példa: "implementáld a spec/product-rating specet".
---

# feature-implement — spec-alapú implementáció orchestrálása

A bemenet egy `spec/{feature}` mappa (jellemzően `requirements.md`, `plan.md`, `tasks.md`,
de lehet több, normatív melléklettel is), amit korábban a `feature-spec-writer` skill (vagy a
fejlesztő kézzel) készített. A lánc alakja:

```
spec-researcher ──► UI-kiválasztói szerződés befagyasztása
                         │
              ┌──────────┴──────────┐        két külön git-worktree,
     spec-implementer          e2e-test-writer     párhuzamosan
              └──────────┬──────────┘
                    integráció (a két branch merge-e)
                         │
                    e2e futtatás az egyesített fán
                         │
                    spec-validator ──► ítélet-jelentés
                         │
                    zárás (záró commit, stack leállítása)
```

A kimenet a **validáló ítélet-jelentése**, az e2e futás tényleges eredményével együtt.

Ha a feature-höz tartozik **felbontási terv** (`docs/orchestration/{feature}/Orchestrator.md`),
a lánc alakját **az** szabja meg — akár négy vagy több delegálással —, és a futásról **naplót
kell vezetni**. Ha nincs, a fenti alapértelmezett lánc fut, és ezt fel kell jegyezni. Lásd a
0/b. és az 1/c. lépést.

Minden felhasználónak szánt szöveg **magyar** (a projekt konvenciója szerint).

## Alapszabály — orchestrálás, nem kódolás

Ebben a skillben **te magad nem írsz kódot**. A kódot a `spec-implementer` subagent írja, az
elfogadási teszteket az `e2e-test-writer`, a kódbázis felderítését a `spec-researcher`, az
ellenőrzést a `spec-validator` végzi. A te dolgod a lánc vezetése, az ágak (az implementálói
munkafák + az e2e ág) integrálása és a jelentések továbbadása.

- **A `spec/` mappa fájljait senki nem módosítja** — a `tasks.md` checkboxait sem.
- **Ne írj át forrásfájlt** „gyors javításként" — ha hiba van, a megfelelő ágnak delegálod.
- **A kutató és a validáló eredményét megvárod**, mielőtt továbblépsz, mert a rájuk épülő
  lépés abból dolgozik. A mechanizmust nem írjuk elő: a harness a delegálást háttérbe is
  teheti (ilyenkor a jelentés értesítésként érkezik) — a lényeg, hogy a következő lépés ne
  induljon el nélküle. Az **implementáló és az e2e-teszt-író párhuzamosan**, két külön
  worktree-ben (3. lépés) — ők nem egymásra épülnek, hanem ugyanarra a befagyasztott
  UI-kiválasztói szerződésre.
- **Ne pushol** semmit, és branch-et ne törölj.

**Kivételek az írási és a git-tilalom alól — pontosan nyolc:**

1. `docs/orchestration/{feature}/Running.md` — a futási napló, a te munkaterületed.
2. `docs/orchestration/{feature}/UiSelectors.md` — a befagyasztott UI-kiválasztói szerződés
   (2/b. lépés).
3. **Branch-nyitás** a lánc elején (0/c. lépés): `git switch -c feature/{feature}`, ha a repó
   a default branchen áll. Más branch-művelet nem.
4. **A spec-mappa commitja** (0/c. lépés) — kizárólag a `spec/{feature}/` tartalma, egy
   commitban. Enélkül a 3/a. lépés `HEAD`-ből ágaztatott worktree-iben nincs megbízás.
5. **Worktree-kezelés**: `git worktree add -b` (3/a., a D eset csomagonkénti munkafáira 3/b.),
   `git worktree remove` és
   `git worktree prune` (4/5.). A guard a subagenteknek ezt is tiltja.
6. **Az implementálói munkafák + az e2e ág commitolása és a branch-ek merge-e** (4. lépés).
   Alapesetben ez két munkafa (`{feature}-impl` és `{feature}-e2e`); a D esetben (3/b.)
   csomagonként egy `{feature}-impl-{X}` munkafa és az e2e ág. Ez azért a tiéd, mert a
   subagentek nem tudják megtenni: a `spec-guard.mjs` minden ágon tiltja a git-mutációt.
7. **A záró commit** (8. lépés) — a fő fán a 4. lépés óta keletkezett változások, a 8. lépés
   felsorolása szerint. Ha a `feature-full` hívott be, ezt **nem** te csinálod, hanem az ő
   7. fázisa.
8. `.scratch/futas-merleg/aktiv-futas.json` — a futásjelző (0/c. lépés 0. pontja): a lánc
   elején írod, a végén és minden korai megállásnál törlöd. Gitignore-olt. Ha a
   `feature-full` hívott be, az írja és törli — te csak ellenőrzöd.

Az `Orchestrator.md` **nincs** a listán: azt a `feature-full` 1/b. fázisa generálja (vagy a
fejlesztő írja), te csak olvasod.

**Push soha**, branch-törlés soha, `reset --hard` soha. Minden más fájlra és minden más
git-műveletre a tilalom él.

## Munkafolyamat

A lépések mechanikája (parancsok, ellenőrzőlisták, kivételek) a `references/` alatt van. Minden
érintett lépés elején egy **kötelező olvasmány** mutat rá: azt a lépés végrehajtása **előtt**
olvasd el — nem háttéranyag, hanem a lépés normája. Az összefoglaló a SKILL.md-ben csak a
„soha” szabályokat tartja, hogy egy kihagyott olvasás se vezessen tiltott lépéshez.

### 0. A feature feloldása

- Ha a felhasználó megadta a feature nevét vagy a mappa útvonalát, azt használod.
- Ha nem adta meg: `Glob`-bal listázd a `spec/*/` mappákat, és `AskUserQuestion`-nel kérdezz
  vissza, melyikre gondolt. **Ne találgass.**
- A listában három **történeti** mappa is szerepel — melyik és miért, azt a `spec-konvenciok` 5. szakasza mondja meg. Ezek a
  törölt Node/lowdb backendet írják le, és **nem megbízások**: ne ajánld őket a
  visszakérdezésben. Ha a fejlesztő mégis egyiket nevezi meg, állj meg és mondd ki, mielőtt
  a láncot elindítod — a `requirements.md` tetején lévő státuszfejléc a bizonyíték.
- A mappa **mérete nem kötött**: van, ahol három fájl van (`requirements.md`, `plan.md`,
  `tasks.md`), és van, ahol több — normatív mellékletekkel (végpont-referencia,
  hibakatalógus, konformancia-esetek). Mindkettő rendben van.
- **Állj meg** viszont, ha nincs a mappában legalább egy **követelmény-jellegű** (a
  viselkedés normája) **és** egy **feladat-jellegű** (végrehajtási sorrend) fájl — féllábon
  ne indítsd el a láncot. Ilyenkor a `feature-spec-writer` skill a következő lépés, nem ez.

### 0/b. A felbontás tervének megkeresése

**Kötelező olvasmány a lépés előtt:** [`references/felbontas-terv.md`](references/felbontas-terv.md) — a lépés teljes
mechanikája. Az alábbi összefoglaló csak a kötelező szabályokat tartja:

Ha van `docs/orchestration/{feature}/Orchestrator.md`, **az** szabja meg a lánc alakját (hány
delegálás, milyen sorrendben, mi párhuzamos). Ha nincs, az alapértelmezett lánc fut — ezt
**nem csendben**: a `Running.md` *Felbontás* mezőjébe írod. Kivétel: `*Gazda:*` sorok a
`tasks.md`-ben → csomagonként, szekvenciálisan. A `docs/orchestration/` mappa **egyetlen
subagenthez sem jut el** — csak a `UiSelectors.md` *tartalma*, a prompt törzsébe másolva.

### 0/c. Git-kiindulás — branch, spec-commit, kiinduló állapot

**Kötelező olvasmány a lépés előtt:** [`references/git-kiindulas.md`](references/git-kiindulas.md) — a lépés teljes
mechanikája. Az alábbi összefoglaló csak a kötelező szabályokat tartja:

Sorrend: **0.** futásjelző (`.scratch/futas-merleg/aktiv-futas.json`, futásnév
`{feature}-<ÉÉÉÉHHNN-ÓÓPP>`; másik feature friss jelzője → állj meg és kérdezz) · **1.** branch
(`git switch -c feature/{feature}`, ha a default branchen állsz; létező branch → állj meg és
kérdezz) · **2.** spec-only commit, ha a spec commitolatlan · **3.** a kiinduló `HEAD` és a teljes
`git status --porcelain` a `Running.md`-be. Ha a `feature-full` hívott be, csak ellenőrzöd.

### 1. Spec beolvasása

`Glob`-bal listázd a spec mappa **összes** `.md` fájlját, és `Read`-del olvasd el mindet.
Nem azért, hogy szó szerint továbbadd, hanem hogy tudd, **mit** adsz át a subagenteknek, és
később **mit** ellenőrizz a jelentéseiken. A tipikus szerepek:

- **követelmény** (`requirements.md`) → a viselkedés normája,
- **terv** (`plan.md`) → az **interfész szerződése** (útvonal, metódus, státuszkódok, szó
  szerinti magyar hibaüzenetek, válasz-törzs, érintett fájlok) és a fázisok,
- **feladatlista** (`tasks.md`) → a **végrehajtási sorrend**,
- **melléklet** (`vegpontok.md`, `hibakatalogus.md`, `konformancia.md`) → **szintén
  normatív**: a szó szerinti hibaüzenetek és az elfogadási esetek innen jönnek.

Azonosítsd a **kész-kritérium forrását**, ebben a sorrendben: `- [ ]` DoD lista →
„Kész, ha:" sorok a feladatlistában → számozott konformancia-esetek (`K-xx`) →
`MA IS`/`ÚJ` jelölések. Ez a mérce a lánc végén; a subagentek is ezt keresik.

Ha a spec **fázisokra** oszlik, tisztázd (szükség esetén `AskUserQuestion`-nel), melyik
fázis a megbízás — a későbbi fázis hiánya nem hiba, és nem is ennek a futásnak a dolga.

### 1/b. Modellválasztás a spec mérete alapján

**Kötelező olvasmány a lépés előtt:** [`references/modellvalasztas.md`](references/modellvalasztas.md) — a lépés teljes
mechanikája. Az alábbi összefoglaló csak a kötelező szabályokat tartja:

Mérhető szabály, nem érzés: a spec **összetett**, ha háromnál több `.md` fájl, fázisok, 800 sor
felett vagy 20-nál több kész-kritérium. A **validátor mindig `opus`**; az implementáló sosem kap
a session modelljénél gyengébbet; javító körben egy fokozattal feljebb.

### 1/c. Naplóvezetés — minden delegálás előtt

**Kötelező olvasmány a lépés előtt:** [`references/naplovezetes.md`](references/naplovezetes.md) — a lépés teljes
mechanikája. Az alábbi összefoglaló csak a kötelező szabályokat tartja:

Ha van `Running.md`: **minden delegálás ELŐTT** a blokkját kitöltöd (átadott kontextus,
modell), a jelentés után lezárod — nem a futás végén, emlékezetből. Korábbi futás kitöltött
napló: új, dátumozott blokk alatta. Kitöltetlen mező őszintébb, mint a kitalált.

### 2. Delegálás a `spec-researcher` subagentnek

`Agent` eszköz, `subagent_type: spec-researcher`, `model` az 1/b. triázs szerint. A jelentését
megvárod, mielőtt a 2/b. lépéshez fogsz.

A promptban add át:
- a spec mappa útvonalát **és a benne talált fájlok listáját** (hogy a mellékletek se
  maradjanak ki),
- a terv „Érintett fájlok" szakaszát,
- ha a spec fázisokra oszlik: melyik fázis a megbízás,
- a kérést: tárja fel a kódbázis releváns konvencióit, és adjon **tömör eligazítást** az
  implementálónak `fájl:sor` hivatkozásokkal,
- **és külön kérd a `## UI-kiválasztói szerződés` szakaszt** — ez a párhuzamos ág feltétele,
  enélkül nem tudod elindítani a 3. lépést.

**Csak az összefoglalót vedd át.** Ne másold be a kódbázis részleteit a saját kontextusodba —
a jelentés a szállítmány.

### 2/b. A UI-kiválasztói szerződés befagyasztása

A kutató jelentésének `## UI-kiválasztói szerződés` szakaszát **szó szerint** kiírod a
`docs/orchestration/{feature}/UiSelectors.md` fájlba. Ha nincs ilyen mappa, **hozd létre** —
a szerződés a párhuzamos ágnak akkor is kell, ha a feature-höz nem készült felbontási terv.

Miért kell külön lépés egy másolásra: a 3. lépés két ága **sosem látja egymás kódját**. Az
implementáló írja a felületet, az e2e-teszt-író pedig ugyanabban a percben írja a rá mutató
kiválasztókat — az egyetlen közös pontjuk ez a lista. Ha nem fagy be **most**, akkor nem
szerződés, hanem két párhuzamos találgatás, és az integrációkor derül ki, hogy elcsúsztak.

Mielőtt kiírod:

- **A `JAVASOLT` sorokat nézd át.** Ha egy javaslat ütközik a spec szó szerinti szövegével
  (gombfelirat, mezőcímke, oldalcím), **a spec nyer** — javítsd a sort a kiírás előtt, és a
  „Forrás" oszlopba a spec `fájl:sor` hivatkozása kerüljön.
- Ha a szakasz „Nincs kliens-felület", akkor nincs párhuzamos ág: a 3. lépés csak az
  implementálót indítja, a 4. és az 5. lépés kimarad, és ezt a jelentésben kimondod.
- Ha a szakasz **üres vagy hiányzik**, de a specnek van kliens-szakasza, **kérdezz vissza**
  (`AskUserQuestion`) vagy delegálj újra a kutatónak. Féllábon ne indítsd el a párhuzamos ágat.

**A fájl útvonalát egyik agent sem kapja meg** — ugyanaz az indok, mint a többi orchestrációs
dokumentumnál (0/b. lépés): a subagentek a `.md` fájlokat normatívnak tekintik, és ez a fájl
nem a spec része. A **tartalmát** másolod be szó szerint mindkét prompt törzsébe.

Befagyasztás után a fájl **nem változik** a futás során. Ha kiderül, hogy rossz, azt a
`Running.md`-be írod és a jelentésben mondod ki — nem írod át utólag úgy, mintha eleve az lett
volna (7. lépés).

### 3. Párhuzamos delegálás — két worktree

Miért érdemes: a két diff **diszjunkt** — az implementáló a `client/` és a `server-java/`
alatt ír, az e2e-teszt-író **kizárólag** az `e2e/` alatt. Ennek az **e2e oldalát** gép tartja
(a `spec-guard.mjs` `e2e-write` módja engedélylista); az implementáló oldalát csak részben: az
`impl-write` a `spec/`-et és a meglévő migrációkat tiltja, de az `e2e/` alá írást **nem** — az
ott prózai szabály. Ezért a 4. lépés
merge-e ütközésmentes kell hogy legyen — egy ütközés önmagában is hibajelzés.

És miért **előre**, nem utólag: ha az e2e-teszt-író az implementáló után futna, csak leírná,
ami már elkészült. Így viszont a szerződés **kétoldalú norma**: az implementálónak elő kell
állítania azokat a fogantyúkat, az e2e-írónak pedig pontosan azokat kell használnia.

#### 3/a. A worktree-ket TE hozod létre — ne az `isolation` paraméterrel

**Kötelező olvasmány a lépés előtt:** [`references/worktree-es-delegalas.md`](references/worktree-es-delegalas.md) — a lépés teljes
mechanikája. Az alábbi összefoglaló csak a kötelező szabályokat tartja:

**Soha `isolation: "worktree"`** — az a default branchből ágaztat. Te hozod létre a
munkafákat `.claude/worktrees/{feature}-impl` és `…-e2e` alatt, `HEAD`-ből, futásonként egyedi
branchnévvel, előtte `git worktree list` (foglalt → állj meg és kérdezz), utána ellenőrzöd, hogy
a spec ott van. **Delegálás előtt `pwd`: a fő session a repó gyökerében álljon** — a subagent
Bash-e a fő session aktuális könyvtárából indul. Minden prompt első bekezdése a munkagyökér, a
relatív `cd .claude/worktrees/<név> && <parancs>` alakkal (ez fut engedélykérés nélkül).

#### 3/b. Munkacsomagokra bontott implementáció

**Kötelező olvasmány a lépés előtt:** [`references/munkacsomagok.md`](references/munkacsomagok.md) — a lépés teljes
mechanikája. Az alábbi összefoglaló csak a kötelező szabályokat tartja:

`*Gazda:*` sorok esetén csomagonként külön `spec-implementer` futás, a függőségi sorrendben,
a fájltulajdon-táblázattal mint kemény korláttal; az érintkezési felület ellenőrzése a tiéd.
Párhuzamos csomagok (D) csak `Orchestrator.md`-ből, csomagonként saját munkafával; fan-in
csomag az alapcsomagok merge-e után, az összefésült `HEAD`-ből. A merge sorrendjét a
lánc-táblázat `#` oszlopa adja, az e2e ág mindig utolsó.

### 4. Integráció — az implementálói munkafák + az e2e ág egyesítése

**Kötelező olvasmány a lépés előtt:** [`references/integracio.md`](references/integracio.md) — a lépés teljes
mechanikája. Az alábbi összefoglaló csak a kötelező szabályokat tartja:

A git-művelet a **tiéd**. Pontok: **1.** a fő fa `git status`-a a kiinduló listához képest (idegen
írás → állj meg) · **2.** áganként commit · **3.** merge `--no-ff`-fel, az implementálói ágak
előbb · **4.** ütközés → állj meg, nem kézi feloldás · **5.** munkafák eltakarítása, branch-törlés
soha · **6.** KÖTELEZŐ build, teszt, lint (és backendnél `mvn clean test`) az egyesített fán;
piros = integrációs hiba, a 7. lépés javító körébe megy.

### 5. E2E futtatás az egyesített fán

**Kötelező olvasmány a lépés előtt:** [`references/e2e-futtatas.md`](references/e2e-futtatas.md) — a lépés teljes
mechanikája. Az alábbi összefoglaló csak a kötelező szabályokat tartja:

**1.** `cd e2e && npm ci` (soha `npm install`) · **2.** stack: ha nem fut, te indítod háttérben;
ha **már futott**, a backend a merge előtti kódot szolgálja ki → állj meg, kérd az újraindítást ·
**3.** dry-run · **4.** éles futás, utána a teljes suite · **5.** a `2`-es kilépési kód
környezeti hiba, nem a feature-é · **6.** a stacket itt **ne** állítsd le.

### 6. Delegálás a `spec-validator` subagentnek

`Agent` eszköz, `subagent_type: spec-validator`, `model: opus` (mindig). Az ítéletét megvárod —
a 7. lépés és a jelentés ebből dolgozik.

A promptban add át:
- a spec mappa útvonalát,
- az implementáló jelentését **mint mutatót a bizonyítékhoz** — kifejezetten írd oda, hogy ez
  nem bizonyíték, minden állítást olvasson vissza a kódból vagy igazoljon futtatással,
- **az e2e futás tényleges kimenetét** (5. lépés) — ugyanezzel a kikötéssel: mutató a
  bizonyítékhoz, nem bizonyíték. A böngészős kritériumokat (jellemzően a „végponttól végpontig"
  DoD pontot) ez méri, tehát a validátornak tudnia kell róla — de a szcenáriókat neki is vissza
  kell olvasnia, mert egy zöld szcenárió, ami nem azt méri, amit állít, hamis `[teljesül]`,
- a kérést: **feltételenkénti** ítélet a spec **minden** kész-kritériumára — DoD pont,
  „kész, ha" feltétel vagy konformancia-eset, aszerint, hogy a spec melyiket használja —
  (`[teljesül]` / `[nem teljesül]` / `[kétséges]`), mindegyik mellé bizonyíték.

### 7. Javító hurok

Ha a validáló talált **`[nem teljesül]`** pontot, az 5. lépés e2e futása piros, vagy a 4/6.
ellenőrzés (build, teszt, lint az egyesített fán) piros:

1. **Előbb nevezd meg, melyik ág hibázott.** Most több ág van (az implementálói munkafák + az
   e2e ág), és a rossz ágnak delegálni
   dupla munka: a teszt „javítása" egy valódi terméki hibára a mérés elrontása.

   | A hiba jellege | Ki javít |
   |---|---|
   | Terméki hiba (rossz státusz, hiányzó mező, más hibaüzenet) | `spec-implementer` |
   | Szcenárió, lépésdefiníció vagy előfeltétel-építés hibája | `e2e-test-writer`, **utólagos** módban — a stack ekkor már fut, tehát futtatva veszi át |
   | Az elem szerep vagy címke alapján elérhetetlen | `spec-implementer` — ez akadálymentességi hiány a felületen. **Nem** `data-testid` az e2e-ben |
   | A megvalósult felület eltér a szerződéstől | `spec-implementer` igazodik a szerződéshez. Ha a **szerződés** a rossz, azt **mondd ki** a jelentésben és írd a `Running.md`-be — a `UiSelectors.md`-t nem írod át utólag |

2. Delegálj **újra** — de **csak a konkrét hibákkal**: a validáló idézett kész-kritériumai vagy
   a bukott szcenárió tényleges kimenete, az eltérés leírása és a `fájl:sor` bizonyítékok. Ne
   indítsd újra az egész implementációt. A `model` itt egy fokozattal feljebb megy (lásd 1/b.).
   Munkacsomagokra bontott implementációnál (3/b.) **annak a csomagnak** delegálsz, amelyiké az
   érintett fájl — a fájltulajdon-táblázat szerint. Ha a hiba az érintkezési felületen van,
   előbb a felületet **birtokló** csomag javít, és csak utána a rá építő.
   **A javító körök a fő fán futnak, worktree nélkül** (nincs `isolation`): az ágak ekkor már
   egyesültek, egy javítás pedig nem párhuzamosítható. A változásaik commitolatlanul maradnak
   a záró commitig (8. lépés).
3. Ha a javítás a `server-java/`-t érintette, indítsd újra a backendet (vagy kérd), az 5/2.
   pont szabálya szerint. Ha e2e-t érintő javítás történt, **futtasd újra az 5. lépés 3–4.
   pontját**.
4. Utána delegálj **újra** a `spec-validator`-nak (friss futás, a **teljes** kritériumlistára,
   nem csak a javított pontokra).

Korlátok:
- **Legfeljebb 2 javító kör.** Utána állj meg, és jelentsd a megmaradt hibákat — ne pörögjön
  végtelenül.
- **`[kétséges]` pont önmagában nem indít javító kört** — az mérési hiány, nem bizonyított hiba.
  Jelentsd, és írd le, mi kellene az eldöntéséhez.
- **Minden kör után írd a `Running.md` javítókör-táblájába a `[nem teljesül]` pontok DARABSZÁMÁT**
  (nem csak azt, mi bukott). A körönkénti szám a konvergenciagörbe — `5 → 2 → 2` azt jelenti, hogy
  a hurok megállt, és ez az egyetlen mérőszám, ami ezt megmutatja.

### A futásmérleg kapuja

**Kötelező olvasmány a lépés előtt:** [`references/futasmerleg-kapu.md`](references/futasmerleg-kapu.md) — a lépés teljes
mechanikája. Az alábbi összefoglaló csak a kötelező szabályokat tartja:

Ha a `futas-mero.mjs` hook tilt (keret, konvergencia, oszcilláció), **az a lánc vége**: jelentsd
a számokat, és **ne kerüld meg** (se újraindítás, se darabolás, se `FUTAS_KERET=0`, se a
futásjelző törlése a folytatás kedvéért). Mérleg `--atirat` nélkül; zárásként stack leállítása
és a jelző törlése.

### 8. Zárás — a lánc végén

Ha a `feature-full` hívott be, ez a lépés **kimarad**: a záró commit és a stack leállítása az
ő 7. fázisáé, mert utána még unit-teszt kör és újravalidálás jön. Önálló futásnál, ebben a
sorrendben:

1. **Stack és futásjelző.** Ha a lánc indította (5/2.), most állítsd le. A Postgres-konténer
   szándékosan futva marad (ezt a `start` így csinálja) — ne bontsd le. Ha nem a lánc
   indította, hagyd. A futásjelzőt **mindkét esetben** töröld (0/c. 0. pont).
2. A `Running.md` „Zárás" blokkja: a záró commit fájllistája, hogy a stacket leállítottad-e, és
   hogy a futásjelzőt törölted.
   A commit hash-e a jelentésbe kerül, nem a naplóba — különben a napló a commit után megint
   piszkos.
3. **Záró commit — egy, pontosan ennyivel.** Az implementáció és az e2e a 4. lépés
   merge-commitjaiban már bent van; a záró commit azt viszi, ami **azóta** a fő fán változott:
   - a 7. lépés javító köreinek változásai (`client/`, `server-java/`, `e2e/`),
   - `docs/orchestration/{feature}/Running.md` és `UiSelectors.md`.

   **Nem** kerül bele: a két mérő-napló (`meresek.jsonl`, `futasok.jsonl` — azokat a hook minden
   sessionben írja, a commitjuk a fejlesztőé), és semmi, ami már a kiinduló `git status`-ban
   szerepelt. A fájlokat **név szerint** add hozzá (`git add -- <útvonalak>`), ne `-A`-val.
   Ha javító kör nem volt, a commit csak a két orchestrációs fájl. Ha maradt `[nem teljesül]`
   pont, a commit akkor is megtörténik, de az üzenete kimondja. **Push nincs.**

## Kimenet

A skill hivatalos kimenete a **validáló jelentése**, elé egy rövid magyar összefoglalóval.
**Kötelező olvasmány a jelentés előtt:** [`references/jelentes-sablon.md`](references/jelentes-sablon.md)
— a fejléc mezői (felbontás, futás-azonosító, ágak, egyesített fa, e2e, javító körök, mérleg, záró
commit, stack). Ha maradt `[nem teljesül]` pont a körkorlát után, azt **mondd ki nyíltan** — ne
jelentsd késznek.

## Szabályok

- **Nincs új vagy frissített függőség** — maradnak a pinelt verziók (`package.json`). A friss
  worktree `npm ci`-je és az `e2e/` első `npm ci`-je nem ez: a lockfile-hoz ragaszkodik, és a
  futtatás előfeltétele, nem függőségváltozás. `npm install` sosem — az átírhatja a lockot.
- A már kiadott Flyway-migrációt nem írjuk át — sémaváltozáshoz új migrációs fájl kell.
- **A `spec/` érinthetetlen, a `docs/orchestration/` a te munkaterületed.** Az utóbbin belül is
  kizárólag a `Running.md`-et és a `UiSelectors.md`-t írod: az `Orchestrator.md`-t a
  `feature-full` 1/b. fázisa generálja (vagy a fejlesztő írja), a `Decision.md` kézi — egyiket
  sem igazítod a futáshoz; ha a terv rossznak bizonyul, az a `Running.md`-be és a jelentésbe
  megy. És **egyiket sem adod át egyetlen subagentnek sem** — a `UiSelectors.md` **tartalmát**
  igen, az útvonalát nem.
- **Git:** git-mutáció kizárólag az „Alapszabály" nyolc kivétele szerint: branch-nyitás és
  spec-commit (0/c.), worktree-kezelés (3/a., 3/b., 4/5.), az implementálói munkafák + az e2e ág
  commitja és merge-e (4.), a
  záró commit (8.). **Push soha**, branch-törlés soha, `reset --hard` soha.
- **Portütközés (3001/5173):** más futó projekt is használhatja ezeket a portokat. Ha az 5. lépés
  vagy a validáló ezt jelzi, add tovább a jelentésben — ne vonj le belőle következtetést a
  feature-re.
- **Ne lépj túl a spec keretein.** Ami nincs a feladatlistában és nem kell egyik
  kész-kritériumhoz sem, az javaslat a jelentés végén, nem implementáció.
- **A guardrailek gépiek.** A `spec-implementer`, az `e2e-test-writer` és a `spec-validator`
  `PreToolUse` hookja (`.claude/hooks/spec-guard.mjs`) blokkolja a `spec/` alá írást, a
  git-mutációt, a függőségtelepítést, az e2e-ág kilépését az `e2e/` mappából, és a validátor
  fájlmódosításait. Az e2e-ág diszjunktságát ez tartja; az implementáló `e2e/`-be írását
  nem tiltja gép (3. lépés), azt a 4. lépés `git status`-a és merge-e fogja meg. Ha egy subagent jelentésében ilyen blokkolás szerepel,
  az **nem** hiba a lánc működésében — add tovább a jelentésben.
- **Ne állítsd, hogy kész, ha nem az.** A validáló mérlege a mérce, nem az implementáló
  önbevallása.
