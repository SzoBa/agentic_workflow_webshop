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
> kifejezetten felülír, és amelyek átírása a 4.8 szakasz S-táblázatában van tételesen.

---

## 1. HTTP-szerződés

Két **új** végpont, a `/api/auth` névtérben: a `vegpontok.md` szerinti **23.** és **24.** pont.

### 1.1 `PUT /api/auth/me` — a saját fiókadatok mentése

Jogosultság: **belépett**. A védelmet a `MEGLÉVŐ` `AuthInterceptor` adja, de **csak akkor, ha az
útvonal szerepel a `WebConfig.PROTECTED_PATTERNS` tételes listáján** — az `/api/auth` névtér mint
olyan **nincs** védve (a regisztráció és a bejelentkezés nyilvános). Mindkét új útvonalat fel
kell venni, és a fájl tényleges tartalmával ellenőrizni.

**Kérés**

```json
{ "username": "…", "email": "…", "address": "…", "currentPassword": "…" }
```

- A mezőket a `MEGLÉVŐ` `UserValidator.validateProfile` ellenőrzi — **nincs új validátorkód**.
- A `currentPassword` **kötelező** mező, a profilmentésen is (4.3).
- A `role` mezőről lásd 4.4.

**Válasz — 200**

```json
{ "id": "…", "username": "…", "email": "…", "address": "…", "role": "customer" }
```

Ez a `MEGLÉVŐ` **Publikus felhasználó** alak (`auth/PublicUserResponse.java`), ugyanaz, amit a
`GET /api/auth/me` ad. **`token` mező NINCS**: a fiókadat nem hitelesítő adat, ezért a
munkamenet érintetlen marad (4.5).

**Ellenőrzések** — a sorrend **kötött**, fentről lefelé (4.3):

| Ellenőrzés | Válasz |
|---|---|
| rate limit (4.2) | **429** `Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.` |
| `currentPassword` helyes-e | **400** `A jelenlegi jelszó hibás.` (4.3) |
| `validateProfile(username, email, address)` | **400**, a hibakatalógus meglévő szövegeivel |
| `requireAvailable(username, email, excludeUserId)` | **400** `Ez a felhasználónév már foglalt.` / `Ezzel az email címmel már regisztráltak.` |

A sorrend **kötött**, a 4.3 szerint. A `PUT` **teljes csere**, nem részleges: mind a négy mező
kötelező, hiányzó mező üresnek számít és a validátoron bukik el.

### 1.2 `POST /api/auth/password` — jelszócsere

Jogosultság: **belépett**.

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

**Ellenőrzések** — a sorrend **kötött**, fentről lefelé (4.3):

| Ellenőrzés | Válasz |
|---|---|
| rate limit (4.2) | **429** `Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.` |
| `currentPassword` helyes-e | **400** `A jelenlegi jelszó hibás.` (4.3) |
| `newPassword` == `newPasswordConfirm` | **400** `A két jelszó nem egyezik.` |
| `validatePassword(newPassword)` | **400** `A jelszó legalább 8 karakter legyen.` |
| `newPassword` != `currentPassword` | **400** `Az új jelszó nem egyezhet meg a jelenlegivel.` |
| hash-írás + tokenrotáció | **200** |

A sorrend **kötött**, ahogy a táblázat mutatja.

### 1.3 Új hibaüzenetek

Három sor a `hu.webshop.common.Messages`-be:

| Konstans | Szöveg |
|---|---|
| `CURRENT_PASSWORD_INVALID` | `A jelenlegi jelszó hibás.` |
| `PASSWORD_CONFIRM_MISMATCH` | `A két jelszó nem egyezik.` |
| `PASSWORD_SAME_AS_OLD` | `Az új jelszó nem egyezhet meg a jelenlegivel.` |

Mind a három **szó szerinti**: a teszteknek erre a szövegre kell asszertálniuk (nem csak a
`Messages.*` konstansra, különben egy szövegmódosítás egyetlen tesztet sem törne el), és az
`S` csomagnak betűre ezt kell átvennie a `hibakatalogus.md`-be.

A `PASSWORD_TOO_SHORT` és a `LOGIN_RATE_LIMITED` **meglévő** konstans, változatlan szöveggel
használjuk újra.

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
- A `handle(r)` opciói: **`signalUnauthorized` marad az alapértelmezetten** (azaz `true`).
  Tilos kikapcsolni — a 4.3 szerint ezeken a végpontokon a `401` **tényleg** lejárt munkamenetet
  jelent, és a felhasználót ki *kell* léptetnie. A rossz jelszó `400`, azt az űrlap mutatja.

