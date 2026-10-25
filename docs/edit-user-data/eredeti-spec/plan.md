# Megvalósítási terv — saját fiókadatok szerkesztése és jelszócsere

Ez a dokumentum két dolgot rögzít, és **mindkettő kötelező**:

1. az **interfész szerződését** — mindent, amiben a munkacsomagok ütközhetnének,
2. a **felbontást** — melyik munkacsomag mit kap, és mihez nyúlhat.

A szerződés **előre** rögzül, mert az implementálói futások kontextusa elkülönített. Ami itt le
van írva, azt egyik oldal sem dönti át menet közben. Ha a szerződés hibásnak bizonyul, azt
**jelenteni** kell, nem javítani.

> **A 4. és 5. szakasz döntései a fejlesztőtől valók** (2026-08-02, két kérdéskörben). Ahol a
> döntés a kódbázis egy leírt elvétől eltér, az indoklás is itt van. A terv a
> [`requirements.md`](./requirements.md) **kiegészítése**; ütközés esetén a
> [`spec/backend/`](../backend/) nyer — kivéve azt a három mondatot, amit ez a feature
> kifejezetten felülír (4.9).

A követelmény auditja — a nyitott kérdések forrása és a mérhetőségi hiányok listája —
[`docs/edit-user-data/notes.md`](../notes.md).

---

## 1. HTTP-szerződés

Két **új** végpont, a `/api/auth` névtérben: a `vegpontok.md` szerinti **23.** és **24.** pont.

### 1.1 `PUT /api/auth/me` — a saját fiókadatok mentése

Jogosultság: **belépett**. A védelmet a `MEGLÉVŐ` őr adja: a `PROTECTED_PATTERNS` már tartalmazza
az `/api/auth/me` mintát (`config/WebConfig.java:36-42`), és a minta **metódus-független** — a
`PUT` tehát új bekötés nélkül védett. **Ezt mérni kell, nem feltételezni** (`FA-08`).

**Kérés**

```json
{ "username": "…", "email": "…", "address": "…", "currentPassword": "…" }
```

- **Teljes csere**: mindhárom fiókadat-mező kötelező. A hiányzó mező üresként viselkedik, és a
  `MEGLÉVŐ` `UserValidator.validateProfile` utasítja el — **nincs új validátorkód**.
- A `currentPassword` **kötelező** (4.3).
- A `role` mezőről lásd 4.4.

**Válasz — 200**

```json
{ "id": "…", "username": "…", "email": "…", "address": "…", "role": "customer" }
```

Ez a `MEGLÉVŐ` **Publikus felhasználó** alak (`auth/PublicUserResponse.java`), ugyanaz, amit a
`GET /api/auth/me` ad. **`token` mező NINCS**: a fiókadat nem hitelesítő adat, ezért a
munkamenet érintetlen marad (4.5).

**Validációs sorrend** — az **első** hibánál megáll, a katalógus konvenciója szerint:

| # | Ellenőrzés | Válasz |
|---|---|---|
| 1 | rate limit (4.2) | **429** `Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.` |
| 2 | `currentPassword` helyes-e | **400** `A jelenlegi jelszó hibás.` — és a számláló nő |
| 3 | `validateProfile(username, email, address)` | **400**, a hibakatalógus meglévő szövegeivel |
| 4 | `role` jelen van és érvénytelen | **400** `Érvénytelen szerepkör.` (4.4) |
| 5 | `requireAvailable(username, email, sajátId)` | **400** `Ez a felhasználónév már foglalt.` / `Ezzel az email címmel már regisztráltak.` |
| 6 | mentés + `flush`; egyediségi ütközés | **400**, a `validator.duplicate(ex)` ágon (4.6) |

A jelszó-ellenőrzés **a formai validáció előtt** van, hogy a két végpont sorrendje azonos legyen,
és hogy hibás űrlap ne fedjen el egy hibás jelszót.

### 1.2 `POST /api/auth/password` — jelszócsere

Jogosultság: **belépett**. Ez a minta **nincs** benne a `PROTECTED_PATTERNS`-ben, tehát
**fel kell venni** — enélkül a végpont hitelesítés nélkül elérhető (4.8).

