# Átvétel és bemutató-forgatókönyv

Ez a repó az `ai-native-project-SzoBa` kurzusprojekt **működő magja**: az alkalmazás (webshop),
a hozzá tartozó szerződések és döntések, valamint az ügynöki fejlesztési munkafolyamat
(`.claude/` — skillek, agentek, hookok). A kurzus heti anyagai nem kerültek át.

## Mi került át, és mi nem

| Átvéve | Miért |
|---|---|
| `client/`, `server-java/`, `e2e/`, `test/mocks/msw/` | a futó alkalmazás és a négy tesztréteg |
| `spec/` (a konformancia-futtatóval együtt) | a backend viselkedési szerződése és a feature-specek — a lánc bemenete |
| `docs/adr/`, `docs/orchestration/` | döntések, a lánc futási naplói, a delegálási mérések tára és küszöbei |
| `.claude/` (10 skill, 11 agent, 3 hook + közös modul, `settings.json`) | maga az ügynöki munkafolyamat |
| `openapi.yaml`, `CLAUDE.md`, `CONTEXT.md`, `README.md`, CI, lint-konfigok, `start.sh`/`start.cmd` | szerződés, ügynök-kontextus, fogalomtár, futtatás |
| `week5/digital-twin` → `docs/digital-twin/` | a Gmail-iker élő viselkedési specifikációja |
| `week5/scenario-catalog`, `week5/user-simulation` → `docs/…` | a lánc kimenetét mérő forgatókönyvek és a szimulált felhasználós riport |
| `week5/edit-user-data` → `docs/edit-user-data/` | a `spec/edit-user-data` auditja és módosítás előtti állapota (a spec rájuk hivatkozik) |
| `week4/AI-aware-ci` → `docs/AI-aware-ci/` | a CI-kapuk naplója (miért ezek a kapuk, mit nem fognak meg) |

| Kihagyva | Miért |
|---|---|
| `week1/`–`week3/`, `week4/README.md`, `week4/own-skill/`, `beadando.md` | kurzusszöveg, nem a rendszer része |
| `.idea/`, `node_modules/`, `target/`, `client/dist/`, `.run/`, `.scratch/`, `e2e/reports/` | IDE- és build-kimenet, újragenerálható |
| `server-java/.env`, `.env.bak`, `.claude/settings.local.json`, `CLAUDE.local.md` | gépfüggő beállítás és titok — sablonja a `.env.example` |

Az átvétellel járó módosítások: a `week5/…` és `week4/AI-aware-ci` hivatkozások az új `docs/…`
helyre mutatnak; a `CLAUDE.md` és a `README.md` dokumentációs szakasza a `docs/` tartalmát írja
le a `week*/` helyett; a lint- és Semgrep-kizárásokból kikerültek a nem létező `week*/` mappák; a
`docker-compose.yml` rögzített projektnevet kapott (`agentic-webshop`), hogy ne ossza meg a
konténert és a volume-ot az eredeti checkouttal.

## Ellenőrzés az átvétel után (2026-10-25)

| Réteg | Parancs | Eredmény |
|---|---|---|
| Backend | `cd server-java && mvn -B test` | **5934** teszt, 0 hiba; JaCoCo-kapu teljesül |
| Kliens | `npm test` · `npm run lint` · `npx tsc --noEmit -p client/tsconfig.json` · `npm run build` | **309** teszt zöld, lint és típusellenőrzés tiszta, build kész |
| Konformancia | `node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store` | **54/54** HTTP-eset (a 16 `⚙` eset a `mvn test`-ben fut) |
| E2E | `cd e2e && npm run e2e -- --base-url http://localhost:5173` | **20** szcenárió, **143** lépés zöld |
| Gmail-iker | `cd test/mocks/msw && npm test` | 0 bukás |
| `.claude/` bekötések | `node .claude/skills/skill-iro/scripts/ellenoriz.mjs --mind` | 0 HIBA (9 ismert FIGYELEM) |
| Dokumentáció-kapu | `node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs` | kód ↔ OpenAPI ↔ README: 25 végpont, fedik egymást |
| Spec-kapu | `node .claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs admin-orders` | a `CLAUDE.md`-ben dokumentált 3 ismert hiány (`AR-17`, `AR-20`, `AR-21`) |
| Őr-hook | `spec-guard.mjs` szimulált hívásokkal | spec-írás, `git commit`, e2e-n kívüli írás, validátoros `rm` → `deny`; engedett írás → `defer` |

**Sorrendi csapda:** a konformancia-futás rate-limit esetei a bejelentkezést 15 percre, IP-re
zárolják, és ez a szerver újraindítását is túléli. Ha utána fut az e2e, a seed admin `429`-et
kap. Bemutató előtt ezért: friss adatbázis (`cd server-java && docker compose down -v`), és az
**e2e fusson előbb**, a konformancia utána.

## Bemutató-forgatókönyv (kb. 10 perc)

1. **Az alkalmazás fut** — `.\start.cmd` (vagy `./start.sh`), majd `http://localhost:5173`:
   katalógus, termékoldal, belépés `adminisztrator` / `admin123`, *Rendelések kezelése*.
2. **A szerződés** — `spec/backend/` (követelmény, hibakatalógus, 70 konformancia-eset) és a
   `openapi.yaml`; a `dok-leltar.mjs` élőben mutatja, hogy a kód, a leíró és a README fedi egymást.
3. **A lánc térképe** — `.claude/README.md` 1. szakasza: `feature-full` → `feature-spec-writer`
   → `feature-implement` (kutató → implementáló ∥ e2e-író → validátor) → mérleg-kapu → unit
   tesztek ∥ dokumentáció.
4. **Gépi kikényszerítés** — a `spec-guard.mjs` egy tiltott írásra `deny`-t ad; a
   `ellenoriz.mjs --mind` a bekötéseket ellenőrzi.
5. **Mért eredmény** — `docs/orchestration/admin-orders/Running.md` (5 delegálás, ≈34,67 USD,
   62 perc) és `spec/edit-user-data/pipeline-riport.md` (1. kör 75% → 2. kör 94%, kevesebb
   tokenből; a leállás gazdasági döntés volt).
6. **Élő indítás (opcionális)** — Claude Code-ban `/feature-spec-writer` egy egymondatos
   ötlettel: a skill felderít, majd egyesével kérdez. A teljes `feature-full` lánc egy futása a
   mért adatok alapján tíz-harminc dollár és egy óra nagyságrendű, ezért bemutatón a 0. fázis
   (spec-írás) a reális élő rész.
