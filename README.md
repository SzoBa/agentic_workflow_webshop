# Mini Webshop — AI-native developer kurzus base projekt

Egy szándékosan egyszerű, full-stack webshop MVP, amit a kurzus során
tovább lehet fejleszteni. A hangsúly az átláthatóságon és a könnyű
elindíthatóságon van.

## Stack

- **Backend:** Java 25 + Spring Boot 3.5 (`server-java/`)
- **Adatbázis:** PostgreSQL 16, Dockerrel. A séma **kizárólag** Flyway-migrációból
  jön; az alkalmazás soha nem hozza létre. Üres adatbázison az első indítás
  létrehozza az induló állapotot (8 demó termék, seed admin).
- **Frontend:** React + Vite + TypeScript (SPA)
- **Naplózás:** strukturált ECS JSON a stdout-ra (szint: `LOG_LEVEL`, alap `info`)
- **E-mail:** Gmail API (OAuth2) a rendelési értesítőhöz — opcionális, a
  hitelesítő adatok hiányában kecsesen kimarad
- **Tesztek:** JUnit 5 + Testcontainers a backendhez (`mvn test`, valódi
  Postgresszel és valódi HTTP-n), Vitest + Testing Library a klienshez (`npm test`)

> A backend korábban Node.js + Express + lowdb volt. Az újraírás lezárult, a
> Node-implementáció törölve — a döntés és a mérési jegyzőkönyve:
> [ADR-0006](docs/adr/0006-atvaltas-a-java-backendre.md).

## Követelmény

- Node.js 20+ a frontendhez (fejlesztve: Node 24)
- JDK **25**, Maven 3.9+ és Docker a backendhez

## Indítás

### Egy paranccsal

```bash
./start.sh          # Linux, macOS, WSL, Git Bash
```

```powershell
.\start.cmd         # Windows: PowerShell vagy cmd
```

Elindítja az adatbázist, a backendet és a klienst is, a helyes sorrendben:
megvárja, míg a Postgres fogad kapcsolatot, majd míg a backend `/api/health`-je
válaszol, és csak utána jön a Vite. A két szerver naplója `[be]` / `[fe]`
előtaggal egy terminálba fut össze (és a `.run/` mappába is kiíródik).

**Ctrl+C** leállítja a backendet és a klienst. A Postgres konténer szándékosan
futva marad — leállítani `cd server-java && docker compose down` paranccsal lehet.

| Kapcsoló | Mit csinál |
|---|---|
| `--no-db` | nem indítja a Docker Postgrest (már fut, vagy külső adatbázis) |
| `--no-backend` | csak az adatbázis és a kliens indul |
| `--no-client` | csak az adatbázis és a backend indul |
| `--timeout N` | ennyi másodpercig vár a backend `/api/health` válaszára (alap: 180) |

A kapcsolók mindkét belépési ponton ugyanazok: `.\start.cmd --no-db`, `./start.sh --no-db`.

A szkript indulás előtt ellenőrzi, hogy a 3001-es és az 5173-as port szabad-e,
és hiba esetén megáll — így nem marad félig felállt környezet.

#### Windows

A `start.cmd` egy vékony wrapper: megkeresi a Git for Windows `bash.exe`-ét, és
változatlanul továbbadja neki a kapcsolókat. A logika egy helyen, a `start.sh`-ban van.

- A `.sh` közvetlenül nem indul PowerShellből vagy `cmd`-ből — vagy a `start.cmd`,
  vagy **Git Bash** (esetleg WSL) kell hozzá.
- A wrapper **nem** a PATH-on lévő `bash`-t hívja: az Windowson a
  `C:\Windows\System32\bash.exe`, vagyis a WSL — ott más a fájlrendszer, és nincs
  ott a Windows-os `mvn`/`npm`/`docker`. Ezért a Git telepítése kell hozzá
  (`C:\Program Files\Git\...`, vagy a `git.exe` melletti `bash.exe`).
