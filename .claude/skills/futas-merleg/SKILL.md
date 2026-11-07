---
name: futas-merleg
description: >-
  Megmondja, mennyibe került egy feature-lánc futása, konvergált-e a javító
  hurok, és ha a kapu megállította, pontosan miért. Valódi tokenszámot,
  költséget és időt olvas a session-átiratból delegálásonként, a validátorkörök
  `[nem teljesül]` darabszámából konvergenciagörbét számol, és a
  `keretek.json` szabályai alapján ítéletet mond.
  Aktiválódjon, ha a fejlesztő azt kérdezi, mennyibe került egy futás vagy egy
  agent, miért állt meg a lánc, körbe-körbe jár-e a javítás, mennyi maradt a
  keretből, vagy a küszöböket akarja kalibrálni.
  NE induljon a delegálásokba BEMENŐ prompt szűkítésére — az a `cost-reducer`
  dolga —, és ne feature megvalósítására (`feature-implement`).
  Példa: „mennyibe került ez a lánc, és miért állt meg?"
---

# Futásmérleg — fogyasztás, konvergencia, leállás

Ez a skill az **ítélő** fél. A **gépi** fele a `.claude/hooks/futas-mero.mjs`
`PreToolUse` hook, amely minden delegálásnál egyeztet és kaput tart. A hook mér
és tilt; ez a skill elolvassa, megmagyarázza, és segít kalibrálni.

## Mit mér, és mit nem

**Mér** — delegálásonként, a session-átiratból, valódi számokkal:
bemeneti és kimeneti token, cache-írás (5 perces és 1 órás külön), cache-olvasás,
falióra-idő, modell, és validátornál a `[teljesül]` / `[nem teljesül]` /
`[kétséges]` darabszám a záró jelentésből.

**Nem mér** — és erre hivatkozni tilos:
- az **orchestrátor saját** fogyasztását (csak a delegálásokét);
- a cache-találati arány **okát** (a nyers szám megvan, a magyarázat nem);
- a **pénzt mint mérést** — az `arak.json`-ból levezetett érték, dátummal;
- a **súlyokat** a költség-egységben — azok feltevések, nem mérések.

## Mi egy „futás"

A futás határa a **lánc**, nem a session (döntés, 2026-11-06). Az azonosító
elsőbbsége: `FUTAS_AZONOSITO` env > friss jelzőfájl > session. A jelző
`.scratch/futas-merleg/aktiv-futas.json`:

```json
{"futas": "{feature}-<ÉÉÉÉHHNN-ÓÓPP>", "kezdet": "…", "frissitve": "<opcionális>", "session": "<opcionális>"}
```

A láncot vezető skill írja, fázisonként frissíti és törli, a hook **csak olvassa**. A
`kezdet` kötelező: időzónás ISO-8601, nem jövőbeli. Friss = a jelző **kora** legfeljebb
6 óra, ahol a kor az opcionális `frissitve`-ből számol, ha az érvényes (időzónás
ISO-8601, nem jövőbeli, nem korábbi a `kezdet`-nél), különben a `kezdet`-ből — így egy
emberi megállóval megszakított lánc jelzője nem jár le közben. Minden más jelzőt (hibás
JSON, üres `futas`, hibás vagy jövőbeli `kezdet`, lejárt kor) a hook figyelmen kívül hagy,
és a sessionre esik vissza. A **lejárt**, de egyébként ép jelzőről a hook
`systemMessage`-et ad (a lánc kerete ilyenkor nulláról indulna — ez nem maradhat néma). A
`session` **opcionális**: ha megvan, és nem egyezik a delegáló session azonosítójával, a
jelző arra a delegálásra nem számít (fail-open: session) — így egy ugyanabban a repóban
párhuzamosan futó másik session delegálásai nem ragadnak a lánchoz. Mező nélkül a jelző
minden sessionre érvényes.

