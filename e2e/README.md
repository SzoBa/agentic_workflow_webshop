# E2E teszt-váz — Gherkin + Cucumber + Playwright

Végponttól végpontig futó BDD tesztek váza: **valódi böngésző → SPA → valódi
backend → valódi Postgres**.

Ez a repó harmadik mérési rétege, és az egyetlen, amelyik az egész rendszert
egyben nézi:

| Réteg | Mit mér | Mit NEM |
|---|---|---|
| `client/test/` (Vitest) | komponensek | a `fetch` mockolt — nincs backend |
| `spec/backend/conformance/` | a HTTP-szerződés (54 eset) | nincs böngésző, nincs frontend |
| **`e2e/` (ez)** | böngésző + SPA + API + adatbázis együtt | egyik réteget sem méri mélységében |

> **A jelenlegi állapot: csak a váz készült el.** Terméki szcenárió nincs benne. A
> `features/onteszt.feature` három szcenáriója a váz **önellenőrzése**: elindul-e a
> böngésző és betölt-e az alkalmazás; kap-e minden szcenárió tiszta böngésző-állapotot;
> elfogadja-e a felület az API-n át beültetett munkamenetet. Az első valódi szcenáriók
> külön feature-fájlokba jönnek, erre a vázra építve.

## Előkészítés (egyszer)

```bash
cd e2e
npm install
npx playwright install chromium
```

A böngésző-binárist a repó nem tárolja; a Playwright a saját gyorsítótárába tölti
(`~/.cache/ms-playwright`, Windowson `%LOCALAPPDATA%\ms-playwright`). Csak Chromium
kell — nincs böngésző-mátrix.

## Futtatás

A váz **nem indítja a stacket**. Előbb indítsd el, aztán futtasd:

```bash
# 1. terminál — a teljes stack
.\start.cmd                 # Windows
./start.sh                  # Linux / macOS / Git Bash

# 2. terminál
cd e2e && npm run e2e
```

| Kapcsoló | Mit csinál |
|---|---|
| `--base-url <url>` | A vizsgált alkalmazás gyökere (alap: `http://localhost:5173`, vagy az `E2E_BASE_URL` env-változó) |
| `--headed` | Látható böngészőablak (alap: headless) |
| `--slowmo <ms>` | Lassítás műveletenként, hibakereséshez |
| `--timeout <ms>` | Egy lépés időkerete (alap: 30000) |
| `--skip-check` | Kihagyja az induló környezet-ellenőrzést |

Minden más kapcsoló változatlanul a `cucumber-js`-hez megy — `--tags "@onteszt"`,
`--name "..."`, `--dry-run`, `--profile ci`.

Az admin-előfeltételek alapból a **seed admin** hitelesítő adatával épülnek
(`support/kornyezet.mjs`), ami a repóban áll. Ez fejlesztői adat, ezért a váz csak
helyi kiszolgáló (`localhost`, `127.0.0.1`, `::1`) ellen engedi használni — nem
helyi `--base-url`-hez add meg a sajátodat, különben a futás el sem indul:

```bash
E2E_ADMIN_USER=... E2E_ADMIN_PASSWORD=... npm run e2e -- --base-url https://staging.pelda.hu
```

Ez az őr a `--skip-check`-től függetlenül fut: az a kapcsoló a „fut-e a stack”
mérést hagyja ki, nem ezt.

Kilépési kód: `0` = minden szcenárió zöld · `1` = van bukott szcenárió · `2` = a
váz el sem tudott indulni (nem fut a stack, vagy ismeretlen kapcsoló).

### Két topológia, egy kapcsoló

Az `/api` **mindkét** felállásban azonos origin-en van, ezért egyetlen
`--base-url` elég:

| Mód | URL | Hogyan |
|---|---|---|
| Fejlesztői | `http://localhost:5173` | `./start.sh` — a Vite proxyzza az `/api`-t a 3001-re |
| Produkció-szerű (ez fut a CI-ban) | `http://localhost:3001` | a Spring szolgálja ki a `client/dist`-et és az API-t is (`STATIC_DIR`) |

Produkció-szerű futtatás helyben:

```bash
npm run build                                   # a repó gyökeréből: client/dist
cd server-java && mvn -DskipTests package && cd ..
STATIC_DIR=file:client/dist/ java -jar server-java/target/webshop-server-*.jar &
cd e2e && npm run e2e -- --base-url http://localhost:3001
```

## Miért nem indítja a váz a stacket

Ugyanaz a szerződés, mint a konformancia-futtatóé: a futtató egy **megadott URL**
ellen mér, az indítás egy helyen — a `start.sh`-ban — van megírva. Ott van a
portfoglalás-ellenőrzés, a health-várakozás és a folyamatfa-leállítás, ami
Windowson a legnehezebb rész; ezt lemásolni a vázba két, egymástól elcsúszó
implementációt jelentene.

Cserébe a váz **indulás előtt ellenőriz**, és ha nem fut a stack, egyetlen
beszédes üzenettel áll le (`run.mjs`), nem húsz azonos szcenárió-bukással. Az
ellenőrzés külön mondja meg, hogy a frontend vagy a backend hiányzik-e, mert a
kettő javítása is más.

## Szerkezet

```
run.mjs                   belépési pont: kapcsolók, környezet-ellenőrzés, cucumber-js indítása
cucumber.mjs              profilok: default / headed / ci
features/
  onteszt.feature         a váz önellenőrzése — NEM terméki szcenárió
  admin-rendelesek-*.f…   az admin rendeléskezelő (lista, státuszváltás)
  tema.feature            a festés előtti téma — az index.html / ui.tsx duplikáció őre
steps/
  vilag.mjs               a World: page, api, nonce, előfeltétel-építők
  horgok.mjs              böngésző életciklusa, izoláció, bukáskori diagnosztika
  onteszt_lepesek.mjs     az önellenőrzés lépései
  admin_rendelesek_l….mjs a rendeléskezelő lépései
  tema_lepesek.mjs        a téma-szcenáriók lépései
support/
  kornyezet.mjs           konfiguráció + indulás előtti környezet-ellenőrzés
  api.mjs                 HTTP-kliens az előfeltételekhez
  fixtures.mjs            egyedi nevű termék / vásárló, gyorsítótárazott admin token
reports/                  a HTML riport (gitignore-olt)
```

