# Webshop backend — Java / Spring Boot / PostgreSQL

A webshop szerveroldala Java 25 + Spring Boot 3.5 + PostgreSQL alapon. **Ez a backend** — a
korábbi Node/Express + lowdb implementáció újraírása, amely az átállás után törölve lett.

> **A viselkedés mérvadó forrása a [`spec/backend/`](../spec/backend/)**, nem a kód. A
> szerződést a nyelvfüggetlen [konformancia-katalógus](../spec/backend/konformancia.md) 70
> esete méri; eltérés esetén a spec az igazság. Az átállás döntése és mérési jegyzőkönyve:
> [ADR-0006](../docs/adr/0006-atvaltas-a-java-backendre.md).

- **Követelmények:** [`spec/backend/requirements.md`](../spec/backend/requirements.md)
- **Végpontok:** [`spec/backend/vegpontok.md`](../spec/backend/vegpontok.md)
- **Hibaüzenetek:** [`spec/backend/hibakatalogus.md`](../spec/backend/hibakatalogus.md)
- **Elfogadási esetek:** [`spec/backend/konformancia.md`](../spec/backend/konformancia.md)

## Követelmény

| Eszköz | Verzió | Miért |
|---|---|---|
| JDK | **25** | A `pom.xml` `java.version` értéke. A Byte Buddy a 25-ös class-file verziót csak a `net.bytebuddy.experimental` flaggel fogadja el — ezt a kód és a build már beállítja. |
| Maven | 3.9+ | `mvn` a PATH-on. |
| Docker | bármelyik friss | Postgres a fejlesztéshez és a Testcontainers-tesztekhez. |

## Indítás

> A teljes fejlesztői környezet (adatbázis + backend + kliens) egy paranccsal is
> felállítható a repó gyökeréből: `./start.sh` — a backendet önmagában a
> `./start.sh --no-client` indítja. Windows terminálból (PowerShell / cmd) ugyanez
> `.\start.cmd --no-client`. Az alábbi lépések ugyanezt írják le kézzel.

### 1. Adatbázis

```bash
cd server-java
docker compose up -d          # Postgres 16 a 5432-es porton
docker compose logs -f postgres   # ha nem indul
```

Leállítás: `docker compose down` · teljes reset (adatvesztéssel):
`docker compose down -v`.

A séma **kizárólag Flyway-migrációból** jön (`src/main/resources/db/migration`), az
alkalmazás soha nem hozza létre (`spring.jpa.hibernate.ddl-auto: validate`). Egy üres
adatbázison az első indítás lefuttatja a migrációkat, majd létrehozza az induló
állapotot (8 demó termék, seed admin).

### 2. A szerver

```bash
cd server-java
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

- API: **http://localhost:3001** (a portot a `PORT` írja felül)
- Egészség-ellenőrzés: `curl http://localhost:3001/api/health` → `{"status":"ok"}`

