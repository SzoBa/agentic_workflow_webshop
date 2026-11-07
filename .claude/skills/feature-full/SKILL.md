---
name: feature-full
description: |
  Végigviszi a teljes láncot egy feature-igénytől a unit tesztekkel is fedett kódig:
  spec megírása (`feature-spec-writer`) → implementációs lánc (`feature-implement`:
  kutató, implementáló ∥ e2e-teszt-író, integráció, e2e futás, validáló) →
  kontextus-mérleg (`cost-reducer`) → Java unit tesztek mért áglefedettséggel
  (`java-unit-test-writer`) ∥ README és OpenAPI-leíró (`docs-api-writer`) →
  újravalidálás. A javító köröket orchestrátorként vezeti:
  a validátor és a unit-teszt kör találatait a `spec-implementer`-nek adja vissza.
  Aktiválódjon, ha a fejlesztő EGY ötlettől a KÉSZ, TESZTELT kódig kéri az egész
  folyamatot, vagy egy meglévő specet akar unit tesztekkel együtt megvalósíttatni.
  NE induljon, ha csak a spec kell (`feature-spec-writer`), vagy ha az implementáció a
  validátor ítéletével véget is ér, unit-teszt kör nélkül (`feature-implement`).
  Példa: „vidd végig a kupon-beváltást ötlettől tesztelt kódig".
---

<!-- ellenoriz: meret-kivetel max=520 — a fázisok mechanikája már a references mappában van; ami itt áll (a kivétellista, az Indulás, a fázisok sorrendje és a tilalmak), az minden futásban kell, és igény szerinti betöltésnél épp egy kihagyott olvasás vinné el -->

# feature-full — egy mondattól tesztekkel fedett kódig

A bemenet **egy mondat**: egy feature-igény. A kimenet **implementált, e2e-vel és unit
tesztekkel is fedett, validált kód**, futási naplóval. A kettő közt hat meglévő darab áll
sorba (`feature-spec-writer`, `feature-implement`, `cost-reducer`, `futas-merleg`,
`java-unit-test-writer`, `docs-api-writer`), és ez a skill a sorrendjükért, az átadásokért és a
javító körökért felel.

```
egy mondat
    │
    indulás              ──►  tiszta README/OpenAPI? más feature futásjelzője? (különben megállás)
    │
 0. feature-spec-writer  ──►  spec/{feature}/          ⟵ ITT beszélgetsz a fejlesztővel
    │                         (kapu: spec-ellenoriz.mjs zöld → feature/{feature} branch
    │                          + futásjelző → spec-commit)
 1. napló és lánc-terv   ──►  docs/orchestration/{feature}/Running.md + kiinduló állapot
    │                         + Orchestrator.md (generálva a plan.md 5. szakaszából)
    │
 2. feature-implement    ──►  kutató → impl ∥ e2e → integráció → e2e futás → validátor
    │                         (a saját javító hurkával együtt)
 3. mérleg-kapu          ──►  kontextus- ÉS futásmérleg  ⟵ AZ EGYETLEN tervezett megállás
    │
 4. java-unit-test-writer ─►  unit tesztek, MÉRT áglefedettség (osztályonként egy futás)
    │      ∥
    │   docs-api-writer   ──►  gyökér README + OpenAPI-leíró, leltár-kapu
    │
 5. lefedettségi kapu    ──►  a pom.xml osztálylistájának bővítése
    │
 6. zárókör              ──►  ha a 4. terméki hibát tárt fel: spec-implementer → újravalidálás
    │
 7. záró commit, stack leállítása, futásjelző törlése, jelentés
```

Minden felhasználónak szánt szöveg **magyar** (a projekt konvenciója szerint).

## Amit a lánc alakjáról előre tudni kell

**A 0. fázis interaktív, és ez nem hiányosság.** A `feature-spec-writer` egyesével kérdez, és
megtámadja a kimondatlan premisszákat — a repó két lezárt lánc-futásának tanulsága szerint a
hibák nagyobb része **spec-írói** hiba volt, nem implementálói. Ezt a fázist nem lehet
„automatizálni" anélkül, hogy pont az veszne el, amitől a lánc többi része mérhető. A
fejlesztő **döntése** itt kell, és utána — a 3. fázis egyetlen tervezett kapuját és az „állj meg
és kérdezz" pontokat leszámítva — nem.

