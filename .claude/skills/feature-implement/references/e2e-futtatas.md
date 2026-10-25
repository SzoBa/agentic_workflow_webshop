# 5. E2E futtatás az egyesített fán

> A `feature-implement` skill lépésének teljes mechanikája. A SKILL.md azonos számú lépése
> csak az összefoglalót tartja; **ez a fájl a norma**, a lépés végrehajtása előtt kötelező
> elolvasni. A belső hivatkozások („3/a.”, „4/6.”, „5/2.”) a SKILL.md lépésszámaira mutatnak.

Most áll elő először az az állapot, amiben a szcenáriók futtathatók: a felület megvan, a
tesztek megvannak, egy fában.

**Nincs kliens-felület (2/b.):** az 1., 3. és 4. pont kimarad, mert nincs mit futtatni. A
**2. pont (stack) és a 6. pont viszont él**: a 6. lépés validátora a merge utáni backendet
méri, és enélkül a futásidejű ítéletei `[kétséges]`-ek lennének.

1. **Előfeltétel.** Ha `e2e/node_modules` hiányzik: `cd e2e && npm ci && cd ..`, majd
   `cd e2e && npx playwright install chromium && cd ..` (az `e2e/README.md` egyszeri lépése; az
   `e2e/` önálló npm-projekt, nem workspace-tag). A záró `cd ..` a SKILL.md „Parancsok — mindig a
   repó gyökeréből” szabálya: a következő parancs a gyökérből indul. **`npm ci`, nem `npm install`**: az utóbbi a
   `package.json` tartományai szerint újraoldhat, és átírhatja az `e2e/package-lock.json`-t.
2. **Stack.** Nézd meg, fut-e: `curl -s http://localhost:3001/api/health`.
   - Ha **nem fut**: indítsd el **háttérben** a repó gyökeréből (a Bash eszközből — Windowson
     is, Git Bash — `./start.sh`; a `.\start.cmd` csak PowerShellből/cmd-ből helyes), és várd
     meg, amíg a `/api/health` és az 5173 válaszol. A `Running.md`-be: *a lánc indította*.
   - Ha **már fut**, azt nem a lánc indította, tehát a backend a merge **előtti** kódot
     szolgálja ki — a mérés rossz rendszeren futna. **Állj meg**, és kérd a fejlesztőtől
     (`AskUserQuestion`), hogy indítsa újra a backendet (vagy erősítse meg, hogy a merge után
     már újraindította). Más folyamatát te nem állítod le. A `Running.md`-be: *már futott*.
   - Ha a `start` **portütközés miatt utasítja el** az indulást (3001 vagy 5173 foglalt), állj
     meg és jelentsd — ez környezeti akadály, ne vonj le belőle következtetést a feature-re.
   - Ha a backend a merge után **szabad porton sem indul el** (a `/api/health` nem válaszol, a
     `[be]` napló indulási hibát mutat — pl. a `ddl-auto: validate` sémaeltérése vagy egy
     migráció hibája), az **integrációs hiba, nem környezeti**: az egyesített kód nem fut. A
     `Running.md` integrációs blokkjába írod, és a 7. lépés javító körébe megy, a fájltulajdon
     szerinti csomagnak.
   - **Kivétel — a perzisztens dev-adatbázis maradványa.** Ha a Flyway a validáláson áll meg
     (`Validate failed: Migrations have failed validation`, benne `Migration checksum mismatch`
     vagy `Detected applied migration not resolved locally`), és a
     `git diff --stat <kiinduló commit> -- server-java/src/main/resources/db/migration` szerint a
     lánc **egyetlen meglévő** migrációt sem módosított (csak újat vett fel, vagy semmit), akkor
     a dev-adatbázisban egy **korábbi futás** (jellemzően ugyanennek a feature-nek egy előző,
     más tartalmú migrációja) alkalmazott verziója ül. Ez **környezeti eset, nem integrációs
     hiba** — javító kört nem indít. **Állj meg**, és kérdezz rá (`AskUserQuestion`) a
     `cd server-java && docker compose down -v && cd ..` reszetre (utána a stack újraindul, a
     fenti „nem fut” ág szerint): a dev-adatbázis a seed
     adatokra áll vissza, minden korábbi rendelés, felhasználó és foglalás elvész — ezért a
     fejlesztő döntése, nem a tiéd. A `Running.md`-be: a Flyway-üzenet szó szerint és a döntés.
     Ha viszont a diff egy **meglévő** migráció módosítását mutatja, az a fenti integrációs
     hiba (kiadott migrációt nem írunk át).

   Ugyanez a szabály minden későbbi **backend-változásra** (7. lépés javító köre, a
   `feature-full` 6. fázisa): ha a javítás a `server-java/`-t érintette, a validátor és az e2e
   újrafuttatása előtt a backendet újra kell indítani — ha a lánc indította, te indítod újra
   (a háttérben futó `./start.sh` leállítása, majd újraindítása), ha nem, a fejlesztőtől kéred.
   A kliens oldalát a Vite dev szerver magától frissíti.
3. **Dry-run:** `cd e2e && npm run e2e -- --dry-run --tags "@{címke}" && cd ..`. Ez fogja meg a
   definiálatlan és a **kétszer definiált** (`Ambiguous`) lépéseket. Előretolt módban az
   e2e-teszt-író ezt nem tudta futtatással kizárni, csak `Grep`-pel — itt dől el.
4. **Éles futás:** `cd e2e && npm run e2e -- --tags "@{címke}" && cd ..`, majd regresszióként
   a **teljes** suite címke nélkül (`cd e2e && npm run e2e && cd ..`). Bukott futásnál a záró
   `cd ..` nem fut le, de a sikertelen hívás cwd-je sem öröklődik — a következő parancs így is a
   gyökérből indul. A meglévő szcenáriók bukása is eredmény: azt is jelentsd.
5. **Kilépési kódok:** `0` zöld · `1` bukott szcenárió · **`2` = el sem indult** (nem fut a
   stack, rossz kapcsoló). A `2` **környezeti hiba, nem a feature hibája** — ne írd a
   kész-kritérium terhére.
6. A stacket **itt ne állítsd le**: a 6. lépés validátora és a 7. lépés utólagos módú
   e2e-teszt-írója futó stacket feltételez. A leállítás a lánc végén van (8. lépés).

A tényleges kimenetet — a szcenárió/lépés összegzést és a kilépési kódot — szó szerint írd a
`Running.md` „E2E futás" blokkjába. Ez lesz az egyik bizonyíték a 6. lépésben.
