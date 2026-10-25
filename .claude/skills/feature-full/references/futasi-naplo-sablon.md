# A futási napló sablonja — az 1. fázis

A `feature-full` lánc naplója a `docs/orchestration/{feature}/Running.md`. **Kitöltetlenül
kell létrehozni**, még az első delegálás előtt, mert a `feature-implement` skill 1/c. lépése
ezt a fájlt keresi: ha nincs, a lánc naplózás nélkül fut, és a mérés utólag nem pótolható.

## Miért előre, és miért kitöltetlenül

A napló értéke az „átadott kontextus" mezőben van, és az a mező csak akkor mond igazat, ha a
**szándékot** rögzíti, nem az utólagos emlékezetet. Ha a futás végén töltöd ki, azt írod le,
amit a subagent *válaszából* visszakövetkeztetsz — és épp az veszik el, hogy mit hagytál ki
szándékosan. Ugyanez a `feature-implement` 1/c. lépésének indoklása; itt csak annyi a
különbség, hogy a fájlt is te hozod létre, mert új feature-nél még nincs meg.

**Kitöltetlen mezőt ne találj ki.** Egy üres cella őszintébb, mint egy kitalált.

## A fájl váza

A `{feature}` és a `{dátum}` helyére a tényleges érték kerül. A `feature-implement` a saját
blokkjait tölti (kutató, implementáló, e2e, integráció, e2e futás, validáló, javító körök);
a `feature-full` a 3–6. fázis blokkjait teszi hozzá.

```markdown
# Futási napló — {feature}

Lánc: `feature-full` · Indítva: {dátum} · Spec: `spec/{feature}/`

## 0. A spec megírása (feature-spec-writer)

| | |
|---|---|
| Kikérdezett döntések száma | |
| Megtámadott premisszák | |
| Kész-kritériumok száma | |
| `spec-ellenoriz.mjs` kimenete | |

## 1. Delegálás — spec-researcher

| | |
|---|---|
| Modell | |
| Átadott kontextus | |
| Kellett-e újra-delegálni | |
| A jelentés validálható volt-e | |

## 2. Delegálás — spec-implementer{, csomagonként külön blokk}

| | |
|---|---|
| Modell | |
| Átadott kontextus | |
| Kellett-e újra-delegálni | |
| A jelentés validálható volt-e | |

## 3. Delegálás — e2e-test-writer

| | |
|---|---|
| Modell | |
| Átadott kontextus | |
| Kellett-e újra-delegálni | |
| A jelentés validálható volt-e | |

## 4. Integráció (worktree merge)

| | |
|---|---|
| Ágak | |
| `git diff --stat` | |
| Tiszta volt-e a merge | |

## 5. E2E futás

| | |
|---|---|
| Parancs | |
| Tényleges kimenet | |
| Kilépési kód | |

## 6. Delegálás — spec-validator

| | |
|---|---|
| Modell | |
| Átadott kontextus | |
| Mérleg (teljesül / nem / kétséges) | |

## 7. Mérleg-kapu

### 7/a. Kontextus-mérleg (cost-reducer)

| | |
|---|---|
| `merleg.mjs` kimenete | |
| Volt-e elég adat recepthez | |
| Javasolt receptek | |
| A fejlesztő döntése | |

### 7/b. Futásmérleg (futas-merleg)

| | |
|---|---|
| Delegálások száma | |
| Költség-egység (a keret %-a) | |
| ≈ USD (`arak.json` dátumával) | |
| Subagent-idő | |
| Konvergenciagörbe (`[nem teljesül]` körönként) | |
| Rendellenesség (megszakadt / marker nélküli) | |
| A kapu megállította-e a láncot, és melyik szabály | |

A pénz **levezetett** adat: mindig az `arak.json` érvényességi dátumával együtt írd be.
A görbében a `?` **mérési hiány**, nem „nulla hiba" — így is kell leírni.

## 8. A 4. fázis két ága

### 8/a. Unit-teszt kör

| | |
|---|---|
| `unit-jeloltek.mjs` kimenete | |
| Delegált osztályok | |
| Modell | |
| Mért áglefedettség osztályonként | |
| Megjelölt gyanús viselkedés | |
| `pom.xml` osztálylista bővítve | |

### 8/b. Dokumentációs kör (docs-api-writer)

| | |
|---|---|
| Modell · átadott kontextus | |
| Hatókör (teljes igazítás / bővítés) | |
| README — mely szakaszok változtak | |
| OpenAPI-leíró — létrehozva / +N művelet | |
| Leltár-kapu **tényleges** kimenete és kilépési kódja | |
| Eltérés a `spec/` végpontlistájától | |

A leltár számai **mért** adatok: a szkript kimenetéből másold, ne az agent összegzéséből.
Piros kapunál ide az kerül, **mi** maradt piros és **miért** — a „javítva lesz" nem állapot.

## 9. Javító körök

| Kör | `[nem teljesül]` db | Mi bukott (azonosítók) | Ki javított | Eredmény |
|---|---|---|---|---|
| | | | | |

A **darabszám** oszlop nem díszítés: a körönkénti szám a konvergenciagörbe. `5 → 2 → 2` azt
jelenti, hogy a hurok megállt — ezt a „mi bukott" szöveges oszlop önmagában elrejti. Ha egy
korábban `[teljesül]` azonosító újra megjelenik itt, az **oszcilláció**: a javítás elrontott
valamit, ami már működött.

## 10. Zárás

| | |
|---|---|
| Végső validátor-mérleg | |
| Teljes `mvn test` kimenete | |
| Lint / típusellenőrzés | |
| Ami nyitva maradt | |
```

## Amit a naplóba tilos írni

- **Meg nem történt lépést.** Ha egy fázis kimaradt, azt írd oda, hogy kimaradt, és miért.
- **Meg nem mért számot.** Lefedettség, teszt-darabszám, kilépési kód csak tényleges
  kimenetből.
- **Utólag átírt szerződést.** Ha a `UiSelectors.md` rossznak bizonyult, az a 9. blokkba
  megy — a szerződést nem írod át úgy, mintha eleve az lett volna.