**Csak a lánc tilt** (döntés, 2026-11-07). Ha a futás-azonosító a sessionre esett
vissza (se `FUTAS_AZONOSITO`, se friss jelző), a három szabály ugyanúgy számol, de a
találat csak `systemMessage`-figyelmeztetés, nem `deny`: egy hosszú munkasession
delegálásai összeadódnak, és a lánchoz kalibrált keret ott olyan munkát állítana meg,
amit senki nem lánc-költségnek szánt. A riport „A kapu mai állása" blokkja ezt jelöli
(`⚠ … (session-futás, nincs lánc)` a `⛔ … TILTVA` helyett).

A **feature** a futás-azonosítóból jön: a `-ÉÉÉÉHHNN-ÓÓPP` utótag levágása adja a
`spec/{feature}/` mappát (utótag nélkül a teljes azonosítót is kipróbálja). Ha ott van
`requirements.md` definiált kritérium-azonosítókkal (`- [ ] **AR-01** — …`), a hook a
validátor jelentéséből **csak ezeket** fogadja el kritériumnak; ha nincs, a minta-szabály
marad (lásd `references/kapu-szabalyok.md`, 3. szabály).

Mivel a hook mindig a **korábbi** delegálásokat egyezteti, delegáláskor — az
egyeztetés **után** — feljegyzi a `tool_use_id` → futás kötést a
`.scratch/futas-merleg/delegalasok.jsonl`-be, és egyeztetéskor ez nyer: a sor annak a
futásnak a része, amelyikben **elindult** — a lánc utolsó delegálása is, amelyet már
a jelző törlése után zár le a riport. Kötés nélkül (pl. `FUTAS_KERET=0` alatt futott
delegálás) az egyeztetéskori feloldás adja az azonosítót.

SendMessage-nél a kötés kulcsa a **session + a címzett**, és a kötéskori **körszámot**
is hordozza (a címzett átiratának addigi köre). Egy folytatott háttéragent könyveletlen
köreit az egyeztetés e kör-határok szerint **szakaszokra** bontja: minden kör annak a
SendMessage-nek a futásához tartozik, amelyik utoljára megelőzte. Így egy későbbi
SendMessage nem viszi át a korábbi folytatás köreit a saját futásába, és egy még futó
agentnek küldött második üzenet utáni körök is külön sort kapnak. A folytatás-sor `ts`-e
a szakasz utolsó körének ideje. Ha a kötés a feloldott `agent_id`-t hordozza, csak arra
az agentre érvényes — egy sessionben két azonos nevű agent (`kutato`) köre így nem
keveredik; név szerinti SendMessage-nél a legutóbb írt, azonos nevű agent a címzett.

A már könyvelt köröket a mérő **agentenként** (`agent_id`) számolja, nem csak
delegálásonként: ha ugyanannak az agentnek egy második eredménysora jelenik meg (új
`tool_use_id`-val), csak a még könyveletlen körei kerülnek be, `folytatas` sorként.

**Még futó háttéragent.** A naplóba csak a lezárása (`finished: true`) után kerül — de
az eddigi köreit a részleges átiratból a kapu **minden** ítéletnél beleszámolja a
keretbe (`allapot: "fut"`, konvergencia nélkül, napló-írás nélkül), különben egy hosszan
futó agent fogyasztását a keret a lezárásáig nem látná. A riport ezt csak `--atirat`
mellett látja (`… MÉG FUT`).

## Nem alku tárgya

1. **Számot csak mérésből mondj.** A költség-egység mért. A pénz levezetett, és
   mindig ott a forrása: az ártábla `ervenyes` dátuma, ahogy a **futás saját soraiban**
   rögzült (nem a mai `arak.json`-é) — például `≈ 12,40 USD (arak.json, 2026-10-25)`;
   több dátumnál `vegyes: d1, d2`. Részleges összeg (áratlan modell) alsó korlát:
   `≥ X USD (részleges, áratlan: …)`. A dátumot a riportból vedd, ne ebből a
   példából. Ami egyik sem, arról hallgass.
