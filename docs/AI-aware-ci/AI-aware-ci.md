# AI-aware CI — kapunapló

Ez a dokumentum a `.github/workflows/ci.yml` biztonsági és minőségi kapuit írja le:
mit ellenőriznek, miért pont azokat, hol lettek kalibrálva, és — a legfontosabb —
**mit NEM fognak meg**, tehát mi marad emberi review feladata.

Három kapu készült el (ESLint, Semgrep, TruffleHog), mindegyik saját blokkal.
A támogató ellenőrzések (típusellenőrzés, shellcheck, sorvég-őr, tesztek,
konformancia) a dokumentum végén, összefoglaló táblázatban szerepelnek.

---

# AI-aware CI lépés — 2026-07-27 — 1. kapu: Linter

```
KAPU KIVÁLASZTÁSA
=================
Választott ellenőrzési típus: Statikus kódelemzés (lint) a JS/TS oldalon
Konkrét eszköz/konfiguráció: ESLint 10, flat config (`eslint.config.mjs`),
                             @eslint/js recommended + typescript-eslint
                             recommended + eslint-plugin-react-hooks;
                             CI-ban `npm run lint`
Miért ezt, és nem mást: A repóban addig SEMMILYEN JS/TS linter nem volt, csak
                        `tsc`. A típusellenőrzés a rossz TÍPUST fogja meg, a
                        rossz MINTÁT nem: egy hibás useEffect-függőséglista
                        típushelyes. A típusinformációt igénylő szabálykészlet
                        (recommended-type-checked) SZÁNDÉKOSAN kimaradt — azt a
                        `tsc --noEmit` amúgy is lefuttatja, duplán fizetni érte
                        lassítás lenne.
Várható false positive szint: [ ] Alacsony  [x] Közepes  [ ] Magas
```

## Mit ellenőriz

A `client/src`, `client/test` és a `spec/backend/conformance/**/*.mjs` fájlokat.
Blokkol: nem használt változó, `no-undef`, a React Hooks szabályai
(`rules-of-hooks`, `exhaustive-deps`), és egy repó-specifikus szabály, ami az
ES2022-es kényelmi metódusokat tiltja (`Object.hasOwn`), mert a `tsconfig`
ES2020-ra fordít, és ezek némán elhasalnak a buildben.

Nem néz `server-java/`-t (az Maven modul).

## Miért van szükség rá

Az AI-generált frontend kód jellemző hibái pont mintaszintűek, nem típusszintűek:

- **Maradék kód**: az átírt komponensben bent marad a régi import és a már nem
  használt state-változó. Típushelyes, de holt kód — a következő olvasót (és a
  következő AI-kört) félrevezeti.
- **useEffect-függőséglisták**: az AI szívesen ír `[]`-t oda, ahol a hatás
  props-tól függ, vagy fordítva, olyat sorol fel, ami minden rendereléskor új
  referencia. Az `exhaustive-deps` ezt méri — a fordító sosem.
- **Hookok feltételes hívása**: ritkább, de az AI a „tegyük egy if-be" kérésre
  simán megteszi. A `rules-of-hooks` ezt hibává teszi.

## Kalibrálás

Az alapértelmezett szabálykészlet **11 találatot** adott a meglévő, működő kódra.
Mindet átnéztem, egyik sem volt valódi hiba, ezért három helyen kalibráltam.
Mindhárom kikapcsolás indoklással szerepel az `eslint.config.mjs`-ben:

| Szabály | Találat | Miért van kikapcsolva |
|---|---|---|
| `react-hooks/set-state-in-effect` **(DEFERRED)** | 7 | A react-hooks 7 új, React Compiler-ihlette szabálya. Mind a 7 hely a `setLoading(true); fetch().then(...)` minta, ami itt helyes: a betöltésjelzőt épp az effektus indítja. Betartása 7 komponens átírását kívánná — az nem lint-kérdés. **Ez a kikapcsolás más fajta, mint a másik kettő:** nem a projekt egy TÉNYÉT rögzíti, hanem KÖLTSÉG miatt halaszt. A visszakapcsolás feltétele ki van írva az `eslint.config.mjs`-be (közös `useFetch` hook), hogy a következő olvasó lássa: ez halasztás, nem döntés. |
| `no-useless-assignment` | 2 | Olvashatóság miatt meghagyott kezdőértékek (pl. `let totalPages = 1` a lapozó ciklusban). |
| `no-unused-vars` → `args: "none"` a conformance-szkriptekben | 2 | A katalógus futtató-szignatúrája fix: `async run({ client, boot })`. Mind a 13 eset ugyanazt a formát viseli, akkor is, ha kettő csak a `boot`-ot használja — ez szerződés, nem maradék kód. A nem használt **változó** ott is hiba marad. |

