# 3/a. A worktree-ket TE hozod létre — ne az `isolation` paraméterrel

> A `feature-implement` skill lépésének teljes mechanikája. A SKILL.md azonos számú lépése
> csak az összefoglalót tartja; **ez a fájl a norma**, a lépés végrehajtása előtt kötelező
> elolvasni. A belső hivatkozások („3/a.”, „4/6.”, „5/2.”) a SKILL.md lépésszámaira mutatnak.

**Ne használd az `Agent` hívás `isolation: "worktree"` paraméterét.** Az a repó
**alapértelmezett** branchéből (`main`) ágaztat, nem a kijelentkezettből. Egy feature-branchen
dolgozva ez azt jelenti, hogy a
subagent **nem látja sem a specet, sem a mérendő rendszert, sem a `.claude/` aktuális állapotát**
— a guard a saját módját sem ismerné fel, tehát a diszjunktságot semmi nem tartaná. Ez a 2026-07-30-i
`admin-orders` próbafutáson derült ki, és mindkét ágat le kellett állítani. (Nem a hely a gond:
a saját munkafáid is a `.claude/worktrees/` alá kerülnek, hanem az alap.)

Helyette, a delegálás előtt. Előbb nézd meg, nem maradt-e munkafa egy korábbi futásból:

```bash
git worktree list
```

Ha a `.claude/worktrees/{feature}-impl`, `…-impl-{X}` vagy `…-e2e` már szerepel benne (vagy a
mappa létezik),
**állj meg és kérdezz** — nem mergelt munka lehet benne, és a törlése a fejlesztő döntése.
Egyébként, a repó gyökeréből, **egy** időbélyeggel minden ágra (`ÉÉÉÉHHNN-ÓÓPP`, a
`Running.md` integrációs blokkjába is beírod). Alapesetben (és C-ben) ez a két sor; a D
esetben az első sor helyett **független** csomagonként egy `{feature}-impl-{X}` sor (3/b.). A
fan-in csomag (két vagy több párhuzamos csomagra épül) munkafája **itt még nem** jön létre: az
alapcsomagjai merge-e után, az összefésült `HEAD`-ből készül (3/b.) — ha most nyitnád, a
`HEAD`-je az alapcsomagok munkája nélkül állna, és később az útvonala és a branch-neve is
foglalt volna, tehát a lánc a saját munkafáján akadna el:

```bash
git worktree add .claude/worktrees/{feature}-impl -b wt/{feature}-impl-<ÉÉÉÉHHNN-ÓÓPP> HEAD
git worktree add .claude/worktrees/{feature}-e2e  -b wt/{feature}-e2e-<ÉÉÉÉHHNN-ÓÓPP>  HEAD
```

A branchnév **futásonként egyedi**, mert egy újrafuttatáskor a régi `wt/…` branch még
megvan (branch-törlés tilos), és a `-b` egy létező névre hibával áll le.

A `HEAD` a lényeg: **a jelenlegi branch csúcsából** ágaztat, tehát a worktree tartalmazza a
specet (a 0/c. spec-commitja után), az `e2e/` vázat és a `.claude/` mai állapotát.

A hely a repón **belül** van, és szándékosan: a `.claude/worktrees/` gitignore-olt (a fő fa
`git status`-ában nem jelenik meg), a háttér-agentek fájlműveletei így a munkakönyvtáron belül
maradnak (nem kérnek engedélyt), a guard ezt a helyet ismeri, és a fő fa `npm run lint`-je
kihagyja.

**Utána — mielőtt bármelyik `Agent` hívást elindítanád — ellenőrizd:**

```bash
git worktree list                                  # az új munkafák a jelenlegi HEAD-en állnak?
ls .claude/worktrees/{feature}-impl/spec/{feature} # ott van-e a megbízás? (D: minden most nyitott …-impl-{X}-re)
```

Ha a HEAD nem egyezik, vagy a spec-mappa hiányzik a munkafából (commitolatlan maradt), **állj
meg** — a lánc rossz alapról indulna, és ez csak az integrációnál derülne ki.

**Előfeltétel: a fő session a repó gyökerében áll.** A subagent Bash-hívásai a fő session
**aktuális** könyvtárából indulnak, és hívásonként oda állnak vissza — nem a repó gyökeréből
(mérve 2026-11-06: egy korábbi `cd server-java` után a háttér-agent minden relatív parancsa a
`server-java/`-ból indult, és a `cd server-java && …` alak elhasalt). Ezért közvetlenül a
delegálás előtt futtasd: `pwd`. Ha nem a repó gyökere, `cd` oda, és csak utána delegálj. Ugyanez
minden későbbi delegálás (javító kör, újravalidálás) előtt.