2. **A hiányzó marker nem nulla hiba.** Ha egy validátor jelentésében nincs
   `[teljesül]`/`[nem teljesül]` marker (`marker-nelkul` — a csupa `[kétséges]` kör is
   ilyen), az mérési hiány: a görbén `?`, és a konvergencia-ítéletből kimarad. Soha ne
   jelentsd konvergenciának, és soha ne mondd rá, hogy „nem volt hiba".
3. **A megszakadt delegálás fogyasztása valós, a jelentése nem.** A
   `status` mezőre **ne** építs: mérve, hogy egy session-limitbe futott, csonka
   validátor `status`-a is `completed`. A csonkaságot a jelentés szövege árulja
   el, semmi más.
4. **Ha a kapu bekattant, a küszöb NEM megy lejjebb** — pontosan úgy, mint a
   JaCoCo 90%-os áglefedettségi kapunál. A kapu azt mondja, hogy a futás
   elszaladt; a küszöb átírása a jelet öli meg, nem a problémát.
5. **A küszöböt mért számból javasold**, ne kerekítsd találomra. Az
   `admin-orders` futás mért adata (5 delegálás, 6 933 376 egység, ≈34,67 USD,
   62 perc) a mai kalibráció alapja. **Fenntartással:** ezt a számot még a soronkénti
   összeadás idején mértük, amely egy másik futáson ≈2,5-szeresre fújta fel a költséget
   (5,07 M a valós 2,02 M helyett). Hogy az `admin-orders` számát is érintette-e,
   **ellenőrizetlen** — az átiratai már nincsenek meg. Új kalibrációhoz friss, a
   `message.id`-alapú mérővel vett futás kell.

## Munkafolyamat

### 1. Mérleg

```
node .claude/skills/futas-merleg/scripts/futas-merleg.mjs
```

Alapból a riport a hook által **már egyeztetett** naplóból készül, és csak olvas.
Egy futásra: `--futas <név>`. A legutóbbira: `--utolso` — a közös `utolsoFutas()`
szerint a napló legkésőbbi `ts`-ű sorának futás-azonosítójára szűr, és az első sorban
kiírja, melyik az (a lánc-skillek záró mérlege ezt hívja). A napló kettős sorait
(két egyszerre futó hook versenye) a riport és a kapu is kiszűri.

**`--atirat <path/to/<session>.jsonl>` — CSAK A FEJLESZTŐ KIFEJEZETT JÓVÁHAGYÁSÁVAL.**
A session-átirat a munkaterületen **kívül** van (`C:\Users\…\.claude\projects\…`), és a
fejlesztő globális szabálya szerint azt natív eszközzel olvasni csak előzetes, kifejezett
engedéllyel szabad. Kérdezd meg, mielőtt hívod; engedély nélkül a riportot a már
egyeztetett adatból készítsd, és mondd ki, hogy a lánc **utolsó** delegálása (amit a
`PreToolUse` hook a természeténél fogva nem tud lezárni) a következő hook-hívásig
hiányzik belőle. Jóváhagyással a szkript előbb egyeztet, csak utána jelent, így az is
bekerül.

**A `--atirat` ír:** az egyeztetett sorokat a verziózott
`docs/orchestration/_kontextus/futasok.jsonl`-hez fűzi, és ez a git diffben
megjelenik. Próbafuttatáshoz vagy idegen átirathoz ideiglenes
`CLAUDE_PROJECT_DIR` alatt futtasd. A `--futas` és a `--utolso` csak olvas. Súgó:
`--help`.

Hibás hívásra (érték nélküli kapcsoló, nem létező futásnév vagy átirat,
`--utolso` és `--futas` együtt) a szkript hibaüzenettel, `2`-es kóddal áll
meg — egy elgépelt futásnév nem ad üres, rendben lévőnek látszó riportot.

