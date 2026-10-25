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
```

A kimenet a **validáló ítélet-jelentése**, az e2e futás tényleges eredményével együtt.

Ha a feature-höz tartozik **felbontási terv** (`docs/orchestration/{feature}/`), a lánc alakját
**az** szabja meg — akár négy vagy több delegálással —, és a futásról **naplót kell vezetni**.
Lásd a 0/b. és az 1/c. lépést.

Minden felhasználónak szánt szöveg **magyar** (a projekt konvenciója szerint).

## Alapszabály — orchestrálás, nem kódolás

Ebben a skillben **te magad nem írsz kódot**. A kódot a `spec-implementer` subagent írja, az
elfogadási teszteket az `e2e-test-writer`, a kódbázis felderítését a `spec-researcher`, az
ellenőrzést a `spec-validator` végzi. A te dolgod a lánc vezetése, a két ág integrálása és a
jelentések továbbadása.

- **A `spec/` mappa fájljait senki nem módosítja** — a `tasks.md` checkboxait sem.
- **Ne írj át forrásfájlt** „gyors javításként" — ha hiba van, a megfelelő ágnak delegálod.
- **A kutató és a validáló szinkron fut** (`run_in_background: false`), mert a rájuk épülő
  lépés az eredményükre vár. Az **implementáló és az e2e-teszt-író párhuzamosan**, két külön
  worktree-ben (3. lépés) — ők nem egymásra épülnek, hanem ugyanarra a befagyasztott
  UI-kiválasztói szerződésre.
- **Ne pushol** semmit, és branch-et ne törölj.

**Kivételek az írási és a git-tilalom alól — pontosan három:**

1. `docs/orchestration/{feature}/Running.md` — a futási napló, a te munkaterületed.
2. `docs/orchestration/{feature}/UiSelectors.md` — a befagyasztott UI-kiválasztói szerződés
   (2/b. lépés).
3. **A két worktree commitolása és a branch-ek merge-e** (4. lépés). Ez azért a tiéd, mert a
   subagentek nem tudják megtenni: a `spec-guard.mjs` mindkét ágon tiltja a git-mutációt.
   Ez a kivétel **kizárólag** a 4. lépés commit + merge műveletére szól. **Push soha.**

Minden más fájlra és minden más git-műveletre a tilalom él.

## Munkafolyamat

### 0. A feature feloldása

- Ha a felhasználó megadta a feature nevét vagy a mappa útvonalát, azt használod.
- Ha nem adta meg: `Glob`-bal listázd a `spec/*/` mappákat, és `AskUserQuestion`-nel kérdezz
  vissza, melyikre gondolt. **Ne találgass.**
- A listában három **történeti** mappa is szerepel (a `week3/` alól kerültek ide
  2026-08-02-án) — melyik és miért, azt a `spec-konvenciok` 5. szakasza mondja meg. Ezek a
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

Nézd meg, létezik-e **`docs/orchestration/{feature}/`** mappa. Ha igen, az tartalmazza a feature
subagent-felbontásának tervét, és **az** szabja meg a lánc alakját — nem az alábbi
alapértelmezett sorrend.

| Fájl | Szerep |
|---|---|
| `Orchestrator.md` | **A felbontás terve.** Melyik subagent mit kap, mit ad vissza, mi a validálási szempontja, és mit tart meg magának az orchestrátor. |
| `Running.md` | **Futási napló.** Kitöltetlen sablon, amit ez a futás tölt ki (1/c. lépés). |
| `Decision.md` | A kontextus-átadási döntések indoklása. Olvasd el, de ne add tovább. |
| `UiSelectors.md` | **A befagyasztott UI-kiválasztói szerződés** — nem előfeltétel, ezt a futás állítja elő (2/b. lépés). Ha már létezik egy korábbi futásból, azt **felülírod**: a szerződést mindig az aktuális kutatói jelentés adja. |

Amit az `Orchestrator.md`-ből ki kell venned: **hány delegálás van, milyen sorrendben, melyik
subagenttel, és mindegyik pontosan milyen kontextust kap.** Ha a terv négy delegálást ír le,
négyet futtatsz, nem hármat.

**Ez a mappa egyetlen subagenthez sem jut el.** Sem a tartalma, sem a hivatkozás rá. Két oka
van: a szervezés metaszintje az implementálónak zaj, és a `spec/` mappán kívül azért van, mert
a spec-agentek `Glob`-bal beolvassák a spec-mappa összes `.md` fájlját, és **normatívnak**
tekintik — egy futási napló ott hamis követelményként viselkedne.

Egyetlen finomítás: a `UiSelectors.md` **tartalma** eljut mindkét párhuzamos ághoz (3. lépés) —
az az egész értelme. Az **útvonala** nem: a szerződést a prompt törzsébe másolod be.

Ha nincs ilyen mappa, a lánc alakja az alapértelmezett, és nincs naplóvezetés — de a
`UiSelectors.md` akkor is elkészül (2/b.), mert a párhuzamos ágnak az a feltétele.

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

A subagentek frontmatterében van alapértelmezett modell, de az `Agent` hívás `model`
paramétere **felülírja** azt. A spec beolvasása után döntsd el, melyik kategória, és a
delegáláskor add át a `model` paramétert. A szabály **mérhető** — ne érzésre dönts:

**Összetett a spec, ha bármelyik igaz:**
- háromnál több `.md` fájl van benne (azaz normatív melléklete is van: végpont-referencia,
  hibakatalógus, konformancia-esetek),
- **fázisokra** oszlik,
- a spec fájljai együtt **800 sornál** hosszabbak,
- **20-nál több** kész-kritérium van benne.

Egyébként egyszerű.

| Subagent | Egyszerű spec | Összetett spec |
|---|---|---|
| `spec-researcher` | `sonnet` | `opus` |
| `spec-implementer` | `inherit` (a session modellje) | `opus` |
| `e2e-test-writer` | `inherit` | `opus` |
| `spec-validator` | `opus` | `opus` |

Két szándékos aszimmetria:

- **Felfelé lépünk, lefelé nem.** Az implementáló sosem kap a session modelljénél
  gyengébbet: itt a hiba a legdrágább, mert végigfut a láncon, és csak egy teljes
  validátor-körben derül ki.
- **A validátor mindig `opus`.** Ő a lánc bizalmi horgonya; egy gyenge validátor hamis
  `[teljesül]`-t ad, amire a lánc készként épít tovább. A spórolás itt pont a legrosszabb
  helyen jönne be, és keveset is hoz — a validátor kevesebbet olvas, mint a kutató.

**Javító körben** (7. lépés) a javító ág egy fokozattal feljebb megy (`inherit` → `opus`):
amit egy modell egyszer elrontott, azt másodszor is elronthatja. A javító körök ritkák, a
költsége elhanyagolható.

Ha a `CLAUDE_CODE_SUBAGENT_MODEL` környezeti változó be van állítva, az **mindent felülír**,
és ez a triázs hatástalan — ilyenkor ne is írj róla a jelentésben.

### 1/c. Naplóvezetés — minden delegálás előtt

Ha van `docs/orchestration/{feature}/Running.md`, akkor **minden egyes delegálás előtt** ki kell
tölteni a hozzá tartozó blokkot, és a jelentés visszaérkezése után lezárni. Nem a futás végén,
összefoglalva — **előtte**, a ténylegesen elküldött promptból.

| Mikor | Mit töltesz ki |
|---|---|
| A delegálás **előtt** | *Átadott kontextus* — mit adsz át ténylegesen, tömören felsorolva. *Modell* — az 1/b. triázs szerint. |
| A jelentés **után** | *Kellett-e újra-delegálni vagy pontosítani* · *A visszaadott összefoglaló validálható volt-e* · *Mit kellett pontosítani a kimenetből*. |
| A **4. lépés után** | Az „Integráció (worktree merge)" blokk: a két branch neve, a `git diff --stat`, és hogy tiszta volt-e a merge. |
| Az **5. lépés után** | Az „E2E futás" blokk: a tényleges kimenet és a kilépési kód. |
| A lánc **végén** | A „Javító körök" és a „Zárás" blokk. |

A párhuzamos ág (3. lépés) **két** delegálás-blokkot kap, nem egyet — az `e2e-test-writer`-ét
is ugyanúgy ki kell tölteni indítás előtt, mint az implementálóét.

Miért előtte: az „átadott kontextus" mező pont akkor értékes, ha a **szándékot** rögzíti, nem az
utólagos emlékezetet. Ha a futás végén töltöd ki, azt írod le, amit a subagent *válaszából*
visszakövetkeztetsz — és épp az veszik el, hogy mit hagytál ki szándékosan.

A `UiSelectors.md`-vel együtt ez a **két** fájl, amit ebben a skillben írsz. Ne írj bele semmit,
ami nem történt meg: a kitöltetlen mező őszintébb, mint a kitalált.

### 2. Delegálás a `spec-researcher` subagentnek

`Agent` eszköz, `subagent_type: spec-researcher`, szinkron futás, `model` az 1/b. triázs
szerint.

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
alatt ír, az e2e-teszt-író **kizárólag** az `e2e/` alatt, és ezt nem ígéret tartja, hanem a
`spec-guard.mjs` `impl-write` / `e2e-write` módja gépileg kikényszeríti. Ezért a 4. lépés
merge-e ütközésmentes kell hogy legyen — egy ütközés önmagában is hibajelzés.

És miért **előre**, nem utólag: ha az e2e-teszt-író az implementáló után futna, csak leírná,
ami már elkészült. Így viszont a szerződés **kétoldalú norma**: az implementálónak elő kell
állítania azokat a fogantyúkat, az e2e-írónak pedig pontosan azokat kell használnia.

#### 3/a. A worktree-ket TE hozod létre — ne az `isolation` paraméterrel

**Ne használd az `Agent` hívás `isolation: "worktree"` paraméterét.** Az a repó
**alapértelmezett** branchéből (`main`) ágaztat, nem a kijelentkezettből, és a munkafát a fő
repó `.claude/worktrees/` mappájába teszi. Egy feature-branchen dolgozva ez azt jelenti, hogy a
subagent **nem látja sem a specet, sem a mérendő rendszert, sem a `.claude/` aktuális állapotát**
— a guard a saját módját sem ismerné fel, tehát a diszjunktságot semmi nem tartaná. Ez a 2026-07-30-i
`admin-orders` próbafutáson derült ki, és mindkét ágat le kellett állítani.

Helyette, a delegálás előtt:

```bash
git worktree add <gyökér>/../wt-{feature}-impl -b wt/{feature}-impl HEAD
git worktree add <gyökér>/../wt-{feature}-e2e  -b wt/{feature}-e2e  HEAD
```

A `HEAD` a lényeg: **a jelenlegi branch csúcsából** ágaztat, tehát a worktree tartalmazza a
specet, az `e2e/` vázat és a `.claude/` mai állapotát.

**Utána — mielőtt bármelyik `Agent` hívást elindítanád — ellenőrizd:**

```bash
git worktree list                     # a két új munkafa a jelenlegi HEAD-en áll?
ls <impl-worktree>/spec/{feature}     # ott van-e a megbízás?
```

Ha a HEAD nem egyezik, **állj meg** — a lánc rossz alapról indulna, és ez csak az integrációnál
derülne ki.

Ezután **egyetlen üzenetben két `Agent` hívás**, `run_in_background: true`, `isolation`
**nélkül**. Mindkét promptnak a **legelső** bekezdésében ott kell lennie a munkagyökérnek:

> A munkagyökered: `<abszolút útvonal>`. Minden fájlműveletet és minden parancsot **ott**
> végezz — nálad a repó gyökere ez a mappa. A fő munkafához (`<a fő munkafa útvonala>`) **ne
> nyúlj**: ott egy másik ág dolgozik ugyanezen a feature-ön.

Ez azért kritikus, mert a subagent `CLAUDE_PROJECT_DIR`-je a **fő** munkafára mutat: egy relatív
útvonalú írás oda menne, ahol a másik ág dolgozik. A `spec-guard.mjs` a saját munkafája
gyökeréhez relativizál (`gitRootOf`), tehát a worktree-n belüli útvonalakat helyesen ítéli meg —
de a fő munkafába tévedő írást nem tudja megkülönböztetni a jogostól. Ezt a 4. lépés 1. pontja
fogja meg utólag.

| Ág | `subagent_type` | Mit adsz át a promptban |
|---|---|---|
| **Implementáló** | `spec-implementer` | a kutató jelentését **szó szerint** · a spec mappa útvonalát (a spec fájljait az agent maga olvassa be; ez a definíciója) · ha a spec fázisokra oszlik: melyik fázis a megbízás · **a UI-kiválasztói szerződést szó szerint**, kimondva, hogy **kötelező érvényű** · emlékeztetőt: a feladatlista sorrendjében haladjon, a spec hibaüzeneteit **szó szerint** használja, és csak **zöld build + zöld teszt + zöld lint** után jelentsen készet · hogy friss worktree-ben dolgozik, tehát a `node_modules`-hoz `npm ci` kell |
| **E2E** | `e2e-test-writer` | hogy **előretolt módban** dolgozik · a feature nevét és a Gherkin-címkét (`@{feature-magyar-kebab}`) · a **kész-kritériumokat szó szerint** — azokat, amelyek végponttól végpontig mérhetők · **a UI-kiválasztói szerződést szó szerint** · az érintett útvonalakat (`/admin/orders`) · a `spec/backend/hibakatalogus.md` érintett sorait **szó szerint** |

Az e2e ág **nem** kapja meg: a kutató jelentését, a spec teljes szövegét, a felbontási tervet.
Ez nem takarékosság, hanem mérés-higiénia: aki a megvalósítás tervét olvassa, azt fogja mérni,
nem a kész-kritériumot.

**A két jelentést külön vedd át**, és a `Running.md`-ben külön blokkba írd. Ha az egyik ág
elakad, a másik eredménye attól még érvényes — az integrációnál mondd ki, melyik ág mit hozott.

#### 3/b. Munkacsomagokra bontott implementáció

Ha a `tasks.md` munkaegységei **`*Gazda:*`** sorral munkacsomagokhoz vannak rendelve (jellemzően
réteg szerint: backend / kliens), akkor **csomagonként külön** delegálsz — nem egyetlen futásban
az egészet. Ilyenkor:

- **Minden csomag saját `spec-implementer` futást kap**, a `tasks.md` függőségi sorrendjében.
  Ha az egyik csomag a másik kimenetére épül (pl. a kliens a backend által megírt típusokra),
  a futások **szekvenciálisak**.
- A promptban **nevezd meg a csomagot** („a B csomag a megbízás"), és add át a `plan.md`
  **fájltulajdon-táblázatát** kemény korlátként. Ami nincs a csomag sorában, ahhoz nem nyúl —
  ha úgy tűnik, muszáj lenne, azt **jelenti**.
- **A csomagok kontextusa elkülönített.** A második csomag nem kapja meg az első jelentését
  egészben, csak azt a szeletet, ami az érintkezési felületről szól (a `plan.md`-ben
  befagyasztott szerződés **tényleges** megvalósult alakját). Az `Orchestrator.md` megmondja,
  pontosan mit.
- **Az érintkezési felület ellenőrzése a te dolgod.** Amikor az első csomag jelentése beérkezik,
  vesd össze a `plan.md`-ben rögzített szerződéssel. Ha eltér, azt jegyezd fel a `Running.md`
  integrációs blokkjába, és a **tényleges** alakot add tovább — nem a szándékot.
- A fájltulajdon betartatása szintén a te felelősséged: ha egy csomag jelentése olyan fájlt
  említ, ami nem az övé, az **integrációs ütközés** — írd be a naplóba, és javító körrel
  rendezd.
- **A csomagok mind UGYANABBAN az implementáló worktree-ben futnak, egymás után.** Mivel a
  worktree-t a 3/a. szerint te hozod létre, ráirányíthatod a következő csomagot is — nem kell
  csomagonként integrálni. A második csomag így természetesen látja az elsőt, és a fájltulajdon
  betartatása marad az egyetlen elválasztás, ahogy a `plan.md` szánta.
- **Az e2e ág a teljes csomaglánccal párhuzamos**, nem indul újra csomagonként. A saját
  worktree-je ugyanabból a HEAD-ből ágazik el — a fájltulajdon miatt a végén akkor is
  ütközésmentesen mergelhető. Az e2e-teszt-írónak a munkacsomagok felosztása nem információ:
  ő a kész-kritériumot méri, nem a munkaszervezést.

### 4. Integráció — a két branch egyesítése

Ez az a lépés, ahol git-műveletet **te** végzel — a subagentek nem tudnak, mert a guard tiltja.

Ha nem indult el a párhuzamos ág (nincs kliens-felület, 2/b.), akkor csak az implementáló ága
van: a 2–3. pont ugyanúgy lefut rá, az 5. lépés viszont kimarad.

1. **Először a fő munkafát nézd meg**: `git status --porcelain` a fő munkafán. Ott **csak** a te
   orchestrációs fájljaid (`Running.md`, `UiSelectors.md`) változhattak. Bármi más azt jelenti,
   hogy egy ág relatív útvonallal a fő fába írt a saját worktree-je helyett (3/a.) — **állj meg**,
   és jelentsd: az ilyen írás megkerülte az elválasztást, tehát a mérés nem érvényes.
2. **Áganként commit.** Előbb `git -C <worktree> status --porcelain`: ha üres, az az ág nem
   írt semmit — ezt **mondd ki** a jelentésben, ne csendben lépj tovább. Egyébként
   `git -C <worktree> add -A`, majd `git -C <worktree> commit -m "…"` beszédes magyar üzenettel.
3. **Merge a jelenlegi branch-re**, a fő munkafán: előbb az implementáló ága, utána az e2e ága,
   mindkettő `--no-ff`-fel, hogy a párhuzamos szerkezet a történetben is látszódjon.
4. **Ütközésnél állj meg**, és jelentsd. A két diffnek a fájltulajdon miatt diszjunktnak kell
   lennie; egy ütközés azt jelenti, hogy valamelyik ág kilépett a sávjából — ez a `Running.md`
   integrációs blokkjába megy, és javító kört indokol, nem kézi feloldást.
5. Sikeres merge után a **munkafák** eltakaríthatók (`git worktree remove <útvonal>`), de a
   **branch-eket ne töröld**, és ne pushol. Mit kezd velük, a fejlesztő döntése.

### 5. E2E futtatás az egyesített fán

Most áll elő először az az állapot, amiben a szcenáriók futtathatók: a felület megvan, a
tesztek megvannak, egy fában.

1. **Előfeltétel.** Ha `e2e/node_modules` hiányzik: `cd e2e && npm install`, majd
   `npx playwright install chromium` (az `e2e/README.md` egyszeri lépése; az `e2e/` önálló
   npm-projekt, nem workspace-tag).
2. **Stack.** Nézd meg, fut-e: `curl -s http://localhost:3001/api/health`. Ha nem, indítsd el
   **háttérben** a repó gyökeréből (`.\start.cmd` Windowson, `./start.sh` egyébként), és várd
   meg, amíg a `/api/health` és az 5173 válaszol. Ha a `start` **portütközés miatt utasítja el**
   az indulást (3001 vagy 5173 foglalt), állj meg és jelentsd — ez környezeti akadály, ne vonj
   le belőle következtetést a feature-re.
3. **Dry-run:** `cd e2e && npm run e2e -- --dry-run --tags "@{címke}"`. Ez fogja meg a
   definiálatlan és a **kétszer definiált** (`Ambiguous`) lépéseket. Előretolt módban az
   e2e-teszt-író ezt nem tudta futtatással kizárni, csak `Grep`-pel — itt dől el.
4. **Éles futás:** `npm run e2e -- --tags "@{címke}"`, majd regresszióként a **teljes** suite
   címke nélkül. A meglévő szcenáriók bukása is eredmény: azt is jelentsd.
5. **Kilépési kódok:** `0` zöld · `1` bukott szcenárió · **`2` = el sem indult** (nem fut a
   stack, rossz kapcsoló). A `2` **környezeti hiba, nem a feature hibája** — ne írd a
   kész-kritérium terhére.
6. Ha te indítottad a stacket, a futás után **állítsd le**. A Postgres-konténer szándékosan
   futva marad (ezt a `start` így csinálja) — ne bontsd le.

A tényleges kimenetet — a szcenárió/lépés összegzést és a kilépési kódot — szó szerint írd a
`Running.md` „E2E futás" blokkjába. Ez lesz az egyik bizonyíték a 6. lépésben.

### 6. Delegálás a `spec-validator` subagentnek

`Agent` eszköz, `subagent_type: spec-validator`, szinkron futás, `model: opus` (mindig).

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

Ha a validáló talált **`[nem teljesül]`** pontot, vagy az 5. lépés e2e futása piros:

1. **Előbb nevezd meg, melyik ág hibázott.** Most két ág van, és a rossz ágnak delegálni
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
   **A javító körök a fő fán futnak, worktree nélkül** (nincs `isolation`): a két ág ekkor már
   egyesült, egy javítás pedig nem párhuzamosítható.
3. Ha e2e-t érintő javítás történt, **futtasd újra az 5. lépés 3–4. pontját**.
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

A `futas-mero.mjs` hook a delegálás előtt megállíthatja a láncot, ha a futás elérte a
költségkeretet, megállt a konvergencia (két egymást követő kör nem csökkentette a `[nem teljesül]`
számot), vagy **oszcilláció** van (egy már teljesült kritérium újra bukik). A tiltás szövege
megnevezi a szabályt és a számokat.

Ha ez bekövetkezik, **az a lánc vége, nem egy akadály**:

1. Állj meg, és jelentsd a fejlesztőnek a tiltás számait, a konvergenciagörbét és azt, mi maradt.
2. **Ne kerüld meg.** Ne indítsd újra ugyanazt a delegálást, ne darabold kisebbekre a korlát alá
   kerülésért, és ne állítsd `FUTAS_KERET=0`-ra. A küszöb és a kikapcsoló a **fejlesztő** döntése.
3. A részletes mérleghez: `node .claude/skills/futas-merleg/scripts/futas-merleg.mjs`.

A kapu a körkorlátot **nem** kényszeríti ki (az alapból kikapcsolva van) — azt továbbra is a fenti
két-kör szabály tartja. A kapu azt fogja el, amit a körszámláló nem: a sok kicsi delegálást, ami
sosem ér el a 2. körig.

## Kimenet

A skill hivatalos kimenete a **validáló jelentése**. Elé tegyél egy rövid magyar összefoglalót:

```markdown
# Implementáció kész: {feature}

- Spec: `spec/{feature}/` — {egyszerű | összetett}, {N} fájl, {M} kész-kritérium
- Felbontás: {alapértelmezett | `docs/orchestration/{feature}/Orchestrator.md` szerint}
- Delegálások: {N} — {ágakra bontva, pl. kutató 1 · implementáló 2 · e2e 1 · validáló 1}
- Modellek: kutató `{…}` · implementáló `{…}` · e2e `{…}` · validáló `{…}`
- Párhuzamos ágak: `{impl-branch}` + `{e2e-branch}` — merge: {tiszta | ütközés: …}
  {vagy: „nincs kliens-felület, a párhuzamos ág kimaradt"}
- E2E: {N} szcenárió — {M} zöld / {K} piros, kilépési kód {…} (`npm run e2e -- --tags "@{címke}"`)
- Javító körök száma: N
- Mérleg: X teljesül / Y nem teljesül / Z kétséges
- Módosított fájlok: … (a két ág jelentéséből)
- Futási napló: `docs/orchestration/{feature}/Running.md` — {kitöltve | nincs ilyen mappa}
- UI-kiválasztói szerződés: `docs/orchestration/{feature}/UiSelectors.md`

---

{a validáló teljes jelentése}
```

Ha maradt `[nem teljesül]` pont a körkorlát után, azt **mondd ki nyíltan** — ne jelentsd késznek.

## Szabályok

- **Nincs új vagy frissített függőség** — maradnak a pinelt verziók (`package.json`). A friss
  worktree `npm ci`-je és az `e2e/` első `npm install`-ja nem ez: mindkettő a lockfile-hoz
  ragaszkodik, és a futtatás előfeltétele, nem függőségváltozás.
- A már kiadott Flyway-migrációt nem írjuk át — sémaváltozáshoz új migrációs fájl kell.
- **A `spec/` érinthetetlen, a `docs/orchestration/` a te munkaterületed.** Az utóbbin belül is
  kizárólag a `Running.md`-et és a `UiSelectors.md`-t írod: az `Orchestrator.md` és a
  `Decision.md` a spec-írás terméke, azokat nem igazítod a futáshoz. És **egyiket sem adod át
  egyetlen subagentnek sem** — a `UiSelectors.md` **tartalmát** igen, az útvonalát nem.
- **Git:** commitolni kizárólag a 4. lépésben, a két worktree-ben és a merge-nél szabad.
  **Push soha**, branch-törlés soha, `reset --hard` soha.
- **Portütközés (3001/5173):** más futó projekt is használhatja ezeket a portokat. Ha az 5. lépés
  vagy a validáló ezt jelzi, add tovább a jelentésben — ne vonj le belőle következtetést a
  feature-re.
- **Ne lépj túl a spec keretein.** Ami nincs a feladatlistában és nem kell egyik
  kész-kritériumhoz sem, az javaslat a jelentés végén, nem implementáció.
- **A guardrailek gépiek.** A `spec-implementer`, az `e2e-test-writer` és a `spec-validator`
  `PreToolUse` hookja (`.claude/hooks/spec-guard.mjs`) blokkolja a `spec/` alá írást, a
  git-mutációt, a függőségtelepítést, az e2e-ág kilépését az `e2e/` mappából, és a validátor
  fájlmódosításait. Ez tartja diszjunktan a párhuzamos ág két diffjét, tehát ez teszi
  ütközésmentessé a 4. lépés merge-ét. Ha egy subagent jelentésében ilyen blokkolás szerepel,
  az **nem** hiba a lánc működésében — add tovább a jelentésben.
- **Ne állítsd, hogy kész, ha nem az.** A validáló mérlege a mérce, nem az implementáló
  önbevallása.
