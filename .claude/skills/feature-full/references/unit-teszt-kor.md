# A unit-teszt kör — a 4–6. fázis

Akkor töltsd be, amikor a 2. fázis implementációs lánca lefutott, a validátor mérlegében
nincs `[nem teljesül]` pont, és a feature-nek van **Java-oldali** része. Kliens-only
feature-nél ez az egész fájl kimarad — mondd ki a jelentésben, és ugorj a 7. fázisra.

## 4/a. A jelöltek kiválasztása

```
node .claude/skills/feature-full/scripts/unit-jeloltek.mjs --alap <a 2. fázis kiinduló commitja>
```

A script a megváltozott produkciós Java osztályokat sorolja fel ítélettel, mindegyikhez
indokkal. **Ne vezesd le kézzel** — a kritérium determinisztikus, és minden futásnál másképp
sikerülne.

| Ítélet | Mit csinálsz |
|---|---|
| `JELÖLT` | delegálod a `java-unit-test-writer`-nek, osztályonként **külön** futásban |
| `MÁR FIGYELT` | szintén delegálod, de a promptban kimondod, hogy **meglévő** tesztosztályt bővít — és hogy ez a 90%-os kapun **már bent lévő** osztály, tehát a build pirosra vált, ha lerontja |
| `GYENGE` | nem delegálod. A jelentésben soronként kimondod, miért nem |
| `KIZÁRVA` | nem delegálod. Ezeket integrációs teszt méri — a mockolásuk ugyanazt mérné, ráadásul a mai huzalozást betonozná be |

Az `ág≥` oszlop **alsó becslés**, nem JaCoCo-ág. Sorrendnek jó, számnak nem — mért
lefedettségi számot csak a 4/c. lépés adhat.

**Ha ötnél több `JELÖLT` van**, az első ötöt delegáld (a legtöbb elágazástól lefelé), a többit
pedig **jelentsd** külön futásra váróként. Egy húsz osztályos kör órákig fut, és a végén
ugyanaz a fejlesztői döntés áll elő, csak később.

## 4/b. Delegálás

`Agent` eszköz, `subagent_type: java-unit-test-writer`, **osztályonként egy hívás, sorban,
a fő fán**. A delegálások **ne** fussanak párhuzamosan ugyanabban a munkafában: külön
tesztfájlba írnak ugyan, de mind ugyanabban a `server-java/`-ban futtat `mvn clean test`-et,
és a `clean` a másik futás `target/classes`-át és `jacoco.exec`-jét törli — a build vagy a
mért szám lesz hamis.

**Párhuzamosan csak osztályonként külön worktree-ben.** Ha a sorban futás túl lassú, és
több jelölt van.

**Előfeltétel — a produkciós kód commitolt.** Párhuzamos kör **csak** akkor indulhat, ha a
`git status --porcelain -- server-java/src/main` a `Running.md`-be írt **kiinduló** listához
képest **nem mutat új sort**. A munkafák `HEAD`-ből ágaznak, a `HEAD` pedig a commitolt
állapot: a 2. fázis javító köreinek commitolatlan változásait (7. lépés — azok a záró commitig
a fő fán maradnak) egyik munkafa sem látná, és a tesztek a javítás **előtti** kódot mérnék. Ha
van új sor, a **teljes** kör sorban fut, a fő fán — osztályonkénti kivételezés nélkül.

1. Osztályonként egy munkafa, a fő fa **mostani** `HEAD`-jéből, egy közös időbélyeggel:
   `git worktree add .claude/worktrees/{feature}-unit-<Osztály> -b wt/{feature}-unit-<Osztály>-<ÉÉÉÉHHNN-ÓÓPP> HEAD`
   — előtte `git worktree list`, ugyanazzal a „már létezik → állj meg és kérdezz" szabállyal,
   mint a `feature-implement` 3/a. lépésében.