Ezután **egyetlen üzenetben két `Agent` hívás** (a D esetben párhuzamos csomagonként egy, plusz
az e2e-é), `run_in_background: true`, `isolation` **nélkül**. Minden promptnak a **legelső**
bekezdésében ott kell lennie a munkagyökérnek:

> A munkagyökered: `<abszolút útvonal>` (a repó gyökeréhez képest: `.claude/worktrees/<név>`).
> Minden fájlműveletet és minden parancsot **ott** végezz — nálad a repó gyökere ez a mappa. A
> fő munkafához (`<a fő munkafa útvonala>`) **ne nyúlj**: ott egy másik ág dolgozik ugyanezen a
> feature-ön. A fájlműveletekben (Read, Write, Edit, Glob, Grep) a munkagyökér abszolút
> útvonalát használd. A **parancsokat relatív alakban** futtasd: a Bash-hívásod a **repó
> gyökerében** indul (az orchestrátor ezt a delegálás előtt biztosította), és minden hívás után
> oda áll vissza, ezért minden parancs így néz ki —
> `cd .claude/worktrees/<név> && <parancs>` (almappában: `cd .claude/worktrees/<név>/server-java
> && mvn clean test`, `cd .claude/worktrees/<név>/e2e && npm ci`). A `<parancs>` a projekt
> engedélylistájának (`.claude/settings.json` `permissions.allow`) alakja: `npm ci`, `npm test`,
> `npm run build`, `npm run lint`, `npm run e2e …`, `npx tsc --noEmit -p client/tsconfig.json`,
> `mvn test …` / `mvn clean test …`, `node .claude/skills/…`. Ez az alak **engedélykérés
> nélkül** fut. Abszolút `cd "D:/…"` előtagot **ne** használj: az nem illeszkedik az
> engedélylistára, és a háttérben futó ág az engedélykérésen elakad.

Ez azért kritikus, mert a subagent `CLAUDE_PROJECT_DIR`-je a **fő** munkafára mutat: egy relatív
útvonalú, `cd` nélküli írás vagy parancs oda menne, ahol a másik ág dolgozik. A `spec-guard.mjs` a saját munkafája
gyökeréhez relativizál (`gitRootOf`), tehát a worktree-n belüli útvonalakat helyesen ítéli meg —
de a fő munkafába tévedő írást nem tudja megkülönböztetni a jogostól. Ezt a 4. lépés 1. pontja
fogja meg utólag.

| Ág | `subagent_type` | Mit adsz át a promptban |
|---|---|---|
| **Implementáló** | `spec-implementer` | a kutató jelentését **szó szerint** · a spec mappa útvonalát (a spec fájljait az agent maga olvassa be; ez a definíciója) · ha a spec fázisokra oszlik: melyik fázis a megbízás · **a UI-kiválasztói szerződést szó szerint**, kimondva, hogy **kötelező érvényű** · emlékeztetőt: a feladatlista sorrendjében haladjon, a spec hibaüzeneteit **szó szerint** használja, és csak **zöld build + zöld teszt + zöld lint** után jelentsen készet · hogy friss worktree-ben dolgozik, tehát a `node_modules`-hoz `npm ci` kell, sosem `npm install` (`spec-konvenciok` 3. szakasz) |
| **E2E** | `e2e-test-writer` | hogy **előretolt módban** dolgozik · a feature nevét és a Gherkin-címkét (`@{feature-magyar-kebab}`) · a **kész-kritériumokat szó szerint** — azokat, amelyek végponttól végpontig mérhetők · **a UI-kiválasztói szerződést szó szerint** · az érintett útvonalakat (`/admin/orders`) · a `spec/backend/hibakatalogus.md` érintett sorait **szó szerint** |

Az e2e ág **nem** kapja meg: a kutató jelentését, a spec teljes szövegét, a felbontási tervet.
Ez nem takarékosság, hanem mérés-higiénia: aki a megvalósítás tervét olvassa, azt fogja mérni,
nem a kész-kritériumot.

**A jelentéseket (alapesetben kettő, a D esetben csomagonként egy + az e2e-é) külön vedd
át**, és a `Running.md`-ben külön blokkba írd. Ha az egyik ág
elakad, a másik eredménye attól még érvényes — az integrációnál mondd ki, melyik ág mit hozott.