A riport öt blokkja: futásonkénti összeg és konvergenciagörbe · a legdrágább
delegálások · rendellenességek (megszakadt / marker nélküli / mérhetetlen / tiltott) · a
kapu mai állása · amit nem mértünk.

A **tiltott** delegálás (`allapot: "tiltva"`) a kapu `deny`-ja után kerül a naplóba: nem
fogyasztás és nem delegálás — le sem futott —, csak a nyoma. A `cost-reducer` mérlege
ebből tudja, hogy az azonos `tool_use_id`-jú mérése egy soha le nem futott delegálásé. A
**mérhetetlen** (`hiba`) sor, amelyhez később mégis mért sor jött (pl. a hiányzó meta
megjelent), olvasáskor kiesik: a hiány már nem áll.

### 2. Olvasd a görbét, ne csak az összeget

A konvergenciagörbe a körönkénti `[nem teljesül]` darabszám: `5 → 2 → 2`. Ez
a lényeg, nem a költség — a költség csak az ára annak, hogy nem haladunk.

| Görbe | Olvasat |
|---|---|
| `5 → 2 → 0` | konvergál, minden rendben |
| `2 → 2` | **megállt** — a kapu tiltja a következő javító delegálást |
| `1 → 3` | romlik — ugyanaz a szabály fogja el |
| `3 → 1`, de egy régen teljesült pont bukott | **oszcilláció** — a puszta darabszám elrejti, a kapu nem |
| `0 → 2` | **oszcilláció**, ha a bukó pont a tiszta körben `[teljesül]` volt; a konvergencia-szabály szándékosan nem lép (döntés, 2026-11-06). Addig sosem mért azonosító bukását egyik szabály sem fogja |
| `0` egyetlen körrel | nincs mit mondani a konvergenciáról, csak egy tiszta kör van |
| `?` | marker nélküli vagy csupa `[kétséges]` kör — mérési hiány, a szabályok kihagyják |

### 3. Ha a lánc megállt

A hook `deny` üzenete megnevezi a szabályt és a számokat (`deny` csak láncban jön; lánc
nélkül ugyanez `systemMessage`-figyelmeztetés). A teendő sorrendben:

1. **Mondd meg a fejlesztőnek, mi állt meg és milyen számoknál.** Idézd a
   szabályt és a görbét.
2. **Nézd meg, mi maradt.** A megmaradt `[nem teljesül]` pontok azonosítói
   benne vannak a naplóban (`konvergencia.bukott_idk`).
3. **Javasolj döntést, ne kerüld meg.** A három valódi lehetőség: kézi javítás,
   a spec pontosítása (ha a kritérium megfogalmazása a hibás — ez itt tényleg
   megtörtént, lásd a `kihivas-katalogus.md`-t), vagy a fejlesztő tudatos
   döntése a keret emeléséről.

**Amit soha ne tegyél:** ne indítsd újra ugyanazt a delegálást, ne darabold fel
kisebbekre a korlát alá kerülésért, és ne állítsd `FUTAS_KERET=0`-ra magadtól.
Az a fejlesztő döntése.

### Élő nézet — „hol tartunk", a futás közben

A mérleg utólag mondja meg, mi fogyott; az élő nézet **közben** mutatja a böngészőben:

```
node .claude/skills/futas-merleg/scripts/elo-nezet.mjs        # → http://127.0.0.1:4300
```

