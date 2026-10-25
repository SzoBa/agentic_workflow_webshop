# Feladatlista — saját fiókadatok szerkesztése és jelszócsere

Munkaegységek végrehajtási sorrendben. Minden egység **önállóan verifikálható**: a *Kész, ha* sor
egy konkrét kész-kritériumra ([`requirements.md`](./requirements.md) DoD, illetve a
[`plan.md`](./plan.md) 5. szakaszának `FA-15…FA-25` pontjai) vagy egy megnevezett tesztre
hivatkozik.

A **`*Gazda:*`** sor mondja meg, melyik munkacsomag hajtja végre. A csomagok fájltulajdona a
[`plan.md`](./plan.md) 3. szakaszában van — **ami nem a tiéd, ahhoz nem nyúlsz**.

- **B** — backend-implementáló (Java + `client/src/api.ts`)
- **F** — kliens-implementáló (React)
- **E** — e2e-teszt-író
- **S** — spec- és konformancia-karbantartó
- **V** — validáló

A checkboxokat **senki nem pipálja ki**: a `spec/` mappa a norma, nem munkaterület. Az elkészült
pontokról a jelentésben kell beszámolni.

> **Indítás előtti teendő (emberi szerkesztés).** A `plan.md` 5.2 szakaszának `FA-15…FA-25`
> pontjait át kell emelni a `requirements.md` DoD-jába, és a meglévő `FA-01…FA-14` pontokhoz
> `*Bizonyíték:*` sort írni. Amíg ez nem történik meg, a
> `node .claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs edit-user-data` pirosat ad.
> Ez **nem** implementálói feladat.

---

# B csomag — backend és típustükör

## B-M1 · Üzenetek és őrizet

- [ ] **B1.1** Három új konstans a `Messages`-be, **szó szerint** a
      [`plan.md`](./plan.md) 1.3 táblázata szerint: `CURRENT_PASSWORD_INVALID`,
      `PASSWORD_CONFIRM_MISMATCH`, `PASSWORD_SAME_AS_OLD`. A `PASSWORD_TOO_SHORT` és a
      `LOGIN_RATE_LIMITED` **változatlan**, újra felhasználva.
      *Kész, ha:* a három szöveg karakterre egyezik a tervvel, és a `Messages` szakaszolása
      (kommentblokkok) követi a fájl meglévő rendjét.
      *Érintett:* `server-java/src/main/java/hu/webshop/common/Messages.java`.
      *Gazda:* B

- [ ] **B1.2** Az `/api/auth/password` minta felvétele a `PROTECTED_PATTERNS`-be. Az
      `/api/auth/me` mintát **nem** kell bővíteni (metódus-független, a `PUT`-ot is fedi).
      *Kész, ha:* **FA-08** — a lista bővült, és a B3.3 ténylegesen lefuttatott kéréssel igazolja
      a 401-et. Nem elég a lista létére hivatkozni.
      *Érintett:* `server-java/src/main/java/hu/webshop/config/WebConfig.java`.
      *Gazda:* B

## B-M2 · Szolgáltatásréteg

- [ ] **B2.1** `AccountWriter` (`@Transactional`): a profilmentés és a jelszóhash írása; a
      tokenrotációhoz a **meglévő** `SessionIssuer.issue(userId)`-t hívja. Új tokenkiadó kódot
      **nem** ír.
      *Kész, ha:* a profilmentés `PublicUserResponse`-t ad vissza, a jelszócsere a meglévő
      `AuthResponse`-t (`user` + nyers `token`), és egyik ág sem definiál új válaszrekordot.
      *Érintett:* `server-java/src/main/java/hu/webshop/auth/AccountWriter.java` (új),
      `auth/SessionIssuer.java` (csak felhasználás).
      *Gazda:* B

- [ ] **B2.2** `AccountService` — **nem** tranzakcionális, a
      [`plan.md`](./plan.md) 4.6 szerint. Rate limit-ellenőrzés, a `currentPassword`
      ellenőrzése, a validáció sorrendje, hibánál `attempts.recordFailure(...)`, sikernél
      `attempts.clear(...)`, majd az írás átadása a `AccountWriter`-nek.
      A számláló kulcsa **`"jelszocsere:" + userId`**, a korlát és az ablak a
      `LoginAttemptService.MAX_ATTEMPTS` / `WINDOW` konstansokból. A `LoginAttemptService`
      annotációit **tilos** módosítani.
      *Kész, ha:* **FA-09**, **FA-17**, **FA-18** — a zárolás a **helyes** jelszót is elutasítja,
      a login IP-vödre érintetlen, és a siker nullázza a saját számlálót.
      *Érintett:* `auth/AccountService.java` (új), `auth/LoginAttemptService.java` (csak
      felhasználás).
      *Gazda:* B