---

## 3. Fájltulajdon — ki mihez nyúlhat

| Munkacsomag | Kizárólagos tulajdon |
|---|---|
| **B — backend + típustükör** | `server-java/src/main/java/hu/webshop/auth/**` · `common/Messages.java` · `config/WebConfig.java` · `server-java/src/test/java/hu/webshop/auth/**` · **`client/src/api.ts`** · `client/test/api.test.ts` |
| **F — kliens** | `client/src/pages/Profile.tsx` (új) · `client/src/RequireAuth.tsx` (új) · `client/src/auth.tsx` · **`client/test/auth.test.tsx`** · `client/src/App.tsx` · `client/test/Profile.test.tsx`, `client/test/RequireAuth.test.tsx` (új) · `client/src/styles/pages.css` |
| **E — e2e** | `e2e/features/fiokadatok.feature` (új) · `e2e/steps/fiokadatok_lepesek.mjs` (új) |
| **S — spec és konformancia** | `spec/backend/**` · `CLAUDE.md` (végpontszám) · `spec/backend/conformance/cases/` (új esetfájl) + `run.mjs` bekötés |
| **V — validáló** | semmi — csak olvas, futtat és jelent |

Az `api.ts` szándékosan a **B** csomagé: ott születik a DTO alakja. Az `auth.tsx` viszont az
**F**-é — az a munkamenet-állapot, nem a hálózati réteg.

---

## 4. Megvalósítási döntések

Ezek **döntések**, nem javaslatok — az implementálónak nem kell újra végiggondolnia őket.

### 4.1 Flyway-migráció

**Nincs migráció.** A `users` táblában a fiókadat-mezők megvannak (`V1__init.sql:30-41`), a rate
limit pedig a meglévő `login_attempts` táblát használja (4.2, 4.10) — annak `attempt_key`
oszlopa hosszkorlát nélküli `text`, tehát az `account:{userId}` kulcs elfér benne.

### 4.2 A találgatás elleni korlát

A jelszó-ellenőrzést végző végpontokra rá kell tenni egy korlátot a `MEGLÉVŐ`
`LoginAttemptService`-szel. A válasz **429**
`Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.`

A számláló **kulcsa a fiók azonosítója**, saját előtaggal (`account:{userId}`) — **nem** a
kliens IP-je. Indoklás: ide csak **érvényes tokennel** lehet eljutni, tehát idegent nem lehet
vele kizárni, viszont az IP-alapú számlálás megkerülhető (a támadó ugyanazzal az ellopott
tokennel más címről folytatja). Ez tudatos eltérés a `LoginAttemptService` osztálydokumentációja
által elutasított „fiókhoz kötött zárolástól", és az indoklás a hozzáférési feltételben van.

Négy következmény, mind **kötelező** és mind mérendő:

1. a korlát **10** sikertelen jelszó-ellenőrzés / **15 perc** ablak (a bejelentkezésével azonos);
2. a zárolás a **helyes** jelszót is elutasítja — különben a támadó pont a találat pillanatában
   csúszna ki alóla;
3. az `account:` előtag **elválasztja** a bejelentkezés IP-kulcsaitól, mindkét irányban: egy
   fiókadat-siker `clear()`-je nem törölheti a bejelentkezési számlálót (különben bárki a saját
   helyes jelszavával nullázná a K-51 védelmet), és a fiók zárolása nem blokkolhatja a
   `POST /api/auth/login`-t;
4. a **sikeres** ellenőrzés nullázza a saját számlálót.

**A számláló nem futhat a kérés tranzakciójában.** Ha az `AccountService` `@Transactional`, a
`recordFailure` írása a `400`-as válasszal együtt **visszagördül**, és a korlát soha nem lép
életbe — a teszt zöld lehet, a védelem mégsem létezik. Lásd 4.6.

### 4.3 A `currentPassword` és a hibás jelszó válasza

A `currentPassword` **mindkét** végponton kötelező mező. A profilmentésen sem opcionális: enélkül
egy ellopott munkamenettel át lehetne írni az e-mail címet, és onnan a fiók átvétele már csak
jelszó-visszaállítás kérdése.

