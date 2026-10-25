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

# feature-full — egy mondattól tesztekkel fedett kódig

A bemenet **egy mondat**: egy feature-igény. A kimenet **implementált, e2e-vel és unit
tesztekkel is fedett, validált kód**, futási naplóval. A kettő közt négy meglévő darab áll
sorba, és ez a skill a sorrendjükért, az átadásokért és a javító körökért felel.

```
egy mondat
    │
 0. feature-spec-writer  ──►  spec/{feature}/          ⟵ ITT beszélgetsz a fejlesztővel
    │                         (kapu: spec-ellenoriz.mjs zöld)
 1. napló létrehozása    ──►  docs/orchestration/{feature}/Running.md
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
 7. jelentés
```

Minden felhasználónak szánt szöveg **magyar** (a projekt konvenciója szerint).

## Amit a lánc alakjáról előre tudni kell

**A 0. fázis interaktív, és ez nem hiányosság.** A `feature-spec-writer` egyesével kérdez, és
megtámadja a kimondatlan premisszákat — a repó két lezárt lánc-futásának tanulsága szerint a
hibák nagyobb része **spec-írói** hiba volt, nem implementálói. Ezt a fázist nem lehet
„automatizálni" anélkül, hogy pont az veszne el, amitől a lánc többi része mérhető. A
fejlesztő figyelme itt kell, és utána — a 3. fázis egyetlen kapuját leszámítva — nem kell.

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

**Kivételek az írási és a git-tilalom alól — pontosan öt:**

1. `docs/orchestration/{feature}/Running.md` — a futási napló, a te munkaterületed.
2. `docs/orchestration/{feature}/UiSelectors.md` — a befagyasztott UI-kiválasztói szerződés
   (a `feature-implement` 2/b. lépése írja).
3. **Commit és merge** — a 2. fázis worktree-inek egyesítése (a `feature-implement` 4. lépése
   szerint), és a 4–5. fázis unit tesztjeinek commitolása. **Push egyik sem.**
4. `server-java/pom.xml` — **kizárólag** a `check-unit-tested-classes` végrehajtás
   `<includes>` listájának **bővítése** (5. fázis). A küszöb értékéhez, a plugin
   verziójához és bármi máshoz a fájlban **nem nyúlsz**.
5. A gyökér `README.md` és a gyökér OpenAPI-leíró — **nem te írod**, hanem a
   `docs-api-writer` a 4. fázis párhuzamos ágán. A kivétel arra vonatkozik, hogy ez a két
   fájl a lánc futása alatt **megváltozhat**, és a commitba is bekerül. Ha az agent
   megakadt, a jelentés mondja ki — a dokumentumot **te nem javítod ki helyette**, mert
   akkor a leltár-kapu mérése kikerülne a láncból.

Minden más fájlra és minden más git-műveletre a tilalom él.

---

## Fázisok

### 0. A spec megírása

Ha a fejlesztő **feature-igényt** adott (nincs még spec-mappa): töltsd be a
`feature-spec-writer` skillt a `Skill` eszközzel, és vidd végig. A fázis akkor kész, ha a
`spec-ellenoriz.mjs` **zölden** lefutott — `HIBA` esetén nem mész tovább.

Ha a fejlesztő **meglévő spec-mappát** nevezett meg: ez a fázis kimarad. Mondd ki, és lépj az
1. fázisra. **Meglévő specet nem íratsz át** — a `feature-spec-writer` maga is megtagadja, és
jó okkal: egy lezárt lánc-futás után a módosítás visszamenőleg meghamisítja a mérleget.

Ha a mappa létezik, de féllábon áll (nincs benne követelmény- **és** feladat-jellegű fájl),
**állj meg** és kérdezz vissza. Ilyenkor a spec kiegészítése emberi döntés, nem generálás.

### 1. Napló és felkészülés

`references/futasi-naplo-sablon.md` — a `Running.md` váza és az, mit tilos beleírni.