- [ ] **B2.3** A profilmentés logikája a [`plan.md`](./plan.md) 1.1 **sorrendjében**:
      rate limit → `currentPassword` → `validateProfile` → `role` → `requireAvailable(…, sajátId)`
      → `flush` + `catch (DataIntegrityViolationException) → validator.duplicate(ex)`.
      A `role` kiolvasása a `UserAdminService.readRole` szabályával történik, de a kiolvasott
      érték **eldobódik** (`plan.md` 4.4).
      *Kész, ha:* **FA-01**, **FA-03**, **FA-04**, **FA-19** — és a saját, változatlan név
      megtartása **200**-at ad.
      *Érintett:* `auth/AccountService.java`, `auth/UserValidator.java` (csak felhasználás).
      *Gazda:* B

- [ ] **B2.4** A jelszócsere logikája a [`plan.md`](./plan.md) 1.2 **sorrendjében**:
      rate limit → `currentPassword` → megerősítés → `validatePassword` → „nem lehet azonos a
      régivel" → hash-írás + tokenrotáció. A jelszót **nem** trimmeljük; az azonosság-vizsgálat a
      kérés két nyers mezőjét hasonlítja össze.
      *Kész, ha:* **FA-05**, **FA-06**, **FA-07** — az új jelszóval a bejelentkezés sikeres, a
      régivel 401, és a tokenrotáció mindkét ága teljesül.
      *Érintett:* `auth/AccountService.java`.
      *Gazda:* B

- [ ] **B2.5** A két végpont bekötése az `AuthController`-be: `PUT /api/auth/me` és
      `POST /api/auth/password`, a belépett felhasználó a **meglévő** `@CurrentUser` feloldóval.
      *Kész, ha:* a válasz alakja megfelel a [`plan.md`](./plan.md) 1.1 és 1.2 szakaszának — a
      profilmentés válaszában **nincs** `token`.
      *Érintett:* `auth/AuthController.java`.
      *Gazda:* B

## B-M3 · Backend teszt

- [ ] **B3.1** `ProfileApiTest` a `hu.webshop.support.IntegrationTest` bázison: valódi HTTP,
      valódi Postgres, **minden előfeltétel a publikus API-n** épül (regisztráció, bejelentkezés).
      Mintája: `auth/AuthApiTest.java` és `auth/AdminUsersApiTest.java`.
      Lefedi: sikeres mentés + visszaolvasás `GET /api/auth/me`-vel, mindhárom mező validációs
      hibáját, a más nevének/e-mailjének elvételét, a saját név megtartását, és mindkét `role`
      ágat.
      *Kész, ha:* **FA-01**, **FA-02**, **FA-03**, **FA-15**, **FA-19** mindegyikéhez tartozik
      asszertáló eset, és a `mvn test -Dtest=ProfileApiTest` zöld.
      *Érintett:* `server-java/src/test/java/hu/webshop/auth/ProfileApiTest.java` (új).
      *Gazda:* B

- [ ] **B3.2** `PasswordChangeApiTest`: sikeres csere, a régi/új jelszó bejelentkezése, a
      tokenrotáció **mindkét** ága (a csere előtti tokennel 401, a kapottal 200), és mind a három
      hibaüzenet **szó szerinti** asszertálása a validációs sorrendben.
      *Kész, ha:* **FA-05**, **FA-06**, **FA-07**, **FA-16** — és minden hibaüzenet karakterre
      egyezik a `Messages` konstansával.
      *Érintett:* `server-java/src/test/java/hu/webshop/auth/PasswordChangeApiTest.java` (új).
      *Gazda:* B