- A `mvn` és az `npm` `.cmd` wrappereit a `start.sh` magától megtalálja.
- Ctrl+C után a `cmd` még megkérdezheti, hogy `Terminate batch job (Y/N)?` — a
  backend és a kliens leállítása ekkor már megtörtént, nyugodtan `Y`.

### Kézzel, két terminálban

A backend és a frontend külön build-láncon van, ezért külön is indítható:

```bash
# 1. Backend: adatbázis + szerver
cd server-java
docker compose up -d          # Postgres a 5432-es porton
mvn spring-boot:run           # API a 3001-es porton

# 2. Frontend (a repó gyökeréből, másik terminálban)
npm install
npm run dev
```

- Frontend: **http://localhost:5173**
- Backend API: **http://localhost:3001**

A Vite dev szerver az `/api` kéréseket automatikusan a backendre proxyzza,
így a böngészőben elég az 5173-as portot megnyitni.

Élesben a backend a lefordított frontendet is kiszolgálja (SPA-visszaeséssel):
`npm run build`, majd `cd server-java && mvn spring-boot:run`.

### Környezeti változók (opcionális)

Mind opcionális — nélkülük is elindul minden. A teljes lista magyarázatokkal:
[`server-java/.env.example`](server-java/.env.example); másold `server-java/.env`
néven, vagy — élesben ez a helyes — add az értékeket környezeti változóként.