A közepes FP-szint tehát nem jóslat, hanem mérés: a v7-es react-hooks plugin új
szabályai bőbeszédűek egy meglévő kódbázison. A klasszikus, értékes szabályok
(`rules-of-hooks`, `exhaustive-deps`) élesek maradtak.

## Ami nem szűr ki

- **Semmit a backendből.** A `server-java/` Java kód, ide nem tartozik; ott a
  `mvn test` és a JaCoCo a mérce.
- **Helyes-e a logika.** Az `exhaustive-deps` megmondja, hogy hiányzik egy
  függőség; azt nem, hogy jó helyen hívod-e egyáltalán az effektust.
- **A magyar szövegek minőségét.** A projekt szabálya szerint a felhasználói
  szövegek és kommentek magyarok — ezt semmilyen linter nem méri.
- **Elavult kosár-adatot.** A localStorage teljes `Product` pillanatképet tárol,
  ami elcsúszhat a szervertől; ez tervezési kérdés, nem lint-találat.

---

# AI-aware CI lépés — 2026-07-27 — 2. kapu: SAST

```
KAPU KIVÁLASZTÁSA
=================
Választott ellenőrzési típus: SAST (statikus biztonsági elemzés)
Konkrét eszköz/konfiguráció: Semgrep, hivatalos `semgrep/semgrep` konténerkép,
                             registry szabálycsomagok: p/security-audit,
                             p/secrets, p/owasp-top-ten, p/java, p/typescript,
                             p/react, p/github-actions.
                             Kizárások: `.semgrepignore`. Token NEM kell.
Miért ezt, és nem mást: Egyetlen eszköz, ami a repó MINDKÉT nyelvét érti
                        (Java és TypeScript) — a CodeQL is tudná, de privát
                        repóban GitHub Advanced Security nélkül nem elérhető,
                        a Semgrep viszont tokenmentesen, nyilvános
                        szabálycsomagokkal fut. A `p/github-actions` csomag
                        ráadásul magát a workflow-t is átvizsgálja.
Várható false positive szint: [ ] Alacsony  [x] Közepes  [ ] Magas
(Az ERROR-kapu miatt a WARNING-találatok nem blokkolnak — a kalibrálás így
 elhalasztható addig, amíg valódi találatokat nem látunk.)
```

## Mit ellenőriz

Mintaalapú biztonsági szabályokat futtat a forráson: SQL-injekció, XSS,
path traversal, gyenge kriptográfia, kikapcsolt tanúsítvány-ellenőrzés,
beégetett titkok, veszélyes deszerializáció, sebezhető GitHub Actions minták.

**Egy szkennelés, két lépés — és ez szándékos:**

1. Egy teljes, **nem blokkoló** kör, ami SARIF riportot ad → felkerül a GitHub
   Code scanning nézetébe (privát repóban GHAS nélkül ez a feltöltés elbukhat,
   ezért `continue-on-error`).
2. Egy ellenőrző lépés, ami **ugyanabból a SARIF-ból** olvas, és **csak ERROR
   súlyosságra** piros.

Így egy registry-szabályfrissítésből érkező új WARNING nem blokkolja azonnal az
összes PR-t, egy valódi sebezhetőség viszont igen.

**Korábban ez két teljes szkennelés volt**, azonos hét `--config` listával: a job
idejének nagyjából felét a duplikált kör vitte el, a tartósabb baj viszont a két,
kézzel szinkronban tartandó lista volt. Ha elcsúsznak, a kapu MÁSRA néz, mint a
riport — és ez a fajta hiba nem ad hibaüzenetet, csak csendesebb eredményt. A
szűréshez szükséges minden adat benne van a riportban, tehát a második futás
valójában olvasási feladat volt végrehajtási feladatnak álcázva.

