# Unit-teszt-tervek

Ebben a mappában osztályonként egy fájl van: `<Osztály>.md` — a `server-java/` egy
produkciós osztályához írt unit tesztek terve. **Verziókövetett**, hogy az esetlevezetés és a
megjelölt furcsaságok túléljék a futást, és a tesztosztállyal együtt kerüljenek review-ra.

**Ki írja:** a `java-unit-test-writer` agent, a `test-writer-java-unit` skill 1. fázisában
(strukturális vázlat), és metódusonként bővíti a 2. fázisban. Kézzel is szerkeszthető, de egy
meglévő tervet bővíteni kell, nem felülírni — a története a lényege. Egy párhuzamos unit-teszt
körben a terv a munkafa commitjával jön át a fő fára, a tesztosztállyal együtt.

**Mi van egy tervben:**

- metódusonként egy sor: mockok, bemeneti tartomány, becsült ágszám, paraméterezési stílus,
  megosztható argumentumforrás, builder-jelölt;
- a feldolgozási sorrend és a kiemelendő fixture-ök;
- metódusonként a lefedett esetek, és amit a kód **gyanúsan** csinál (ezt a teszt rögzíti, a
  döntés a fejlesztőé);
- a szándékosan lefedetlen esetek, okkal.

**Ami hiányzik:** a `server-java/pom.xml` `check-unit-tested-classes` kapulistáján lévő tíz
osztály (`ClientIpResolver`, `UserValidator`, `ProductFilter`, `ProductValidator`, `JsonInput`,
`OrderTransitions`, `AdminInterceptor`, `AuthInterceptor`, `CurrentUserArgumentResolver`,
`SessionService`) terve még a régi, gitignore-olt `.scratch/test-writer/` helyen készült, és
elveszett — ezért nincs itt. A tesztjeik megvannak; a tervük csak akkor kerül ide, ha egy új
futás újra levezeti.