**Kérés**

```json
{ "currentPassword": "…", "newPassword": "…", "newPasswordConfirm": "…" }
```

**Válasz — 200**

```json
{ "user": { "id": "…", "username": "…", "email": "…", "address": "…", "role": "customer" },
  "token": "<új nyers token>" }
```

Ez a `MEGLÉVŐ` `auth/AuthResponse` alak, ugyanaz, amit a bejelentkezés ad — **nincs új
válaszrekord**.

**Validációs sorrend**

| # | Ellenőrzés | Válasz |
|---|---|---|
| 1 | rate limit (4.2) | **429** `Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.` |
| 2 | `currentPassword` helyes-e | **400** `A jelenlegi jelszó hibás.` — és a számláló nő |
| 3 | `newPassword` == `newPasswordConfirm` | **400** `Az új jelszó és a megerősítése nem egyezik.` |
| 4 | `validatePassword(newPassword)` | **400** `A jelszó legalább 8 karakter legyen.` |
| 5 | `newPassword` != `currentPassword` | **400** `Az új jelszó nem lehet azonos a régivel.` |
| 6 | hash-írás + tokenrotáció | **200** |

- A jelszót **nem trimmeljük** — a szóköz is karakter (`UserValidator.validatePassword` javadoc).
- Az 5. lépés a kérés **két nyers mezőjét** hasonlítja össze, nem hash-el újra: a 2. lépés már
  igazolta, hogy a `currentPassword` a tárolt hash-hez tartozik, tehát a nyers egyenlőség
  ekvivalens — és nem fizeti ki még egyszer a BCrypt árát.

### 1.3 Új hibaüzenetek

Három sor a `hu.webshop.common.Messages`-be, és ugyanezzel a szöveggel a hibakatalógusba:

| Konstans | Szöveg |
|---|---|
| `CURRENT_PASSWORD_INVALID` | `A jelenlegi jelszó hibás.` |
| `PASSWORD_CONFIRM_MISMATCH` | `Az új jelszó és a megerősítése nem egyezik.` |
| `PASSWORD_SAME_AS_OLD` | `Az új jelszó nem lehet azonos a régivel.` |

A `PASSWORD_TOO_SHORT` és a `LOGIN_RATE_LIMITED` **meglévő** konstans, változatlan szöveggel
használjuk újra. A szövegek **szó szerintiek** — a konformancia-esetek, a kliens és a Gherkin
ezekre épül.

---

## 2. TypeScript-tükör

A Java válasz-DTO és a `client/src/api.ts` külön van definiálva, ezért **együtt** módosulnak.
Az `api.ts` bővítése a **B** munkacsomag felelőssége.

```ts
export type ProfileInput = {
  username: string;
  email: string;
  address: string;
  currentPassword: string;
};

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
};

export function updateProfile(input: ProfileInput): Promise<User>;
export function changePassword(input: PasswordChangeInput): Promise<AuthResult>;
```

- A `User` és az `AuthResult` **meglévő** exportok (`client/src/api.ts:145-152,266`) — ne
  definiálj újat.
- **Mindkét hívás a `handle(r)` alapértelmezett ágán megy**, `signalUnauthorized: false`
  **nélkül**. Ez tudatos: ezen a két végponton a 401 tényleg lejárt munkamenetet jelent, mert a
  hibás jelszó **400**-at ad (4.3). A `login`/`register` kivétele ide **nem** másolandó.
- A `client/tsconfig` **ES2020**-at céloz: `Array#at`, `Object.hasOwn` megbuktatja a buildet.

---

## 3. Fájltulajdon — ki mihez nyúlhat