**Csapda, amibe könnyű beleesni** (és amibe az első javítási kísérlet bele is esett):
a kézenfekvő `jq '.runs[].results[] | select(.level == "error")'` szűrő **soha nem
találna semmit**. A Semgrep SARIF-jában az egyes találatokon **nincs `level` mező** —
mérve: 14 találatból 0 esetben —, a súlyosság a szabálynál él
(`runs[].tool.driver.rules[].defaultConfiguration.level`). Az a kapu tehát mindig
zöld lenne, függetlenül attól, mit talál a szkennelés: pontosan az a néma
meghibásodás, ami ellen a lépés készült. A workflow ezért a `ruleId`-n keresztül
oldja fel a szabály súlyosságát, és a kapu **mindkét irányban le van mérve** — zöld
riporton `exit 0`, egy ERROR-ra állított szabállyal `exit 1` + `::error::` annotáció.

## Miért van szükség rá

Az AI-generált backend kód tipikus biztonsági hibái pont a Semgrep mintáira
illeszkednek:

- **Kézzel összefűzött SQL.** Ha az AI-t megkérik egy „gyors kereső végpontra",
  szívesen ír string-konkatenációt paraméteres lekérdezés helyett. A repó
  szempontjából ez élő kockázat: van szűrés/lapozás a katalógusban.
- **Kikapcsolt ellenőrzések a „hogy működjön" nyomás alatt.** Tanúsítvány-
  validáció kikapcsolása, `permitAll()`, CORS `*` — az AI ezeket „ideiglenes"
  megoldásként javasolja, és bent maradnak.
- **`dangerouslySetInnerHTML`** a kliensen, amikor szerver-oldali szöveget kell
  megjeleníteni.
- **Beégetett kulcs a példakódban.** A spec 7.6 kimondja: hitelesítő adat KIZÁRÓLAG
  környezetből jöhet. A `p/secrets` ennek a mintaalapú fele (a másik felét a 3.
  kapu adja).

## Kalibrálás

**Egyelőre nincs kalibrálás — szándékosan.** A kapu alapértelmezett
szabálycsomagokkal fut, mert találat nélkül kalibrálni találgatás lenne.
Egyetlen konfigurációs döntés van, és az nem szabály-kikapcsolás:

- A `.semgrepignore` kizárja a `node_modules/`, `client/dist/`,
  `server-java/target/`, `.scratch/`, `.run/` mappákat. **Fontos
  csapda:** ha ez a fájl létezik, a Semgrep beépített alapértelmezett kizárásai
  NEM lépnek életbe — ezért van benne a `node_modules` is kiírva.

**Az első teljes futás eredménye (mérve):** 253 szabály, 248 fájl, **14 találat —
mind WARNING, egy ERROR sem**, tehát a kapu zöld. A 14 találat mindegyike ugyanaz a
szabály (`github-actions-mutable-action-tag`), és mindegyik **magára a
`.github/workflows/ci.yml`-re** mutat: lebegő tagre hivatkozó `uses:` sorok.
Kalibrálásra így sincs szükség — a találat valódi, nem zaj.

**És itt jön a tanulságosabb fele: amit a SAST NEM fogott meg.** A 14 találat mind
`actions/checkout@v4`-típusú, tehát **első feles, GitHub-karbantartott** action lebegő
tagje. A repó legkockázatosabb `uses:`-e, a `trufflesecurity/trufflehog@main` —
harmadik fél, mozgó ÁGRA rögzítve — **nem volt a találatok között**: a szabály a
verziószerű tageket nézi, egy branch-referenciát nem ismer fel. A kockázati sorrendet
tehát pont fordítva mérte, mint ahogy valós:

| | Kockázat | Semgrep |
|---|---|---|
| `trufflesecurity/trufflehog@main` (3rd party, ág) | legmagasabb | **nem jelezte** |
| `actions/checkout@v4` (1st party, tag) | elfogadott kompromisszum | 14× jelezte |

A `@main` időközben commit-SHA-ra van rögzítve (`@6f3c981…` + `# v3.96.0` komment),
az action `version` inputja viszont szándékosan `latest` maradt: az action KÓDJA
rögzített, a szkennelő detektorai frissek — a heti ütemezés épp erre épül.

