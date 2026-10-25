# Feladatlista — saját fiókadatok szerkesztése és jelszócsere

Munkaegységek végrehajtási sorrendben. Ahol van *Kész, ha* sor, az egy kész-kritériumra
([`requirements.md`](./requirements.md) DoD, illetve a [`plan.md`](./plan.md) 5. szakasza) vagy
egy megnevezett tesztre hivatkozik.

A **`*Gazda:*`** sor mondja meg, melyik munkacsomag hajtja végre. A csomagok fájltulajdona a
[`plan.md`](./plan.md) 3. szakaszában van — **ami nem a tiéd, ahhoz nem nyúlsz**.

- **B** — backend-implementáló (Java + `client/src/api.ts`)
- **F** — kliens-implementáló (React)
- **E** — e2e-teszt-író
- **S** — spec- és konformancia-karbantartó
- **V** — validáló

A checkboxokat **senki nem pipálja ki**: a `spec/` mappa a norma, nem munkaterület. Az elkészült
pontokról a jelentésben kell beszámolni.

---

# B csomag — backend és típustükör

## B-M1 · Üzenetek

- [ ] **B1.1** Három új konstans a `Messages`-be a [`plan.md`](./plan.md) 1.3 táblázata szerint:
      `CURRENT_PASSWORD_INVALID`, `PASSWORD_CONFIRM_MISMATCH`, `PASSWORD_SAME_AS_OLD`. A
      `PASSWORD_TOO_SHORT` és a `LOGIN_RATE_LIMITED` **változatlan**, újra felhasználva.
      *Kész, ha:* a három konstans megvan, és a `Messages` szakaszolása (kommentblokkok) követi a
      fájl meglévő rendjét.
      *Érintett:* `server-java/src/main/java/hu/webshop/common/Messages.java`.
      *Gazda:* B

## B-M2 · Szolgáltatásréteg

- [ ] **B2.1** `AccountService`: a rate limit kezelése, a `currentPassword` ellenőrzése, a
      validáció, a profilmentés és a jelszóhash írása; a tokenrotációhoz a **meglévő**
      `SessionIssuer.issue(userId)`-t hívja. Új tokenkiadó kódot **nem** ír.
      *Kész, ha:* a profilmentés `PublicUserResponse`-t ad vissza, a jelszócsere a meglévő
      `AuthResponse`-t (`user` + nyers `token`).
      *Érintett:* `server-java/src/main/java/hu/webshop/auth/AccountService.java` (új),
      `auth/SessionIssuer.java`, `auth/LoginAttemptService.java` (csak felhasználás).
      *Gazda:* B

- [ ] **B2.2** A profilmentés logikája: a `currentPassword` ellenőrzése, `validateProfile`,
      névütközés-vizsgálat, mentés. A `role` mezőt figyelmen kívül hagyjuk (`plan.md` 4.4).
      *Kész, ha:* **FA-01**, **FA-03**, **FA-04**.
      *Érintett:* `auth/AccountService.java`, `auth/UserValidator.java` (csak felhasználás).
      *Gazda:* B

- [ ] **B2.3** A jelszócsere logikája: `currentPassword` → megerősítés → `validatePassword` →
      „nem lehet azonos a régivel" → hash-írás + tokenrotáció.
      *Kész, ha:* **FA-05**, **FA-06**, **FA-07**.
      *Érintett:* `auth/AccountService.java`.
      *Gazda:* B

- [ ] **B2.4** A két végpont bekötése az `AuthController`-be: `PUT /api/auth/me` és
      `POST /api/auth/password`, a belépett felhasználó a **meglévő** `@CurrentUser` feloldóval.
      *Érintett:* `auth/AuthController.java`.
      *Gazda:* B

## B-M3 · Backend teszt