| Változó | Mire jó |
|---------|---------|
| `PORT` | a backend portja (alap: `3001`) |
| `STATIC_DIR` | a kiszolgált frontend könyvtára (alap: `file:../client/dist/`) |
| `DATABASE_URL` · `DATABASE_USER` | Postgres kapcsolat (alap: a `docker-compose.yml` szerint) |
| `DATABASE_PASSWORD` | a Postgres jelszava. **Nincs alapértéke**: hiánya (és az üres érték) indulási hiba, hogy egy elfelejtett változóval ne induljon el éles telepítés. Helyi fejlesztéshez a `./start.sh` a `dev` profilt kapcsolja be, ami megadja |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` (alap: `info`) |
| `GMAIL_CLIENT_ID` · `GMAIL_CLIENT_SECRET` · `GMAIL_REFRESH_TOKEN` · `GMAIL_SENDER` | Gmail API OAuth2 a rendelési értesítőhöz |
| `ORDER_NOTIFY_TO` | a rendelési értesítő címzettje |
| `TRUSTED_PROXY_HOPS` | hány megbízható proxy van előtted (alap: `0` = nincs). A bejelentkezési rate limiting valós kliens IP-je ennyi hopra van az `X-Forwarded-For` lánc **végétől** |
| `CORS_ORIGINS` | engedélyezett eredetek vesszős listája. **Üresen nincs CORS fejléc** — a dev proxy és az éles static kiszolgálás sem támaszkodik rá |
| `ORDER_RESERVATION_HOURS` | meddig foglal készletet egy leadott rendelés (alap: `72`) |
| `ORDER_EXPIRY_SWEEP_MINUTES` | milyen gyakran fut a lejáratkezelő (alap: `5`) |
| `TOKEN_TTL_HOURS` | a munkamenet élettartama, csúszó megújítással (alap: `168`, azaz 7 nap) |
| `IMPORT_FILE` | egyszeri adatátvétel egy régi lowdb `db.json`-ból |

### Admin belépés (fejlesztői adat)

Az adatbázis induláskor gondoskodik róla, hogy legalább egy admin jogú
felhasználó létezzen. Ha egy sincs, létrejön a seed admin:

| Felhasználónév | Jelszó |
|----------------|--------|
| `adminisztrator` | `admin123` |

> ⚠️ **Ez fejlesztői adat.** Éles környezetben az első bejelentkezés után
> cserélendő — a jelenlegi kódban jelszómódosítás nincs, ezért ott saját admin
> felhasználó felvétele (regisztráció + adatbázisban `role: "admin"`) a helyes út.

Az admin a `/admin/products` és a `/admin/users` oldalakat éri el. A védelem
szerveroldali (útvonalminta-alapú admin-őr az `/api/admin/**` felett); a
menüpontok elrejtése csak kényelmi funkció.

## Hasznos parancsok

Az egész környezet — a repó gyökeréből:

| Parancs | Mit csinál |
|---------|------------|
| `./start.sh` | adatbázis + backend + kliens egy terminálban, Ctrl+C-re leáll |
| `.\start.cmd` | ugyanaz Windows terminálból (PowerShell / cmd) |
| `./start.sh --help` | a kapcsolók listája |

Frontend — a repó gyökeréből:

| Parancs | Mit csinál |
|---------|------------|
| `npm run dev`   | a kliens dev szervere (5173), watch módban |
| `npm run build` | a kliens lefordítása (`client/dist`) |
| `npm test`      | a kliens Vitest suite-ja egyszer |
| `npm run test:watch` | ugyanaz watch módban |

Backend — a `server-java/` mappából:

| Parancs | Mit csinál |
|---------|------------|
| `docker compose up -d` | fejlesztői Postgres · `down -v` teljes reset |
| `mvn spring-boot:run` | a szerver indítása (3001) |
| `mvn test` | a teljes JUnit suite (Dockert igényel) |
| `mvn -DskipTests package` | csomagolás → `target/webshop-server-1.0.0.jar` |

A szerződés ellenőrzése egy futó backend ellen:
`node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store`

Végponttól végpontig futó tesztek — az `e2e/` mappából (külön npm projekt, nem
workspace-tag; a stacket **nem** ő indítja):

| Parancs | Mit csinál |
|---------|------------|
| `npm install && npx playwright install chromium` | egyszeri előkészítés |
| `npm run e2e` | a Gherkin-szcenáriók futó stack ellen (alap: 5173) |
| `npm run e2e:headed` | ugyanaz látható böngészőablakkal |
| `npm run e2e -- --help` | a kapcsolók listája |

## Mappa-struktúra

```
.
├── start.sh                # a teljes fejlesztői környezet indítása egy paranccsal
├── start.cmd               # ugyanaz Windows terminálból (a start.sh-t hívja Git Bashsel)
├── server-java/            # Java 25 + Spring Boot backend
│   ├── docker-compose.yml  # fejlesztői Postgres
│   ├── .env.example        # opcionális env-változók sablonja
│   ├── pom.xml
│   └── src/main/
│       ├── java/hu/webshop/
│       │   ├── auth/       # bejelentkezés, regisztráció, admin felhasználókezelés
│       │   ├── bootstrap/  # induló állapot (seed katalógus, seed admin) + db.json import
│       │   ├── catalog/    # termékek: vásárlói és admin lekérdezés, validáció
│       │   ├── common/     # hibaszerződés: ApiException, központi hibakezelő, üzenetek
│       │   ├── config/     # konfigurációs kulcsok, webréteg, Jackson
│       │   ├── domain/     # JPA entitások
│       │   ├── ops/        # napló, e-mail, statikus kiszolgálás, életciklus
│       │   ├── order/      # rendelés leadása, státuszváltás, lejárat
│       │   ├── repo/       # Spring Data repositoryk
│       │   ├── review/     # értékelés beküldése, publikus lista, moderáció
│       │   ├── security/   # munkamenet, hitelesítés, jogosultság
│       │   └── stock/      # készletfoglalás és fedezetellenőrzés
│       └── resources/
│           ├── application.yml
│           └── db/migration/   # Flyway séma
├── e2e/                    # végponttól végpontig futó BDD tesztek (Gherkin + Cucumber + Playwright)
│   ├── run.mjs             # belépési pont: kapcsolók + környezet-ellenőrzés
│   ├── features/           # .feature fájlok (magyar Gherkin, `# language: hu`)
│   ├── steps/              # World, horgok, lépésdefiníciók
│   └── support/            # konfiguráció, HTTP-kliens, fixture-építők
└── client/                 # React + Vite frontend
    └── src/
        ├── main.tsx        # belépési pont (Router + Auth/Cart provider)
        ├── index.css       # a teljes stíluslap
        ├── api.ts          # backend hívások + közös típusok és formázók
        ├── auth.tsx        # belépett felhasználó (Context + localStorage token)
        ├── cart.tsx        # kosár állapot (Context + localStorage)
        ├── App.tsx         # útvonalak + layout
        ├── RequireAdmin.tsx# kliensoldali admin-őr (kényelmi)
        ├── Stars.tsx       # csillagos értékelés megjelenítése
        ├── ProductReviews.tsx # vélemények listája + beküldő űrlap
        ├── AddToCart.tsx   # "Kosárba" gomb + készletüzenet (lista és részletes nézet)
        ├── ReservationStatus.tsx # foglalási visszaszámláló / lejárat-magyarázat
        ├── Reorder.tsx     # újrarendelés a mai árakon (tervező + gomb)
        ├── SessionExpiredNotice.tsx # lejárt munkamenet sávja + terelés a belépéshez
        └── pages/          # ProductList, ProductDetail, Cart, Checkout,
                            # Login, Register, Orders, AdminProducts, AdminUsers
```

A tesztek nem a forrás mellett élnek: `client/test/`, `server-java/src/test/java/`
és `e2e/`. A csomagok **funkció szerint** vannak vágva, nem réteg szerint — egy
végpont megértéséhez egy mappát kell megnyitni.

## API végpontok

A 25 végpont áttekintése. A kérés- és válaszsémákat, a státuszkódokat és a hibaszövegeket
az [`openapi.yaml`](openapi.yaml) írja le — ez a tábla azt mondja meg, *mit csinál* egy
végpont, a leíró azt, *hogyan hívom*.

| Metódus | Útvonal | Leírás |
|---------|---------|--------|
| GET  | `/api/products`     | aktív termékek, lapozva/szűrve, értékelési átlaggal |
| GET  | `/api/products/:id` | egy aktív termék értékelési átlaggal (inaktívra 404) |
| GET  | `/api/products/:id/reviews` | a termék jóváhagyott értékelései (publikus, szerző nélkül) |
| POST | `/api/reviews`      | értékelés beküldése (`{ productId, rating, body? }`) |
| POST | `/api/orders`       | rendelés leadása (`{ items, customer, expectedTotal }` — a végösszeg jóváhagyása kötelező) |
| GET  | `/api/orders`       | a saját leadott rendelések listája |
| POST | `/api/auth/register` | regisztráció — a válasz munkamenet-tokent hoz |
| POST | `/api/auth/login`   | bejelentkezés (IP-nkénti rate limiting véd) |
| POST | `/api/auth/logout`  | kijelentkezés — a token érvénytelenné válik |
| GET  | `/api/auth/me`      | a belépett felhasználó publikus adatai |
| PUT  | `/api/auth/me`      | a saját fiókadatok mentése (a jelenlegi jelszó kell hozzá) |
| POST | `/api/auth/password` | jelszócsere — a válasz **új** tokent hoz, a régi érvénytelen |
| GET  | `/api/health`       | health-check |

Admin végpontok — mind a `requireAuth` + `requireAdmin` őr mögött (401 / 403):

| Metódus | Útvonal | Leírás |
|---------|---------|--------|
| GET    | `/api/admin/products`             | teljes katalógus, az inaktívakkal együtt |
| POST   | `/api/admin/products`             | új termék |
| PUT    | `/api/admin/products/:id`         | termék módosítása (teljes csere) |
| PATCH  | `/api/admin/products/:id/active`  | csak az aktivitás váltása |
| DELETE | `/api/admin/products/:id`         | végleges törlés |
| GET    | `/api/admin/users`                | felhasználók, jelszóadat nélkül |
| PUT    | `/api/admin/users/:id`            | név, e-mail, cím, szerepkör |
| DELETE | `/api/admin/users/:id`            | törlés (a rendelései megmaradnak) |
| GET    | `/api/admin/reviews`              | értékelések moderáláshoz (`?status=` szűréssel) |
| PATCH  | `/api/admin/reviews/:id`          | moderációs státusz (`approved` / `rejected` / `removed`) |
| GET    | `/api/admin/orders`               | a teljes rendeléshalmaz, legújabb elöl (lapozva, szűrve) |
| PATCH  | `/api/admin/orders/:id/status`    | teljesítési státusz (`pending` / `expired` / `delivered`) — a kiszállított és a lejárt állapotból nincs visszalépés (409) |

## Hogyan működik

1. Üres adatbázison az indítás létrehozza az induló állapotot: 8 demó termék
   (`p1`…`p8`) és a seed admin. Idempotens — kétszeri indítás nem duplikál.
2. A frontend lekéri a termékeket, és a kosarat a böngészőben tárolja
   (localStorage), így oldal-újratöltés után is megmarad.
3. A pénztárnál a kosár tartalma + a vevői adatok a `POST /api/orders`-re
   kerülnek. A szerver **újraszámolja a végösszeget** a DB-beli árakból
   (nem bízik a kliensben), majd egyetlen tranzakcióban — a termék sorát
   zárolva — ellenőrzi a fedezetet és menti a rendelést.
4. A rendelés elutasításra kerül, ha a kosárban időközben inaktívvá vált vagy
   törölt termék van, illetve ha a jóváhagyott végösszeg eltér a szerver által
   számolttól — a vevő soha ne fizessen mást, mint amit a képernyőn látott.
5. A rendelési tételek a leadáskori nevet és egységárat snapshotként őrzik, ezért
   egy korábbi rendelés tartalma akkor sem változik, ha a terméket később
   átnevezik, átárazzák vagy törlik.
6. Sikeres rendelés után a szerver e-mail értesítőt küld (ha a Gmail-kulcsok be
   vannak állítva). A küldés hibája **nem** buktatja a rendelést: naplózódik.

### Értékelések és csillagok

- Minden rendelés `pending` státusszal születik; `delivered`-re csak admin
  állíthatja (`PATCH /api/admin/orders/:id/status`).
- Értékelni csak **ellenőrzött vásárló** tud: akinek van olyan `delivered`
  rendelése, amely tartalmazza az adott terméket. A puszta megrendelés nem elég
  (403). Egy felhasználó egy terméket **egyszer** értékelhet (409).
- Az értékelés 1–5 csillag + opcionális, legfeljebb 500 karakteres szöveg.
  Beküldés után **nem módosítható**.
- A beküldött értékelés `pending` moderációs státuszú, és **nem publikus**.
  Csak az `approved` látszik a terméklapon, és csak az számít az átlagba.
  A `removed` soft delete: az adatbázisban megmarad.
- A szerző azonosítója soha nem kerül ki a publikus listára, és a beküldő
  személyét mindig a token dönti el — a kérés törzsében küldött `author`-t a
  szerver figyelmen kívül hagyja.
- Az átlag **nem tárolt**, hanem lekérdezéskor számolt, és csak a megjelenített
  oldal termékeire — így nem kell denormalizált mezőt karbantartani.

**Eltérés az eredeti specifikációtól:** a spec szerint "moderálni MVP-ben bárki
tud", mert íráskor még nem volt felhasználókezelés. Azóta van, ezért a moderáció
az admin névtérbe került — egy nyitott moderációs végpont bárkinek megengedné,
hogy tetszőleges véleményt eltüntessen vagy jóváhagyjon. A moderációhoz
jelenleg **nincs kliensoldali felület**, csak API.

### Biztonsági megoldások

- Jelszó: BCrypt hash, nyers jelszó soha nem tárolódik; a hash és a token soha
  nem kerül ki a kliensre.
- Bejelentkezés: IP-nkénti rate limiting (15 perces ablakban 10 sikertelen
  próbálkozás, utána 429). **Adatbázisban tárolt**, ezért túléli az
  újraindítást, és több példány esetén sem lehet példányonként újrakezdeni.
- Admin védelem **útvonalminta alapján**, egyetlen ponton bekötve — nem
  végpontonkénti annotációval, így egy új admin végpontnál nem lehet
  elfelejteni az őrt.
- Az egyediségi és mennyiségi invariánsokat adatbázis-megszorítás védi
  (kis/nagybetűtől független unique index a felhasználónévre és e-mailre,
  `CHECK` a mennyiségekre) — nem csak alkalmazásszintű ellenőrzés.

## Dokumentáció

- `openapi.yaml` — a REST API teljes leírója (OpenAPI 3.1): mind a 25 végpont kérés- és
  válaszsémákkal, státuszkódokkal és a magyar hibaszövegekkel. Kézzel karbantartott,
  statikus fájl — generátor szándékosan nincs; naprakészen a
  `.claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs` leltár-kapuja tartja, ami a
  controllerek, a leíró és ez a README végponthalmazát veti össze
- `CLAUDE.md` — a projekt szabályai AI-ügynökök számára
- `CONTEXT.md` — a domain szótára (ubiquitous language)
- `spec/backend/` — a backend teljes specifikációja hat dokumentumban: követelmények,
  terv, feladatlista, végpont-referencia, hibaüzenet-katalógus, konformancia-esetek
- `spec/admin-orders/` — a rendelés-adminisztráció feature-spece; a spec-alapú lánc
  legfrissebb, teljes kimenete
- `spec/admin-role/` · `spec/review-and-rating/` · `spec/termek-felhasznaloi-ertekeles/`
  — **történeti** feature-specek, 2026-08-02-án a kurzus `week3/` mappájából kerültek ide. A törölt
  Node/lowdb backendre készültek (ADR-0006), így a bennük szereplő `server/…` útvonalak
  elavultak; mindegyik `requirements.md` státuszfejléccel kezdődik, ami ezt kimondja.
  Olvasmánynak valók, megbízásnak nem
- `spec/backend/conformance/` — a `K-xx` konformancia-esetek futtatója; egy megadott
  base URL ellen fut, kizárólag HTTP-n:
  `node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store`
  A `compare.mjs` ugyanezen a szerződésen két futó példány válaszait veti össze.
- `e2e/README.md` — a végponttól végpontig futó BDD teszt-váz: futtatás, a két
  támogatott topológia, és a szcenárióírás négy megkötése (a szerver állapota nem
  áll vissza, a bejelentkezési rate limit perzisztens, az előfeltételek API-n
  épülnek, a kiválasztás szerep/címke szerint megy)
- `server-java/README.md` — a backend indítása, konfigurációs kulcsok, adatátvétel
- `docs/adr/` — architekturális döntések (ADR 0001–0009)
- `.claude/` — az ügynöki fejlesztési munkafolyamat: 10 skill, 11 agent és 3 hook (plusz egy közös modul); a térkép
  a [`.claude/README.md`](.claude/README.md). A belépő a `feature-full` skill (ötlet → spec →
  implementáció + e2e → validálás → unit tesztek → dokumentáció), a bekötések épségét a
  `node .claude/skills/skill-iro/scripts/ellenoriz.mjs --mind` validátor ellenőrzi
- `docs/ATVETEL.md` — mi került át az eredeti kurzusrepóból, az átvétel utáni ellenőrzés
  mért eredményei és a bemutató forgatókönyve
- `docs/digital-twin/` — a Gmail viselkedési iker (`test/mocks/msw/`) élő specifikációja
- `docs/scenario-catalog/` · `docs/user-simulation/` — forgatókönyv-katalógusok és a szimulált
  felhasználós riport (a vásárlási folyamatra és az `edit-user-data` feature-re)
- `docs/edit-user-data/` — az `edit-user-data` követelmény-auditja és a spec módosítás előtti állapota
- `docs/AI-aware-ci/` — a CI biztonsági és minőségi kapuinak naplója
- `docs/orchestration/` — a spec-alapú ügynöklánc futási naplói és a delegálási mérések tára

## Ötletek a továbbfejlesztéshez

- Moderációs admin felület az `/api/admin/reviews` végpontokhoz
- Értékelés szerkesztése / visszavonása
- Elfelejtett jelszó visszaállítása (e-mailes helyreállítás). A jelszó **módosítása** már
  megvan (`POST /api/auth/password`); a `db.json`-ból importált fiókoknak viszont a
  visszaállításra is szükségük van, mert a jelszavuk nem hozható át (ld. ADR-0006)
- Fizetés-integráció (pl. Stripe)