Ez a legjobb példa a dokumentum tézisére: a mintaalapú kapu megbízhatóan jelzi, ami a
mintájába esik, a *kockázat súlyát* viszont nem ő rangsorolja. Ezt a találatot emberi
review hozta.

**Következő lépésként feljegyezve:** a 14 first-party lebegő tag rögzítése SHA-ra
(Dependabottal karbantartva) — nem sürgős, mert a `permissions: contents: read`
workflow-szinten kicsire fogja a robbanási sugarat.

## Ami nem szűr ki

- **Az üzleti logika hibáit.** A Semgrep nem tudja, hogy ebben a rendszerben a
  vásárolhatóságot az `available` (= `stock` − aktív `pending` foglalások) dönti
  el, nem a `stock`. Ha az AI `stock`-ra ellenőriz, az mintaszinten tökéletes
  kód — és eladhat olyat, ami nincs. **Ezt csak emberi review vagy a
  konformancia-katalógus fogja meg.**
- **A jogosultsági szabályokat.** Hogy egy végpontnak admin-jogot kell-e kérnie,
  az specifikáció kérdése, nem mintáé.
- **A szó szerinti hibaüzeneteket.** A spec magyar hibakatalógusa karakterre
  kötött; ettől eltérni funkcionális hiba, amit a SAST nem lát.
- **A pénzügyi számítást.** Hogy a szerver DB-ből számolja újra a végösszeget és
  ne higgyen a kliens árainak — biztonsági döntés, de a Semgrep számára csak
  aritmetika.
- **Az ADR-ekben rögzített szándékos „szabálytalanságokat"** (pl. hogy az
  `order_items.name` pillanatkép, nem idegen kulcs). Egy „normalizáld" javaslat
  nem SAST-találat, de kárt okozna.

---

# AI-aware CI lépés — 2026-07-27 — 3. kapu: Titok-szkennelés

```
KAPU KIVÁLASZTÁSA
=================
Választott ellenőrzési típus: Secret scanning (titok-szivárgás keresése)
Konkrét eszköz/konfiguráció: TruffleHog (`trufflesecurity/trufflehog` action),
                             `fetch-depth: 0`, üres `base` → a TELJES
                             git-történet átvizsgálása,
                             `--results=verified,unknown`
Miért ezt, és nem mást: A Semgrep `p/secrets` csomagja mintaalapú: felismeri,
                        hogy valami kulcsNAK NÉZ KI. A TruffleHog ezen felül
                        VERIFIKÁL is — kipróbálja a kulcsot a szolgáltató
                        API-ján, tehát az „élő kulcs" és a „példa-string"
                        között különbséget tud tenni. És nem a munkapéldányt,
                        hanem a történetet nézi: egy commitolt, majd törölt
                        kulcs továbbra is kiszivárgott kulcs.
Várható false positive szint: [x] Alacsony  [ ] Közepes  [ ] Magas
(A `verified` találat definíció szerint igaz. Az `unknown` ág hozhat zajt —
 ha sok lesz, a következő lépés a `--only-verified`-re szűkítés.)
```

## Mit ellenőriz

A repó teljes git-történetét (nem csak az utolsó commitot, nem csak a diffet)
ismert szolgáltatók kulcsformátumaira. Blokkol, ha talál.

Ez a kapu tartatja be ténylegesen a spec 7.6 szabályát: hitelesítő adat kizárólag
környezetből jöhet, forráskódba nem kerülhet. A `server-java/.env` gitignore-olt,
az `.env.example` csak sablon — de a gitignore csak addig véd, amíg valaki nem
`git add -f`-el, vagy nem másol be kulcsot egy másik fájlba.

## Miért van szükség rá

Ez az a hibatípus, amit az AI-asszisztens **a leggyakrabban és a
legláthatatlanabbul** okoz:

- **Példakód valódi kulccsal.** Ha a beszélgetésben egyszer elhangzik egy
  token, az AI szívesen beleírja a generált konfigurációba „hogy működjön".
