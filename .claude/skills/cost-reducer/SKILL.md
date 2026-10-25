---
name: cost-reducer
description: |
  A subagent-delegálások átadott kontextusát méri, és jóváhagyott recept alapján
  szűkíti: a beillesztett, máshonnan is elérhető blokkokat hivatkozásra váltja, a
  stabil részt előre rendezi, és amit egy adott szerepnek nem szabad látnia, azt
  kihagyja. A méréseket egy `PreToolUse` hook gyűjti minden delegálásnál; ez a skill
  olvassa ki őket, javaslatot tesz, a döntést TŐLED kéri, és a jóváhagyott receptet
  elmenti — a következő futás így magától felismeri a helyzetet.
  Aktiválódjon, ha a fejlesztő a delegálások költségét, a promptok méretét vagy az
  átadott kontextus szűkítését firtatja, receptet kér a mért adatokból, vagy egy
  átírás hatását akarja visszanézni. NE induljon feature megvalósítására
  (`feature-implement`) vagy spec írására (`feature-spec-writer`).
  Példa: „mennyibe kerülnek a delegálásaim, és mit lehet levágni?"
---

# cost-reducer — a delegálásoknak átadott kontextus mérése és szűkítése

Két darabból áll, és a munkamegosztás szigorú:

| | Ki | Mit |
|---|---|---|
| **gépi fele** | `.claude/hooks/kontextus-mero.mjs` | minden delegálásnál mér, és **jóváhagyott** receptet alkalmaz |
| **ítélő fele** | ez a skill | a mért adatokból **javasol**, tőled kér döntést, és a jóváhagyottat elmenti |

A hook **soha nem talál ki** rövidítést. Recept nélkül a prompt érintetlenül megy tovább.
Ez nem óvatosság: egy modell által kitalált vágás pont azt az érdemi információt viheti el,
amitől a subagent utána magabiztosan téved.

## A vezérelv — ez nem költségoptimalizálás

A repó már csinálja ezt kézzel, és a `docs/orchestration/admin-orders/Decision.md` hat
döntéséből **egyet sem** költséggel indokol. Az indokok: horgonyzás, sodródás, hamis
normativitás. Például a kliens-implementáló azért nem kapja meg a hibakatalógust, mert a
szabály az, hogy a szerver üzenetét **változtatás nélkül** mutassa — ha megkapná a
katalógust, épp az lenne a csábítás, hogy leképezze.

> A kontextus nem ingyen van. Amit átadok, azt a subagent normának vagy legalábbis
> releváns háttérnek olvassa. Egy odaadott, de oda nem tartozó dokumentum nem semleges —
> **irányt ad.** *(`Decision.md`, vezérelv)*

Vagyis a jó szűkítés elsősorban **minőségi** eszköz, aminek a költségcsökkenés a
mellékterméke. Amelyik javaslatot csak a költség indokolja, az gyanús.

## Nem alku tárgya

- **Recept nélkül nincs átírás.** A hook ismeretlen alakra mér és `defer`-t ad.
- **Nem mondasz ki nem mért számot.** Karaktert mérünk, tokent **becslünk** (≈4 karakter),
  cache-találati arányt és pénzt **nem tudunk** mérni — a harness nem adja ki. Ha egy
  javaslat előnye csak feltételezhető, azt **hipotézisnek** nevezed, nem megtakarításnak.
  (A repó saját tanulsága: a `Reflexion.md` szerint a „hatékonyabb **és olcsóbb**" állítás
  olcsóbb feléhez sosem volt adat.)
- **A döntés a fejlesztőé.** Minden recept `AskUserQuestion`-nel kerül jóváhagyásra, és a
  jóváhagyás dátuma nélkül a hook nem alkalmazza — akkor sem, ha a fájlban ott van.
- **Az elhagyás a legdrágább művelet.** Mindig indokkal, és mindig a
  `references/mit-nem-szabad-elvenni.md` átfuttatása után.
- **Nem írsz agentet, skillt vagy specet.** Ha egy javaslat úgy szólna, hogy „az agent
  definíciójába kellene tenni", azt **jelented** — az a `skill-iro` dolga.
- Magyar próza, ékezet nélküli azonosítók.

## Amit a mechanizmusról tudni kell

Mérve, 2026-08-01, Claude Code 2.1.220 — a dokumentáció ebben **téved**, ezért méréssel
dőlt el. A részletek a hook fejlécében; a lényeg:

- A `PreToolUse` **lefut** az `Agent` eszközre, és látja a **teljes promptot**.
- A `SubagentStart` **nem** kapja meg a promptot — átírásra alkalmatlan.
- Az `updatedInput` **kizárólag** `permissionDecision: "allow"` mellett érvényesül. `defer`
  mellett a hook lefut, kiadja az átírást, és a subagent mégis az eredetit kapja — **némán**.

Ennek ára van: átíráshoz `allow` kell, ami **megkerüli az adott delegálás engedélykérését**.
Ezért ad a hook `allow`-t kizárólag akkor, ha ténylegesen alkalmazott egy receptet. Ha ez
neked sok, a `COST_REDUCER=0` környezeti változó egy futásra kikapcsolja.

## Fázisok

### 0. Mérleg

