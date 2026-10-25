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

## Nem alku tárgya

1. **Számot csak mérésből mondj.** A költség-egység mért. A pénz levezetett, és
   mindig ott a forrása: `≈ 34,67 USD (arak.json, 2026-08-04)`. Ami egyik sem,
   arról hallgass.
2. **A hiányzó marker nem nulla hiba.** Ha egy validátor jelentésében nincs
   marker (`marker-nelkul`), az mérési hiány. Soha ne jelentsd konvergenciának,
   és soha ne mondd rá, hogy „nem volt hiba".
3. **A megszakadt delegálás fogyasztása valós, a jelentése nem.** A
   `status` mezőre **ne** építs: mérve, hogy egy session-limitbe futott, csonka
   validátor `status`-a is `completed`. A csonkaságot a jelentés szövege árulja
   el, semmi más.
4. **Ha a kapu bekattant, a küszöb NEM megy lejjebb** — pontosan úgy, mint a
   JaCoCo 90%-os áglefedettségi kapunál. A kapu azt mondja, hogy a futás
   elszaladt; a küszöb átírása a jelet öli meg, nem a problémát.
5. **A küszöböt mért számból javasold**, ne kerekítsd találomra. Az
   `admin-orders` futás mért adata (5 delegálás, 6 933 376 egység, ≈34,67 USD,
   62 perc) a mai kalibráció alapja.

## Munkafolyamat

### 1. Mérleg

```
node .claude/skills/futas-merleg/scripts/futas-merleg.mjs
```

Egy futásra: `--futas <név>`. Egy még nem egyeztetett sessionre:
`--atirat <path/to/<session>.jsonl>` — a szkript előbb egyeztet, csak utána
jelent, így a lánc **utolsó** delegálása is bekerül (azt a `PreToolUse` hook a
természeténél fogva nem tudja lezárni).

A riport öt blokkja: futásonkénti összeg és konvergenciagörbe · a legdrágább
delegálások · rendellenességek (megszakadt / marker nélküli / mérhetetlen) · a
kapu mai állása · amit nem mértünk.

### 2. Olvasd a görbét, ne csak az összeget

A konvergenciagörbe a körönkénti `[nem teljesül]` darabszám: `5 → 2 → 2`. Ez
a lényeg, nem a költség — a költség csak az ára annak, hogy nem haladunk.

| Görbe | Olvasat |
|---|---|
| `5 → 2 → 0` | konvergál, minden rendben |
| `2 → 2` | **megállt** — a kapu tiltja a következő javító delegálást |
| `1 → 3` | romlik — ugyanaz a szabály fogja el |
| `3 → 1`, de egy régen teljesült pont bukott | **oszcilláció** — a puszta darabszám elrejti, a kapu nem |
| `0` egyetlen körrel | nincs mit mondani a konvergenciáról, csak egy tiszta kör van |
| `?` | marker nélküli kör — mérési hiány |

### 3. Ha a lánc megállt

A hook `deny` üzenete megnevezi a szabályt és a számokat. A teendő sorrendben:

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
| `references/kapu-szabalyok.md` | a négy szabály pontos szemantikája és a fail-open esetek |
| `docs/orchestration/_kontextus/futasok.jsonl` | a napló (verziózott, prompt-szöveg nélkül) |
| `docs/orchestration/_kontextus/keretek.json` | küszöbök és súlyok |
| `docs/orchestration/_kontextus/arak.json` | ártábla, kötelező `ervenyes` dátummal |

A `cost-reducer` és ez a skill **külön** dolgot csinál, közös tárban lakva: az a
delegálásba **bemenő prompt** karaktereit szűkíti, ez a futás **fogyasztását**
méri és állítja meg. Ha a kérdés az, „mit vágjunk ki a promptból", az a
`cost-reducer`.