| Munkacsomag | Kizárólagos tulajdon |
|---|---|
| **B — backend + típustükör** | `server-java/src/main/java/hu/webshop/auth/**` · `common/Messages.java` · `config/WebConfig.java` · `server-java/src/test/java/hu/webshop/auth/**` · **`client/src/api.ts`** · `client/test/api.test.ts` |
| **F — kliens** | `client/src/pages/Profile.tsx` (új) · `client/src/RequireAuth.tsx` (új) · `client/src/auth.tsx` · `client/src/App.tsx` · `client/test/Profile.test.tsx`, `client/test/RequireAuth.test.tsx` (új) · `client/src/styles/pages.css` |
| **E — e2e** | `e2e/features/fiokadatok.feature` (új) · `e2e/steps/fiokadatok_lepesek.mjs` (új) |
| **S — spec és konformancia** | `spec/backend/**` · `CLAUDE.md` (végpontszám) · `spec/backend/conformance/cases/` (új esetfájl) + `run.mjs` bekötés |
| **V — validáló** | semmi — csak olvas, futtat és jelent |

Az `api.ts` szándékosan a **B** csomagé: ott születik a DTO alakja. Az `auth.tsx` viszont az
**F**-é — az a munkamenet-állapot, nem a hálózati réteg.

Amihez **egyik csomag sem nyúl**: `db/migration/**` (nincs sémaváltozás, 4.1), `package.json`,
`pom.xml` (nincs új függőség), `spec/edit-user-data/**` (ez a norma), és a
`spec/backend/konformancia.md` **meglévő** eseteinek számozása (4.10).

---

## 4. Megvalósítási döntések

Ezek **döntések**, nem javaslatok — az implementálónak nem kell újra végiggondolnia őket.

### 4.1 Nincs Flyway-migráció

A `users` táblában minden mező megvan (`V1__init.sql:30-41`), a rate limit tárolójának kulcsa
pedig szabad szöveges elsődleges kulcs (`login_attempts.attempt_key`, `V1__init.sql:97-101`),
tehát névtérrel bővíthető. **Ne írj migrációs fájlt.** Ezt azért kell kimondani, mert az
implementáló konvenciója szerint „új viselkedés = új migráció" — itt viszont nincs sémaváltozás.

### 4.2 A találgatás elleni korlát: `jelszocsere:{userId}`

| Paraméter | Érték |
|---|---|
| kulcs | `"jelszocsere:" + userId` |
| korlát | `LoginAttemptService.MAX_ATTEMPTS` (**10**) |
| ablak | `LoginAttemptService.WINDOW` (**15 perc**) |
| válasz | **429** `Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.` |
| siker | nullázza a **saját** számlálót (`clear`) |
| zárolás alatt | a **helyes** jelszót is elutasítja |

Négy dolog, ami ebből következik:

- **A két végpont ugyanazt a számlálót használja.** A `PUT /api/auth/me` is `currentPassword`-öt
  ellenőriz, tehát ott is lehet tippelni. Külön számláló azt jelentené, hogy a támadó a másik
  végponton folytatja — a korlát megkerülhető lenne.
- **A zárolás a helyes jelszót is elutasítja.** Enélkül a támadó pont a találat pillanatában
  csúszna ki a korlát alól — ez a `MEGLÉVŐ` bejelentkezés legfontosabb védelmi tulajdonsága
  (`auth/AuthService.java:109-113`), és itt sem gyengülhet.
- **A login IP-alapú számlálója érintetlen.** Más névtér, más kulcs: a két korlát nem akad össze,
  és egy zárolt jelszócsere nem akadályozza a bejelentkezést (sem fordítva).
