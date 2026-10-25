# Szándékos minőségrontás — a `spec/edit-user-data/` három fájlján

> **Ez a fájl nem norma, és nem is a spec része.** Napló arról, hogy 2026-08-02-án **szándékosan**
> rontottam a `requirements.md`, a `plan.md` és a `tasks.md` készültségi minőségén, hogy a
> feature-t **iteratívan**, körről körre lehessen megvalósítani és javítani.
>
> A cél nem a spec elrontása, hanem az, hogy legyen **mit** javítani: minden alább felsorolt
> tétel egy **előre ismert, várható kódhibát** telepít a láncba, és meg van adva, melyik körben
> kellene kiderülnie. Ha egy kör nem találja meg a saját tételeit, az magáról a körről mond
> valamit — ez a mérés lényege.
>
> **A rontás előtti, hiánytalan változat megvan:**
> [`docs/edit-user-data/eredeti-spec/`](../../docs/edit-user-data/eredeti-spec/) — a három fájl
> szó szerinti másolata. Bármelyik tétel visszaállítása = a megfelelő szakasz visszamásolása
> onnan. Az implementáló láncnak **ezt a mappát nem szabad odaadni**: az tartalmazza a
> megoldásokat.

---

## Hogyan használd

1. A lánc (`feature-implement`) a **rontott** `spec/edit-user-data/` mappából indul.
2. Minden kör után az alábbi táblázat „Melyik körben derül ki" oszlopa mondja meg, mit **kellett
   volna** megtalálni. Amit a kör megtalált, azt a kódban javítjuk; amit nem, ott a **spec** sorát
   élesítjük (a `docs/edit-user-data/eredeti-spec/` a referencia), és újra futtatjuk.
3. A `spec/` mappát a lánc nem írhatja (`spec-guard.mjs`), tehát a spec élesítése minden körben
   **emberi szerkesztés** — ez szándékos: így válik el, mit talált meg a gép, és mit a fejlesztő.

**Kiindulási mérés a rontás után** (`node .claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs edit-user-data`):

```
Spec-ellenőrzés — spec/edit-user-data (14 kész-kritérium, 13 hivatkozva a feladatlistából)
Összesen: 21 HIBA, 0 FIGYELEM.
```

Ebből 14 a hiányzó `*Bizonyíték:*` sor (ez a rontás előtt is így volt), a maradék 7 **új**:
4 munkaegység `*Kész, ha:*` sor nélkül, 2 kritériumra nem mutat feladat, és a feladatlista egy
**nem létező** kritériumra (`FA-18`) hivatkozik.

---

## A rontások

`H1`…`H8` = a `.claude/skills/feature-spec-writer/references/kihivas-katalogus.md` hibaosztályai
(`H1` megengedő megfogalmazás · `H2` hiányzó hatókör · `H3` ellenőrizetlen premissza ·
`H4` hiányzó end-to-end mérő pont · `H5` szűk bizonyíték · `H6` két állítás egy pontban ·
`H7` a kritérium a tesztet írja le · `H8` le nem állított reflex).