- **A `.env.example` kitöltése.** Az AI a sablont hajlamos „segítőkészen"
  valódi értékekkel kitölteni, mert a placeholder üresen „hiányosnak" látszik.
- **Debug-commitok.** A gyors „próbáljuk ki" körökben beégetett kulcs bekerül a
  történetbe, majd a következő körben kiszedik — a repóban viszont örökre ott
  marad. **Ezt a munkapéldányt néző eszközök egyike sem látja, csak a
  történet-szkennelés.**

A projekt konkrét kitettsége: Gmail API OAuth2 kulcsok
(`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`) — pontosan az
a fajta hitelesítő adat, amire a TruffleHog-nak van verifikáló detektora.

## Kalibrálás

**Nincs — alapértelmezett detektorkészlettel fut.** Egy kalibrálási döntés
elhalasztva: a `--results=verified,unknown` beállítás bőkezűbb, mint a
`--only-verified`, mert az „unknown" azt jelenti, hogy a detektor talált mintát,
de nem tudta ellenőrizni (pl. nincs hálózati elérés a szolgáltatóhoz).
Biztonsági kapunál a téves riasztás olcsóbb, mint a kihagyott találat, ezért
indulásnak ez a szigorúbb beállítás maradt.

**Következő lépésként feljegyezve:** ha az `unknown` ág zajosnak bizonyul,
`--only-verified`-re szűkíteni — ez egy soros változtatás a workflow-ban.

## Ami nem szűr ki

- **Az egyedi formátumú titkokat.** A TruffleHog ismert szolgáltatók mintáira
  épül. A rendszer SAJÁT munkamenet-tokenje, egy adatbázis-jelszó vagy a seed
  admin `admin123` jelszava nem illeszkedik egyetlen detektorra sem — pedig ha
  ilyesmi éles értékkel kerülne a kódba, ugyanúgy szivárgás lenne.
- **A nem commitolt fájlokat.** A helyi `.env` tartalmát senki nem ellenőrzi;
  a kapu csak azt méri, ami a git-be bekerült.
- **A jogosulatlan hozzáférést mint olyat.** Attól, hogy nincs kulcs a kódban,
  a kulcskezelés még lehet rossz (túl tág jogosultság, nem rotált token).
- **A naplózott titkokat.** Ha a kód egy tokent `info` szinten kiír, az nem a
  forrásban lévő titok — a szkennelés nem látja, emberi review igen.

---

# Támogató ellenőrzések

Ezek nem önálló „AI-aware kapuk", de ugyanabban a workflow-ban futnak, és
ugyanúgy blokkolnak:

| Job / lépés | Mit fog meg | Miért nem elég önmagában |
|---|---|---|
| `tsc --noEmit` (lint job) | Típushibák, hallucinált API-k és mezőnevek. A `client/test` is benne van, mert a Vitest esbuilddel csak leveszi a típusokat, nem ellenőrzi őket. | Csak típust néz, mintát nem. |
| `shellcheck` (lint job) | Shell-hibák a `start.sh`-ban. **Már fogott is valódit:** SC1087, egy `$port[` kifejezés, amit a shell tömbindexelésnek olvashat. | Egyetlen fájlra vonatkozik. |
| Sorvég- és kódlap-őr (lint job) | Hogy a `start.cmd` CRLF + ASCII marad, a `start.sh` pedig LF. A `.gitattributes` ezt kikényszeríti, a lépés azt méri, hogy a kikényszerítés él-e. | Platform-specifikus csapda, nem minőségi mérce. |
| `client` job (Vitest + build) | 262 kliensteszt és a produkciós build. | A tesztek azt mérik, amit megírtak. |
| `server` job (`mvn test`) | Java integrációs és unit tesztek valódi Postgresszel (Testcontainers), JaCoCo riporttal. **Mérve: 5906 teszt zöld, 86,0% áglefedettség.** | Ugyanaz a korlát. |
| JaCoCo lefedettségi kapu (`server` job) | **Új.** A `jacoco:check` 90%-os BRANCH küszöböt kényszerít ki a `test-writer-java-unit` skill által lefedett 10 osztályra (`.scratch/test-writer/*.md` tervvel rendelkezők). Eddig a 90% csak ígéret volt: a riport feltöltődött, de semmi nem bukott el tőle. | **Osztályszintű, nem repószintű.** A modul egésze 86,0%-on áll, egy globális 90% azonnal pirosra váltana a soha nem unit-tesztelt legacy kódtól. A kapu így regressziót fog meg, nem lefedettséget növel. |
| `conformance` job | A spec 67 elfogadási esetéből az 54 HTTP-n mérhető, friss adatbázis ellen. **Ez a legmélyebb kapu**: a spec szó szerinti hibaüzeneteit és a domain-szabályokat (foglalás, `available`, jogosultság) méri. | Nyelvfüggetlen, csak a HTTP-szerződést nézi — a kód belső minőségéről semmit nem mond. |