A hibás vagy hiányzó `currentPassword` válasza **`400`**, szó szerint `A jelenlegi jelszó hibás.`
— **nem `401`**. Ez nem ízléskérdés, hanem a kliens architektúrájából következik: a
`client/src/api.ts` **globális** `401`-kezelője minden `401`-nél eldobja a munkamenetet és
megjeleníti a `SessionExpiredNotice`-t. Ezekkel a végpontokkal a `401` azt jelenti, hogy a
**munkamenet** járt le, a `400` azt, hogy a beküldött mező rossz — a kettőt nem szabad
összemosni.

Két következmény, mindkettő kötelező:

- **Tilos** a `signalUnauthorized: false` ezen a két híváson. Az a `401`-et néma hibává tenné,
  és egy ténylegesen lejárt munkamenetre a felhasználó a „`A jelenlegi jelszó hibás.`" üzenetet
  látná — pontosan a rossz magyarázatot.
- Egy **elgépelt** jelenlegi jelszó `400`-at ad, a felhasználó belépve marad, az űrlapon látja a
  hibát, és javítás után újra tud menteni. Egy **lejárt** munkamenet `401`-et ad, és a
  felhasználó a szokásos módon kilép. A két eset szétválasztása mérendő.

**Az ellenőrzések sorrendje kötött** (a hibás jelszó **elfedi** a mezőhibákat — akit nem tudunk
hitelesíteni, az ne kapjon visszajelzést arról, mi van a fiókon):

1. találgatási korlát (4.2) → `429`
2. `currentPassword` → `400` `A jelenlegi jelszó hibás.`
3. a többi mező validációja / a jelszócsere további ágai

### 4.4 A `role` mező kezelése

A saját fiókon a szerepkört nem lehet állítani: a kérésben érkező `role` mezőt **némán**
figyelmen kívül hagyjuk, a regisztráció mintájára (`auth/AuthService.java:79-81`).

„Némán" = a `role` **nem hibás bemenet, hanem nem bemenet**: a `"role": "admin"`-t vivő kérés
`200`-at ad, a mentendő mezők frissülnek, a szerepkör nem. **Szándékos eltérés** a
`PUT /api/admin/users/{id}`-tól, ahol az érvénytelen `role` `400` — ott a mező értelmes bemenet,
itt egyáltalán nem az. Egy „konzisztenciát teremtő" refaktor, ami itt is `400`-at adna,
megsértené ezt a pontot.

### 4.5 A tokenrotáció szabálya

| Végpont | Rotál? | Miért |
|---|---|---|
| `PUT /api/auth/me` | **NEM** | a fiókadat nem hitelesítő adat; a mentés előtti tokennek utána is működnie kell |
| `POST /api/auth/password` | **IGEN** | a jelszó hitelesítő adat: a régi tokennek azonnal meg kell halnia (`I-6` — egy felhasználóhoz egy munkamenet) |

A rotáció a `MEGLÉVŐ` `auth/SessionIssuer.issue(userId)` hívása — **ne írj új tokenkiadó kódot**.
A hash-írás és a rotáció **egy** tranzakcióban van (4.6): nem fordulhat elő, hogy az egyik
megtörtént, a másik nem.

A rotációnak **két**, egymásnak látszólag ellentmondó következménye van, és mindkettő kötelező:
a **régi token azonnal halott** (bárhol is használják — más böngészőlapon `401`, és ott a
felhasználó jogosan lép ki), **és** a cserét kezdeményező felhasználó **nem repül ki** (a kliens
a válaszban kapott új tokenre vált, 4.11). Egy naiv megvalósítás az egyiket teljesíti: vagy nem
rotál, vagy rotál és nem tárolja az újat.

### 4.6 Szolgáltatásréteg

A logika **két** beanre oszlik, a `MEGLÉVŐ` `AuthService` + `SessionIssuer` mintájára:

- **`auth/AccountService`** — **nem** tranzakcionális: a rate limit kezelése, a `currentPassword`
  ellenőrzése, a döntési logika. Ez az a réteg, ahol a hibaág `400`/`429`-cel kilép, és a
  számlálónak **túl kell élnie** ezt a kilépést (4.2).
- **`auth/AccountWriter`** — `@Transactional`: a validáció, a mentés, a jelszóhash írása és a
  tokenrotáció **egy** egységben.