A `dev` profil egyetlen dolgot csinál: megadja a `docker compose` szerinti helyi
adatbázis-jelszót. A `DATABASE_PASSWORD`-nak ugyanis **nincs alapértéke**, tehát profil
és környezeti változó nélkül a szerver beszédes hibával megáll — lásd a
[Konfiguráció](#konfiguráció) szakaszt. Aki `.env`-ben vagy környezeti változóban adja
meg a jelszót, annak nem kell a profil. A `./start.sh` automatikusan `dev`-vel indít.

Csomagolt indítás:

```bash
mvn -DskipTests package
java -jar target/webshop-server-1.0.0.jar
```

### 3. Frontend mellé

Fejlesztés alatt a frontendet a Vite szolgálja ki (`npm run dev` a repó gyökerében), és
az `/api` kéréseket a 3001-es portra proxyzza — a kliensen nincs teendő.

> **Portütközés.** A 3001-es portot bármely más helyben futó szerver elfoglalhatja;
> ilyenkor a szerver indulása hasal el. Állítsd le a másikat, vagy adj `PORT`-ot az
> egyiknek. A `./start.sh` ezt indulás előtt ellenőrzi, és inkább meg sem próbálja.

Élesben ez a szerver adja a lefordított frontendet is:

```bash
npm run build                 # a repó gyökerében: client/dist elkészül
cd server-java && mvn spring-boot:run
```

Minden nem `/api/...` útvonal az `index.html`-re esik vissza (SPA-visszaesés), így a
mélylink és az oldalfrissítés is működik. A kiszolgált könyvtár a `STATIC_DIR`
konfigurációból jön (alap: `file:../client/dist/`). Ha nincs lefordított frontend, a
szerver **ettől még elindul** — csak nem szolgál ki statikus fájlt.

## Konfiguráció

A `DATABASE_PASSWORD` kivételével minden kulcs opcionális; a sablon és a magyarázatok:
[`.env.example`](./.env.example). Másold `.env` néven ide (a fájl nincs verziókövetve),
vagy — élesben ez a helyes — add az értékeket környezeti változóként. A `.env`
**alacsonyabb** prioritású, mint a valódi környezeti változó.

| Kulcs | Alap | Szerep |
|---|---|---|
| `PORT` | `3001` | A hallgatott port |
| `STATIC_DIR` | `file:../client/dist/` | A kiszolgált frontend könyvtára |
| `DATABASE_URL` · `DATABASE_USER` | a `docker-compose.yml` szerint | Postgres kapcsolat |
| `DATABASE_PASSWORD` | **nincs** | Az adatbázis jelszava. Hiánya **indulási hiba** — a `dev` profil adja meg helyi fejlesztéshez |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `TOKEN_TTL_HOURS` | `168` | Munkamenet élettartama (csúszó) |
| `TRUSTED_PROXY_HOPS` | `0` | Hány megbízható proxy áll előtted; a valós kliens IP az `X-Forwarded-For` lánc **végétől** ennyi hopra van. `0` = a fejlécet nem olvassuk |
| `CORS_ORIGINS` | üres | Engedélyezett eredetek, vesszővel elválasztva. Üresen **nincs** CORS fejléc |
| `ORDER_RESERVATION_HOURS` | `72` | Foglalási idő |
| `ORDER_EXPIRY_SWEEP_MINUTES` | `5` | A lejáratkezelő kör gyakorisága |
| `GMAIL_CLIENT_ID` · `GMAIL_CLIENT_SECRET` · `GMAIL_REFRESH_TOKEN` · `GMAIL_SENDER` | — | Gmail OAuth2 a rendelési értesítőhöz |
| `ORDER_NOTIFY_TO` | — | Az értesítő címzettje |
| `IMPORT_FILE` | üres | **Egyszeri** adatátvétel egy meglévő lowdb `db.json`-ból (lásd lent) |

Hitelesítő adat **kizárólag** környezetből származhat, forráskódba nem kerülhet
(spec 7.6), és **tartalék értéke sincs**: a többi kulcsnál az alapérték a helyes
viselkedés, a jelszónál viszont egy működő, de kitalálható alapérték azt jelentené,
hogy az elfelejtett változóval éles telepítés is elindul. A hibának ezért hangosnak és
azonnalinak kell lennie. A fejlesztői kényelem helye a `dev` profil
(`-Dspring-boot.run.profiles=dev`), amit a `./start.sh` automatikusan bekapcsol.

## Adatátvétel egy meglévő `db.json`-ból

Ha a régi, azóta törölt Node-backend egy megmaradt `db.json`-jával akarsz indulni, add meg az `IMPORT_FILE` kulcsot **egy üres
adatbázison**:

```bash
docker compose down -v && docker compose up -d      # tiszta adatbázis
IMPORT_FILE=/út/a/régi/db.json mvn spring-boot:run
```

Az import egyszeri és **mindent vagy semmit** végez: egyetlen tranzakcióban fut, bármelyik
rekord hibája az egészet visszagörgeti. Nem üres adatbázison **kimarad** egy figyelmeztetéssel
— így a beállítás bennfelejtése nem duplikál és nem akadályozza a következő indulást. Utána a
kulcsot vedd ki.

Átjön: a termékek (beszúrási sorrendben), a felhasználók szerepkörrel, a rendelések a
**tétel-snapshotokkal együtt** (ADR-0001 — a név és az egységár akkor is megmarad, ha a termék
azóta törlődött), az értékelések és a bejelentkezési számlálók. A
[`requirements.md`](../spec/backend/requirements.md) 8. fejezetének `FORRÁS` szabályai
érvényesek: hiányzó gyűjtemény üresnek számít, hiányzó `active` → igaz, hiányzó `role` →
`customer`, ismeretlen rendelési státusz → `pending`.

Az importáló **hangosan elutasít** minden olyan forrásadatot, amit csak csendes módosítással
lehetne betölteni: törtszám egész mező helyén, hiányzó vagy értelmezhetetlen időbélyeg,
ütköző felhasználónév/e-mail (kis/nagybetűtől függetlenül), ütköző termék–szerző pár. Egy
migráció ne találjon ki adatot — a hibás fájlt javítani kell, és az import megismételhető.

> **A jelszavak NEM jönnek át.** A referenciaimplementáció scryptet használt külön sóval, ez a
> modul BCryptet — a kettő nem konvertálható, visszafejteni nem lehet. Az importált fiókok
> olyan hasht kapnak, amire semmilyen jelszó nem illik, és a munkamenetük is törlődik: **új
> jelszót kell kapniuk**. Jelszó-visszaállító folyamat jelenleg nincs az alkalmazásban.
> Indoklás: [ADR-0006](../docs/adr/0006-atvaltas-a-java-backendre.md).

**Méretkorlát.** Az import egyetlen tranzakcióban fut, és felhasználónként kiszámol egy
BCrypt hasht (~100 ms). Néhány ezer rekordig ez kényelmes; tízezres nagyságrend fölött az
import percekig tart, és a persistence context memóriaigénye is együtt nő a rekordszámmal.
Ez tudatos csere: egy **egyszeri** eszköznél az egyszerűség és a mindent-vagy-semmit
garancia többet ér, mint a kötegelt írás. Nagy állomány esetén számolj vele.

## Üzemeltetési viselkedés

Ezt a részt a spec [7.3–7.5](../spec/backend/requirements.md) írja elő; a megvalósítás a
`hu.webshop.ops` csomagban van.

**Naplózás.** Strukturált (ECS JSON) kimenet a szabványos kimenetre. Minden HTTP kérés
naplózódik metódussal, útvonallal, státusszal és válaszidővel; a szint a státuszkódból
jön (5xx → `error`, 4xx → `warn`, egyébként `info`). **Hitelesítő adat és token soha nem
kerül a naplóba** — az `Authorization` fejlécet a kérésnapló el sem olvassa.

Érvénytelen `LOG_LEVEL` esetén a szerver visszaesik az alapszintre, és magyar nyelvű
figyelmeztetést naplóz. Nem áll le miatta, és nem hagyja, hogy a Logback angol
hibaüzenettel panaszkodjon: a szűrés a naplórendszer indítása előtt megtörténik
(`LogLevelEnvironmentPostProcessor`, regisztráció: `META-INF/spring.factories`).

**Hibakezelés.** Kezeletlen hiba → egységesen `500`, semleges magyar üzenettel
(`Váratlan szerverhiba.`); a részletek kizárólag a naplóba kerülnek. A hiba nem állítja
meg a folyamatot: a következő kérést a szerver kiszolgálja (K-72).

**Életciklus.** Indulás után `Szerver elindult…` a tényleges porttal; leállításkor
`Leállítás folyamatban…`, majd `A szerver leállt.`. A leállás **szabályos**
(`server.shutdown: graceful`): a futó kérések befejeződhetnek, de legfeljebb 20
másodpercig (`spring.lifecycle.timeout-per-shutdown-phase`).

**Rendelési értesítő.** Sikeres rendelés után egy fix, előre konfigurált címre megy
magyar nyelvű, egyszerű szöveges levél (rendelésazonosító a tárgyban is, időpont, a
rendelő adatai, a tételek névvel és darabszámmal, végösszeg forintban). A vevő **nem**
kap visszaigazolást.

- Ha a `GMAIL_*` / `ORDER_NOTIFY_TO` kulcsok **bármelyike** hiányzik, a küldés kimarad
  (`warn`: „Gmail nincs konfigurálva, e-mail kihagyva”), és **semmilyen** e-mail nem megy
  ki — beégetett tartalék címzett nincs (K-73, K-74).
- Egyetlen próbálkozás, nincs újrapróbálás. A küldés hibája sosem buktatja a rendelést:
  a vevő válasza változatlan, a hiba `error` szinten a rendelésazonosítóval naplózódik
  (K-75).

**Eredetek.** CORS csak akkor van, ha a `CORS_ORIGINS` ki van töltve. Üres értéknél a
válaszban **egyetlen** `Access-Control-*` fejléc sincs (K-76) — sem a fejlesztői proxy,
sem az éles static kiszolgálás nem támaszkodik rá, mert mindkettő azonos eredetű.

## Tesztek

```bash
cd server-java
mvn test                      # a teljes csomag
mvn test -Dtest=OpsIntegrationTest
```

Az integrációs tesztek **valódi Postgresszel** futnak: a
`hu.webshop.support.IntegrationTest` egy singleton Testcontainers-konténert indít
(`postgres:16-alpine`), és minden teszt előtt üríti a táblákat, majd lefuttatja az
induló állapot létrehozását. A HTTP hívások valódi porton mennek
(`RANDOM_PORT` + `TestRestTemplate`).

Ezért **Dockernek futnia kell** a tesztekhez. Ha a Docker Desktop nem elérhető, a
Testcontainers `IllegalStateException: Could not find a valid Docker environment`
hibával áll le — ilyenkor nem a kód a hibás. A `docker compose` szerinti fejlesztői
adatbázisra viszont nincs szükség: a teszt saját konténert indít.

Az egységtesztek (`LogLevelEnvironmentPostProcessorTest`, `GmailOrderNotifierTest`,
`SpaResourceConfigTest`) Docker nélkül is futnak.

**Állapot (2026-07-26): 220 teszt zöld.**

Két teszt kilóg a szokásos mintából, mert olyan esetet mérnek, amit HTTP-n nem lehet:

- `AuthRateLimitRestartTest` (K-52) egy **második alkalmazáspéldányt** indít ugyanarra az
  adatbázisra, véletlen porton — ez az egyetlen mód igazolni, hogy a bejelentkezési korlát
  tényleg a tárolóban él, és nem a folyamat memóriájában.
- `ErrorContractTest` (K-72) **hibát injektál** a lekérdező szolgáltatásba; a kontroller, a
  hibakezelő és a szervlet-lánc valódi marad.

## Konformancia-futtatás a Java backend ellen

A [konformancia-futtató](../spec/backend/conformance/README.md) nyelvfüggetlen: nulla
függőségű ESM JavaScript, ami **kizárólag HTTP-n** méri a backendet. A katalógus a
szerződés mércéje: nem ismer implementációs részletet, csak kérést és választ.

```bash
# 1. Tiszta adatbázis (a darabszám-érzékeny esetekhez kell)
cd server-java && docker compose down -v && docker compose up -d

# 2. A Java backend indítása külön terminálban
cd server-java && mvn spring-boot:run
#    (vagy a repó gyökeréből:  ./start.sh --no-db --no-client — az adatbázis már fut)

# 3. A katalógus futtatása a repó gyökeréből
node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store
```

Kilépési kód: `0` = minden futtatott eset zöld · `1` = van bukott eset · `2` = a futtató
nem tudott elindulni.

Két gyakorlati tudnivaló (részletesen a futtató README-jében):

- A `--clean-store` nélkül négy eset (K-05, K-48, K-49, K-77) kimarad, mert abszolút
  darabszámot állít.
- A K-51 **15 percre kizárja a futtató IP-jét** a bejelentkezésből, és a korlát
  perzisztens — közvetlen újrafuttatás előtt használd a `--skip-rate-limit` kapcsolót.

A katalógus 70 esetéből 54 futtatható HTTP-n; a maradék 16 (`⚙`) óraállítást,
újraindítást, konfigurációs felülírást, az adatbázis közvetlen olvasását vagy hibainjektálást
igényel — a K-56 pedig a K-51-gyel egy rate limit vödröt fogyaszt, ezért nem futtatható vele
egy körben. **Ezt a 16-ot ebben a modulban integrációs teszt fedi le** — a leképezés a
[`konformancia.md`](../spec/backend/konformancia.md) `⚙`-táblázatában van.

**Mérés (2026-07-26):** 54 / 54 zöld. Az (azóta törölt, ADR-0006) Node-implementáció ugyanezt adta, és a
válasz-összehasonlítás (`compare.mjs`, 58 lépés) **0 érdemi eltérést** talált — a részletek
az [ADR-0006](../docs/adr/0006-atvaltas-a-java-backendre.md)-ban.

## Szerkezet

```
server-java/
├── docker-compose.yml            fejlesztői Postgres
├── .env.example                  konfigurációs sablon (spec 7.6)
├── pom.xml
└── src/
    ├── main/
    │   ├── java/hu/webshop/
    │   │   ├── auth/             bejelentkezés, regisztráció, admin felhasználókezelés
    │   │   ├── bootstrap/        induló állapot (seed katalógus, seed admin) + db.json import
    │   │   ├── catalog/          termékek: vásárlói és admin lekérdezés, validáció
    │   │   ├── common/           hibaszerződés: ApiException, központi hibakezelő, üzenetek
    │   │   ├── config/           konfigurációs kulcsok, webréteg, Jackson
    │   │   ├── domain/           JPA entitások
    │   │   ├── ops/              üzemeltetés: napló, e-mail, statikus kiszolgálás, életciklus
    │   │   ├── order/            rendelés leadása, státuszváltás, lejárat
    │   │   ├── repo/             Spring Data repositoryk
    │   │   ├── review/           értékelés beküldése, publikus lista, moderáció
    │   │   ├── security/         munkamenet, hitelesítés, jogosultság
    │   │   └── stock/            készletfoglalás és fedezetellenőrzés
    │   └── resources/
    │       ├── application.yml
    │       ├── META-INF/spring.factories   kontextuson kívül futó komponensek
    │       └── db/migration/               Flyway séma
    └── test/java/hu/webshop/
        ├── support/              IntegrationTest (Testcontainers + valódi HTTP)
        └── auth|bootstrap|catalog|ops|order|review/   a fenti csomagok tesztjei
```

A csomagok **funkció szerint** vannak vágva, nem réteg szerint (nincs `controller/`,
`service/`, `dto/`): egy végpont megértéséhez így egy mappát kell megnyitni. A kivétel a
`domain/` és a `repo/` — azokat több funkció is használja.
