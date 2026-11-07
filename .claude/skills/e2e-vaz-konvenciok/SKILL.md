---
name: e2e-vaz-konvenciok
description: |
  A webshop `e2e/` Gherkin + Cucumber + Playwright vázának szerkezete, API-ja, futtatása és
  konvenciói az `e2e-test-writer` agentnek. Az agent a frontmatter `skills:` mezőjével tölti
  be indításkor — ez a váz projekttényeinek egyetlen forrása.
---

# Az `e2e/` váz — kódtérkép és konvenciók

Ezt a leírást az `e2e-test-writer` kapja meg indításkor. **Kiindulópont, nem bizonyíték:**
a hivatkozott fájlokat el kell olvasni, mielőtt bárki épít rájuk. Ha eltérést találsz a
leírás és a váz között, a **váz** az igazság — és az eltérést jelenteni kell.

**A váz projekttényeinek egyetlen otthona ez a fájl.** Az agent szándékosan nem tartalmaz
fájlnevet, metódusnevet, parancsot vagy kilépési kódot: ő a szerepet, a módszert és a
kimeneti szerződést hordozza. Ez a felosztás egy valódi hibából származik — az agent
korábban inline felsorolta a World metódusait, a felsorolás elavult, és emiatt egy létező
képesség mellé íratott volna új, duplikált fixture-építőt. **Új váztény ide kerül, ne az
agent-fájlba.**

---

## 1. Kötelező olvasás — mielőtt egyetlen sort írnál