- **Ez tudatos eltérés** a `LoginAttemptService` osztálydokumentációjától, amely a fiókhoz kötött
  zárolást elutasítja („bárki kizárhat bárkit, akinek ismeri a felhasználónevét"). Az érv itt
  **nem áll**: a végponthoz **érvényes token** kell, tehát idegen fiókjára nem lehet
  próbálkozásokat terhelni. A `spec/backend/requirements.md` 7.2 IP-alapú szabálya a
  **bejelentkezésre** vonatkozik, és változatlan marad.

### 4.3 A `currentPassword` mindkét végponton kötelező

Ellopott tokennel az e-mail cím átírása fiókátvétel — a követelmény épp erre a kockázatra
hivatkozva vezeti be a jelszóvédelmet. Ezért a **profilmentés** is kéri, azonos hibaüzenettel és
azonos státuszkóddal.

**A hibás jelszó válasza 400, nem 401.** A hitelesítést a token adja, ami érvényes; a jelszó itt
**validált bemenet**. Következmény, ami miatt ez a döntés fontos: a kliens globális 401-kezelője
(`client/src/api.ts:186-199`) **minden** 401-nél eldobja a munkamenetet — 401-es válasz mellett
egy elgépelés kiléptetné a felhasználót „lejárt a munkameneted" magyarázattal. **A 400-tól ez
szerkezetileg lehetetlen**, nem egy `signalUnauthorized: false` beállítás fegyelmén múlik.

### 4.4 A `role` mező kezelése

| Bemenet | Válasz |
|---|---|
| a mező **hiányzik** | 200 — a szerepkör változatlan |
| `"role": "admin"` vagy `"role": "customer"` | **200** — a szerepkör **változatlan**, az érték némán elvész |
| `"role": "barmi"`, `null`, nem szöveg | **400** `Érvénytelen szerepkör.` |

Vagyis: a mezőt **ugyanazzal a szabállyal olvassuk**, mint a `PUT /api/admin/users/:id`
(`auth/UserAdminService.readRole:107-122` — az elgépelt szerepkör nem maradhat némán figyelmen
kívül), de a kiolvasott értéket **eldobjuk**. Ez a saját fiókon a szerepkör-emelés egyetlen
lehetséges útját zárja le úgy, hogy közben egy elgépelés sem tűnik el csendben.

> **Reflexfigyelmeztetés:** ez **eltér** a regisztrációtól, ahol minden `role` érték némán
> elvész (`auth/AuthService.java:79-81`). Egy „konzisztenciát teremtő" refaktor, ami itt is némán
> eldobná az érvénytelen értéket, az `FA-19` kritériumot buktatná.

### 4.5 A tokenrotáció szabálya

| Művelet | Tokencsere |
|---|---|
| `PUT /api/auth/me` (fiókadat) | **nincs** — a válaszban nincs `token`, a régi token érvényes marad |
| `POST /api/auth/password` (hitelesítő adat) | **van** — a válasz új nyers tokent hoz, a régi azonnal halott |

Ez a [`CONTEXT.md`](../../CONTEXT.md) fogalmi különbsége: *„Hitelesítő adat cseréje mindig
munkamenetet is cserél"*, a **fiókadat** viszont nem hitelesítő adat.

A rotáció a `MEGLÉVŐ` `auth/SessionIssuer.issue(userId)` hívása — **ne írj új tokenkiadó kódot**.
Az `I-6` invariáns miatt (egy felhasználóhoz egy érvényes munkamenet, `users_token_hash_uidx`) a
régi token érvénytelenítése ennek **automatikus következménye**, nem külön lépés. Ennek az ára,
hogy egy másik böngészőlap munkamenete a csere pillanatában megszűnik — ez **elfogadott**, nem
hiba.

### 4.6 Tranzakciós felépítés — két bean, a `MEGLÉVŐ` minta szerint

A számláló növelése **nem futhat** a kérés tranzakciójában: a hibás jelszó 400-zal végződik, és
egy közös tranzakció a válasszal együtt a számlálót is visszagörgetné — a korlát soha nem lépne
életbe. Ezt a `MEGLÉVŐ` `AuthService`/`SessionIssuer` páros oldja meg, és ugyanez a felosztás
kell ide:

- **`auth/AccountService`** — **nem** tranzakcionális. Rate limit, a felhasználó betöltése, a
  jelszó ellenőrzése, a validáció sorrendje. Hibánál `attempts.recordFailure(...)` (saját
  tranzakcióban commitál), majd dob. Sikernél `attempts.clear(...)`.
- **`auth/AccountWriter`** — `@Transactional`. A profilmentés, illetve a jelszóhash írása; a
  tokenrotációhoz a `SessionIssuer.issue`-t hívja, ami a meglévő tranzakcióba csatlakozik.

A `LoginAttemptService` annotációit **tilos** átírni: a bejelentkezés viselkedése függ tőlük.

### 4.7 A validátor újrahasználata — és ami nem elég belőle

- `validateProfile(username, email, address)` — **változatlanul** hívható.
- `requireAvailable(username, email, excludeUserId)` — a harmadik paraméter a **saját**
  azonosító, enélkül a változatlan név megtartása is ütközésnek látszana
  (`auth/UserValidator.java:72-87`).
- A `flush` körüli `catch (DataIntegrityViolationException) → validator.duplicate(ex)` ág
  **kötelező**: az `I-1`/`I-2` **atomicitását** ez adja, nem az előzetes ellenőrzés (K-47). Enélkül
  két egyidejű kérés 500-zal végződhet 400 helyett.
- `validatePassword(newPassword)` — hívható, de **a hatóköre bővül**: eddig „kizárólag a
  regisztrációra" vonatkozott (a javadoc és a hibakatalógus is így írja). A javadocot és a
  katalógust ehhez igazítani kell (4.9).

### 4.8 A `PROTECTED_PATTERNS` bővítése

Az `/api/auth/password` mintát **fel kell venni** a `config/WebConfig.java` listájába. Ez a lista
**tételes felsorolás**, nem névtér-minta: `/api/auth/**` nincs benne, tehát az új végpont
alapértelmezésben **védtelen**. Ez a `K-58`/`K-70` tanulságának pontosan az a helye, ahol
elrontható — ezért az `FA-08` bizonyítéka **ténylegesen lefuttatott kérés**, nem az interceptor
létére hivatkozás.

Az `/api/auth/me` mintát **nem** kell bővíteni: metódus-független, a `PUT`-ot is fedi.

### 4.9 A `spec/backend/` frissítése — mit ír felül ez a feature

| Fájl | Mi változik |
|---|---|
| `vegpontok.md` | Új **23.** és **24.** pont + sorok az áttekintő táblában; a fejléc „**22 végpontja**" → **24**; a 303. sor mondata („a jelszó nem módosítható") az **admin** útra szűkül |
| `hibakatalogus.md` | Új szakasz a három üzenettel és a 429-cel; a `A jelszó legalább 8 karakter legyen.` sor kiváltó oka „Csak regisztrációnál" → **regisztrációnál és jelszócserénél** |
| `requirements.md` | Az 1. szakasz mondata: a jelszó **adminisztrátori úton** továbbra sem módosítható, a felhasználó **saját maga** viszont igen; a 7.2 kiegészül a jelszócsere korlátjával |
| `CLAUDE.md` | „22 endpoints" → 24 |