- [ ] **B3.1** Integrációs tesztek a két új végpontra a `hu.webshop.support.IntegrationTest`
      bázison: valódi HTTP, valódi Postgres. Mintája: `auth/AuthApiTest.java`.
      **Kötelező esetlista** — ennél kevesebb nem elég:
      sikeres mentés + visszaolvasás · a válasz **pontosan** öt kulcsa (`FA-20`) · a mentés
      **nem** rotál tokent (`FA-19`) · `role: admin` némán lepattan **és** az admin névtér `403`
      (`FA-23`) · rossz jelszó **+** rossz e-mail egyszerre → `400`
      `A jelenlegi jelszó hibás.`, mezőhiba nélkül (`FA-22`) · hiányzó `currentPassword` ·
      a **saját**, változatlan név megtartása nem ütközés · más nevének/e-mailjének elvétele
      `400` · más e-mailje **más kis/nagybetűzéssel** is `400` · a négy profilvalidációs ág ·
      sikeres jelszócsere + tokenrotáció (a **régi** token `401`, az **új** `200`) ·
      belépés az új jelszóval `200`, a régivel `401` · megerősítés-eltérés · rövid jelszó ·
      azonosság a régivel · a válasz nem szivárogtat jelszót/hasht.
      **A hibaüzenetekre szó szerinti szövegre asszertálj**, ne csak a `Messages.*` konstansra —
      különben egy szövegmódosítás egyetlen tesztet sem törne el.
      *Kész, ha:* **FA-12**, **FA-19**, **FA-20**, **FA-22**, **FA-23** — a `mvn test` zöld.
      *Érintett:* `server-java/src/test/java/hu/webshop/auth/` (új tesztosztályok).
      *Gazda:* B

- [ ] **B3.2** Jogosultsági eset: a végpontok token nélkül **és** ismeretlen tokennel sem
      érhetők el (`401` `Bejelentkezés szükséges.`), és a hitelesítetlen kérés nem is írt.
      A `WebConfig.PROTECTED_PATTERNS` **tényleges** tartalmát is ellenőrizd — a `requirements.md`
      „Brute force" szakasza szerint a lista tételes, nem névtér.
      *Kész, ha:* **FA-08**.
      *Gazda:* B

- [ ] **B3.3** A találgatási korlát tesztjei a `plan.md` 4.2 négy következményére: 11. próbálkozás
      `429` · a zárolás a **helyes** jelszót is elutasítja · a fiók zárolása **nem** blokkolja a
      `POST /api/auth/login`-t ugyanarról az IP-ről · **és a fordított irány**: egy sikeres
      fiókadat-művelet `clear()`-je **nem** törli a bejelentkezési számlálót · a sikeres
      ellenőrzés nullázza a saját számlálót.
      *Kész, ha:* **FA-09**, **FA-17**.
      *Gazda:* B

- [ ] **B3.4** Snapshot-regresszió: egy korábban leadott rendelés `customer` blokkja a
      név/e-mail/cím átírása után is a **leadáskori** értékeket mutatja, és eltér a
      `GET /api/auth/me` jelenlegi értékeitől.
      *Kész, ha:* **FA-21**.
      *Gazda:* B

- [ ] **B3.5** Regresszió a bővített közös osztályokon: a `UserValidator`, a `SessionIssuer` és a
      `LoginAttemptService` meglévő hívóinak (regisztráció, bejelentkezés,
      `PUT /api/admin/users/{id}`) tesztjei **szűrés nélküli** `mvn test`-ben is zöldek.
      *Kész, ha:* **FA-13**, **FA-24**.
      *Gazda:* B

## B-M4 · Típustükör

- [ ] **B4.1** `client/src/api.ts` bővítése a [`plan.md`](./plan.md) 2. szakasza szerint:
      `ProfileInput`, `PasswordChangeInput`, `updateProfile`, `changePassword`. A meglévő `User`
      és `AuthResult` exportokra épül.
      *Kész, ha:* `npm run build` zöld.
      *Érintett:* `client/src/api.ts`, `client/test/api.test.ts`.
      *Gazda:* B

- [ ] **B4.2** Ellenőrzés: `cd server-java && mvn test`, majd a gyökérből `npm run build`,
      `npm test`, **`npm run lint`** és `npx tsc --noEmit -p client/tsconfig.json`.
      A lint **nem elhagyható** — a CI-ban blokkoló job.
      *Kész, ha:* **FA-13**, **FA-14**, **FA-25** — mind zöld.
      *Gazda:* B

---

# F csomag — kliens

> Az F csomag a **kész** `client/src/api.ts`-re épül. Ha egy szükséges típus vagy függvény
> hiányzik onnan, azt **jelenteni** kell — az `api.ts` nem az F csomag tulajdona.

## F-M1 · Munkamenet és őr