2. A prompt első bekezdése a munkagyökér — a `feature-implement` 3/a. lépésének bekezdése, a
   **relatív** parancsalakkal együtt: minden parancs a repó gyökeréből,
   `cd .claude/worktrees/{feature}-unit-<Osztály> && <parancs>` alakban (a Maven-futás:
   `cd .claude/worktrees/{feature}-unit-<Osztály>/server-java && mvn clean test`) — a
   subagent cwd-je a fő session **aktuális** könyvtára, és hívásonként oda áll vissza, ezért a
   delegálás előtt `pwd`, és ha kell, `cd` a repó gyökerébe (`feature-implement` 3/a.,
   „Előfeltétel”). A `<parancs>` a
   `.claude/settings.json` `permissions.allow` mintáihoz igazodik (`mvn test …` /
   `mvn clean test …`, `node .claude/skills/…`); ez az alak **engedélykérés nélkül** fut.
   Abszolút `cd "D:/…"` előtag nem. Friss munkafában a `node_modules` és a `target/`
   hiányzik; a Maven-futáshoz ez nem akadály.
3. **Közös `support/` fixture-t ne emeljen ki** egyik agent sem — két párhuzamos ág ugyanazt
   a fájlt írná, és az összefésülés ütközne. Ezt a promptban mondd ki; a közös fixture
   kiemelése az összefésülés **után** a te javaslatod a jelentésben (vagy egy újabb, sorban
   futó delegálás), nem az agenteké.
4. **Átvétel.** Ha egy ág kész: `git -C <munkafa> add -A` és `git -C <munkafa> commit`, majd a
   fő fán `git checkout <ág> -- <az ág tesztfájljai>` — így a tesztek a fő fán commitolatlanul
   landolnak, és a 7/a. záró commitba kerülnek, nem külön merge-be. A fájllistát a
   `git -C <munkafa> show --name-only --format= HEAD` adja; ha a `server-java/src/test/` alatti fájlokon és a
   saját `docs/test-plans/<Osztály>.md` tervén kívül más is van benne, **állj meg** — az ág
   kilépett a sávjából. A terv verziókövetett, tehát ugyanez a commit és ugyanez a
   `git checkout` hozza át, kézi mentés nem kell.
5. **Ellenőrizd, hogy a terv átjött**: a fő fán ott van a `docs/test-plans/<Osztály>.md`. Ha az
   agent mégis a `.scratch/`-be írt valamit, azt a munkafa eltávolítása **előtt** mentsd át —
   a `.scratch/` gitignore-olt, és a `git worktree remove` végleg törli.
6. Utána `git worktree remove` (és szükség esetén `prune`, a `feature-implement` 4/5. pontja
   szerint). A branch-et ne töröld.
7. **A jelentett szám az összefésült fán futtatott egyetlen `mvn clean test`-ből jön**
   (a fő fán, a repó gyökeréből: `cd server-java && mvn clean test && cd ..` — a
   `feature-implement` „Parancsok — mindig a repó gyökeréből” szabálya), a `target/site/jacoco/jacoco.csv` osztálysoraiból — nem az
   agentek saját munkafás méréséből. Azok egy-egy osztályt mértek elszigetelten; a kapu az
   összefésült állapotra szól.

A `model` a 2. fázis triázsát követi (`inherit` egyszerű spec, `opus` összetett).

A promptban add át:

- **az osztály teljes minősített nevét** — pontosan egyet,
- a **spec mappa útvonalát**, ha az osztály viselkedése normát követ (a szó szerinti magyar
  hibaüzenetek onnan jönnek, és a teszt ezekre asszertál),
- az implementáló jelentésének **az osztályra vonatkozó szeletét**, kimondva, hogy ez
  **mutató a bizonyítékhoz, nem bizonyíték**,
- hogy `MÁR FIGYELT` osztálynál meglévő tesztet bővít.

Amit **ne** adj át: a felbontási tervet, a futási naplót, a teljes validátor-jelentést, a
másik osztály jelentését. Aki a megvalósítás tervét olvassa, azt fogja mérni, nem a
viselkedést.

## 4/c. A kapu

A kör akkor kész, ha:

1. a **szűretlen** teszt-futás zöld (a szűrt futás a `@Nested` osztályokat nem futtatja, és
   `Tests run: 0`-val **zölden lép ki** — a részletek a `spec-konvenciok` 3. szakaszában),
2. minden delegált osztályra van **mért** áglefedettség, és az ≥ 90%,
3. ami nem éri el, ahhoz **megindokolt** magyarázat van, nem kitöltő teszt.

A számokat sorban futott körnél az agentek jelentéséből, párhuzamosnál az összefésült fa
`mvn clean test`-jéből (4/b. 7. pont) vedd át, és írd a napló 8. blokkjába — **szó
szerint**, nem összefoglalva.

## 5. A lefedettségi kapu bővítése