**Nem** változik: a hibaválasz alakja, a munkamenet szabályai (7.1), a bejelentkezés IP-alapú
korlátja, és az `admin-orders` bármely szabálya.

### 4.10 Konformancia — új esetek, meglévő számozás érintetlenül

Nyolc új eset: **`K-79` … `K-86`**, mind HTTP-n futtatható (**nincs** `⚙`).

- A meglévő azonosítók **nem** számozódnak át. A fenntartott hézagokat (`K-16…K-19`,
  `K-37…K-39`, `K-59`) **nem** használjuk el: azok a meglévő területekbe való beszúrásra
  vannak fenntartva, ez viszont **új terület**.
- A lefedettségi térkép új sort kap: *Fiókadat és jelszócsere · K-79…K-86 (8)*.
- Az összesítők: **70 → 78** eset, a HTTP-n futtathatók **54 → 62**, a `⚙` esetek száma
  **16 marad**.

| # | Mit mér |
|---|---|
| K-79 | Profilmentés, majd `GET /api/auth/me` — az új értékek jönnek vissza; a mentés előtti token továbbra is érvényes |
| K-80 | Más felhasználó nevének/e-mailjének elvétele **400**; a **saját**, változatlan név megtartása **200** |
| K-81 | `role: "admin"` → 200, a szerepkör marad `customer`; `role: "barmi"` → 400 |
| K-82 | Jelszócsere: a válaszban kapott tokennel `GET /api/auth/me` **200**, a csere **előtti** tokennel **401** |
| K-83 | Az **új** jelszóval `POST /api/auth/login` sikeres, a **régivel** 401 |
| K-84 | Hibás `currentPassword` → 400; a válasz nem árulja el, mi a helyes |
| K-85 | Megerősítés-eltérés → 400; a régivel azonos új jelszó → 400 |
| K-86 | 10 hibás `currentPassword`, majd a 11. kérés a **helyes** jelszóval → **429**; közben egy **másik** felhasználó cseréje és a bejelentkezés ugyanarról az IP-ről **200** |