| Fájl | Miért |
|---|---|
| `e2e/README.md` | **teljes egészében.** Ez a váz szerződése: az öt megkötés (szerver-állapot, rate limit, előfeltételek, kiválasztás, retry nélküli soros futás) innen való, és a jelentés is ezekre hivatkozik |
| `e2e/steps/vilag.mjs` | **mit tud a `this`** — a World tényleges képességei |
| `e2e/steps/onteszt_lepesek.mjs` | a **közös** lépések (navigáció, „egy regisztrált vásárló") — ezeket nem definiálod újra |
| `e2e/steps/admin_rendelesek_lepesek.mjs` | a legközelebbi minta: hogyan néz ki egy terméki lépésfájl ebben a repóban |
| `e2e/support/fixtures.mjs` | milyen előfeltétel épül ma HTTP-n, és milyen alakot ad vissza |
| `e2e/features/*.feature` | a szcenáriók hangneme, a fejléc-kommentek szerkezete, a meglévő lépésszövegek |

**Utólagos módban** a kliens oldalról azt is olvasd el, amire a kiválasztóid mutatnak
(`client/src/pages/…`), hogy a szerep és a címke **tényleg** az legyen, amit a komponens ad.
**Előretolt módban ezt ne tedd**: ott a kapott szerződés a norma, a kliens pedig még a
feature előtti állapotban van.

## 2. A World és a fixture-ök — a fájl az igazság

**A `this` képességeit a `e2e/steps/vilag.mjs`-ből olvasd ki, ne egy felsorolásból** — sem
ebből, sem az agent promptjából. A váz nő: minden feature hozhat új World-metódust és új
fixture-építőt, és egy elavult lista alapján **duplikátumot** vennél fel egy létező
képesség mellé.

Tájékoztatásul, pillanatkép (2026-11-06, a `vilag.mjs` alapján): a World ad `config`,
`baseUrl`, `nonce`, `api`, `context`, `page`, `konzol`, `hibasValaszok` mezőket;
előfeltétel-metódusként `adminToken`, `adminMunkamenet`, `ujTermek`, `ujVasarlo`,
`ujRendeles`, `keszletModositas`; böngésző-metódusként `megnyit`, `tarolobaIr` (egy
`localStorage` kulcs beültetése a **következő** oldalbetöltés elé), `szkriptekNelkul` (a
következő betöltés a kliens JS-kötege nélkül) és `bejelentkezveMint`. A `tarolobaIr`,
a `szkriptekNelkul` és a `bejelentkezveMint` a `megnyit()` **előtt** hívandó. A tényleges,
aktuális lista a `vilag.mjs`-ben van; az építők a `support/fixtures.mjs`-ben.

Új előfeltétel-építő **kizárólag publikus API-hívásból**, egyedi (nonce-os) névvel, és a
kapocs a `Vilag`-ban egy metódusként — ez az agent munkaterülete, szabad. Ha az előfeltétel
publikus API-n nem építhető fel, az **megállító** akadály: jelenteni kell, nem teszt-hátsóajtót
nyitni.

## 3. Szerkezet és fájlnév-konvenciók

```
run.mjs                   belépési pont: kapcsolók, környezet-ellenőrzés, cucumber-js indítása
cucumber.mjs              profilok: default / headed / ci
features/<kebab>.feature  szcenáriók — magyar Gherkin
steps/<snake>_lepesek.mjs lépésdefiníciók — sima ESM JavaScript, NEM TypeScript
steps/vilag.mjs           a World · steps/horgok.mjs   böngésző-életciklus, bukás-diagnosztika
support/fixtures.mjs      előfeltétel-építők · support/api.mjs · support/kornyezet.mjs
reports/report.html       a HTML riport (gitignore-olt)
```

Az `e2e/` **önálló npm-projekt**, nem workspace-tag: a repó gyökerének `npm ci`-je nem
telepíti. Az egyszeri előkészítés (`npm ci && npx playwright install chromium` az `e2e/`-ben —
`npm ci`, nem `npm install`, mert az utóbbi átírhatja az `e2e/package-lock.json`-t) a
**hívó** dolga.

**A lépésfájlokat a gyökér lintje is méri.** Az `eslint.config.mjs`-nek külön blokkja van az
`e2e/**/*.mjs`-re (`no-unused-vars`, `_` előtaggal kivételezve; Node- és böngésző-globálisok),
tehát egy új lépés- vagy fixture-fájl után a **repó gyökeréből** fusson az `npm run lint` — ez
a CI blokkoló `lint` jobja is. Ehhez a gyökérben kell `node_modules` (friss worktree-ben
ott is `npm ci`), és worktree-ben a **munkafa** gyökeréből kell futtatni
(`cd .claude/worktrees/<név> && npm run lint`): a fő fa lintje a `.claude/worktrees/**`-t
kihagyja.

**A láncban a lint kapuja egy helyen van:** a `feature-implement` 4. lépése (merge) után az
orchestrátor a **fő fa gyökeréből** lefuttatja az `npm run lint`-et, és ez az e2e lépésfájlokat
is fedi. A munkafában futtatott lint ehhez képest önellenőrzés; ha előretolt módban a munkafa
gyökerében nincs `node_modules`, a jelentésben mondd ki, hogy a lint a merge utáni kapura
maradt — ne állítsd zöldnek, amit nem futtattál.

## 4. Nyelv

**Magyar Gherkin, `# language: hu` fejléccel** — enélkül a magyar kulcsszavak nem
értelmeződnek. A CLAUDE.md angol-elnevezési kivétele a *Java teszt-metódus- és `@Nested`
osztálynevekre* szól, a Gherkinre **nem**: a `.feature` fájlok magyar felületű viselkedést
író próza, a lépésdefiníciók callbackjei pedig névtelenek — nincs mit anglicizálni.

A várt hibaüzenetek **szó szerint** a `spec/backend/hibakatalogus.md`-ből valók. Ha egy
állítás a szövegen bukik, az a kliens vagy a katalógus hibája — a várt szöveget **nem**
igazítjuk hozzá.

## 5. Futtatás

A váz **nem indítja a stacket** — egy megadott URL ellen mér. Az indítás (`./start.sh` /
`.\start.cmd`) a **hívó** dolga.

```bash
cd e2e
npm run e2e -- --dry-run --tags "@címke"     # 1. definiálatlan / ütköző lépés kiszűrése
npm run e2e -- --tags "@címke"               # 2. az igazi futás
```

Munkafában ugyanez a repó gyökeréből, relatív alakban:
`cd .claude/worktrees/<név>/e2e && npm run e2e -- --dry-run --tags "@címke"` — a Bash-hívás a
repó gyökerében indul és hívásonként oda áll vissza, és ez az alak illeszkedik a projekt
engedélylistájára (`npm run e2e:*`); abszolút `cd "D:/…"` előtag nem.

| Kilépési kód | Jelentése |
|---|---|
| `0` | minden szcenárió zöld |
| `1` | van bukott szcenárió |
| **`2`** | **a váz el sem indult** — nem fut a stack, vagy ismeretlen kapcsoló |

A `2` **környezeti akadály, nem a feature hibája**: ilyenkor meg kell állni és jelenteni.

Bukáskor a diagnosztika a riportban van (`e2e/reports/report.html`): teljes oldalas
képernyőkép, URL, a 400-as és fölötti HTTP-válaszok, a böngésző-konzol és a JS-hibák.
Hibakereséshez `npm run e2e:headed`, szükség esetén `--slowmo 300`.

Topológia egyetlen kapcsolóval: `--base-url http://localhost:5173` (fejlesztői, Vite
proxyzza az `/api`-t) vagy `http://localhost:3001` (produkció-szerű, a Spring szolgálja ki
a `client/dist`-et — ez fut a CI-ban).

## 6. Váz-döntések, amiket nem szabad felülírni

- **`retry: 0`** a `cucumber.mjs`-ben — egy retry-jal zöldülő e2e teszt nem zöld, csak
  elrejtett.
- **`parallel: 0`** — a szerver állapota közös, a rate limit IP-re szól.
- **Sima ESM JavaScript, nem TypeScript** — ez a réteg a *futó rendszert* méri, nem az
  egyik oldal típusgráfját, ezért nem támaszkodhat egyik build-láncra sem.
- **`playwright`, nem `@playwright/test`** — a futtató a Cucumber; a Playwright könyvtárként
  kell. Az `expect` web-first állításai a `playwright/test` alútvonalon így is elérhetők,
  ez ugyanannak a csomagnak a része, nem újabb függőség.

## 7. Az öt megkötés — a `README.md` szakaszai

Ezeket a váz szerződése rögzíti; itt csak a mutató van, a teljes indoklás a README-ben:

1. **A szerver állapota soha nem áll vissza** (README „1.") — nincs DB-hozzáférés és nincs
   teszt-hátsóajtó. Minden fixture nonce-os nevet kap; abszolút darabszámra támaszkodni és
   üres katalógust feltételezni tilos. A **böngésző** állapota viszont szcenáriónként tiszta.
2. **A bejelentkezési rate limit perzisztens és IP-re szól** (README „2.") — tíz sikertelen
   próbálkozás 15 percre kizárja a gépet, és a szerver újraindítását is túléli. A
   munkamenetet ezért `this.bejelentkezveMint(...)` ülteti be az API-n át; a bejelentkező
   űrlap azoké a szcenárióké, amelyeknek a bejelentkezés a **tárgya**.
   A `bejelentkezveMint` hívása a `megnyit()` **ELŐTT** kell legyen: az `addInitScript` a
   következő dokumentumra hat, egy már megnyitott oldalra nem.
3. **Az előfeltételeket nem a felületen kattintjuk össze** (README „3.") — a felület akkor
   jön képbe, amikor a szcenárió **tárgya** a felület.
4. **Kiválasztás szerep és címke szerint** (README „4.") — `getByRole` / `getByLabel` /
   `getByText`. A `client/src/` **egyetlen** `data-testid`-t sem tartalmaz, és ne is
   kezdjen. `data-testid` és CSS-szelektor csak akkor, ha nincs ARIA-fogantyú (`p.error`
   mintájára), és akkor is **meglévő** megjelenítési osztályra, kommenttel indokolva.
   Ha egy elem szerep vagy címke alapján elérhetetlen, az **akadálymentességi hiány a
   komponensben** — azt jelenteni kell, nem `data-testid`-t akasztani rá.
5. **Nincs újrapróbálkozás, és a futás soros** (README „5.") — `retry: 0`, `parallel: 0`. Egy
   retry-jal zöldülő szcenárió nem zöld, csak elrejtett; a párhuzamosítás a közös
   szerverállapot és az IP-s rate limit miatt fixture-izolációt kívánna.

## 8. A mérési rétegek — mit NE mérj újra itt

| Réteg | Mit mér | Mit nem |
|---|---|---|
| `client/test/` (Vitest) | komponensek | a `fetch` mockolt — nincs backend |
| `spec/backend/conformance/` | a HTTP-szerződés (54 eset) | nincs böngésző, nincs frontend |
| `server-java/src/test/` (`mvn test`) | végpontok valódi Postgresszel | nincs böngésző |
| **`e2e/`** | böngésző + SPA + API + adatbázis együtt | egyik réteget sem mélységében |

Az e2e a rétegek *találkozását* méri. Egy mezővalidáció tíz esete nem ide való — az
olcsóbb réteg már lefedi.

## 9. Jelentés-fegyelem

A záró jelentésed a lánc fő sessionjébe kerül, és ott minden körben újraolvasódik. Ezért:
kritériumonként egy sor (kritérium → szcenárió, `fájl:sor`); a lépésszövegek listája egyszer;
futtatásból csak az összesítő sor (`5 scenarios (5 passed)`, kilépési kód), a teljes kimenet csak
bukásnál, csak a hibás szcenárióé; amit a hívó adott (kritériumok, szerződés), azt nem idézed
vissza. Irányszám: ≤ 60 sor.