- [ ] **B3.3** Jogosultsági esetek: **mindkét** végpont token nélkül — ténylegesen lefuttatva,
      nem az interceptor létére hivatkozva. Külön eset a `PUT /api/auth/me`-re és a
      `POST /api/auth/password`-re.
      *Kész, ha:* **FA-08** — 401, `{ error }` törzzsel, mindkét végponton.
      *Érintett:* `ProfileApiTest`, `PasswordChangeApiTest`.
      *Gazda:* B

- [ ] **B3.4** `PasswordChangeRateLimitTest`: 10 hibás `currentPassword`, majd a 11. kérés a
      **helyes** jelszóval → 429; egy **másik** felhasználó cseréje és a `POST /api/auth/login`
      ugyanabban az ablakban → 200; valamint 9 hiba → siker → újabb 9 hiba **nem** ad 429-et.
      Mintája: `auth/AuthRateLimitTest.java`.
      *Kész, ha:* **FA-09**, **FA-17**, **FA-18** — mind a négy asszerció megvan.
      *Érintett:* `server-java/src/test/java/hu/webshop/auth/PasswordChangeRateLimitTest.java` (új).
      *Gazda:* B

- [ ] **B3.5** Regresszió: a meglévő auth-tesztek **változatlan** asszertálásokkal futnak.
      *Kész, ha:* **FA-24** — az `AuthApiTest`, `AdminUsersApiTest`, `UserValidatorTest`,
      `AuthRateLimitTest`, `AuthRateLimitPurgeTest`, `AuthRateLimitSpoofTest` zöld, és egyik
      asszertálása sem módosult. Ha egy teszt módosítása elkerülhetetlennek látszik, azt
      **jelenteni** kell, nem megtenni.
      *Gazda:* B

- [ ] **B3.6** Migráció-ellenőrzés: a `db/migration` könyvtár tartalma változatlan.
      *Kész, ha:* **FA-20** — a könyvtárban `V1`, `V2`, `V3` és semmi más.
      *Gazda:* B

## B-M4 · Típustükör

- [ ] **B4.1** `client/src/api.ts` bővítése a [`plan.md`](./plan.md) 2. szakaszában rögzített
      **pontos** alakkal: `ProfileInput`, `PasswordChangeInput`, `updateProfile`,
      `changePassword`. A meglévő `User` és `AuthResult` exportokra épül.
      **Egyik hívás sem kap `signalUnauthorized: false`-t** — a hibás jelszó 400-at ad, a 401 itt
      valóban lejárt munkamenetet jelent.
      *Kész, ha:* `npm run build` zöld (ES2020-korlát betartva), és a `client/test/api.test.ts`
      lefedi a két új hívás törzsének összeállítását.
      *Érintett:* `client/src/api.ts`, `client/test/api.test.ts`.
      *Gazda:* B

- [ ] **B4.2** Ellenőrzés: `cd server-java && mvn test`, majd `npm run build`, `npm test` és
      `npm run lint` a repó gyökeréből.
      *Kész, ha:* **FA-13**, **FA-14**, **FA-25** — mind zöld. Piros esetén a jelentésbe a
      **valódi** hibakimenet kerül.
      *Gazda:* B

---

# F csomag — kliens

> Az F csomag a **kész** `client/src/api.ts`-re épül. Ha egy szükséges típus vagy függvény
> hiányzik onnan, azt **jelenteni** kell — az `api.ts` nem az F csomag tulajdona.

## F-M1 · Munkamenet és őr

- [ ] **F1.1** Az `auth.tsx` context bővítése két metódussal, a `login`/`register` mintájára:
      `updateProfile` (a válasszal frissíti a `state.user`-t) és `changePassword` (frissíti a
      `state.user`-t **és** a `state.token`-t, valamint hívja a `setAuthToken`-t).
      A `Profile.tsx` **nem** hívja közvetlenül az `api`-t, és **nem** ír localStorage-ot.
      *Kész, ha:* **FA-01**, **FA-07** kliensoldali fele — a fejléc a mentés után azonnal az új
      nevet mutatja, és a csere után a tárolt token az **új**.
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
      *Kész, ha:* **FA-11** mérhető olvasata — a hibák a **szerver magyar üzenetével**,
      változtatás nélkül jelennek meg; a kliens nem fogalmaz újra és nem tompít.
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
      Lefedi: az előtöltött űrlapot, a sikeres profilmentést, a sikeres jelszócserét, valamint
      **külön** egy 400-as (hibás jelenlegi jelszó) ágat — ahol a felhasználó **belépve marad**,
      és a `SessionExpiredNotice` **nem** jelenik meg.
      *Kész, ha:* **FA-11**, **FA-12** kliens-fele — minden felsorolt ághoz tartozik asszertáló
      eset, és az `npm test` zöld.
      *Érintett:* `client/test/Profile.test.tsx` (új).
      *Gazda:* F