### Nyelv és eszközválasztás

- **Sima ESM JavaScript, nem TypeScript.** Ugyanaz az indok, mint a
  konformancia-futtatónál: ez a réteg a *futó rendszert* méri, nem az egyik oldal
  típusgráfját, ezért nem támaszkodhat egyik build-láncra sem. TypeScript egy
  transzpiler-függőséget és egy fordítási lépést jelentene nulla haszonért.
- **`playwright`, nem `@playwright/test`.** A futtató itt a Cucumber; a Playwright
  csak könyvtárként kell. (Az `expect` web-first állításai a `playwright/test`
  alútvonalon így is elérhetők — ez ugyanannak a csomagnak a része, nem újabb
  függőség.)
- **Magyar Gherkin**, `# language: hu` fejléccel. A CLAUDE.md angol-elnevezési
  kivétele a *teszt-metódus- és `@Nested` osztálynevekre* szól; a Gherkin-próza
  magyar felületű viselkedést ír le, és a várt hibaüzenetek szó szerint a
  `spec/backend/hibakatalogus.md`-ből valók.

## Amit egy szcenárió írásakor tudni kell

### 1. A szerver állapota soha nem áll vissza

Nincs adatbázis-hozzáférés és nincs teszt-hátsóajtó — a váz csak HTTP-t használ.
Hátsóajtót nyitni a termelési szerveren külön biztonsági döntés, nem egy teszt-váz
hatásköre (a konformancia-futtató ugyanezt a határt húzza meg).

Következmények:

- Minden fixture **egyedi nevet** kap (`support/fixtures.mjs`): `E2E termék <nonce>`.
- A szcenárió **nem támaszkodhat abszolút darabszámra** („3 termék van a listában")
  és **nem feltételezhet üres katalógust**.
- A **böngésző** állapota viszont szcenáriónként tiszta: minden szcenárió friss
  Playwright-kontextust kap, tehát üres `localStorage`-dzsal indul — a
  `webshop-auth` munkamenet és a kosár is. Ehhez nem kell teardown-kód.

### 2. A bejelentkezési rate limit perzisztens és IP-re szól

Tíz sikertelen bejelentkezés **15 percre** kizárja ezt a gépet, és a kizárás a
szerver újraindítását is **túléli**. Ezért:

- az admin token **futásonként egyszer** kérődik le, és process-szinten tárolódik;
- ha a szcenáriónak csak *be kell lennie jelentkezve*, azt az **API-n** át intézd
  (`this.bejelentkezveMint(...)` a munkamenetet egyenesen a `localStorage`-be
  ülteti), ne a bejelentkező űrlapon végigkattintva;
- a felületi bejelentkezés azoké a szcenáriókét, amelyeknek a bejelentkezés a
  **tárgya** — és a hibás jelszót próbálókból legyen kevés.

Ha mégis bezárult a korlát, a váz beszédes üzenettel áll le. Feloldás: várd ki a
15 percet, vagy adj friss adatbázist (`cd server-java && docker compose down -v`).

### 3. Az előfeltételeket ne a felületen kattintsd össze

Az „adott egy raktáron lévő termék" lépés admin-bejelentkezésből,
termékfelvitelből és mentésből állna a felületen — tíz másodperc és öt olyan
képernyő, aminek a szcenárióhoz semmi köze, és ami minden más szcenáriót is
elbuktat, ha elromlik. A `this.ujTermek()` / `this.ujVasarlo()` ugyanezt egy
kéréssel intézi. A felület akkor jön képbe, amikor a szcenárió **tárgya** a felület.

### 4. Kiválasztás szerep és címke szerint

A `client/src/` **egyetlen** `data-testid`-t sem tartalmaz, és ne is kezdjen: a
Vitest komponenstesztek is szerep és címke szerint választanak
(`getByRole("button", { name: /Bejelentkezés/ })`). Ugyanez a szabály itt is:
`page.getByRole` / `getByLabel` / `getByText`.

Ha egy elem szerep vagy címke alapján elérhetetlen, az **akadálymentességi hiány a
komponensben** — azt érdemes javítani, nem `data-testid`-t akasztani rá a teszt
kedvéért.

### 5. Nincs újrapróbálkozás, és a futás soros

`retry: 0` — egy retry-jal zöldülő e2e teszt nem zöld, csak elrejtett. `parallel: 0`
— a szerver állapota közös, a rate limit IP-re szól; a párhuzamosítás előbb a
fixture-izoláció átgondolását kívánná.

## Bukáskor

A bukott szcenárióhoz a váz automatikusan csatolja a riportba:

- a teljes oldal képernyőképét (mit *látott* a felhasználó),
- az oldal URL-jét,
- a 400-as és fölötti HTTP-válaszokat,
- a böngésző-konzolt és a JS-hibákat (miért azt látta).

A riport: `e2e/reports/report.html` (gitignore-olt). Hibakereséshez
`npm run e2e:headed`, szükség esetén `--slowmo 300`.

## CI

A `.github/workflows/ci.yml` `e2e` jobja futtatja, a produkció-szerű topológiában
(Spring szolgálja ki a `client/dist`-et a 3001-en). Bukáskor a riportot és a
backend naplóját is feltölti artefaktumként.