---

# Mit tudunk mérésből, és mit nem

Az őszinteség kedvéért, mert egy kapunapló annyit ér, amennyi belőle ellenőrzött:

**Mérve:**
- Az ESLint 11 találata: egyenként átnézve, mind besorolva (0 valódi hiba).
- A `tsc --noEmit`: tiszta.
- A 262 kliensteszt: zöld.
- A shellcheck: a CI-val azonos verzióval (0.9.0, Dockerben) újramérve a javítás
  után — `exit 0` warning szinten is.
- A sorvég-őr logikája: a jelenlegi munkapéldányon lefuttatva, OK.
- A `.gitattributes`: bevezetés után nem okozott renormalizációs diffet.
- **A Semgrep első teljes futása** (helyben, a CI-val azonos `semgrep/semgrep`
  képpel, azonos hét szabálycsomaggal): 253 szabály, 248 fájl, **14 találat, mind
  WARNING, egyetlen ERROR sem** — tehát a kapu zöld. Részletek lentebb.
- **A TruffleHog első teljes futása** a git-történeten: 1430 chunk, 2,75 MB,
  **0 verified és 0 unverified találat**, 9,3 s (CLI 3.96.0). Az `unknown` ág tehát
  ezen a repón NEM zajos — a „ha zajos lesz, szűkítsünk `--only-verified`-re"
  következő lépés ezzel tárgytalan, a bőkezűbb beállítás maradhat.
- **A backend teljes tesztsora**: 5906 teszt, 0 hiba, `BUILD SUCCESS`; a modul
  áglefedettsége **86,0% (553/643)**, a unit-tesztelt osztályoké 100,0%. Ez a mérés
  kalibrálta a lefedettségi kaput (lásd a támogató ellenőrzések tábláját).

**Még NEM mérve, tehát nyitott kérdés:**
- A **konformancia job** egyben: a jar indítása service-konténeres Postgres ellen
  helyben nem lett újramérve.
- **A CI-oldali futásidők és a futástörténet.** A repó privát, a mérésekhez itt
  nincs `gh` CLI, tehát a GitHub Actions oldali időket (jobonkénti másodpercek)
  ez a dokumentum nem állítja — a fenti számok mind HELYI, a CI-val azonos
  konténerképekkel készült mérések. Ez szándékos: a „mérve" rovatba csak az kerül,
  amit tényleg lefuttattunk.
- **A TruffleHog futása ebből a munkapéldányból.** A `feature-skill` mappa git
  **worktree** (a `.git` egy fájl, ami a fő checkout `.git/worktrees/...` mappájára
  mutat), amit a konténer nem ér el — a fenti mérés ezért a fő checkout közös
  történetén készült. A CI-t ez nem érinti: ott az `actions/checkout` normál repót ad.

---

# Hol fut

`.github/workflows/ci.yml` — push a `main` / `develop` ágakra, PR a `main` /
`develop` felé, heti ütemezés (hétfő 04:00 UTC, csak a default branchről), plusz
kézi indítás (`workflow_dispatch`).

