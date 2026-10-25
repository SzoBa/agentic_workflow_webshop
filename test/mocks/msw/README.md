# Gmail `users.messages.send` viselkedési klón

A `docs/digital-twin/digital-twin.md` táblázatait játssza le hálózat nélkül. Önálló npm projekt:
**nem** workspace-tag, saját `package.json`-nal és lockfile-lal — a gyökér `package.json`-t és
lockfile-t nem érinti (ugyanaz a döntés, mint az `e2e/`-nél). A gyökér `npm test` (Vitest) csak
`client/test/**/*.test.{ts,tsx}`-et futtat, tehát ez a mappa nem kerül bele; itt a saját
`npm test` fut.

## Felépítés

| Fájl | Függőség | Mit ad |
|------|----------|--------|
| `twin-core.mjs` | nincs | A döntési mag: eloszlás, kvótaszabály, ragadós állapotok, késésmintavétel |
| `http-server.mjs` | nincs | Valódi porton figyelő szerver a **Java** oldalnak |
| `notifier-twin.mjs` | nincs | `OrderNotifier`-szintű homlokzat: hiányzó konfig + elnyelt kivétel |
| `handlers.mjs` | `msw` | MSW v2 handlerek — a mag döntését HTTP válaszra fordítja |
| `msw-server.mjs` | `msw` | `setupServer` a Node-tesztekhez |
| `twin.test.mjs` | nincs | 17 teszt a magra (`node --test`) |
| `http-server.test.mjs` | nincs | 6 teszt a HTTP adapterre: hibahatár, méretkorlát, kötési cím |
| `msw.test.mjs` | `msw` | 7 integrációs teszt valódi `fetch`-csel az MSW rétegen |

A viselkedés **egy helyen** van (`twin-core.mjs`), a többi adapter. Ezért nem tud a Node- és a
Java-oldali klón szétcsúszni.

A táblázat „Függőség" oszlopa nem dísz: az `msw` **csak** a két adapterfájlhoz kell. A mag, a Java
felé néző szerver és a homlokzat `npm install` nélkül is fut — ezért működik a
`node --test twin.test.mjs` és a `node http-server.mjs` üres `node_modules` mellett is.

## Futtatás

```bash
node --test twin.test.mjs http-server.test.mjs   # 23 teszt, függőség nélkül
node http-server.mjs --port 8089                 # figyelő iker a Java oldalnak
npm install && npm test                          # mind a 30 teszt (az MSW réteggel együtt)
```

Mérve: **30/30 zöld**, ~0,5 s. A `node_modules` a gyökér `.gitignore` hatálya alatt van.

⚠️ **Ide ne kerüljön `test/` alkönyvtár.** A Node teszt-futtatója egy `test/` mappa **minden**
fájlját tesztesetnek tekinti, névmintától függetlenül — egy ott elhelyezett segédmodul így
„zöld tesztként" jelenne meg, és felfelé hamisítaná a darabszámot. A tesztek ezért laposan,
`*.test.mjs` néven ülnek a mappa tetején.

## Stack szerinti bekötés

### Node.js — MSW

```js
import { setupGmailTwin } from './msw-server.mjs';

const { server, twin } = setupGmailTwin({ seed: 42 });
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => twin.reset());
afterAll(() => server.close());

// Fault injection:
twin.force('backendError', 3);          // a következő 3 küldés 500/503
twin.stick('expiredToken');             // ragadós 401, amíg nincs reauthorize()
```

Kérésenként fejléccel is megy: `x-twin-scenario: userRateLimitExceeded`.

### Java — figyelő szerver

Az MSW a Node HTTP rétegét foltozza; egy külön JVM-et nem tud elfogni. Ezért a Java oldal a
`http-server.mjs`-t kapja, ugyanazzal a maggal:

```
node http-server.mjs --port 8089 --seed 42
```

Vezérlőfelület (ez a klón sajátja, nem a Gmail API része):

| Végpont | Mit csinál |
|---------|-----------|
| `GET /__twin/health` | állapot + aktuális ragadós hiba |
| `GET /__twin/ledger` | minden eddigi döntés (ág, státusz, késés, szabály) |
| `GET /__twin/stats` | ágankénti darabszám **és** a megfigyelhető kimenetek száma |
| `POST /__twin/force` | `{"scenario":"backendError","times":3}` |
| `POST /__twin/stick` | `{"scenario":"expiredToken"}` |
| `POST /__twin/reauthorize` · `POST /__twin/reset` | ragadós állapot feloldása / teljes reset |

⚠️ **A szerver alapból csak a loopbackra köt (`127.0.0.1`).** Ennek a vezérlőfelületnek nincs — és
szándékosan nem is lesz — hitelesítése: egy tesztdublőrbe nem építünk auth-ot. Ezzel viszont a
kötési cím lesz a teherhordó elem: `0.0.0.0`-n bárki az irodai vagy kávézós hálózaton elhajthatná
vagy visszaállíthatná a futó tesztet, és a naplót is elolvashatná. Ha konténerből kell elérni:
`--host 0.0.0.0`, tudatosan.

