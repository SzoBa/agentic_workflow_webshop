# 1/c. Naplóvezetés — minden delegálás előtt

> A `feature-implement` skill lépésének teljes mechanikája. A SKILL.md azonos számú lépése
> csak az összefoglalót tartja; **ez a fájl a norma**, a lépés végrehajtása előtt kötelező
> elolvasni. A belső hivatkozások („3/a.”, „4/6.”, „5/2.”) a SKILL.md lépésszámaira mutatnak.

Ha van `docs/orchestration/{feature}/Running.md`, akkor **minden egyes delegálás előtt** ki kell
tölteni a hozzá tartozó blokkot, és a jelentés visszaérkezése után lezárni. Nem a futás végén,
összefoglalva — **előtte**, a ténylegesen elküldött promptból.

| Mikor | Mit töltesz ki |
|---|---|
| A **0/c. lépésben** | A fejléc kiinduló mezői: branch, kiinduló commit, futás-azonosító, felbontás, kiinduló `git status --porcelain`. |
| A delegálás **előtt** | *Átadott kontextus* — mit adsz át ténylegesen, tömören felsorolva. *Modell* — az 1/b. triázs szerint. |
| A jelentés **után** | *Kellett-e újra-delegálni vagy pontosítani* · *A visszaadott összefoglaló validálható volt-e* · *Mit kellett pontosítani a kimenetből*. |
| A **4. lépés után** | Az „Integráció (worktree merge)" blokk: az implementálói branchek és az e2e branch neve a merge sorrendjében (D esetben csomagonként), a `git diff --stat`, hogy tiszta volt-e a merge, és a 4/6. ellenőrzés (build, teszt, lint) tényleges kimenete. |
| Az **5. lépés után** | Az „E2E futás" blokk: a stack eredete (a lánc indította / már futott), a tényleges kimenet és a kilépési kód. |
| **Javító körönként** | Delegálásonként egy blokk, ugyanazokkal a mezőkkel, mint fent, és a kör sora a javítókör-táblában. |
| A lánc **végén** | A „Zárás" blokk: a záró commit (vagy hogy a `feature-full`-é), a stack leállítása. |

Ha a `Running.md` egy **korábbi** futásból már ki van töltve, nem írod felül: alá nyitsz egy
`## Futás — {ÉÉÉÉ-HH-NN ÓÓ:PP}` blokkot, és abba töltesz (a sablon:
`.claude/skills/feature-full/references/futasi-naplo-sablon.md`).

A párhuzamos ág (3. lépés) **minden** delegálása saját blokkot kap — alapesetben kettőt (az
implementálóét és az `e2e-test-writer`-ét), a D esetben (3/b.) párhuzamos csomagonként egyet
plusz az e2e-ét. Az `e2e-test-writer`-ét is ugyanúgy ki kell tölteni indítás előtt, mint az
implementálóét.

Miért előtte: az „átadott kontextus" mező pont akkor értékes, ha a **szándékot** rögzíti, nem az
utólagos emlékezetet. Ha a futás végén töltöd ki, azt írod le, amit a subagent *válaszából*
visszakövetkeztetsz — és épp az veszik el, hogy mit hagytál ki szándékosan.

A `UiSelectors.md`-vel együtt ez a **két** fájl, amit ebben a skillben írsz. Ne írj bele semmit,
ami nem történt meg: a kitöltetlen mező őszintébb, mint a kitalált.