**A figyelme viszont nem csak itt kell: az orchestrátor git-lépései engedélyt kérnek.** A
branch-nyitás, a spec-commit, a `git worktree add/remove/prune`, az áganként commit és a merge, a
párhuzamos unit-kör `git checkout <ág> -- …` átvétele, a záró commit és a munkafa-mappa törlése a
**fő sessionben** fut, és a `.claude/settings.json` `permissions.allow` listáján **szándékosan
nincs** git-mutáció: a fő sessionnek nincs guardja, tehát a lista az egyetlen, ami előtte áll.
Ezek a lépések tehát **kérdeznek** — a 2. fázis 0/c., 3/a. és 4. lépésénél, a 4/b. átvételnél
és a 7/a. zárásnál számíts rájuk. Egy háttér-subagent engedélykérése szintén a fő sessionben
jelenik meg. Ha a fejlesztő nincs ott, a lánc az első ilyen ponton **vár** — ez nem hiba, és a
lista bővítése sem megoldás rá.

**A 2. fázist behívod, nem lemásolod.** A `Skill` eszközzel betöltöd a `feature-implement`
skillt, és a fázisait követed. A worktree-kezelés, a modell-triázs, a guard-módok, a
UI-kiválasztói szerződés befagyasztása és az e2e futtatás **ott** van leírva, egy helyen. Ebbe
a fájlba **ne másold át egyiket sem**: egy két helyen élő tény ebben a repóban már kétszer
csúszott szét.

**A unit-teszt kör Java-oldali.** A kliens Vitest-tesztjei az implementáló feladatai a spec
szerint; ez a fázis a `server-java/` elágazásos logikáját fedi. Ha a feature-nek nincs ilyen
része, a 4. és az 5. fázis kimarad — és ezt a jelentésben **kimondod**, nem csendben lépsz
tovább.

**A dokumentációs kör viszont nem az.** A `docs-api-writer` a 4. fázissal **párhuzamosan**
fut, de nem a unit-teszt kör része: kliens-only feature-nél is elindul, mert a README a
viselkedést, a parancsokat és a mappastruktúrát is leírja, nem csak a végpontokat. A két ág
egymástól függetlenül bukhat és zöldülhet — a jelentésben **külön** szerepelnek.

## Nem alku tárgya

- **Orchestrálás, nem kódolás.** Kódot nem írsz: azt a `spec-implementer` írja, az elfogadási
  teszteket az `e2e-test-writer`, a unit teszteket a `java-unit-test-writer`, az ítéletet a
  `spec-validator` mondja. A te dolgod a sorrend, az átadás és a javító körök vezetése.
- **A `spec/` érinthetetlen**, a `tasks.md` checkboxait sem pipálod ki. Ez alól a 0. fázis a
  kivétel — ott a `feature-spec-writer` **hozza létre** a mappát, és utána már senki nem
  nyúl hozzá.
- **Ne állítsd, hogy kész, ha nem az.** A mérce a validátor mérlege és a **mért**
  lefedettség, nem az implementáló önbevallása.
- **Ne lépj túl a spec keretein.** Ami nincs a feladatlistában és nem kell egyik
  kész-kritériumhoz sem, az javaslat a jelentés végén.
- **Push soha**, branch-törlés soha, `reset --hard` soha.

**Kivételek az írási és a git-tilalom alól — pontosan tizenhárom:**

1. `docs/orchestration/{feature}/Running.md` — a futási napló, a te munkaterületed.
2. `docs/orchestration/{feature}/UiSelectors.md` — a befagyasztott UI-kiválasztói szerződés
   (a `feature-implement` 2/b. lépése írja).
