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

A `{feature}` és a `{dátum}` helyére a tényleges érték kerül, az `<ÉÉÉÉHHNN-ÓÓPP>` helyére a
worktree-branchek időbélyege (a futásnév `{feature}-<ÉÉÉÉHHNN-ÓÓPP>` ugyanezt viseli). A `feature-implement` a saját
blokkjait tölti (kutató, implementáló, e2e, integráció, e2e futás, validáló, javító körök);
a `feature-full` a 3–6. fázis blokkjait teszi hozzá.

Minden delegálás-blokk ugyanazt az öt mezőt kapja (a `feature-implement` 1/c. lépése
szerint): *Modell* és *Átadott kontextus* a delegálás **előtt**; *Kellett-e újra-delegálni*,
*A jelentés validálható volt-e* és *Mit kellett pontosítani a kimenetből* a jelentés **után**.

```markdown
# Futási napló — {feature}

Lánc: `feature-full` · Indítva: {dátum} · Spec: `spec/{feature}/`

## Kiinduló állapot

| | |
|---|---|
| Branch | `feature/{feature}` — {megnyitva ebben a futásban / már létezett} |
| Kiinduló commit (`git rev-parse HEAD`, a spec-commit után) | |
| Worktree-branchek időbélyege (`ÉÉÉÉHHNN-ÓÓPP`) | |
| Futás-azonosító (a futásmérleg `--futas` értéke) | `{feature}-<ÉÉÉÉHHNN-ÓÓPP>` — a jelzőből, `kezdet`: {ISO-8601}{, `session`: {azonosító} / `session` nélkül} {/ `FUTAS_AZONOSITO`={érték}, a jelző nem érvényes} {· elavult jelzőt írtam felül: …} |
| Felbontás | {`Orchestrator.md`, ez a futás generálta — logika {A / C / D} / meglévő `Orchestrator.md` / alapértelmezett lánc — nincs `Orchestrator.md` / nincs `Orchestrator.md`, a `*Gazda:*` sorok szerint csomagonként, szekvenciálisan ({sorrend})} |
| Stack | {a lánc indította / már futott — a fejlesztő indította újra a merge után} |

Kiinduló `git status --porcelain` (szó szerint; üres fánál: „üres"):

    {kimenet}

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
| Mit kellett pontosítani a kimenetből | |

## 2. Delegálás — spec-implementer{, csomagonként külön blokk}

| | |
|---|---|
| Modell | |
| Átadott kontextus | |
| Kellett-e újra-delegálni | |
| A jelentés validálható volt-e | |
| Mit kellett pontosítani a kimenetből | |

## 3. Delegálás — e2e-test-writer

| | |
|---|---|
| Modell | |
| Átadott kontextus | |
| Kellett-e újra-delegálni | |
| A jelentés validálható volt-e | |
| Mit kellett pontosítani a kimenetből | |

## 4. Integráció (worktree merge)

| | |
|---|---|
| Ágak — az implementálói munkafák + az e2e ág (`wt/…-<időbélyeg>`, a merge sorrendjében; D esetben csomagonként, fan-innél a részleges merge is) | |
| A fő fa `git status --porcelain` a kiinduló listához képest (4/1.) | |
| `git diff --stat` | |
| Tiszta volt-e a merge | |
| Build · teszt · lint (· `mvn clean test`) az egyesített fán (4/6.) — tényleges kimenet | |

## 5. E2E futás

| | |
|---|---|
| Stack (a lánc indította / már futott, újraindítva a merge után) | |
| Parancs | |
| Tényleges kimenet | |
| Kilépési kód | |

## 6. Delegálás — spec-validator

| | |
|---|---|
| Modell | |
| Átadott kontextus | |
| Mérleg (teljesül / nem / kétséges) | |
| A jelentés validálható volt-e | |
| Mit kellett pontosítani a kimenetből | |

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
| Egyeztetés (`--atirat` nélkül — az utolsó delegálás hiányozhat / `--atirat` a fejlesztő jóváhagyásával) | |
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
| Sorban, a fő fán / párhuzamosan, osztályonkénti worktree-ben (a `git status --porcelain -- server-java/src/main` új sorai a kiindulóhoz képest — 4/b. előfeltétel) | |
| Összefésült fa `mvn clean test` (párhuzamos körnél ebből a szám) | |

Osztályonként egy delegálás-blokk:

#### 8/a/{Osztály} — java-unit-test-writer

| | |
|---|---|
| Modell | |
| Átadott kontextus | |
| Munkafa (fő fa / `.claude/worktrees/{feature}-unit-{Osztály}`) | |
| Kellett-e újra-delegálni | |
| A jelentés validálható volt-e | |
| Mit kellett pontosítani a kimenetből | |
| Mért áglefedettség (a forrással: agent / összefésült futás) | |
| A `docs/test-plans/<Osztály>.md` átjött-e (párhuzamos körnél a 4/b. átvételével) | |

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

Körönként minden delegálás (javító ág és az újravalidálás is) saját blokkot kap:

### 9/{kör}/{agent} — {spec-implementer | e2e-test-writer | java-unit-test-writer | spec-validator}

| | |
|---|---|
| Forrás (2. fázis 7. lépése / 6. fázis) | |
| Modell (javító körben egy fokozattal feljebb) | |
| Átadott kontextus | |
| Kellett-e újra-delegálni | |
| A jelentés validálható volt-e | |
| Mit kellett pontosítani a kimenetből | |
| Backend újraindítva a javítás után (ki indította) | |

## 10. Zárás

| | |
|---|---|
| Végső validátor-mérleg | |
| Teljes `mvn test` kimenete | |
| Lint / típusellenőrzés | |
| Stack leállítva (vagy: nem a lánc indította) | |
| Futásjelző törölve (`.scratch/futas-merleg/aktiv-futas.json`) | |
| Záró commit fájllistája (a hash a jelentésben) | |
| Ami nyitva maradt | |
```

## Ha a `Running.md` már létezik

Egy újrafuttatás **nem írja felül** a korábbi naplót: az a korábbi futás mérése. A fájl végére
egy elválasztó után új blokk kerül, és a fenti váz **teljes** egészében alá ismétlődik,
minden fejléc egy szinttel lejjebb:

```markdown
---

## Futás — {ÉÉÉÉ-HH-NN ÓÓ:PP}

Lánc: `feature-full` · Spec: `spec/{feature}/` · Előző futás: fent

### Kiinduló állapot
…
```

A kiinduló commit és a kiinduló `git status` **ennek** a futásnak a mért értéke, nem az
előzőé — a 4/1. ellenőrzés és a záró commit ehhez a blokkhoz diffel.

## Amit a naplóba tilos írni

- **Meg nem történt lépést.** Ha egy fázis kimaradt, azt írd oda, hogy kimaradt, és miért.
- **Meg nem mért számot.** Lefedettség, teszt-darabszám, kilépési kód csak tényleges
  kimenetből.
- **Utólag átírt szerződést.** Ha a `UiSelectors.md` rossznak bizonyult, az a 9. blokkba
  megy — a szerződést nem írod át úgy, mintha eleve az lett volna.