Hozd létre a `docs/orchestration/{feature}/Running.md` fájlt **kitöltetlenül**, még az első
delegálás előtt. Ez nem formaság: a `feature-implement` 1/c. lépése **ennek a fájlnak a
létéhez** köti a naplóvezetést. Ha nincs meg, a 2. fázis naplózás nélkül fut, és a mérés
utólag nem pótolható.

Töltsd ki a 0. blokkot (mit döntött el a spec-írás), majd lépj tovább.

`Orchestrator.md`-t **ne** írj. Annak hiánya azt jelenti, hogy a 2. fázis az alapértelmezett
lánc-alakot használja — ez a helyes viselkedés. Az `Orchestrator.md` a spec-írás terméke,
nem a futásé.

### 2. Az implementációs lánc

Töltsd be a `feature-implement` skillt a `Skill` eszközzel, és **kövesd a fázisait** a spec
mappára. Ami onnan érvényes, azt itt nem ismételjük meg — a 0/b–7. lépés az irányadó, benne:

- a spec beolvasása és a kész-kritérium forrásának azonosítása,
- a **modell-triázs** (1/b.) — a spec méretétől függő modellválasztás,
- a `spec-researcher` delegálása és a **UI-kiválasztói szerződés befagyasztása**,
- a **párhuzamos ág** két külön worktree-ben, az `isolation` paraméter nélkül,
- az integráció, az e2e futtatás és a `spec-validator` ítélete,
- a **javító hurok** (7. lépés, legfeljebb 2 kör) — ez az, amit a fejlesztő „a validátor
  hibáit adja vissza az implementálónak" alatt ért, és **már benne van** a behívott skillben.

Amit ehhez **hozzáteszel**, mert a `feature-implement` önmagában nem tudhatja:

- A naplót **te** hoztad létre (1. fázis), tehát a naplóvezetés él — a `Running.md` blokkjait
  a behívott skill 1/c. lépése szerint töltsd.
- A fázis végén jegyezd fel, **melyik commit** volt a lánc kiindulópontja (`git rev-parse`),
  mert a 4. fázis jelöltkeresője ehhez képest nézi a változást.
- Ha a validátor mérlegében a **körkorlát után is** maradt `[nem teljesül]` pont, **állj meg**,
  és a 3–6. fázist ne indítsd el. Unit teszttel fedni egy olyan implementációt, amiről tudjuk,
  hogy nem teljesíti a specet, a hibát betonozná be. Jelentsd, és add vissza a döntést.

### 3. Kontextus- és futásmérleg — a lánc egyetlen tervezett megállása

```
node .claude/skills/cost-reducer/scripts/merleg.mjs
node .claude/skills/futas-merleg/scripts/futas-merleg.mjs
```

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

A `futas-merleg`-nek nincs „nem volt elég adat" esete: az első delegálástól kezdve mér. Ha a
riport üres, az nem adathiány, hanem **hiba** — a hook nincs bekötve, vagy `FUTAS_KERET=0` van
beállítva. Ezt mondd ki, ne hallgasd el.

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
   köreitől külön számolva.

### 7. Jelentés

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
- Fogyasztás: {N} költség-egység ≈ {X} USD (arak.json, {dátum}) — a keret {P}%-a · subagent-idő {T} perc
- Kontextus-mérleg: {N} recept jóváhagyva | nem volt elég adat
- Validátor-mérleg: X teljesül / Y nem teljesül / Z kétséges
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
- `references/dokumentacios-ag.md` — a 4. fázis párhuzamos fele: README + OpenAPI-leíró
- `references/unit-teszt-kor.md` — a 4–6. fázis: jelöltek, delegálás, kapu, zárókör
- `scripts/unit-jeloltek.mjs` — a 4/a. fázis jelöltkeresője

Amit **behívsz**, nem olvasol előre (`Skill` eszköz, a fázisánál):
`feature-spec-writer` (0.) · `feature-implement` (2.) · `cost-reducer` (3.)