3. **Branch-nyitás**: `git switch -c feature/{feature}`, ha a repó a default branchen áll
   (lásd „Indulás").
4. **A spec-mappa commitja** — kizárólag a `spec/{feature}/` tartalma, egy commitban, a zöld
   `spec-ellenoriz.mjs` után és az 1. fázis előtt (meglévő, de commitolatlan specnél a
   `feature-implement` 0/c. lépésének 2. pontja szerint, ugyanígy az 1. fázis előtt). Enélkül a 2. fázis
   `HEAD`-ből ágaztatott worktree-iben nincs megbízás, és a `feature-implement` 3/a.
   lépésének ellenőrzése (`ls …/spec/{feature}` a munkafában) megállítaná a láncot.
5. **Worktree-kezelés**: `git worktree add -b`, `git worktree remove`, `git worktree prune`, és
   egy félbemaradt `remove` után megmaradt munkafa-mappa törlése
   (`rm -rf .claude/worktrees/<név>` — csak ha a `git worktree list` már nem mutatja; a
   `feature-implement` 4/5. pontja szerint) —
   a 2. fázis munkafáira: az implementálói munkafák + az e2e ág (alapesetben `{feature}-impl` és
   `{feature}-e2e`; a D esetben toldalék nélküli `{feature}-impl` nincs, csak csomagonként egy
   `{feature}-impl-{X}` — előre csak a független csomagoké, a fan-in csomagé a merge után, az
   összefésült `HEAD`-ből; a `feature-implement` 3/a., 3/b. és 4/5. lépése szerint), és a 4. fázis
   osztályonkénti munkafáira, ha a unit-teszt kör párhuzamosan fut
   (`references/unit-teszt-kor.md` 4/b.).
6. **Worktree-commit és az eredmény átvétele** — a 2. fázis ágainak (az implementálói munkafák +
   az e2e ág, a D esetben csomagonként) commitja és merge-e (a
   `feature-implement` 4. lépése), és a párhuzamos unit-teszt munkafák commitja, valamint a
   tesztfájlok és a teszttervek (`docs/test-plans/<Osztály>.md`) átvétele a fő fára
   (`git checkout <ág> -- <útvonalak>`, a 4/b. szerint).
7. `server-java/pom.xml` — **kizárólag** a `check-unit-tested-classes` végrehajtás
   `<includes>` listájának **bővítése** (5. fázis). A küszöb értékéhez, a plugin
   verziójához és bármi máshoz a fájlban **nem nyúlsz**.
8. A gyökér `README.md` és a gyökér OpenAPI-leíró — **nem te írod**, hanem a
   `docs-api-writer` a 4. fázis párhuzamos ágán. A kivétel arra vonatkozik, hogy ez a két
   fájl a lánc futása alatt **megváltozhat**, és a záró commitba is bekerül. Ha az agent
   megakadt, a jelentés mondja ki — a dokumentumot **te nem javítod ki helyette**, mert
   akkor a leltár-kapu mérése kikerülne a láncból.
9. **A záró commit** (7/a. fázis) — egyetlen commit, a tartalma ott felsorolva.
10. `docs/orchestration/{feature}/Orchestrator.md` — a lánc terve, amit az 1. fázis
    **generál** (`references/orchestrator-sablon.md`). Meglévőt nem írsz felül.
11. `.scratch/futas-merleg/aktiv-futas.json` — a futásjelző („Indulás" 3.): a lánc elején
    írod, **minden fázis elején** a `frissitve` mezőjét frissíted (csak azt), a végén és minden
    korai megállásnál törlöd. A `.scratch/` gitignore-olt.
12. `docs/orchestration/_kontextus/receptek.json` — **csak** egy, a 3. fázisban a fejlesztő
    által **jóváhagyott** recept mentése (a `cost-reducer` mentési fázisa írja). A recept
    döntés, mint a `Decision.md`: verziókövetett, és a 7/a. záró commitba kerül. Jóváhagyás
    nélkül a fájl nem változhat.
13. **A darabszámok frissítése** (7/a.) — a `CLAUDE.md` és a
    `.claude/skills/spec-konvenciok/SKILL.md` azon számai, amelyeket a 4–5. fázis elavulttá tett:
    a unit-teszt osztályok száma és felsorolása, a `check-unit-tested-classes` lista hossza
    (a `CLAUDE.md` „ten classes” mondatai), és a `@Nested` tagolású osztályok száma. **Csak** a
    számok és a lista, mért értékből (`Glob`/`Grep` a `server-java/src/test/java/` alatt, a
    `pom.xml` `<includes>`-a), a mérés dátumával. Más mondathoz a két fájlban nem nyúlsz.

**Push egyik sem.** Minden más fájlra és minden más git-műveletre a tilalom él.

## Indulás — mielőtt a 0. fázis elkezdődik

1. **Tiszta dokumentáció.** Ha a `git status --porcelain -- README.md openapi.yaml` nem üres,
   **állj meg** és jelentsd: ezt a két fájlt a 4. fázis `docs-api-writer`-e írja, és a záró
   commitba kerülnek — a fejlesztő commitolatlan módosítása velük együtt menne, és a
   kiinduló állapothoz vett diff sem választaná szét a kettőt.
2. **Branch.** Ha a repó a default branchen áll, nyiss feature-branchet
   (`git switch -c feature/{feature}`) — a default meghatározása és a „már létezik → állj meg
   és kérdezz" szabály a `feature-implement` 0/c. lépésében van. **Mikor:** amint a feature
   neve rögzült — meglévő specnél azonnal, új specnél a 0. fázis végén, a spec-commit
   **előtt** (a commitolatlan spec-mappa a váltással együtt jön). A spec-commit így már a
   feature-branchre kerül, a default branchre soha.
3. **Futásjelző** (`.scratch/futas-merleg/aktiv-futas.json`) — a szabály a `feature-implement`
   0/c. lépésének 0. pontjában van, két időpontra bontva. Az **ellenőrzést azonnal**, a
   0. fázis előtt végzed: ha friss jelző áll egy **másik** feature nevével, állj meg és
   kérdezz, mielőtt a fejlesztő a spec-kikérdezésbe fektetne. A **megírás** a 2. ponttal egy
   időben történik, amint a feature neve rögzült — akkor is, ha branch-nyitás nem kell. A
   0. fázis esetleges delegálásai így még a session-azonosítóra könyvelődnek; a lánc futása
   a jelzőtől indul. Megíráskor a `frissitve` = `kezdet`; utána **minden fázis elején** (1–7.,
   a 2. fázison belül a `feature-implement` lépései szerint) csak a `frissitve` frissül —
   `date -u +%Y-%m-%dT%H:%M:%SZ`, majd a jelző `Read`-je és egy `Edit`, ami kizárólag a
   `"frissitve"` értékét cseréli. A `futas` és a `kezdet` változatlan: az átírásuk a keret
   megkerülése volna. A 3. fázis emberi megállója különösen ilyen pont: a fejlesztő válasza után,
   a 4. fázis első delegálása előtt frissíts. A mechanika a `feature-implement` 0/c. lépésének
   0. pontjában van — az **élő nézet** indításával együtt (ugyanott, „Élő nézet"): a megírás
   után háttérben indítod, és a címét megmondod a fejlesztőnek, hogy a spec-kikérdezéstől a
   zárásig a böngészőben kövesse, hol tart a lánc.

---

## Fázisok

### 0. A spec megírása

Ha a fejlesztő **feature-igényt** adott (nincs még spec-mappa): töltsd be a
`feature-spec-writer` skillt a `Skill` eszközzel, és vidd végig. A fázis akkor kész, ha a
`spec-ellenoriz.mjs` **zölden** lefutott — `HIBA` esetén nem mész tovább. Utána, ebben a
sorrendben: branch-nyitás („Indulás" 2.) és a futásjelző („Indulás" 3.), majd a spec-commit
(4. kivétel).

Ha a fejlesztő **meglévő spec-mappát** nevezett meg: ez a fázis kimarad. Mondd ki, nyisd meg a
branchet („Indulás" 2.), írd meg a futásjelzőt („Indulás" 3.), ha a mappa commitolatlan, commitold (4. kivétel), és lépj az
1. fázisra. **Meglévő specet nem íratsz át** — a `feature-spec-writer` maga is megtagadja, és
jó okkal: egy lezárt lánc-futás után a módosítás visszamenőleg meghamisítja a mérleget.

Ha a mappa létezik, de féllábon áll (nincs benne követelmény- **és** feladat-jellegű fájl),
**állj meg** és kérdezz vissza. Ilyenkor a spec kiegészítése emberi döntés, nem generálás.

### 1. Napló és felkészülés

`references/futasi-naplo-sablon.md` — a `Running.md` váza és az, mit tilos beleírni.

Hozd létre a `docs/orchestration/{feature}/Running.md` fájlt **kitöltetlenül**, még az első
delegálás előtt. Ez nem formaság: a `feature-implement` 1/c. lépése **ennek a fájlnak a
létéhez** köti a naplóvezetést. Ha nincs meg, a 2. fázis naplózás nélkül fut, és a mérés
utólag nem pótolható. Ha a fájl egy **korábbi** futásból már létezik, nem írod felül: alá
nyitsz egy dátumozott futás-blokkot (a sablon „Ha a `Running.md` már létezik" szakasza).

**A létrehozás előtt** — a spec-commit után — vedd fel a kiinduló állapotot, és írd a fejléc
mezőibe:

- a **kiinduló commitot** (`git rev-parse HEAD`). A 4. fázis jelöltkeresője ehhez képest nézi
  a változást, a munkafa commitolatlan módosításaival együtt — így a javító körökben módosult
  osztály sem marad ki. A 2. fázis végén vett HEAD a merge utáni állapot volna, amihez képest
  a diff üres.
- a **kiinduló `git status --porcelain`** teljes kimenetét. A `feature-implement` 4/1.
  ellenőrzése („csak az engedélyezett fájlok változtak") és a 7/a. záró commit ehhez képest
  diffel: ami itt már piszkos volt, az a fejlesztőé, nem a láncé.
- a **futás-azonosítót** — a futásjelző `futas` mezőjét, vagy a `FUTAS_AZONOSITO` értékét,
  ha az be van állítva („Indulás" 3.). A 3. fázis futásmérlege ezzel a névvel kérdez.

Ezzel a `feature-implement` 0/c. lépése el van végezve — a 2. fázisban csak ellenőrzi.

Töltsd ki a 0. blokkot (mit döntött el a spec-írás), majd generáld a lánc tervét.

#### 1/b. Az `Orchestrator.md` generálása

`references/orchestrator-sablon.md` — a váz, a levezetési szabály és a kérdezés esetei.

A `docs/orchestration/{feature}/Orchestrator.md`-t **te generálod**, még az első delegálás
előtt, a `plan.md` 5. szakaszának („Munkacsomagok és függőségeik") csomagjaiból és
függőségeiből: egy csomag → az alapértelmezett lánc (A), egymásra épülő csomagok →
szekvenciális csomagonkénti implementálás (C), **független csomagok → párhuzamos javaslat**
(D). Ha a levezetés nem egyértelmű (a sablon felsorolja, mikor), **kérdezz** — a választ a
fájl „Levezetés" bekezdésébe és a `Running.md` 0. blokkjába is beírod.

Ez nem a spec-írás terméke, és szándékosan nem: a `plan.md`-t minden subagent normaként
olvassa, ezért abban csak munka-tény áll (mi a csomag, mire épül), a delegálás nem. A lánc
alakja az orchestrátor döntése, és olyan fájlba kerül, amit egyik subagent sem lát.

Ha az `Orchestrator.md` **már létezik** (kézzel írták, vagy egy korábbi futás generálta), nem
írod felül: azt követi a 2. fázis, és a `Running.md` „Kiinduló állapot" blokkjába beírod, hogy
meglévő tervvel indult a lánc.

### 2. Az implementációs lánc

Töltsd be a `feature-implement` skillt a `Skill` eszközzel, és **kövesd a fázisait** a spec
mappára. Ami onnan érvényes, azt itt nem ismételjük meg — a 0/b–7. lépés az irányadó, benne:

- a spec beolvasása és a kész-kritérium forrásának azonosítása,
- a **modell-triázs** (1/b.) — a spec méretétől függő modellválasztás,
- a `spec-researcher` delegálása és a **UI-kiválasztói szerződés befagyasztása**,
- a **párhuzamos ág** külön worktree-kben (az implementálói munkafák + az e2e ág), az
  `isolation` paraméter nélkül,
- a merge utáni **kötelező** build, teszt és lint az egyesített fán (4/6.),
- az integráció, az e2e futtatás és a `spec-validator` ítélete,
- a **javító hurok** (7. lépés, legfeljebb 2 kör) — ez az, amit a fejlesztő „a validátor
  hibáit adja vissza az implementálónak" alatt ért, és **már benne van** a behívott skillben.

Amit ehhez **hozzáteszel**, mert a `feature-implement` önmagában nem tudhatja:

- A naplót **te** hoztad létre (1. fázis), tehát a naplóvezetés él — a `Running.md` blokkjait
  a behívott skill 1/c. lépése szerint töltsd.
- Az `Orchestrator.md`-t is te generáltad (1/b.), tehát a behívott skill 0/b. lépése azt
  találja, és **az** szabja meg a delegálások számát, sorrendjét és párhuzamosságát.
- A behívott skill **8. lépése (zárás) kimarad**: a stack futva marad a 6. fázis
  újravalidálásáig, és a záró commit a 7/a. fázisé. A stack-szabály (ha nem a lánc indította,
  a merge és minden backend-javítás után a fejlesztőtől kéred az újraindítást) a
  `feature-implement` 5/2. pontjában van, és itt is él.
- Ha a validátor mérlegében a **körkorlát után is** maradt `[nem teljesül]` pont, **állj meg**,
  és a 3–6. fázist ne indítsd el. Unit teszttel fedni egy olyan implementációt, amiről tudjuk,
  hogy nem teljesíti a specet, a hibát betonozná be. Jelentsd, és add vissza a döntést —
  a 7/a. korai megállás szabálya szerint (stack, futásjelző).

### 3. Kontextus- és futásmérleg — a lánc egyetlen tervezett megállása

```
node .claude/skills/cost-reducer/scripts/merleg.mjs --futas <futásnév>
node .claude/skills/futas-merleg/scripts/futas-merleg.mjs --futas <futásnév>
```

A `--futas <futásnév>` (`{feature}-<ÉÉÉÉHHNN-ÓÓPP>`, a `Running.md` „Kiinduló állapot” blokkjából)
**mindkét** mérlegben a ledger **ennek a láncnak** a sorait választja (a `kontextus-mero` sorai is
hordozzák a `futas` mezőt; a régi, mező nélküli sorok csak a szűretlen mérlegben látszanak): a hook a futásjelző („Indulás" 3.) miatt a
futásnévre könyvelt, nem a session-azonosítóra. Ha a
`FUTAS_AZONOSITO` be volt állítva, annak értéke a név (a `Running.md` „Kiinduló állapot"
blokkjában áll). Argumentum nélkül a script a ledger összes futását listázná, és egy régi
futás sorai elfednék, hogy a mostaniból semmi nem érkezett.

**Alapból `--atirat` nélkül.** Az `--atirat <a session átirata>` a session `<session-id>.jsonl`
fájlját olvasná a Claude Code projektmappájában — a munkaterületen **kívül**, ahová a
fejlesztő globális szabálya szerint natív eszközzel csak az ő kifejezett engedélyével lehet
nyúlni. A következmény: a lánc **utolsó**, még nem egyeztetett delegálása (jellemzően a
2. fázis záró validátora) a riportból **hiányozhat** — a `PreToolUse` hook egy delegálást csak a
következő delegálás előtt egyeztet, így a konvergenciagörbéből épp az utolsó kör eshet ki. Ezt
a jelentésben és a napló 7/b. blokkjában **jelezd** („az utolsó delegálás egyeztetés nélkül —
`--atirat` nem futott"). Az `--atirat` csak akkor használható, ha a fejlesztő `AskUserQuestion`-re
**kifejezetten jóváhagyta**; akkor a `--futas` mellett az egyeztetett sorok is a futásnévre
kerülnek.

**A két mérleg két külön dolgot mond, és nem helyettesítik egymást.** A `merleg.mjs` a
delegálásokba **bemenő prompt** karaktereit méri (mit lehetne szűkíteni); a `futas-merleg.mjs` a
futás **tényleges fogyasztását** (valódi token, költség, idő) és a **konvergenciagörbét**. Az
elsőből recept lesz, a másodikból ítélet arról, hogy egyáltalán haladt-e a lánc.

A futásmérlegből ezt a hármat vidd tovább a jelentésbe: az **összköltséget** (és hogy a keret hány
százaléka), a **konvergenciagörbét** (`5 → 2 → 0`), és minden **rendellenességet** (megszakadt vagy
marker nélküli validátorkör). Egy `?` a görbében mérési hiány — soha ne olvasd „nulla hibának".

Ez a pont **szándékosan** itt van, és nem máshol: a 2. fázis után már van mit mérni (a lánc
delegálásai megtörténtek), és **még van mire hatnia** (a 4. fázis unit-teszt delegálásai és a
6. fázis javító körei hátravannak). Egy jóváhagyott recept a **következő** delegálástól él,
tehát a futás végén jóváhagyva erre a futásra már semmit nem hozna.

Amit a mechanizmusról tudni kell, mielőtt ítélsz:

- A **gépi fele magától fut.** A `kontextus-mero.mjs` hook minden delegálásnál mér, és a
  **már jóváhagyott** recepteket alkalmazza — ehhez a fázishoz semmi köze. Amit itt csinálsz,
  az az **ítélő** fele: új receptet javasolsz a mért adatokból.
- **Recept nélkül nincs átírás.** Ha nincs jóváhagyott recept, a promptok érintetlenül mennek.

A menet: töltsd be a `cost-reducer` skillt a `Skill` eszközzel, és vidd végig a 0–4. fázisát
(mérleg → jelöltek → biztonsági szűrő → jóváhagyás → mentés).

**Ha nincs elég adat, ne kérdezz.** A `cost-reducer` saját szabálya, hogy két delegálásból nem
lesz recept — a mintázatot a harmadik-negyedik futás mutatja meg. Ilyenkor a helyes viselkedés
az, hogy a mérleget a naplóba írod, a jelentésben kimondod, hogy **nem volt elég adat**, és
**megállás nélkül** lépsz a 4. fázisra. Egy gyenge bizonyítékra jóváhagyott recept rosszabb,
mint semmilyen: az árát nem a hook fogja jelezni, hanem egy subagent, ami magabiztosan mást
csinál.

Írd **mindkét** mérleg **tényleges** kimenetét a napló 7. blokkjába.

A `futas-merleg`-nek nincs „nem volt elég adat" esete: az első delegálástól kezdve mér. A
riportnak a **mostani** futás delegálásait kell tartalmaznia (a 2. fázis kutatóját,
implementálóját, e2e-íróját és validátorát — vesd össze a `Running.md` delegálás-blokkjaival;
`--atirat` nélkül az utolsó, még nem egyeztetett delegálás hiánya **várt**, a fenti jelzéssel).
A `2`-es kilépési kód hibás hívás (nem létező átirat, üres napló, **ismeretlen futásnév**),
nem riport. Ha a script szerint nincs ilyen nevű futás, a session-azonosítóval
viszont van, a hook nem látta a jelzőt (hiányzott, 6 óránál régebbi volt — a `frissitve`,
ennek hiányában a `kezdet` szerint, tehát egy fázis eleji frissítés elmaradt —, vagy hibás a
tartalma) — ez **hiba**, nem adathiány. Ugyanígy, ha a riport üres vagy kevesebb delegálást
mutat, mint a `Running.md` (az egy, még nem egyeztetett utolsó delegáláson túl): a hook nincs
bekötve, vagy `FUTAS_KERET=0` van beállítva. Ezt mondd ki, ne hallgasd el.

Egy feature **újrafuttatása** új futásnevet kap (más időbélyeg), tehát a ledgerben és a hook
költségkeretében külön futás. Ha a korábbival együtt akarod látni, a `futas-merleg.mjs`
argumentum nélkül mindkettőt listázza; ha a `Running.md`-ben korábbi futás-blokk is van, a
jelentésben nevezd meg mindkét futásnevet.

### 4. A dokumentációs ág — a unit-teszt körrel párhuzamosan

`references/dokumentacios-ag.md` — **mindig töltsd be** a 4. fázisnál: a `docs-api-writer`
delegálásának alakja, mit adj át és mit ne, a leltár-kapu, és a piros kapu három esete.

Két dolog előre, mert a fázis sorrendjét ez szabja meg: a delegálást **elsőként** indítsd,
`run_in_background: true` mellett (semmi nem függ tőle), és ez az ág **kliens-only
feature-nél is fut** — a README nem csak végpontokat ír le.

### 4–6. Unit-teszt kör, lefedettségi kapu, zárókör

`references/unit-teszt-kor.md` — a három fázis részletei: a jelöltek kiválasztása, a
delegálás alakja, a 90%-os kapu, a `pom.xml` osztálylistájának bővítése, és a zárókör
négyféle találata azzal, hogy melyiket ki javítja.

**Akkor töltsd be**, ha a feature-nek van Java-oldali része. Ha nincs — kliens-only
változás —, ez a három fázis kimarad; **mondd ki a jelentésben**, és ugorj a 7. fázisra.
A fenti dokumentációs ág ilyenkor **is** lefut, és a 4. fázis egyetlen delegálása marad.

A vázlat, hogy tudd, mire számíts:

1. **4. fázis** — `scripts/unit-jeloltek.mjs` kiválasztja a jelölt osztályokat a 2. fázis
   kiinduló commitjához képest, majd osztályonként egy `java-unit-test-writer` delegálás.
   A kapu: szűretlen zöld teszt-futás és **mért** ≥90% áglefedettség.
2. **5. fázis** — a `pom.xml` lefedettségi osztálylistájának bővítése a mért számok alapján.
   Ez az egyetlen pont, ahol build-fájlhoz nyúlsz, és szándékosan **nem** az agenté.
3. **6. fázis** — ha a unit-teszt kör terméki hibát tárt fel, javító kör a
   `spec-implementer`-rel, majd **teljes** újravalidálás. Legfeljebb 2 kör, a 2. fázis
   köreitől külön számolva. Minden `server-java/`-t érintő javítás után a `dok-leltar` kapu
   újra lefut, és piros kapunál a `docs-api-writer` újra-delegálást kap
   (`references/dokumentacios-ag.md` „Backend-javítás után").

### 7. Zárás és jelentés

#### 7/a. Záró commit — egyetlen, ezzel a tartalommal

A lánc **egyetlen** záró commitja, a 6. fázis után (kliens-only feature-nél a 4. fázis
dokumentációs ága után — a záró commit ott is jár). Az implementáció és az e2e alapja a
2. fázis merge-commitjaiban már bent van; ez a commit mindazt viszi, ami **azóta** a fő fán
változott:

- az implementáció és az e2e **javító köreinek** változásai — a 2. fázis 7. lépéséből és a
  6. fázisból (`client/`, `server-java/src/main/`, `e2e/`),
- a **unit tesztek** (`server-java/src/test/`) — sorban futott körnél a fő fán keletkeztek,
  párhuzamosnál a 4/b. átvétele hozta őket,
- a **teszttervek** (`docs/test-plans/<Osztály>.md`) — osztályonként egy, a unit tesztekkel
  ugyanúgy (sorban futott körnél a fő fán, párhuzamosnál a 4/b. átvételével),
- a `server-java/pom.xml` `<includes>` listájának bővítése (5. fázis),
- a gyökér `README.md` és `openapi.yaml` (4. fázis, `docs-api-writer`),
- `docs/orchestration/_kontextus/receptek.json`, ha a 3. fázisban a fejlesztő receptet
  **jóváhagyott** (12. kivétel) — a recept döntés, mint a `Decision.md`,
- `docs/orchestration/{feature}/Running.md`, `UiSelectors.md`, és az `Orchestrator.md`, ha
  ez a futás generálta (1/b.),
- a **darabszámok frissítése** (13. kivétel): ha a 4–5. fázis új unit-teszt osztályt hozott
  vagy a `pom.xml` listáját bővítette, a `CLAUDE.md` és a `spec-konvenciok` érintett számai a
  commit **előtt** a mért értékre igazítva. Ha nem változott semmi, ezt a „Zárás" blokkba írod
  („a számok nem avultak el"), nem hallgatod el.

**Nem** kerül bele: a két mérő-napló (`docs/orchestration/_kontextus/meresek.jsonl`,
`futasok.jsonl` — a hook minden sessionben írja őket, a commitjuk a fejlesztőé), a
gitignore-olt `.scratch/`, és semmi, ami már a kiinduló `git status`-ban szerepelt. A
fájlokat **név szerint** add hozzá (`git add -- <útvonalak>`), ne `-A`-val: a mostani
`git status --porcelain` és a kiinduló lista különbsége a jelölt, és abból is csak a fenti
felsorolás. Ha ezen kívül más is változott, **állj meg** és jelentsd — az egy sávjából kilépett
ág nyoma.

Előtte: ha a lánc indította a stacket, **most** állítsd le (a Postgres-konténer marad), a
futásjelzőt töröld (`rm -f .scratch/futas-merleg/aktiv-futas.json`), és a `Running.md`
„Zárás" blokkját töltsd ki — a commit hash-e a jelentésbe kerül, nem a naplóba. Ha maradt
`[nem teljesül]` pont vagy 90% alatti osztály, a commit akkor is megtörténik, de az üzenete
kimondja. **Push nincs.**

Ha a lánc **korábban** áll meg (a 2. fázis körkorlátja, a futásmérleg-kapu `deny`-ja, egy
„állj meg és kérdezz" pont, ami után a fejlesztő nem folytatja), a stacket akkor is
leállítod, ha a lánc indította, és a futásjelzőt **akkor is törlöd** — egy ottfelejtett jelző
6 órán át a következő session delegálásait is erre a futásra könyveli, a költségkeretével
együtt. A záró commit ilyenkor a fejlesztő döntése — kérdezz.

#### 7/b. Jelentés

```markdown
# Kész: {feature} — spectől unit tesztekig

- Spec: `spec/{feature}/` — {megírva ebben a futásban | meglévő}, {N} kész-kritérium
- Delegálások: {N} — kutató {n} · implementáló {n} · e2e {n} · unit-teszt {n} · dokumentáció {n} · validáló {n}
- E2E: {N} szcenárió — {M} zöld / {K} piros, kilépési kód {…}
- Unit tesztek: {N} osztály — mért áglefedettség osztályonként
- `pom.xml` lefedettségi kapu: {N} osztállyal bővült | nem bővült, mert …
- Dokumentáció: README {szakaszok} · OpenAPI-leíró {létrehozva | +N művelet} —
  leltár-kapu kilépési kód {0 | 1, és mi maradt piros}
- Javító körök: implementációs {N} · unit-teszt eredetű {M}
- Konvergencia ([nem teljesül] körönként): {5 → 2 → 0} {| `?` = marker nélküli kör}
- Fogyasztás (futás: `{futás-azonosító}`): {N} költség-egység ≈ {X} USD (arak.json, {dátum}) — a keret {P}%-a · subagent-idő {T} perc {· az utolsó delegálás egyeztetés nélkül — `--atirat` nem futott | `--atirat` a fejlesztő jóváhagyásával}
- Felbontás: `Orchestrator.md` — {generálva, logika {A | C | D} | meglévő terv}
- Kontextus-mérleg: {N} recept jóváhagyva | nem volt elég adat
- Validátor-mérleg: X teljesül / Y nem teljesül / Z kétséges
- Branch: `feature/{feature}` · kiinduló commit `{hash}` · záró commit `{hash}` ({N} fájl)
- Stack: {a lánc indította, leállítva | már futott, nem nyúltam hozzá}
- Futási napló: `docs/orchestration/{feature}/Running.md`

---

{a záró validátor teljes jelentése}

## Amit nem mértem
{amit egyik kapu sem fedett: a `GYENGE` és `KIZÁRVA` osztályok, a kliensoldal unit-lefedettsége,
a kétséges kritériumok}

## Nyitva maradt
{a körkorlát után maradt hibák, a varrat-hiányok, a specnek nem ellentmondó gyanús viselkedés}
```

Ha maradt `[nem teljesül]` pont, 90% alatti osztály **vagy piros leltár-kapu**, **mondd ki
nyíltan** — ne jelentsd késznek. A „tesztekkel fedett kód" és a „naprakész dokumentáció"
állítás egyaránt csak mért számokkal érvényes.

---

## Fájlok

Fázisonként olvasd be, ne előre:

- `references/futasi-naplo-sablon.md` — az 1. fázis: a `Running.md` váza és a tilalmai
- `references/orchestrator-sablon.md` — az 1/b. fázis: az `Orchestrator.md` váza és levezetése
- `references/dokumentacios-ag.md` — a 4. fázis párhuzamos fele: README + OpenAPI-leíró
- `references/unit-teszt-kor.md` — a 4–6. fázis: jelöltek, delegálás, kapu, zárókör
- `scripts/unit-jeloltek.mjs` — a 4/a. fázis jelöltkeresője

Amit **behívsz**, nem olvasol előre (`Skill` eszköz, a fázisánál):
`feature-spec-writer` (0.) · `feature-implement` (2.) · `cost-reducer` (3.)