### 4.11 Kliens — a munkamenet frissítése a mentés után

Az `AuthProvider` a felhasználót **és** a tokent a `webshop-auth` localStorage-kulcsban tartja
(`client/src/auth.tsx:41,88-90`). Ebből két kötelezettség:

- **profilmentés után** a context `user` állapotát frissíteni kell a válasszal — enélkül a
  fejléc és minden előtöltött űrlap a régi nevet mutatja az oldal újratöltéséig;
- **jelszócsere után** a válasz `token` mezőjét ugyanoda be kell írni (`setAuthToken` + `state`)
  — enélkül a következő kérés 401, és a globális kezelő kilépteti a felhasználót.

Mindkettő az `auth.tsx` context **új metódusaként** valósul meg (`updateProfile`,
`changePassword`), a `login`/`register` mintájára — a `Profile.tsx` **nem** hívja közvetlenül az
`api`-t és **nem** ír localStorage-ot.

### 4.12 Kliens — útvonal, őr és a fejléc-belépő

- Új komponens: **`RequireAuth`**, a `RequireAdmin` mintájára
  (`client/src/RequireAdmin.tsx` — context-olvasás, saját hálózati hívás nélkül). Hiányzó
  felhasználónál `<Navigate to="/login" replace />`. Ma nincs ilyen őr a repóban.
- Új útvonal: **`/profile`**, a `RequireAuth` alatt.
- A fejlécben a **belépett felhasználó neve lesz a link** a `/profile`-ra (a topbar mai
  `Belépve: <strong>{user.username}</strong>` blokkja). Ez a `MEGLÉVŐ` elv szerint kényelmi
  funkció; az érdemi védelem szerveroldali.
- A képernyő **két külön űrlap**: fiókadatok (`username`, `email`, `address`, `currentPassword`)
  és jelszócsere (három mező). A hibák a **szerver magyar üzenetével** jelennek meg, változtatás
  nélkül — a kliens nem fogalmaz újra és nem tompít.

---

## 5. A kész-kritériumok mérhető olvasata

### 5.1 A meglévő pontok élesítése

A [`requirements.md`](./requirements.md) öt pontja a mai szövegével nem ítélhető meg
(részletesen: [`notes.md`](../notes.md) 5. szakasz). Ez a terv rögzíti,
**mit jelentenek** — a validáló ezt méri:

| Pont | A mérhető olvasat |
|---|---|
| `FA-02` | A hibaüzenetek **szó szerint** az 1.3 és a hibakatalógus szövegei, a státuszkód 400, és az 1.1/1.2 **sorrendje** érvényesül. |
| `FA-07` | Két ág: (a) a csere **előtti** tokennel `GET /api/auth/me` **401**; (b) a válaszban kapott tokennel **200**. Mindkettő kell. |
| `FA-09` | A 4.2 táblázata: 10 hibás próbálkozás / 15 perc → a 11. kérés **429**, a **helyes** jelszóval is. |
| `FA-11` | A hibák a szerver üzenetével, változtatás nélkül megjelennek mindkét űrlapon; a „jól néz ki" **nem** kritérium. |
| `FA-12` | Négy tesztotthon közül: integrációs teszt (`server-java/src/test/java/hu/webshop/auth/`), kliens-teszt (`client/test/`), konformancia-eset (`K-79…K-86`) és e2e feature-fájl. Mind a négy kell. |
| `FA-14` | Három parancs: `mvn test`, `npm run build` + `npm test`, és **`npm run lint`** (a CI külön jobja). |

### 5.2 Kiegészítő kész-kritériumok

