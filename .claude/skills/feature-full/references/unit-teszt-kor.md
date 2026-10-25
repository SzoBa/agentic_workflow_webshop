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

`Agent` eszköz, `subagent_type: java-unit-test-writer`, **osztályonként egy hívás**. A
független osztályok mehetnek párhuzamosan (`run_in_background: true`) — külön fájlba írnak,
tehát nem ütköznek. Worktree **nem** kell: a két ág ekkor már egyesült.

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

A számokat az agentek jelentéséből vedd át, és írd a napló 8. blokkjába — **szó szerint**,
nem összefoglalva.

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
2. Utána **futtasd újra** az érintett osztály unit tesztjeit (4/c. kapu).
3. Utána delegálj **újra** a `spec-validator`-nak — friss futás, a **teljes**
   kritériumlistára, nem csak a javított pontra. Egy javítás máshol is elronthat valamit,
   és ezt csak a teljes lista mutatja meg.

**Legfeljebb 2 ilyen kör.** Ez a korlát **külön** számolódik a 2. fázis javító köreitől: ott a
validátor ítélete indította a kört, itt a unit teszt — más jelzés, más hibaosztály. Utána állj
meg és jelentsd, mi maradt.

Végül commitold a unit teszteket és a `pom.xml` bővítését beszédes magyar üzenettel. **Push
nincs.**