A `feature/**` SZÁNDÉKOSAN nincs a `push` listáján. Amíg ott volt, egy nyitott
PR-rel bíró feature-ág minden commitja két teljes kört indított (2 × 6 job), és a
`concurrency` sem vonta össze őket, mert a push a `refs/heads/...`, a PR a
`refs/pull/N/merge` refen fut. A kettő nem ugyanazt méri, és a PR-változat a
hasznosabb: az a CÉLÁGGAL VETT ÖSSZEFÉSÜLÉST méri, nem az ágat önmagában. A repó
PR-alapú (#5–#9 PR-merge a történetben), tehát a lefedettség megmarad; ára, hogy egy
ág a PR megnyitásáig CI nélkül van — arra a kézi indítás való.

Helyi futtatás (a CI-val azonos képekkel):

```powershell
npm run lint                                   # 1. kapu
npx tsc --noEmit -p client/tsconfig.json
docker run --rm -v "${PWD}:/mnt" koalaman/shellcheck:v0.9.0 --severity=warning start.sh
docker run --rm -v "${PWD}:/src" -w /src semgrep/semgrep semgrep scan `
  --config p/security-audit --config p/secrets --config p/owasp-top-ten `
  --config p/java --config p/typescript --config p/react `
  --config p/github-actions --metrics=off                    # 2. kapu
docker run --rm -v "${PWD}:/repo" trufflesecurity/trufflehog:latest `
  git file:///repo --results=verified,unknown                # 3. kapu
```

**Csapda a 3. kapu helyi futtatásánál:** ha a munkapéldány git **worktree** (a `.git`
nem mappa, hanem a fő checkout `.git/worktrees/...`-ára mutató fájl), a konténer nem
éri el az objektumtárat, és a parancs `not a git repository`-val elhasal. Ilyenkor a
fő checkout mappáját kell becsatolni — a történet közös. A CI-t ez nem érinti: ott az
`actions/checkout` normál repót ad.

A backend lefedettségi kapuja külön is futtatható, tesztek újrafuttatása nélkül, a
meglévő `jacoco.exec`-ből:

```powershell
cd server-java; mvn -B -o jacoco:check@check-unit-tested-classes
```

# Reflexiós kérdés

**Melyik kapu térült meg azonnal?** Nem a látványos. A `start.sh`-ban talált valódi
hibát a **shellcheck** fogta meg (SC1087): a `$port[` kifejezésben a shell a `[`-t a
változónév részének olvassa, tehát tömbindexelést lát ott, ahol egy port száma után
egy szögletes zárójel állt.

Fontos pontosítani, mert a tanulság épp ezen múlik: **nem az ESLint volt.** Az ESLint
ebben a repóban a `client/**` és a `spec/backend/conformance/**/*.mjs` fájlokat linteli
— egy shell-szkriptről nincs és nem is lehet véleménye. A hibát azért találtuk meg,
mert bevezettünk egy lintert egy olyan nyelvre, amit **általában senki nem lintel**.

Ebből három dolog következik:

1. **A legolcsóbb kapu hozta az első valódi találatot.** A shellcheck egyetlen sor a
   workflow-ban, előre telepítve az `ubuntu-latest` képen, futásideje másodperc. A két
   "komoly" biztonsági kapu (SAST, titok-szkennelés) eddig egyetlen valódi hibát sem
   talált — ami jó hír, de azt jelenti, hogy a megtérülésük egyelőre elméleti.
2. **A lefedetlen fájltípus a kockázat, nem a lefedetlen szabály.** A repó JS/TS és
   Java kódját több eszköz is nézte; a `start.sh`-t addig egy sem. Egy CI erőssége nem
   az egy fájlra jutó ellenőrzések száma, hanem az, hogy marad-e olyan fájl, amire
   nulla jut. Ugyanez a gondolat szülte a sorvég-őrt a `start.cmd`-ra.
3. **A "megoldotta magának" csalóka.** A szkript működött a fejlesztői gépen, tehát
   semmi nem jelezte a hibát — pont ez a fajta, csak bizonyos bemenetnél előbukkanó
   shell-hiba az, amit emberi review is átugrik, statikus elemző viszont determinisztikusan
   megtalál.

**Amit a következő projektben másképp csinálnék:** nem a legerősebb eszközzel kezdeném,
hanem a lefedetlenség térképével — végigvenném, milyen fájltípusok vannak a repóban, és
melyikre nincs *semmilyen* automatikus ellenőrzés. A shell-szkript, a Dockerfile, a
CI-YAML és a migrációs SQL tipikusan ilyen. (A `p/github-actions` Semgrep-csomag ugyanezt
a logikát követi, és rögtön hozott is találatot magára a workflow-ra — lásd lentebb.)
