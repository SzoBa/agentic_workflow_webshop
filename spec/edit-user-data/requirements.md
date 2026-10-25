# Saját fiókadatok szerkesztése

## Miről van szó

A bejelentkezett felhasználó ma semmit nem tud állítani magán. Ha elköltözik vagy elírta az
e-mailjét, adminhoz kell fordulnia, a jelszavát meg egyáltalán senki nem tudja megváltoztatni,
még az admin sem.

Kell egy „Adataim" képernyő, ahol a user átírja a nevét, e-mailjét, címét, és külön ott tud
jelszót is cserélni.

## Mit lehet szerkeszteni

- felhasználónév
- e-mail
- szállítási cím
- jelszó (ez külön van, lásd lentebb)

A szerepkört értelemszerűen nem lehet állítani magának, azt hagyjuk figyelmen kívül, ha mégis
beküldi.

A validáció ugyanaz legyen, mint a regisztrációnál — ne írjunk új szabályokat, elég a meglévő
validátort meghívni.

## Jelszócsere

Külön végpont, mert ez más jellegű művelet. A kérésben jön a jelenlegi jelszó, az új jelszó,
és az új jelszó még egyszer megerősítésként.

A tokennel kezdeni kell valamit csere után — a régi token elvileg nem maradhat érvényes, de
nem akarjuk kiléptetni a usert sem. Új tokent kell adni a válaszban, a kliens meg
lecseréli.

## Hibaüzenetek

Magyarul, ahogy a többi. **Szó szerint** ezek a szövegek — a hibaüzenet szerződés, nem
illusztráció:

| Eset | Szöveg |
|---|---|
| rossz vagy hiányzó jelenlegi jelszó | `A jelenlegi jelszó hibás.` |
| a megerősítés nem egyezik | `A két jelszó nem egyezik.` |
| az új jelszó ugyanaz, mint a régi | `Az új jelszó nem egyezhet meg a jelenlegivel.` |

A rövid jelszóra (`A jelszó legalább 8 karakter legyen.`), a profilmezőkre és a
találgatási korlátra (`Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.`) a meglévő
katalógusszövegek jók, azokat ne duplikáljuk.

## Brute force

Elvileg valaki ellopott tokennel addig tippelgetheti a jelenlegi jelszót, amíg el nem találja.
Erre valami korlátot rá kell tenni, a `LoginAttemptService` már megvan, azt lehetne használni.

**A hitelesítés nem jár automatikusan.** A `WebConfig.PROTECTED_PATTERNS` **tételes
felsorolás**, nem névtér: a `/api/auth/register` és a `/api/auth/login` szándékosan nyilvános,
tehát `/api/auth/**` nincs és nem is lehet benne. Az új végpontokat egyenként fel kell venni a
listára — ellenőrizd a fájl **tényleges** tartalmát, ne feltételezésből dolgozz.

## Definition of Done

- [ ] **FA-01** — A felhasználó be tudja állítani a saját adatait, és utána tényleg azt látja,
      amit beírt.
- [ ] **FA-02** — A validáció rendesen működik, hibás adatra értelmes hibaüzenet jön vissza.
- [ ] **FA-03** — Nem lehet más nevét vagy e-mailjét elvenni.
- [ ] **FA-04** — A szerepkört nem tudja magának átírni.
- [ ] **FA-05** — A jelszócsere működik.
- [ ] **FA-06** — A jelszókezelés a csere után is rendben van: az **új** jelszóval a
      `POST /api/auth/login` sikeres, a **régivel** `401` `Hibás felhasználónév vagy jelszó.`, és
      sem a jelszó, sem a hash nem jelenik meg egyetlen válasz törzsében sem.
- [ ] **FA-07** — A tokenkezelés a csere után korrekt, **két** külön mérhető állítással:
      (a) *szerver* — a válaszban új nyers token jön, a **régi** tokennel a `GET /api/auth/me`
      `401`, az újjal `200`; (b) *kliens* — az `AuthProvider` a kapott új tokent beírja a
      munkamenetbe (`webshop-auth` kulcs **és** `setAuthToken`), a felhasználó **nem** lép ki.
      A (b) bizonyítéka nem lehet mockolt context: valódi `AuthProvider`-t rendereljen.