A követelmény DoD-jából **három kategória hiányzik**: end-to-end mérő pont, regressziós pont a
bővített közös komponensekre, és a spec-karbantartás. A fejlesztő mind a négy hatókör-tételt
befogadta, ezért az alábbi pontok a feature részei.

> **Ezek ma a tervben élnek.** A `requirements.md` 5. szakasza **emberi szerkesztés** — a lánc
> indítása előtt ezeket át kell emelni oda, `*Bizonyíték:*` sorral, ahogy a
> [`spec/admin-orders/requirements.md`](../admin-orders/requirements.md) teszi. Amíg ez nem
> történik meg, a `spec-ellenoriz.mjs` a mappát pirosnak látja.

- **`FA-15`** — `PUT /api/auth/me` **200**-at ad, és a válasz pontosan `id`, `username`, `email`,
  `address`, `role` kulcsot tartalmaz; **`token` nincs** benne, és a mentés előtt használt
  tokennel a `GET /api/auth/me` utána is **200**.
  *Bizonyíték:* `ProfileApiTest` integrációs eset.
- **`FA-16`** — `POST /api/auth/password` **200**-at ad `user` és `token` mezővel; a **válaszban
  kapott** tokennel a `GET /api/auth/me` **200**, a csere **előtti** tokennel **401**.
  *Bizonyíték:* `PasswordChangeApiTest` — mindkét ág külön asszertálva.
- **`FA-17`** — 10 hibás `currentPassword` után a 11., **helyes** jelszót vivő kérés **429**;
  ugyanabban az ablakban, ugyanarról az IP-ről egy **másik** felhasználó jelszócseréje és a
  `POST /api/auth/login` **200**.
  *Bizonyíték:* `PasswordChangeRateLimitTest` — mindhárom asszerció.
- **`FA-18`** — Egy **sikeres** jelszó-ellenőrzés nullázza a saját számlálót: 9 hibás próba → egy
  sikeres művelet → újabb 9 hibás próba **nem** vezet 429-hez.
  *Bizonyíték:* `PasswordChangeRateLimitTest`.
- **`FA-19`** — `role: "admin"` → **200**, a szerepkör marad `customer`; `role: "barmi"` →
  **400** `Érvénytelen szerepkör.`
  *Bizonyíték:* `ProfileApiTest` — mindkét érték külön kérésben.
- **`FA-20`** — Nincs új fájl a `server-java/src/main/resources/db/migration` könyvtárban.
  *Bizonyíték:* a könyvtár tartalma (`V1`, `V2`, `V3` és semmi más).
- **`FA-21`** — A `spec/backend/` három fájlja és a `CLAUDE.md` a 4.9 szerint frissült: a
  `vegpontok.md` 23. és 24. pontja megvan, a végpontszám 24, a hibakatalógus három új üzenete
  **szó szerint** egyezik a `Messages` konstansaival, és a jelszóhossz-sor hatóköre bővült.
  *Bizonyíték:* `git diff` a `spec/backend/` alatt + szövegegyezés-ellenőrzés a `Messages`-szel.
- **`FA-22`** — A `K-79…K-86` esetek bekerültek a `konformancia.md`-be **a meglévő azonosítók
  átszámozása nélkül**, az összesítők 78 / 62 / 16-ra frissültek, és a
  `node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store` futó
  backend ellen **zölden** lefut.
  *Bizonyíték:* a futtatás tényleges kimenete + a `git diff` a `konformancia.md`-n.
- **`FA-23`** — A `/profile` **futó stack ellen** működik: a profilmentés végigmegy, a
  jelszócsere után a felhasználó **belépve marad**, és egy elgépelt jelenlegi jelszó **nem**
  lépteti ki.
  *Bizonyíték:* `e2e/features/fiokadatok.feature` — Cucumber + Chromium, tényleges futáskimenettel.