| # | Hol | Mit vettem ki | Várható kódhiba | Kör | Osztály |
|---|---|---|---|---|---|
| **M-01** | `plan` 1.1–1.3, `tasks` B1.1, E1.1, V1.4 | A hibaüzenetek **szó szerintisége**; kettő helyére „kb. ilyesmi" került | A `Messages` szövegei, a tesztek várt szövegei és a Gherkin idézetek elcsúsznak egymástól | 1 | `H1` |
| **M-02** | `plan` 1.1, 1.2, `tasks` B2.2–B2.3 | A **validációs sorrend** (számozott táblázat → sorrendezetlen lista) | Több egyidejű hiba esetén más üzenet jön, mint amit a teszt vár; a hibás űrlap elfedi a hibás jelszót | 1 | `H5` |
| **M-03** | `plan` 4.3 és 2. szakasz | A „**hibás jelszó → 400, nem 401**" döntés és a `signalUnauthorized` tilalom | 401 a hibás jelszóra → egy **elgépelés kilépteti** a felhasználót „lejárt a munkameneted" üzenettel | 2 | `H3` |
| **M-04** | `req` „Brute force", `plan` 1.1/1.2/4.8, `tasks` B1.2 (törölve) | A `PROTECTED_PATTERNS` **tételes** volta — helyette **hamis premissza**: „az `/api/auth` névtér már védett" | A `POST /api/auth/password` kimarad az őrlistából → **hitelesítés nélkül elérhető** | 2 | `H3` |
| **M-05** | `plan` 4.4, `tasks` B2.2 | A `role`-táblázat (érvénytelen érték → 400) | Az elgépelt szerepkör **némán elvész**, a kérés 200-at ad | 2 | `H8` |
| **M-06** | `plan` 4.7, 1.1, `req` (a saját név megtartása) | Az `excludeUserId` harmadik paraméter és a kötelező `duplicate(ex)` ág | A user **nem tudja megtartani a saját nevét** (400); egyidejű névváltás **500** | 2 | `H8` |
| **M-07** | `plan` 4.2 | A korlát paraméterei (kulcs, 10 / 15 perc) és a négy következmény | Naiv limiter: a **helyes** jelszó kicsúszik a zárolás alól, vagy a login IP-vödrébe folyik → a user nem tud belépni | 3 | `H1` |
| **M-08** | `plan` 4.6 | A **kétbean-es** felépítés (`AccountService` nem tranzakcionális + `AccountWriter`) | A számláló a kérés tranzakciójában nő → a 400-zal **visszagördül**, a korlát **soha nem lép életbe** (a teszt zöld lehet, a védelem nem létezik) | 3 | `H3` |
| **M-09** | `plan` 4.5 | A tokenrotáció táblázata (profilmentés: nincs · jelszócsere: van) és az `I-6` indoklás | A profilmentés fölöslegesen rotál (kilépteti a usert), vagy a jelszócsere **nem** öli meg a régi tokent | 3 | `H2` |
| **M-10** | `plan` 4.11, `tasks` F1.1 | A két kliensoldali kötelezettség (`state.user` frissítés · új token beírása) | A fejléc a régi nevet mutatja; a csere után a következő kérés 401 → **kirepül a user** | 2 | `H5` |
| **M-11** | `plan` 4.1, 3. szakasz, `tasks` B3.6 (törölve) | A „**ne írj migrációs fájlt**" tilalom és az `FA-20` | Fölösleges `V4__…sql` a rate limit tárolásához („új viselkedés = új migráció" reflex) | 1 | `H8` |
| **M-12** | `plan` 4.8, `tasks` S1.1–S1.2 | A `spec/backend/` frissítésének **táblázata** (mely fájl, mely mondat, mely szám) | A norma továbbra is azt állítja, hogy „a jelszó nem módosítható", és a végpontszám 22 marad | 2 | `H1` |
| **M-13** | `plan` 4.9, `tasks` S1.3–S1.4 (törölve) | A `K-79…K-86` esettábla, az **átszámozási tilalom** és a futtató bekötése | Nincs HTTP-szintű bizonyíték; vagy a beszúrás **átszámozza** a meglévő eseteket | 2 | `H4` |
| **M-14** | `plan` 5.1 (törölve) | A hat ítélhetetlen DoD-pont **mérhető olvasata** | `FA-02`, `FA-07`, `FA-09`, `FA-11`, `FA-12`, `FA-14` nem eldönthető → a validáló bármit „teljesül"-nek írhat | 0 | `H1` |
| **M-15** | `plan` 5.2 → 5.1, `req` FA-05/06/08 | `FA-15…FA-25` (11 pont, mind `*Bizonyíték:*` sorral) → `FA-15…FA-18` (4 vak pont); a DoD legjobb két pontja elrontva | Nincs mit megbuktatni: a lánc „kész"-t jelenthet mért bizonyíték nélkül | 0 | `H5` `H6` |
| **M-16** | `tasks` B3.5 (törölve), `FA-24` | A **regressziós** kritérium a bővített közös osztályokra (`UserValidator`, `SessionIssuer`, `LoginAttemptService`) | A regisztráció / login / `PUT /api/admin/users/:id` viselkedése csendben elmozdul | 3 | `H4` |
| **M-17** | `tasks` B4.2, F3.2, V1.2, `FA-25` | Az `npm run lint` a parancslistákból | Lokálisan „zöld a build", a CI `lint` jobja **piros** | 1 | `H5` |
| **M-18** | `tasks` B3.1–B3.4 → B3.1–B3.2, F3.1, V1.1 | A tesztfeladatok esetlistái („mit kell asszertálnia") | Vékony tesztek: happy path igen, hibaágak és tokenrotáció nem | 1 | `H7` |
| **M-19** | `tasks` E1.1 (3. szcenárió), V1.3 (törölve) | Az „elgépelt jelszó → **nem** repül ki" szcenárió és a futó stack elleni mérés | Az `M-03` és az `M-10` hibája **nem derül ki** böngészőből | 2 | `H4` |
| **M-20** | `tasks` „Függőségi sorrend", `plan` 3. szakasz | A gráf, és az „amihez egyik csomag sem nyúl" lista | Az F csomag a kész `api.ts` előtt indul; valaki hozzányúl a migrációkhoz / a `package.json`-höz | 3 | `H2` |
| **M-21** | `plan` fejléc, `tasks` indítási megjegyzés | A [`notes.md`](../../docs/edit-user-data/notes.md) audit-mutatója és a „`FA-15…FA-25` átemelése" teendő | Az olvasó nem találja meg a nyitott kérdések listáját, és a spec formailag piros marad | 0 | — |
| **M-22** | `plan` 4. szakasz | — (a 4.8/4.9/4.10 összevonása után **nincs 4.10**, a számozás 4.9 → 4.11-re ugrik) | Kozmetikai: gyanút kelt, hogy a dokumentumból kivettek valamit | 0 | — |

**Kör-jelölés:** `0` = a spec gépi/emberi átolvasásakor, még implementáció előtt · `1` = az első
implementációs kör után (build, `mvn test`, `npm test`) · `2` = konformancia + e2e + kliens ·
`3` = átvétel, biztonsági és regressziós olvasat.

---

## Két tétel, ami nem csak hiány, hanem **hamis állítás**

Ezt a kettőt szándékosan külön jelzem, mert nem elhallgatás, hanem tévedés — visszaállításkor
nem elég kiegészíteni, **törölni** kell:

1. **`req` „Brute force" szakasz** (`M-04`) — új mondat:
   > „Mindkét végpont az `/api/auth` névtérben lesz, ami már védett — a hitelesítéssel tehát nem
   > kell külön foglalkozni, azt a meglévő interceptor elintézi."

   A valóság: a `PROTECTED_PATTERNS` **tételes felsorolás**
   (`server-java/src/main/java/hu/webshop/config/WebConfig.java:36-42`), `/api/auth/**` nincs
   benne. A `PUT /api/auth/me` véletlenül védett (a minta metódus-független), a
   `POST /api/auth/password` **nem**.

2. **`plan` 4.3** (`M-03`) — új mondat:
   > „A hibás jelszóra adott státuszkód a hitelesítési hibák szokásos kódja legyen, ahogy a
   > bejelentkezésnél is."

   Ez 401 felé tereli az implementálót, miközben a kliens globális 401-kezelője
   (`client/src/api.ts:186-199`) minden 401-nél eldobja a munkamenetet.

---

## Amit **nem** rontottam el — hogy a lánc egyáltalán elinduljon

Ezek nélkül a spec nem implementálható, nem pedig „nehezebben":

- A **két végpont útvonala és metódusa** (`PUT /api/auth/me`, `POST /api/auth/password`), a
  kérés- és válaszalakok, a `PublicUserResponse` / `AuthResponse` újrahasználata.
- A **TypeScript-tükör** alakja (`ProfileInput`, `PasswordChangeInput`, a két függvény szignatúrája).
- A **fájltulajdon-táblázat** (`plan` 3.) — a munkacsomagok szétválasztása megmaradt, csak a
  tiltólista tűnt el mellőle.
- A **munkacsomagok és a lánc alakja** (`plan` 6.), a `RequireAuth` / `/profile` / fejléc-link
  hármas (`plan` 4.12), és a `spec/backend/` elsőbbsége ütközéskor.
- A `docs/edit-user-data/notes.md` **audit** maga: érintetlen, csak a rá mutató hivatkozás tűnt
  el a `plan.md`-ből. Aki elolvassa, minden nyitott kérdést megtalál benne — de a lánc nem kapja
  meg.

## Ami már a rontás előtt is hiányzott

Nem az én művem, de a kör-tervezéshez tudni kell: a `requirements.md` **egyetlen** kritériumánál
sem volt `*Bizonyíték:*` sor, és a DoD öt pontja (`FA-02`, `FA-07`, `FA-09`, `FA-11`, `FA-12`)
eredetileg is ítélhetetlen szövegű volt — ezeket a `plan.md` 5.1 szakasza élesítette, amit az
`M-14` kivett. A teljes eredeti felmérés:
[`docs/edit-user-data/notes.md`](../../docs/edit-user-data/notes.md).

Külön figyelmeztetés: a
[`docs/scenario-catalog/scenario-katalogus-edit-user-data.md`](../../docs/scenario-catalog/scenario-katalogus-edit-user-data.md)
egy **bővebb** specváltozat ellen íródott (`FA-01…FA-30`), tehát a rontás után még távolabb került
ettől a mappától. Ha egy kör bizonyítékként hivatkozna rá, az hibás átvétel.