- [ ] **F1.1** Az `auth.tsx` context bővítése a profilmentéshez és a jelszócseréhez szükséges
      metódusokkal, a `login`/`register` mintájára, a `plan.md` 4.11 **két** kötelezettségével.
      *Kész, ha:* **FA-07** (b) — a `client/test/auth.test.tsx`-ben **valódi `AuthProvider`-t
      renderelő** teszt méri, hogy (a) a jelszócsere után az új token kerül a `setAuthToken`-be
      és a `webshop-auth` kulcsba, (b) a profilmentés **nem** nyúl a tokenhez, (c) egyik esetben
      sem gyullad be a munkamenet-lejárat. Mockolt context nem bizonyíték.
      *Érintett:* `client/src/auth.tsx`, `client/test/auth.test.tsx`.
      *Gazda:* F

- [ ] **F1.2** `RequireAuth` komponens a `RequireAdmin` mintájára
      (`client/src/RequireAdmin.tsx`): context-olvasás, saját hálózati hívás nélkül; hiányzó
      felhasználónál `<Navigate to="/login" replace />`.
      *Kész, ha:* **FA-10** — kijelentkezve a `/profile` a bejelentkezésre irányít.
      *Érintett:* `client/src/RequireAuth.tsx` (új), `client/test/RequireAuth.test.tsx` (új).
      *Gazda:* F

## F-M2 · Képernyő

- [ ] **F2.1** `client/src/pages/Profile.tsx`: **két külön űrlap** — fiókadatok (`username`,
      `email`, `address`, `currentPassword`) és jelszócsere (`currentPassword`, `newPassword`,
      `newPasswordConfirm`). A fiókadat-űrlap a jelenlegi értékekkel **előtöltve** érkezik.
      Betöltési, siker- és hibaállapot kezelése űrlaponként külön.
      Mintája: `client/src/pages/Login.tsx` és `Register.tsx` (űrlap, hibamegjelenítés).
      *Kész, ha:* **FA-11** — az oldal jól néz ki, és a hibák megjelennek rajta.
      *Érintett:* `client/src/pages/Profile.tsx` (új), `client/src/styles/pages.css`.
      *Gazda:* F

- [ ] **F2.2** Útvonal és fejléc-belépő: `/profile` a `RequireAuth` alatt, és a topbar
      `Belépve: <strong>{user.username}</strong>` blokkja **linkké** válik a `/profile`-ra.
      *Kész, ha:* **FA-10** — az útvonal létezik az őr alatt, és a fejlécből egy kattintással
      elérhető.
      *Érintett:* `client/src/App.tsx`.
      *Gazda:* F

## F-M3 · Kliens teszt

- [ ] **F3.1** `client/test/Profile.test.tsx` az `AdminUsers.test.tsx` / `Login.test.tsx`
      mintájára: mockolt `api` modul, `@testing-library/react` + `user-event`.
      **Kötelező esetlista:** az előtöltött űrlap · a sikeres profilmentés · a sikeres
      jelszócsere · a `role` **nem** megy ki a kérésben · a **400**-as rossz jelszó az űrlapon
      jelenik meg, kiléptetés nélkül · a névütközés, a megerősítés-eltérés, a „azonos a régivel",
      a rövid jelszó és a `429` szó szerinti üzenete · a két űrlap hibaállapota **független**.
      *Kész, ha:* **FA-11**, **FA-12** kliens-fele — az `npm test` zöld.
      *Érintett:* `client/test/Profile.test.tsx` (új).
      *Gazda:* F

- [ ] **F3.2** Ellenőrzés: `npm run build`, `npm test`, **`npm run lint`** és
      `npx tsc --noEmit -p client/tsconfig.json` a repó gyökeréből.
      *Kész, ha:* **FA-14**, **FA-25**.
      *Gazda:* F

---

# E csomag — end-to-end

> Az E csomag **kizárólag** az `e2e/` mappát írja, terméki kódot soha. A váz konvencióit az
> `e2e-vaz-konvenciok` skill adja — ez a feladatlista nem ismétli meg őket.