- [ ] **FA-08** — Az érzékeny végpontok védve vannak.
- [ ] **FA-09** — A találgatás néhány próbálkozás után le van tiltva egy ideig.
- [ ] **FA-10** — Van egy `/profile` oldal, ahonnan mindez elérhető, és a fejlécből is el lehet
      jutni rá.
- [ ] **FA-11** — Az oldal a meglévő űrlapmintát (`.panel` + `.form-stack`, lásd `Login.tsx`)
      követi, és **minden** szerverhiba szó szerint, a hozzá tartozó űrlap mellett jelenik meg —
      űrlaponként külön hibaállapottal, a másik űrlap érintése nélkül.
- [ ] **FA-12** — Van rá teszt, **legalább** ezekre: a két végpont sikeres ága, minden
      hibaága (rossz jelszó, megerősítés-eltérés, azonosság a régivel, rövid jelszó, névütközés,
      profilvalidáció, `429`), a tokenrotáció **mindkét** iránya (`FA-07` a és b), és a
      hitelesítetlen hozzáférés.
- [ ] **FA-13** — A meglévő tesztek nem törnek el, és a bővített **közös** osztályok
      (`UserValidator`, `SessionIssuer`, `LoginAttemptService`) meglévő hívói — regisztráció,
      bejelentkezés, `PUT /api/admin/users/{id}` — változatlanul viselkednek.
- [ ] **FA-14** — Zöld a build: `mvn test` · `npm run build` · `npm test` · **`npm run lint`** ·
      `npx tsc --noEmit -p client/tsconfig.json`. A lint nem elhagyható — a CI-ban blokkoló job.

## Egyéb megjegyzések

- A régi rendelésekben lévő név nem változik meg utólag, az snapshot (ADR-0001), ez így jó.

## Változásnapló

**2026-08-02 — 2. kör előtti élesítés (emberi szerkesztés).** A `spec-validator` első köre tíz
ponton talált hibát **magában a specben**, nem a kódban. Az alábbiak ennek nyomán változtak; a
forrás minden esetben a validátor jelentése, **nem** a megvalósult kód:

| # | Mi változott | Miért |
|---|---|---|
| 1 | „Brute force": a „`/api/auth` névtér már védett" mondat **törölve**, helyette a tételes `PROTECTED_PATTERNS` ténye | Az állítás hamis volt; aki elhiszi, hitelesítés nélkül hagyja a jelszócsere-végpontot |
| 2 | `plan` 4.3: a hibás jelszó válasza **`400`**, a `signalUnauthorized: false` **tiltva**, az ellenőrzések sorrendje kötött | A norma a kockázatos döntést az implementálóra hagyta, aki `401`-et választott — az pedig a kliens globális `401`-kezelőjén keresztül kiléptetne egy elgépeléstől |
| 3 | Mind a három új hibaüzenet **szó szerinti** | „kb. ilyesmi" megfogalmazásból nem lesz szerződés |
| 4 | `FA-06`, `FA-07`, `FA-11`, `FA-12`, `FA-13`, `FA-14` mérhető olvasata | A validátor kettőt `[ítélhetetlen]`-nek minősített |
| 5 | `plan` 4.2, 4.5, 4.6: a korlát paraméterei és négy következménye, a rotációs táblázat, a kétbean-es felépítés | A megvalósítás helyes volt, de a spec nem írta elő — a következő futás elronthatná |
| 6 | `plan` 4.10 (új): tiltólista — migráció, `package.json`, `pom.xml`, CI | Hiányzott az „amihez senki nem nyúl" lista |
| 7 | `plan` 4.8: az `spec/backend/`-frissítés tételes táblázata; `4.9`: átszámozási tilalom | „Ha jónak látja" nem feladatkiosztás |
| 8 | `plan` 3.: a `client/test/auth.test.tsx` az **F** csomagé | A `tasks.md` és a `plan.md` mást mondott, ezért a fájl senkié sem volt — és a tokenrotáció kliensoldala mérés nélkül maradt |
| 9 | `FA-19`…`FA-25` (új, mind `*Bizonyíték:*` sorral) | A `FA-15`…`FA-18` négy pontja nem fedte le a mérendő viselkedést |
| 10 | `tasks`: `B3.1` kötelező esetlistája, `B3.3`–`B3.5`, `F1.1` bizonyítéka, `E1.1` harmadik forgatókönyve, `S1.3`–`S1.4`, `V1.3`–`V1.4` | „Van rá teszt" és „a forgatókönyvek le vannak írva" nem mér működést |