- [ ] **F3.2** Ellenőrzés: `npm run build`, `npm test` és `npm run lint` a repó gyökeréből.
      *Kész, ha:* **FA-14**, **FA-25** — mind zöld. Piros esetén a **valódi** hibakimenet kerül a
      jelentésbe.
      *Gazda:* F

---

# E csomag — end-to-end

> Az E csomag **kizárólag** az `e2e/` mappát írja, terméki kódot soha. A váz konvencióit az
> `e2e-vaz-konvenciok` skill adja — ez a feladatlista nem ismétli meg őket.

- [ ] **E1.1** `e2e/features/fiokadatok.feature` — magyar Gherkin, `# language: hu` fejléccel.
      Három forgatókönyv: (a) a felhasználó átírja a szállítási címét és a mentett adatokat látja
      viszont; (b) jelszócsere után **belépve marad**, majd az **új** jelszóval újra be tud lépni;
      (c) elgépelt jelenlegi jelszó → a szerver hibaüzenete megjelenik, és a felhasználó **nem**
      repül ki.
      A hibaszövegek **szó szerint** a `hibakatalogus.md`-ből.
      *Kész, ha:* **FA-23** — mindhárom forgatókönyv le van írva.
      *Érintett:* `e2e/features/fiokadatok.feature` (új).
      *Gazda:* E

- [ ] **E1.2** Lépésdefiníciók a meglévő váz API-jára (`e2e/steps/`, `e2e/support/`), a
      `admin_rendelesek_lepesek.mjs` mintájára. Új támogató fájl csak akkor, ha a meglévő váz nem
      elég — ezt **jelenteni** kell.
      *Kész, ha:* `npm run e2e` az `e2e/` mappából, **futó stack ellen** zölden lefut, és a
      tényleges kimenet a jelentésbe kerül.
      *Érintett:* `e2e/steps/fiokadatok_lepesek.mjs` (új).
      *Gazda:* E

---

# S csomag — spec és konformancia

- [ ] **S1.1** `spec/backend/hibakatalogus.md`: új szakasz a három üzenettel (400) és a
      429-cel; a `A jelszó legalább 8 karakter legyen.` sor kiváltó okában a „Csak
      regisztrációnál" megjegyzés **regisztrációnál és jelszócserénél**-re bővül.
      A szövegeknek **karakterre** egyezniük kell a `Messages` konstansaival.
      *Kész, ha:* **FA-21** — a katalógus és a `Messages` szövegei egyeznek.
      *Érintett:* `spec/backend/hibakatalogus.md`.
      *Gazda:* S

- [ ] **S1.2** `spec/backend/vegpontok.md`: új **23.** és **24.** pont teljes leírással
      (kérés, státuszkód-táblázat, válasz), sorok az áttekintő táblában, a fejléc
      „22 végpontja" → **24**, és a „Admin — felhasználók" szakasz 303. sorának mondata az
      **admin** útra szűkül. `spec/backend/requirements.md`: az 1. szakasz mondata és a 7.2
      kiegészítése a jelszócsere korlátjával. `CLAUDE.md`: „22 endpoints" → 24.
      *Kész, ha:* **FA-21** — mind a négy fájl frissült, és egyik sem állítja többé, hogy a
      jelszó nem módosítható.
      *Érintett:* `spec/backend/vegpontok.md`, `spec/backend/requirements.md`, `CLAUDE.md`.
      *Gazda:* S

- [ ] **S1.3** `spec/backend/konformancia.md`: a `K-79…K-86` esetek felvétele a
      [`plan.md`](./plan.md) 4.10 táblázata szerint, **új** területi blokként. A meglévő
      azonosítókat **tilos** átszámozni, és a fenntartott hézagokat (`K-16…K-19`, `K-37…K-39`,
      `K-59`) **nem** használjuk el. A lefedettségi térkép új sort kap, az összesítők
      **78 / 62 / 16**-ra frissülnek.
      *Kész, ha:* **FA-22** — a `git diff` a `konformancia.md`-n egyetlen meglévő azonosítót sem
      érint.
      *Érintett:* `spec/backend/konformancia.md`.
      *Gazda:* S