- **`FA-24`** — Regresszió: a `POST /api/auth/register`, a `POST /api/auth/login` és a
  `PUT /api/admin/users/:id` viselkedése **változatlan** — az `AuthApiTest`, `AdminUsersApiTest`,
  `UserValidatorTest`, `AuthRateLimitTest`, `AuthRateLimitPurgeTest` és `AuthRateLimitSpoofTest`
  változatlan asszertálásokkal zöld.
  *Bizonyíték:* a `mvn test` tényleges kimenete.
- **`FA-25`** — `npm run lint` zöld a repó gyökeréből.
  *Bizonyíték:* a parancs tényleges kimenete.

---

## 6. Felbontás — a munkacsomagok sorrendje

```
spec-researcher → spec-implementer (B) → spec-implementer (F) → e2e-test-writer (E)
                                                                        ↓
                                          spec-implementer (S) → spec-validator (V)
```

| Lépés | Ki | Mit kap | Mit ad vissza |
|---|---|---|---|
| 1 | `spec-researcher` | ez a spec-mappa | eligazítás `fájl:sor` hivatkozásokkal |
| 2 | `spec-implementer` (**B**) | a kutató jelentése + a B csomag | backend + `api.ts`, zöld `mvn test` |
| 3 | `spec-implementer` (**F**) | az 1.–2. szakasz + az `api.ts` tényleges alakja + az F csomag | `Profile.tsx`, `RequireAuth.tsx`, zöld `npm test` |
| 4 | `e2e-test-writer` (**E**) | az 1. szakasz + az `FA-23` + a `Profile.tsx` kiválasztói | feature-fájl + lépésdefiníciók, futtatva |
| 5 | `spec-implementer` (**S**) | a 4.9 és a 4.10 táblázata | `spec/backend/` + konformancia-esetek, zöld `run.mjs` |
| 6 | `spec-validator` (**V**) | a spec-mappa + a jelentések **mutatóként** | `FA-01…FA-25` tételes ítélet |

A **B** és az **F** azért nem párhuzamos, mert az F a B által megírt `api.ts`-re épül. Az **E**
és az **S** egymástól függetlenek, de mindkettő az F után van: az E a kész képernyőt méri, az S
pedig a `Messages` végleges szövegeit veszi át.

Az `e2e-test-writer` a projekt e2e vázának konvencióit a saját `skills:` mezőjén keresztül kapja
(`e2e-vaz-konvenciok`) — **ez a terv nem ismétli meg őket**.

---

## 7. Kockázatok

| Kockázat | Kezelés |
|---|---|
| Az új `/api/auth/password` kimarad a `PROTECTED_PATTERNS`-ből → hitelesítés nélkül elérhető. | 4.8 explicit lépés + `FA-08` bizonyítéka **lefuttatott** kérés. |
| A hibás jelszó 401-et ad → egy elgépelés kilépteti a felhasználót. | 4.3: a válasz **400**; a 2. szakasz tiltja a `signalUnauthorized: false` másolását. |
| A jelszócsere-számláló a login IP-vödrébe folyik → a felhasználó nem tud belépni. | 4.2 külön névtér + `FA-17` harmadik asszerciója. |
| A számláló a kérés tranzakciójában nő → a 400-zal visszagördül, a korlát sosem lép életbe. | 4.6 kétbean-es felépítés, a `MEGLÉVŐ` `AuthService` mintájára. |
| Az implementáló migrációt ír („új viselkedés = új migráció"). | 4.1 explicit tiltás + `FA-20`. |
| Az érvénytelen `role` némán elvész (regisztráció-reflex) vagy az `"admin"` 400-at kap (admin-reflex). | 4.4 táblázat + `FA-19` mindkét értéket méri. |
| A `duplicate(ex)` ág kimarad → egyidejű névváltás 500. | 4.7 kötelező elem. |
| A kliens nem frissíti a tárolt tokent a csere után → a user kirepül. | 4.11 + `FA-16` és `FA-23`. |
| A konformancia-esetek beszúrása átszámozza a meglévőket. | 4.10: új, összefüggő tartomány; `FA-22` a `git diff`-et is nézi. |
| A `spec/backend/` frissítése elmarad → a norma továbbra is tiltja a feature-t. | Külön munkacsomag (**S**) + `FA-21`. |
