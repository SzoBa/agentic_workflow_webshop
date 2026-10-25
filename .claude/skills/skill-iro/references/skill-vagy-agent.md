# Milyen alakot vegyen fel? — az 1. fázis döntési táblája

Öt hely van, ahová egy új képesség kerülhet. A választás nem ízlés kérdése: mindegyiknek más
a **betöltési ideje**, más a **hatóköre**, és más, hogy **ki hívja**.

| Alak | Mikor töltődik be | Ki hívja | Akkor ez, ha… |
|---|---|---|---|
| **Konvenció-skill** | egy agent indulásakor, a frontmatter `skills:` mezőjével | senki közvetlenül | projekt**tények** halmaza kell egy vagy több agentnek |
| **Munkafolyamat-skill** | amikor a leírás illeszkedik, vagy `/névvel` | a fejlesztő | **eljárás** kell: fázisok, döntések, jelentés |
| **Agent** | amikor az orchestrátor delegál | egy skill vagy a fejlesztő | **külön kontextus** kell: szűkített eszközkészlet, saját kontextusablak, más modell |
| **CLAUDE.md-bejegyzés** | minden munkamenetben, mindig | — | 1–3 mondat, ami **minden** feladatnál igaz |
| **Hook** | egy eszközhívás előtt/után, gépileg | a harness | a szabálynak akkor is tartania kell, ha a prompt nem érvényesül |

## A két skill-család — ez a repó legfontosabb felosztása

**Konvenció-skill** (`spec-konvenciok`, `e2e-vaz-konvenciok`): *tényforrás*. Számozott
szakaszokból áll, az agentek szakasznévre hivatkoznak benne. Kötelező eleme két kitétel:

- **„Kiindulópont, nem bizonyíték"** — ha a leírás és a kód eltér, a **kód** az igazság, és az
  eltérést jelenteni kell.
- **„A projekttények egyetlen otthona ez a fájl"** — az agentek szándékosan nem tartalmaznak
  útvonalat, parancsot, portszámot, annotációt.

**Munkafolyamat-skill** (`test-writer-java-unit`, `feature-implement`): *eljárás*. Nem-alkuképesek
+ számozott fázisok + záró jelentés. Projekttényt csak annyit tartalmaz, amennyi nélkül a fázis
nem értelmezhető — a többiért a megfelelő konvenció-skillre hivatkozik.

**A kettő keverése a leggyakoribb hiba.** Egy fájl, amiben eljárás és ténykatalógus is van, két
ütemben avul el, és a bővítője sosem tudja, melyik felét bővíti.

## Miért kell a szétválasztás — a repó két megtörtént szétcsúszása

Nem elméleti szabály. Mindkét konvenció-skill fejlécében ott a saját esete:

- Az `e2e-test-writer` promptjába be volt másolva a World osztály metóduslistája. A váz nőtt, a
  lista nem — és az agent egy **létező képesség mellé** íratott volna új, duplikált
  fixture-építőt.
- A `spec-konvenciok` ellenőrző parancsai közül hiányzott a lint. Egy „zöld build és zöld teszt"
  jelentés így olyan kódot nyilvánított késznek, amin a CI piros volt.

Mindkettő ugyanaz a hiba: **egy tény két helyen élt.** Ezért van a `skill-iro`-ban külön nem-alkuképes
rá, és ezért figyeli az `ellenoriz.mjs` 5. ellenőrzése.

## Kell-e agent is?

Az agent akkor indokolt, ha **legalább egy** igaz:

- **Kontextus-elszigetelés.** A munka sok fájlt olvas, és a részletek nem valók a főszálba.
- **Eszközszűkítés.** A szerep megköveteli, hogy ne tudjon írni (`spec-researcher`, `spec-validator`
  → csak `Read, Grep, Glob`), vagy hogy csak egy mappába írhasson.
- **Más modell vagy gondolkodási szint.** A validálás `opus` + `effort: high`, a felderítés `sonnet`.
- **Párhuzamosítás.** Két ág egyszerre dolgozhat.

Ha egyik sem, **ne** legyen agent: egy hívási réteg, ami csak továbbadja a promptot, tiszta veszteség.

**Ha agent lesz, szinte mindig párban születik**: az agent viszi a szerepet, a módszert és a
kimeneti szerződést, a konvenció-skill a tényeket. A `skills:` mező köti össze őket. A tények soha
nem az agent-fájlba mennek — akkor sem, ha ott „kézenfekvőbb".

## Mikor NE készülj skillt

- **A képességet egy meglévő már fedi.** Ekkor bővíts. A 0. fázis leltára ezért kötelező.
- **A szabály minden feladatnál igaz, és három mondatban elfér.** Az a `CLAUDE.md` dolga.
- **A szabálynak akkor is tartania kell, ha a modell figyelmen kívül hagyja a prózát.** Az hook —
  lásd a `spec-guard.mjs` fejlécét arról, mit nyújt egy ilyen őr, és mit nem.
- **Egyszeri feladat.** Egy skill karbantartási kötelezettség; egy egyszeri munkához prompt kell.