A kettő szétválasztása **nem stílus**: egyetlen tranzakcionális osztály a rate limitet
működésképtelenné tenné (4.2 utolsó bekezdése).

### 4.7 A validátor újrahasználata

- `validateProfile(username, email, address)` — **változatlanul** hívható.
- `requireAvailable(username, email, excludeUserId)` — a névütközés ellenőrzésére
  (`auth/UserValidator.java:80`). A **harmadik** paraméter kötelező: enélkül a felhasználó
  **saját, változatlan** nevének megtartása is „foglalt névnek" látszana, és a `400` egy olyan
  mentést buktatna meg, ami csak a címet írja át.
- A `duplicate(ex)` ág **kötelező**: az egyediséget végső soron az adatbázis `LOWER()`-es egyedi
  indexe dönti el (`V1__init.sql:42-43`), tehát az egyediség **kis/nagybetűtől független**, és
  egy egyidejű névváltás enélkül `500`-zal esne el, nem szerződéses `400`-zal.
- `validatePassword(newPassword)` — az új jelszó hosszára.

### 4.8 A `spec/backend/` frissítése

A `spec/backend/` három állítása **ellentmond** az új végpontoknak. Tételesen, mit kell átírni:

| Fájl | Mit | Mire |
|---|---|---|
| `vegpontok.md` | a végpontok száma (`22`) | `24`, plusz a két új végpont leírása |
| `hibakatalogus.md` | — | a három új üzenet felvétele (1.3), a `A jelenlegi jelszó hibás.` **`400`**-as sorként |
| `CLAUDE.md` | „22 endpoints" | `24 endpoints` |

Ha a `spec/backend/` bárhol azt állítja, hogy a jelszó nem módosítható, az a mondat is elavul.

### 4.9 Konformancia

Az S csomag új konformancia-eseteket vesz fel a `konformancia.md` végére, a **meglévő esetek
átszámozása nélkül** (`K-…` azonosító csak a lista végére kerülhet — az átszámozás minden
korábbi hivatkozást elront), és beköti őket a `conformance/run.mjs` futtatójába.

### 4.10 Fájlok, amikhez **egyik** csomag sem nyúl

`server-java/src/main/resources/db/migration/**` — **ne írj migrációs fájlt**. A `users` tábla
mezői megvannak (4.1), a `login_attempts.attempt_key` pedig hosszkorlát nélküli `text`
(`V1__init.sql:97-101`), tehát a `account:{userId}` kulcs elfér benne. Az „új viselkedés = új
migráció" reflex itt hibás, és egy fölösleges `V4__…sql` a `ddl-auto: validate` mellett
kockázat.

Szintén tiltott: `package.json`, `pom.xml`, `docker-compose.yml`, `.github/workflows/**` —
új függőség vagy CI-változtatás ehhez a feature-höz nem kell.

### 4.11 Kliens — a munkamenet frissítése a mentés után

Az `AuthProvider` a felhasználót és a tokent a `webshop-auth` localStorage-kulcsban tartja
(`client/src/auth.tsx:41,88-90`). **Két** kötelezettség, külön-külön mérendő:

1. **profilmentés után** — a context `state.user`-ét le kell cserélni a válaszra, hogy a fejléc
   és az oldal a friss nevet mutassa. A `token` mezőhöz **nem** szabad hozzányúlni.
2. **jelszócsere után** — a válasz `token` mezőjét be kell írni: `setAuthToken(token)` **és**
   `setState({ user, token })`. Enélkül a következő kérés `401`, és a felhasználó kirepül.

Ezt a két állítást **valódi `AuthProvider`-t renderelő** teszt bizonyítsa (`FA-07` b) — mockolt
context nem bizonyíték.

### 4.12 Kliens — útvonal, őr és a fejléc-belépő

- Új komponens: **`RequireAuth`**, a `RequireAdmin` mintájára
  (`client/src/RequireAdmin.tsx` — context-olvasás, saját hálózati hívás nélkül). Hiányzó
  felhasználónál `<Navigate to="/login" replace />`. Ma nincs ilyen őr a repóban.
- Új útvonal: **`/profile`**, a `RequireAuth` alatt.
- A fejlécben a **belépett felhasználó neve lesz a link** a `/profile`-ra (a topbar mai
  `Belépve: <strong>{user.username}</strong>` blokkja). Ez a `MEGLÉVŐ` elv szerint kényelmi
  funkció; az érdemi védelem szerveroldali.