- [ ] **S1.4** A nyolc eset megvalósítása a konformancia-futtatóban: új esetfájl a
      `spec/backend/conformance/cases/` alatt, a `felhasznalok.mjs` mintájára (`harness.mjs`
      segédfüggvények, `nonce()`, `assertErrorShape`), és bekötés a `run.mjs`-be.
      *Kész, ha:* **FA-22** —
      `node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store`
      futó backend ellen zölden lefut, **62** HTTP-esettel, és a tényleges kimenet a jelentésben
      van.
      *Érintett:* `spec/backend/conformance/cases/` (új fájl), `spec/backend/conformance/run.mjs`.
      *Gazda:* S

---

# V csomag — átvétel

- [ ] **V1.1** A kész-kritériumok tételes végigmérése: `FA-01` … `FA-25`, pontonként
      `[teljesül]` / `[nem teljesül]` / `[kétséges]`, mindegyik mellé bizonyítékkal (`fájl:sor`,
      tesztnév vagy tényleges kimenet). A [`plan.md`](./plan.md) 5.1 táblázata mondja meg, mit
      jelent a hat élesített pont.
      *Kész, ha:* mind a 25 pont ítéletet kapott, és egyetlen `[teljesül]` sincs bizonyíték
      nélkül.
      *Gazda:* V

- [ ] **V1.2** Dinamikus ellenőrzés: `cd server-java && mvn test` (Docker kell hozzá), valamint
      `npm run build`, `npm test` és `npm run lint` a repó gyökeréből. A **tényleges** kimenet
      kerül a jelentésbe.
      *Kész, ha:* **FA-13**, **FA-14**, **FA-24**, **FA-25** — vagy ha piros, a valódi
      hibakimenettel indokolva.
      *Gazda:* V

- [ ] **V1.3** A teljes stack elleni mérés a `./start.sh` (Windowson `.\start.cmd`) által
      felhozott környezetben: a konformancia-futtató és az e2e feature-fájl **tényleges**
      lefuttatása.
      *Kész, ha:* **FA-22**, **FA-23** — mindkét futás kimenete a jelentésben van.
      *Gazda:* V

- [ ] **V1.4** Szövegegyezés-ellenőrzés: a `hibakatalogus.md` három új üzenete, a `Messages`
      konstansai, a Java tesztek várt szövegei és a Gherkin idézetei **karakterre** egyeznek.
      *Kész, ha:* **FA-02**, **FA-21** — egyetlen eltérés sincs.
      *Gazda:* V

---

## Függőségi sorrend

```
B1.1 ─┬─► B2.1 ──► B2.2 ──► B2.3 ─┬─► B2.5 ──► B3.1 ──► B3.2 ──► B3.3 ──► B3.4 ──► B3.5 ──► B3.6 ──► B4.1 ──► B4.2
B1.2 ─┘                    B2.4 ──┘                                                                            │
                                                                                                               ▼
                                                        F1.1 ──► F1.2 ──► F2.1 ──► F2.2 ──► F3.1 ──► F3.2
                                                                                                     │
                                                              ┌──────────────────────────────────────┤
                                                              ▼                                      ▼
                                                     E1.1 ──► E1.2                          S1.1 ──► S1.2 ──► S1.3 ──► S1.4
                                                              │                                                        │
                                                              └────────────────────┬───────────────────────────────────┘
                                                                                   ▼
                                                                    V1.1 ──► V1.2 ──► V1.3 ──► V1.4
```

- **B1.1 és B1.2** egymástól függetlenek, de mindkettő megelőzi a B2-t.
- **B2.3 és B2.4** párhuzamosítható: két külön végpont logikája, közös előfeltételekkel.
- **Az F csomag csak B4.1 után indulhat** — az `api.ts`-re épül.
- **Az E és az S egymástól független**, de mindkettő az F után: az E a kész képernyőt méri, az S
  a `Messages` végleges szövegeit veszi át.
- **A V csomag a legvégén**, friss szemmel, a teljes kritériumlistára.