```
node .claude/skills/cost-reducer/scripts/merleg.mjs
```

Kiírja delegálás-típusonként a darabszámot és a méreteket, az **ismétlődő blokkokat** (ami
több delegáláson is átment — ezek a jelöltek), az aktív recepteket a **mért** hatásukkal, és
az elutasított átírásokat.

Ha nincs elég adat, **mondd ki**. Két delegálásból nem lesz recept — a mintázatot a
harmadik-negyedik futás mutatja meg. Ilyenkor a javaslat annyi, hogy fusson még.

### 1. Jelöltek

Három osztály, csökkenő biztonságban:

| Művelet | Mit csinál | Mikor biztonságos |
|---|---|---|
| **`csere`** (behúzás → hivatkozás) | egy beillesztett blokkot fájlhivatkozásra vált | ha a címzettnek **van** olvasó eszköze, **megkapja az útvonalat**, és a prompt **felszólítja** az elolvasásra |
| **`elore`** | a stabil részt a prompt elejére mozgatja | mindig — nem vesz el semmit |
| **`elhagy`** | egy blokkot teljesen kivesz | csak akkor, ha a blokk a címzett **szerepéhez** nem tartozik, és ezt indokolni tudod |

A `csere` a legjobb üzlet, mert **veszteségmentes**: az információ nem tűnik el, csak
lekérdezéssé válik. A `feature-implement` például kimondja az implementálóról, hogy „a spec
fájljait az agent maga olvassa be" — minden beillesztett spec-részlet nála eleve redundáns.

**A `csere` buktatója:** ha a promptban csak az útvonal van, de nincs kimondva, hogy
**kötelező** elolvasni, a recept veszteségessé válik. A helyettesítő szövegnek mindig
tartalmaznia kell a felszólítást.

### 2. Biztonsági szűrő

`references/mit-nem-szabad-elvenni.md` — hat kategória, amit **soha** nem szabad kivenni,
mindegyik a repó egy konkrét döntéséből, és a hat mellé az az ellenpróba, hogy mi **látszik**
elhagyhatónak, holott nem az.

Minden jelöltet vigyél végig ezen a listán, **mielőtt** a fejlesztő elé teszed. Ami fennakad,
azt ne is javasold — ne a jóváhagyás legyen az egyetlen szűrő.

### 3. Jóváhagyás

`AskUserQuestion`, **jelöltenként egy kérdés**. A kérdés tartalmazza:

- **mit** venne ki vagy cserélne (az érintett blokk első sora és a mérete),
- **mennyi** a mért karakter-nyereség, és hogy **hány** delegálásra hat,
- **mi az indok** — és ha az indok csak a költség, mondd ki, hogy csak az,
- **mi veszne el a rossz esetben** — ez a legfontosabb mondat a kérdésben.

Ajánlott válasz az első opció; a „ne csináld" mindig legyen valódi opció.

### 4. A recept mentése

`references/recept-formatum.md` — a tár alakja, az illeszkedés szemantikája és a gépi
visszafogás.

A recept a `docs/orchestration/_kontextus/receptek.json`-be kerül, **verziókövetve**: a
receptek döntések, akárcsak a `Decision.md`, tehát reviewzhatók, és egy rossz recept eredete
visszakereshető. A `jovahagyva` dátum és az `indok` **kötelező** — nélkülük a hook nem
alkalmazza.

### 5. Visszamérés

Egy recept jóváhagyása **nem** a munka vége. A következő mérlegben nézd meg:

- **mennyit vett le ténylegesen** (`megtakaritas`, mért karakter),
- **elutasította-e a gépi visszafogás** (`allapot: "elutasitva"`) — ez azt jelenti, hogy a
  recept egy védett szöveget vitt volna el, vagy túl sokat vágott. Az ilyen receptet
  **javítani vagy visszavonni** kell, nem a küszöböt lejjebb venni.
- **romlott-e a kimenet.** Ha egy delegálás rossz eredményt adott, az eredeti prompt megvan:
  `.scratch/cost-reducer/visszajatszas/`. A visszajátszás az egyetlen módja eldönteni, hogy
  a recept volt-e az ok.

**Ha egy recept gyanúba keveredik, vondd vissza** (`jovahagyva` törlése) és jelentsd. Egy
bizonytalan recept rosszabb, mint semmilyen: a hibáját nem a hook fogja jelezni, hanem egy
subagent, ami magabiztosan mást csinál.

### 6. Jelentés

- a mérleg lényege: hány delegálás, mekkora átlag, mi ismétlődik,
- jelöltenként: mit javasoltál, mi lett a döntés, és **miért**,
- a mentett receptek azonosítója,
- **külön szakaszban, amit nem mértél** — a cache-hatás és a pénzben kifejezett
  megtakarítás ide tartozik, becslés nélkül,
- ha visszavontál receptet: melyiket és mi alapján.

## Fájlok

Fázisonként olvasd be, ne előre:

- `references/mit-nem-szabad-elvenni.md` — a 2. fázis biztonsági katalógusa
- `references/recept-formatum.md` — a 4. fázis: a tár alakja és az illeszkedés
- `scripts/merleg.mjs` — a 0. és az 5. fázis mérőeszköze