- A képernyő két űrlapot tartalmaz: fiókadatok és jelszócsere. A hibákat felhasználóbarát módon
  kell megjeleníteni.

---

## 5. A kész-kritériumok mérhető olvasata

### 5.1 Kiegészítő kész-kritériumok

A követelmény DoD-ja mellé néhány további pont, amit a validálónak érdemes megnéznie:

- **`FA-15`** — `PUT /api/auth/me` **200**-at ad, és a válasz a publikus felhasználó-alakot
  tartalmazza.
- **`FA-16`** — `POST /api/auth/password` **200**-at ad `user` és `token` mezővel, és a
  felhasználó a csere után is használni tudja az alkalmazást.
- **`FA-17`** — A találgatás elleni korlát működik.
- **`FA-18`** — A `/profile` oldal **futó stack ellen** is működik: az `E` csomag
  forgatókönyvei nem csak le vannak írva, hanem **lefutottak zölden**, és a tényleges kimenet a
  jelentésben van.
  *Bizonyíték:* `npm run e2e` kimenete az `e2e/` mappából.
- **`FA-19`** — A profilmentés **nem** rotál tokent: a válaszban nincs `token` mező, és a mentés
  **előtti** tokennel a `GET /api/auth/me` utána is `200`.
  *Bizonyíték:* integrációs teszt, valódi HTTP.
- **`FA-20`** — A `PUT /api/auth/me` válasza **pontosan** öt kulcsot tartalmaz
  (`id`, `username`, `email`, `address`, `role`) — se `token`, se jelszómező, se hash.
  *Bizonyíték:* a válasz kulcshalmazának mérete és tartalma asszertálva.
- **`FA-21`** — A név- vagy címváltás **nem** írja át a korábbi rendeléseket: a
  `GET /api/orders` `customer` blokkja a leadáskori értékeket mutatja, és **eltér** a
  `GET /api/auth/me` jelenlegi értékeitől (ADR-0001).
  *Bizonyíték:* integrációs teszt, ami a két értékkészlet **eltérését** méri.
- **`FA-22`** — A hibás `currentPassword` **`400`**-at ad (nem `401`), a felhasználó belépve
  marad, és a mezőhibák **nem** jelennek meg mellette (a jelszó elfedi őket, 4.3).
  *Bizonyíték:* integrációs teszt egyidejűleg rossz jelszóval **és** rossz e-mail címmel; a
  válasz törzse pontosan `A jelenlegi jelszó hibás.`
- **`FA-23`** — A `role` némán lepattan: `"role": "admin"`-nal a válasz `200` és `customer`, és
  ugyanazzal a tokennel egy `/api/admin/**` hívás `403`.
  *Bizonyíték:* integrációs teszt mindhárom asszertálással.
- **`FA-24`** — Regresszió a bővített **közös** osztályokon (`UserValidator`, `SessionIssuer`,
  `LoginAttemptService`): a regisztráció, a bejelentkezés és a `PUT /api/admin/users/{id}`
  meglévő tesztjei változatlanul zöldek.
  *Bizonyíték:* `mvn test` teljes futás, szűrés nélkül.
- **`FA-25`** — `npm run lint` zöld (a CI `lint` jobja blokkoló).
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
| 4 | `e2e-test-writer` (**E**) | az 1. szakasz + az `FA-18` + a `Profile.tsx` kiválasztói | feature-fájl + lépésdefiníciók, futtatva |
| 5 | `spec-implementer` (**S**) | a 4.8 és a 4.9 szakasz | `spec/backend/` + konformancia-esetek |
| 6 | `spec-validator` (**V**) | a spec-mappa + a jelentések **mutatóként** | `FA-01…FA-25` tételes ítélet |

A **B** és az **F** azért nem párhuzamos, mert az F a B által megírt `api.ts`-re épül. Az **E**
és az **S** egymástól függetlenek, de mindkettő az F után van: az E a kész képernyőt méri, az S
pedig a `Messages` végleges szövegeit veszi át.

Az `e2e-test-writer` a projekt e2e vázának konvencióit a saját `skills:` mezőjén keresztül kapja
(`e2e-vaz-konvenciok`) — **ez a terv nem ismétli meg őket**.