- [ ] **E1.1** `e2e/features/fiokadatok.feature` — magyar Gherkin, `# language: hu` fejléccel,
      **három** forgatókönyv:
      1. a felhasználó a fejlécben a nevére kattint, átírja a szállítási címét, és a mentett
         adatokat látja viszont — **belépve marad**;
      2. jelszócsere után kijelentkezik, és az **új** jelszóval újra be tud lépni;
      3. **elgépelt jelenlegi jelszó**: a hibaüzenet az űrlapon jelenik meg, a felhasználó
         **nem** kerül a `/login`-ra, és javítás után a mentés átmegy.
      A várt hibaüzenetek **szó szerint** a `plan.md` 1.3 táblázatából valók.
      *Kész, ha:* a három forgatókönyv le van írva. **Ez önmagában nem `FA-18`** — azt csak a
      lefuttatás adja (`E1.2`).
      *Érintett:* `e2e/features/fiokadatok.feature` (új).
      *Gazda:* E

- [ ] **E1.2** Lépésdefiníciók a meglévő váz API-jára (`e2e/steps/`, `e2e/support/`), a
      `admin_rendelesek_lepesek.mjs` mintájára. Új támogató fájl csak akkor, ha a meglévő váz nem
      elég — ezt **jelenteni** kell.
      *Kész, ha:* **FA-18** — `npm run e2e` az `e2e/` mappából, **futó stack ellen** zölden
      lefut, és a tényleges kimenet a jelentésbe kerül.
      *Érintett:* `e2e/steps/fiokadatok_lepesek.mjs` (új).
      *Gazda:* E

---

# S csomag — spec és konformancia

- [ ] **S1.1** `spec/backend/hibakatalogus.md`: a három új hibaüzenet felvétele **szó szerint**
      a [`plan.md`](./plan.md) 1.3 táblázatából, a `A jelenlegi jelszó hibás.` **`400`**-as
      sorként.
      *Érintett:* `spec/backend/hibakatalogus.md`.
      *Gazda:* S

- [ ] **S1.2** `spec/backend/vegpontok.md`: a két új végpont leírása, és a végpontszám
      `22` → `24` a [`plan.md`](./plan.md) 4.8 táblázata szerint — a `CLAUDE.md`-ben is.
      *Érintett:* `spec/backend/vegpontok.md`, `CLAUDE.md`.
      *Gazda:* S

- [ ] **S1.3** Konformancia-esetek a `konformancia.md` **végére**, a meglévők **átszámozása
      nélkül**: a sikeres profilmentés, a `400`-as rossz jelszó, a `role` néma lepattanása, a
      jelszócsere + tokenrotáció, és a `429`.
      *Érintett:* `spec/backend/konformancia.md`.
      *Gazda:* S

- [ ] **S1.4** Az új esetek bekötése a futtatóba, és a `run.mjs` lefuttatása futó backend ellen.
      *Kész, ha:* a tényleges kimenet a jelentésben van.
      *Érintett:* `spec/backend/conformance/cases/` (új fájl), `spec/backend/conformance/run.mjs`.
      *Gazda:* S

---

# V csomag — átvétel

- [ ] **V1.1** A kész-kritériumok végigmérése: `FA-01` … `FA-25`, pontonként
      `[teljesül]` / `[nem teljesül]` / `[kétséges]`.
      *Kész, ha:* minden pont ítéletet kapott.
      *Gazda:* V

- [ ] **V1.2** Dinamikus ellenőrzés: `cd server-java && mvn test` (Docker kell hozzá), valamint
      `npm run build`, `npm test`, **`npm run lint`** és
      `npx tsc --noEmit -p client/tsconfig.json` a repó gyökeréből.
      *Kész, ha:* **FA-13**, **FA-14**, **FA-25** — vagy ha piros, a valódi hibakimenettel
      indokolva.
      *Gazda:* V

- [ ] **V1.3** Futó stack elleni mérés: a `/profile` oldal böngészőből (`E` csomag `npm run e2e`)
      és a konformancia-futtató (`S` csomag).
      *Kész, ha:* **FA-18** — vagy a hiány tételes rögzítése.
      *Gazda:* V

- [ ] **V1.4** A hibaüzenetek **szó szerintiségének** átolvasása: a `Messages.java`, a backend
      tesztek, a kliens tesztek, a Gherkin idézetek és a `spec/backend/hibakatalogus.md`
      **ugyanazt** a szöveget mondják-e.
      *Kész, ha:* minden előfordulás egyezik, vagy az eltérés tételesen jelentve van.
      *Gazda:* V

---

## Függőségi sorrend

A csomagok nagyjából a fenti sorrendben haladnak: **B** → **F** → **E** / **S** → **V**. A
csomagokon belüli munkaegységek sorrendjét az implementáló alakítja ki.