Ez az a pont, ahol a `pom.xml`-hez nyúlsz — és ezért **nem** a unit-teszt agenté: a
`check-unit-tested-classes` listája tartós CI-kötelezettség, a bővítése pedig ne lehessen egy
elakadt teszt-kör legkényelmesebb kiútja. A `unit-test-write` guard-mód emiatt tiltja is neki.

Minden osztályra, amelyik a 4/c. kapuját **mért** számmal teljesítette, és még nincs a
listán, vegyél fel egy `<include>` sort. Amelyik nem érte el a 90%-ot, azt **ne vedd fel** —
a lista csak olyan osztályt tartalmazhat, ami valóban fölötte van, különben a következő teljes
teszt-futás pirosra vált.

A küszöb értékéhez **nem nyúlsz**. Ha egy osztály nem fér be, a lista marad, és a jelentés
mondja ki, miért.

Utána futtasd le a **tiszta** teljes ellenőrzést, hogy a most bővített kapu tényleg zöld: a
lefedettségi adatfájl hozzáfűz a korábbi futásokhoz, tehát csak tiszta futásból idézhető szám.

## 6. Zárókör

A 4. fázis négyféle találatot hozhat vissza. **Ezek nem ugyanazok**, és összekeverni őket a
mérés elrontása:

| Amit az agent visszahozott | Mit jelent | Ki javít |
|---|---|---|
| **Megjelölt gyanús viselkedés**, ami **ellentmond** a spec egy kész-kritériumának | terméki hiba, amit az e2e és az integrációs teszt nem fogott meg | `spec-implementer` — javító kör |
| **Megjelölt gyanús viselkedés**, ami a specnek **nem mond ellent** | a kód olyat csinál, ami nem volt szándék, de nem is norma | senki most — **jelentsd**, a döntés a fejlesztőé |
| **Varrat-hiány** (az osztály nem tesztelhető refaktor nélkül) | tervezési adósság | senki most — jelentsd javaslatként |
| A unit teszt bukik, mert a **teszt** rossz | a mérés hibája | `java-unit-test-writer`, újra-delegálva a konkrét bukással |

**Terméki hiba esetén**, a `feature-implement` 7. lépésének szabályai szerint:

1. Delegálj a `spec-implementer`-nek — **csak a konkrét hibával**: a megsértett
   kész-kritérium, a bukó unit teszt tényleges kimenete, és a `fájl:sor` bizonyíték. Ne
   indítsd újra az implementációt. A `model` egy fokozattal feljebb megy.
2. Utána **futtasd újra a szűretlen** `mvn clean test`-et (4/c. kapu; a gyökérből,
   `cd server-java && mvn clean test && cd ..`) — nem `-Dtest`-tel:
   a generált tesztek `@Nested` tagolásúak, és a szűrt futás `Tests run: 0`-val zölden lép ki.
3. A futó backend a javítás **előtti** kódot szolgálja ki: indítsd újra (vagy kérd) a
   `feature-implement` 5/2. pontjának szabálya szerint, mielőtt a validátor élő stack ellen mér.
4. **Dokumentációs kapu újra** — ha a javítás a `server-java/`-t érintette: a repó gyökeréből
   `node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs`. A 4. fázis dokumentációs ága
   a javítás **előtti** kódot írta le; egy új, átnevezett vagy törölt végpont a README-t és a
   leírót csendben elavultatja. `0` → rendben, a kimenetet a napló 8/b. blokkjába írod. `1` →
   **újra-delegálás** a `docs-api-writer`-nek a kapu tényleges kimenetével
   (`references/dokumentacios-ag.md` „Backend-javítás után"); a kaput te nem zöldíted kézzel.
5. Utána delegálj **újra** a `spec-validator`-nak — friss futás, a **teljes**
   kritériumlistára, nem csak a javított pontra. Egy javítás máshol is elronthat valamit,
   és ezt csak a teljes lista mutatja meg.

**Legfeljebb 2 ilyen kör.** Ez a korlát **külön** számolódik a 2. fázis javító köreitől: ott a
validátor ítélete indította a kört, itt a unit teszt — más jelzés, más hibaosztály. Utána állj
meg és jelentsd, mi maradt.

Itt **nincs** külön commit: a unit tesztek és a `pom.xml` bővítése a `SKILL.md` 7/a. fázisának
egyetlen záró commitjába kerül, a többi változással együtt.