**A mérés határa.** A szerver HTTP-n figyel, tehát a `Gmail.Builder`-nek
`setRootUrl("http://localhost:8089/")` kellene — és az a hívás ma **nincs kivezetve** a
`GmailOrderNotifier`-ből, ami maga építi a transportot
(`GoogleNetHttpTransport.newTrustedTransport()`). Amíg nincs injektálható `HttpTransport` +
`setRootUrl` varrat, ez a szerver a **protokollt** méri egy kísérleti kliensről; a termelési kódút
**viselkedési** mérésének helye az `OrderNotifier` interfész (`notifier-twin.mjs` a JS párja,
`TwinOrderNotifier implements OrderNotifier` a Java párja). A `digital-twin.md` „Beillesztési pont"
szakasza ugyanezt mondja — ez választás következménye, nem hiba.

## Négy döntés, ami eltér a naiv klóntól

### 1. A sebességkorlát szabály, nem kockadobás

A 3%-os `userRateLimitExceeded` sor **szándékosan nincs** a súlyok között. Helyette kvótavödör:
250 egység/mp, 100 egység/küldés. Így a másodpercen belüli **harmadik** küldés determinisztikusan
403 — pont az, amit egy rendelési csúcs kivált, és amit véletlen valószínűséggel sosem sikerül
reprodukálni. A maradék 97% van 100-ra normálva, tehát az arányok a dokumentumot tartják.

Mérve (`node --test`): tartós terhelésen 2,2–3,0 küldés/mp megy át.

### 2. A hibák egy része ragad

| Ág | Élettartam | Miért |
|----|-----------|-------|
| `expiredToken` | `reauthorize()`-ig | a „Testing" OAuth-app refresh tokenje 7 naponta lejár |
| `insufficientPermissions` | új hozzájárulásig | hiányzó scope magától nem gyógyul |
| `quotaExhausted` | következő UTC éjfélig | napi kvóta |
| `backendError`, `invalidArgument`, `stuckConnection`, rate limit | egy kérés | átmeneti |

Ez a klón legfontosabb tulajdonsága: nem egy rossz kérést mér, hanem azt, hogy **sorozatnyi rendelés
értesítése marad-e el csendben**. A ragadósság a kényszerített ágra is érvényes — egy ág
következményét nem befolyásolhatja, hogy kockával jött-e ki vagy kézzel kértük. Ha egy teszt csak az
egyszeri választ akarja: `stickyFailures: false`.

### 3. A késés eloszlás, nem konstans

A dokumentum sikersora önellentmondó: „150–900 ms" tartomány, de „p99 ≈ 3 s". A feloldás: a tömeg
(99%) a 150–900 sávban, p50 = 300 ms-ra hangolva, a felső 1% nyúlik 900 → 3000 ms-ig. Így p99 ≈ 900 ms,
p100 ≈ 3 s. **Ha valaha lesz mért adat, a `DEFAULT_LATENCY` blokk a cserélendő** — a `digital-twin.md`
maga is tervezési feltevésnek nevezi a számokat.

A beragadt kapcsolat 20 s-a nem önkényes: a Google HTTP kliens alapértelmezett olvasási időkorlátja,
amit a kódbázis nem ír felül. A klón kitartja, majd elejti a socketet (Java: `SocketTimeoutException`,
fetch: hálózati hiba). Teszthez `realTime: false` / `--no-delay`.

### 4. A hiányzó konfiguráció külön ág, nem hibaág

Ha az öt kulcs bármelyike üres, a hívás **el sem indul**: `log.warn("Gmail nincs konfigurálva,
e-mail kihagyva")`, 0 ms késés, a klón meg sem szólal. Ez a valós fejlesztői alapállapot, mert a
`.env` sablonban a kulcsok üresen vannak — ezért ez a `notifier-twin.mjs` **alapértelmezése**.

## Amit a klón kimutat

Nem egy teszt zöldre állítása a hozadék, hanem egy vakfolt számszerűsítése. A
`GmailOrderNotifier` minden kivételt elnyel, az `OrderController` még egyszer körbezárja — a
`stats()` ezt méri:

```json
{ "total": 9,
  "byScenario": { "success": 4, "userRateLimitExceeded": 1, "insufficientPermissions": 4 },
  "byObservable": { "sent": 4, "error-log": 5 },
  "distinguishableFailureModes": 1 }
```

Hét különböző hibaok, **egyetlen** megkülönböztethető kimenet. Az üzemeltető ebből nem tudja
megmondani, kell-e új OAuth-folyamat, vagy csak várni kell. A `collapses every failure branch into a
single observable outcome` teszt pont ezt állítja bizonyítékként.

## Determinizmus

Minden futás seedelt (mulberry32). Azonos `seed` → azonos ágsorozat, azonos késések. Az idő
injektálható (`now`), így a kvótavödör és a napi kvóta lejárata valós várakozás nélkül tesztelhető.
