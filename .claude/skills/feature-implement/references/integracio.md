# 4. Integráció — az implementálói munkafák + az e2e ág egyesítése

> A `feature-implement` skill lépésének teljes mechanikája. A SKILL.md azonos számú lépése
> csak az összefoglalót tartja; **ez a fájl a norma**, a lépés végrehajtása előtt kötelező
> elolvasni. A belső hivatkozások („3/a.”, „4/6.”, „5/2.”) a SKILL.md lépésszámaira mutatnak.

A git-műveletet itt is **te** végzed — a subagentek nem tudnak, mert a guard tiltja.

Alapesetben két ág van (`{feature}-impl` és `{feature}-e2e`); a D esetben (3/b.) minden
`{feature}-impl-{X}` munkafa külön ág, és az e2e ág. Egy fan-in csomag (3/b.) előtt az
alapcsomagjaira ez a lépés **részben** már lefutott (1–4. és 6. pont, az e2e ág nélkül); itt a
maradék implementálói ágak és az e2e ág jönnek.

Ha nem indult el a párhuzamos ág (nincs kliens-felület, 2/b.), akkor csak az implementálói
ág(ak) van(nak): az 1–6. pont ugyanúgy lefut rájuk, e2e ág nélkül. Az 5. lépésből csak a
szcenáriók futtatása marad ki (1., 3., 4. pont); a **stack indítása (5/2.) megtörténik**, mert
a 6. lépés validátora a merge utáni kódot futó backend ellen méri.

1. **Először a fő munkafát nézd meg**: `git status --porcelain` a fő munkafán, és vesd össze
   a 0/c. lépésben a `Running.md`-be írt **kiinduló** listával — ami ott már szerepelt, az a
   fejlesztő induláskori állapota, nem a láncé. Az **új** sorok közül **csak** a te
   orchestrációs fájljaid (`Running.md`, `UiSelectors.md`, és az `Orchestrator.md`, ha a
   `feature-full` 1/b. fázisa ebben a futásban generálta) és a két mérő hook naplója
   (`docs/orchestration/_kontextus/meresek.jsonl`, `futasok.jsonl`) lehetnek — az utóbbiakat
   minden delegálásnál a hook írja, nem egy ág. (A `.claude/worktrees/` gitignore-olt, ezért nem
   jelenik meg.) Bármi más azt jelenti,
   hogy egy ág relatív útvonallal a fő fába írt a saját worktree-je helyett (3/a.) — **állj meg**,
   és jelentsd: az ilyen írás megkerülte az elválasztást, tehát a mérés nem érvényes.
2. **Áganként commit.** Előbb `git -C <worktree> status --porcelain`: ha üres, az az ág nem
   írt semmit — ezt **mondd ki** a jelentésben, ne csendben lépj tovább. Egyébként
   `git -C <worktree> add -A`, majd `git -C <worktree> commit -m "…"` beszédes magyar üzenettel.
3. **Merge a jelenlegi branch-re**, a fő munkafán: előbb az implementálói ág(ak) — több
   implementálói ágnál az `Orchestrator.md` lánc-táblázatának `#` oszlopa szerinti sorrendben
   (3/b.) —, utána az e2e ága, mind `--no-ff`-fel, hogy a párhuzamos szerkezet a történetben is
   látszódjon.
4. **Ütközésnél állj meg**, és jelentsd. Az ágak diffjének a fájltulajdon miatt diszjunktnak
   kell lennie; egy ütközés azt jelenti, hogy valamelyik ág kilépett a sávjából — ez a
   `Running.md` integrációs blokkjába megy, és javító kört indokol, nem kézi feloldást.
5. Sikeres merge után a **munkafák** eltakaríthatók
   (`git worktree remove .claude/worktrees/{feature}-impl`, ugyanígy az `…-e2e` és a
   párhuzamos csomagok `…-impl-{X}` munkafái, 3/b.), de a
   **branch-eket ne töröld**, és ne pushol. Mit kezd velük, a fejlesztő döntése. Windowson a
   `remove` a friss `node_modules` miatt `Directory not empty` hibával félbemaradhat: ilyenkor a
   munkafa már ki van jelentkeztetve (`git worktree list` nem mutatja), a megmaradt mappa
   törölhető (`rm -rf .claude/worktrees/<név>` — ez az „Alapszabály” 5. kivételének része, és
   **csak** akkor, ha a `git worktree list` már nem mutatja; különben nem mergelt munka vész el),
   majd `git worktree prune`. Egy fan-in csomag alapcsomagjainak munkafái a
   részleges merge után már eltakaríthatók; az e2e munkafa a lánc végéig marad.
6. **Build, teszt és lint az egyesített fán — KÖTELEZŐ**, minden merge után (a fan-in csomag
   előtti részleges merge után is), a fő munkafán, a repó gyökeréből:
   `npm run build`, `npm test`, `npm run lint`, és ha bármelyik ág a backendet is érintette,
   `cd server-java && mvn clean test && cd ..` (a SKILL.md „Parancsok — mindig a repó
   gyökeréből” szabálya). Az ágak a saját munkafájukban zöldek voltak, de az
   egyesített fát **egyik sem** mérte: két külön-külön zöld ág együtt is bukhat (pl. két csomag
   ugyanazzal a Flyway-verziószámmal ír migrációt). A lint **itt, egy helyen** fut a lánc
   kapujaként — ez fedi az `e2e/**/*.mjs` lépésfájlokat is, amiket az előretolt e2e ág friss
   munkafájában gyökér-`node_modules` híján nem feltétlenül mért. A kimenetet a `Running.md`
   integrációs blokkjába írod. **Piros eredmény integrációs hiba**, nem környezeti: a 7. lépés
   javító körébe megy, a fájltulajdon szerinti csomagnak — az 5. lépés (e2e futás) addig nem
   indul. Kivétel csak a dokumentált környezeti jel (a Testcontainers `Could not find a valid
   Docker environment` hibája, `spec-konvenciok` 3. szakasz): azt jelented, nem javíttatod.
   Ha a **fan-in előtti részleges** merge piros, **állj meg és kérdezz**: a javító kör a fő fán
   commitolatlanul dolgozna, a ráépülő csomag `HEAD`-ből ágaztatott munkafája pedig nem látná.
