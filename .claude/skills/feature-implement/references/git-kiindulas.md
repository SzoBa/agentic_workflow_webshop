# 0/c. Git-kiindulás — branch, spec-commit, kiinduló állapot

> A `feature-implement` skill lépésének teljes mechanikája. A SKILL.md azonos számú lépése
> csak az összefoglalót tartja; **ez a fájl a norma**, a lépés végrehajtása előtt kötelező
> elolvasni. A belső hivatkozások („3/a.”, „4/6.”, „5/2.”) a SKILL.md lépésszámaira mutatnak.

Ha a `feature-full` hívott be, ezt a lépést az már elvégezte (indulás + 1. fázis): csak
ellenőrizd, hogy a `Running.md`-ben ott van a kiinduló commit, a kiinduló `git status` és a
futás-azonosító, és hogy a futásjelzőben ennek a futásnak a neve (`{feature}-<ÉÉÉÉHHNN-ÓÓPP>`)
áll — majd lépj tovább. Egyébként,
ebben a sorrendben:

0. **Futásjelző — a futás határa a lánc, nem a session.** A `futas-mero` hook a delegálásokat
   erre a futásnévre könyveli, és a költségkeretét, a konvergencia- és az oszcillációs kapuját
   is erre számolja. Elsőbbség: a session indításakor beállított `FUTAS_AZONOSITO` > a
   `.scratch/futas-merleg/aktiv-futas.json` jelző, ha 6 óránál frissebb > a session-azonosító.
   - **A futásnév** `{feature}-<ÉÉÉÉHHNN-ÓÓPP>` — az időbélyeg **ugyanaz**, amit a 3/a. lépés a
     worktree-branchek nevébe tesz (itt rögzíted, ott újrahasznosítod). Így egy feature
     újrafuttatása **új** futás: a ledgerben nem olvad össze az előzővel, és a költségkeret sem
     számolja együtt a kettőt.
   - **Ellenőrzés.** Ha a jelző létezik, és **friss** (a `kezdet` 6 órán belül), de **másik**
     feature futásneve áll benne, **állj meg és kérdezz**: egy másik lánc fut, vagy takarítás nélkül
     állt le — ha felülírod, annak a delegálásai a te futásodra könyvelődnek, vagy fordítva.
     Elavult jelzőt, vagy a saját feature-öd egy korábbi futásának jelzőjét felülírod; az elavultat a `Running.md`-be
     beírod.
   - **`FUTAS_AZONOSITO`.** Nézd meg (`echo "$FUTAS_AZONOSITO"`). Ha be van állítva, az nyer a
     jelző fölött, tehát a futás neve **az** — ezt írod a naplóba, és a futásmérleget is azzal
     kéred. Menet közben nem állítható át.
   - **Megírás** a `Write` eszközzel:
     `{"futas": "{feature}-<ÉÉÉÉHHNN-ÓÓPP>", "kezdet": "<ISO-8601>", "session": "<a mostani session-azonosító, ha ismert>"}`.
     A `kezdet` a `date -u +%Y-%m-%dT%H:%M:%SZ` kimenete, nem becslés — a hook ebből dönti el,
     friss-e a jelző. A `session` opcionális: ha megadod, a hook egy **másik** session
     delegálásainál a jelzőt nem veszi figyelembe (egy ottfelejtett jelző így nem könyvel
     idegen sessiont a futásra). Ha a session-azonosítót nem tudod biztosan, hagyd ki a mezőt —
     ne találd ki.
   - **Törlés** (`rm -f .scratch/futas-merleg/aktiv-futas.json`): a lánc végén (8. lépés), és
     **minden ponton, ahol a lánc idő előtt véget ér** — a futásmérleg-kapu `deny`-ja, a
     körkorlát után maradt hiba, egy „állj meg és kérdezz", ami után a fejlesztő nem folytatja.
     Egy ottfelejtett jelző 6 órán át a következő session delegálásait is erre a futásra
     könyveli.
1. **Branch.** Ha a repó a default branchen áll (`git symbolic-ref --short
   refs/remotes/origin/HEAD` adja meg; ha ez hibával tér vissza — ebben a repóban ma így van —,
   a default `main`), nyiss feature-branchet:
   `git switch -c feature/{feature}`. Ha a branch **már létezik**
   (`git rev-parse --verify --quiet refs/heads/feature/{feature}`), **állj meg és kérdezz** —
   egy korábbi futás munkája lehet rajta, és a választás (folytatás rajta vagy más név) a
   fejlesztőé. A commitolatlan változások a váltással együtt jönnek; ez szándékos.
2. **Spec-commit.** Ha a `git status --porcelain -- spec/{feature}/` nem üres, a specet egy
   commitban felveszed: `git add -- spec/{feature}`, majd
   `git commit -m "…" -- spec/{feature}` (a pathspec miatt más, esetleg előre stage-elt fájl
   nem kerül bele). Ha a mappa **már commitolt** fájljai módosultak (nem új spec), **állj meg
   és kérdezz**: egy meglévő spec átírása emberi döntés (a `feature-spec-writer`
   „Ha a mappa már létezik" szakasza).
3. **Kiinduló állapot.** Írd a `Running.md`-be a kiinduló commitot (`git rev-parse HEAD`), a
   futás-azonosítót (0. pont), a felbontást (0/b.) és a `git status --porcelain` **teljes**
   kimenetét. A 4/1. ellenőrzés ehhez képest diffel: a
   fejlesztő induláskor már piszkos fájljai nem a lánc művei. Ha nincs `Running.md` (nincs
   naplóvezetés), a listát a jelentés fejlécébe írod, és a 4/1. pont abból dolgozik.