A láncskillek **minden futásnál** elindítják, a futásjelző megírása után, háttérben
(a `feature-implement` skill 0/c. lépése, 0. pont, „Élő nézet"). Mit mutat: a lánc
fázisait (Spec → Felderítés → Implementáció ∥ e2e-írás → Integráció → E2E futás → Validálás
→ Javító kör → Unit ∥ dokumentáció → Zárás, állapotonként kész / fut / vár / kihagyva),
agentenként egy idősávot az eszközhívásokkal és a guard-tiltásokkal, a tokeneket és a becsült
költséget, a párhuzamossági szorzót, a worktree-k változásait és a stack lámpáit.

- **Levezet, nem bemondásra dolgozik.** A fázist az agentek típusából (a `meta.json`
  `agentType`-ja) és a fő session parancsaiból (`git merge`, `npm run e2e`, a jelzőt törlő `rm`,
  írás a `spec/` alá) olvassa ki — minden lánc-alakra működik, és a láncnak menet közben semmit
  nem kell jeleznie. Amit nem lát, azt nem találja ki: egy sosem látott fázis „vár", vagy
  „kihagyva", ha egy későbbi már elindult.
- **Csak olvas, és nem könyvel.** A számai a mérlegével azonos forrásból és ártáblából jönnek,
  de becslések egy élő képernyőre: a kapu és a riport a `futasok.jsonl`-ből dolgozik, nem ebből.
- A session-átiratot olvassa (a munkaterületen kívül) — ezt a fejlesztő 2026-11-07-én
  kifejezetten jóváhagyta erre a nézetre. A `--atirat` jóváhagyási szabálya ettől független.
- **Csak `127.0.0.1`-re köt**: az átiratban a promptok és a parancsok teljes szövege benne van.
- **Idempotens** indulás; a lánc **nem** állítja le — a jelző törlése után a lezárt futást mutatja
  tovább, egy új jelzőre magától átvált. Bemutatóhoz: `--cel-perc <N>` piros cél-időt rajzol.

### 4. Kalibrálás

Küszöböt csak akkor javasolj, ha **van** mért futás hozzá. A javaslat alakja:
„a mért N futás mediánja X egység; a keret ennek Y-szorosa, mert …". A
`keretek.json` `alap` mezőjébe a levezetés is bekerül, nem csak a szám.

Ha a fejlesztő küszöböt módosít, az `AskUserQuestion`-nel megerősített döntés —
és a `kalibralva` dátum frissül vele.

## Fájlok

| Fájl | Szerep |
|---|---|
| `.claude/hooks/futas-kozos.mjs` | egyeztetés + ítélet — a hook és a szkript **közös** fele |
| `.claude/hooks/futas-mero.mjs` | a `PreToolUse` kapu (mód: `kapu`) |
| `scripts/futas-merleg.mjs` | ez a riport |
| `scripts/elo-nezet.mjs` | az élő nézet („hol tartunk") — a láncskillek minden futásnál elindítják |
| `references/kapu-szabalyok.md` | a négy szabály pontos szemantikája és a fail-open esetek |
| `docs/orchestration/_kontextus/futasok.jsonl` | a napló (verziózott): számok, azonosítók, állapotok, a delegálás rövid leírása (`leiras` — a meta `description` mezője) és a hibaokok; prompt- és jelentésszöveg **nélkül** |
| `docs/orchestration/_kontextus/keretek.json` | küszöbök és súlyok |
| `docs/orchestration/_kontextus/arak.json` | ártábla, kötelező `ervenyes` dátummal |
| `.scratch/futas-merleg/aktiv-futas.json` | a lánc jelzője (gitignore-olt; a lánc írja és törli, a hook olvassa) |
| `.scratch/futas-merleg/delegalasok.jsonl` | delegálás-kori futás-kötések (gitignore-olt; a hook írja) |
| `.scratch/futas-merleg/meta-hiany.jsonl` | hiányzó `meta.json` első észlelése (gitignore-olt): csak egy legalább 60 s-mal későbbi egyeztetésnél is hiányzó meta lesz `hiba` sor, `elso_eszlelve` mezővel |

A `cost-reducer` és ez a skill **külön** dolgot csinál, közös tárban lakva: az a
delegálásba **bemenő prompt** karaktereit szűkíti, ez a futás **fogyasztását**
méri és állítja meg. Ha a kérdés az, „mit vágjunk ki a promptból", az a
`cost-reducer`.
