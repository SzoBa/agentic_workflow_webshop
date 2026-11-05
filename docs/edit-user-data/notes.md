# Követelmény-audit — `spec/edit-user-data/requirements.md`

**Mérés dátuma:** 2026-08-02 · **Vizsgált fájl:**
[`spec/edit-user-data/requirements.md`](../../spec/edit-user-data/requirements.md) (75 sor,
14 kész-kritérium)

> **Ez a jegyzet nem norma és nem javított spec.** Audit-eredmény: mit találtam a
> követelményben, és mit nem. A `spec/` alatt semmit nem módosít, egyetlen nyitott kérdést
> sem dönt el a fejlesztő helyett — az utolsó szakasz épp azokat sorolja fel.

---

## 0. Mit vizsgáltam, mihez mértem

A követelményt **nem** önmagában olvastam, hanem három, a repóban már meglévő mércéhez:

| Mérce | Mit ad |
|---|---|
| [`spec/admin-orders/requirements.md`](../../spec/admin-orders/requirements.md) | A repó **egyetlen** végigvitt feature-specje: azonosított kritériumok, `*Bizonyíték:*` sorok, „Mi normatív" szakasz, Változásnapló. Ez a forma. |
| [`kihivas-katalogus.md`](../../.claude/skills/feature-spec-writer/references/kihivas-katalogus.md) | Nyolc spec-írói hibaosztály, **mindegyik ténylegesen megtörtént ebben a repóban**. Minden kritériumot végigvittem rajtuk. |
| A kódbázis | A követelmény minden **ténybeli** állítását visszaellenőriztem a forráson (`server-java/`, `client/`, `spec/backend/`, migrációk). |

Ezen felül lefuttattam a projekt gépi spec-ellenőrzőjét (5.4 szakasz).

**A nyolc hibaosztály rövidítve** — a jegyzetben `H1`…`H8` néven hivatkozom rájuk:

`H1` megengedő megfogalmazás · `H2` globálisan olvasható tiltás (hiányzó hatókör) ·
`H3` ellenőrizetlen premissza · `H4` hiányzó end-to-end mérő pont · `H5` a bizonyíték-sor
szűkebb, mint a kritérium · `H6` két állítás egy pontban · `H7` a kritérium a tesztet írja le,
nem a viselkedést · `H8` reflexek, amiket a specnek le kell állítania.

---

## 1. Mérleg

| Kategória | Darab | Súlyos? |
|---|---|---|
| Ellentmondás a kódbázissal vagy a `spec/backend/`-kel | **4** | mind a négy blokkoló |
| Hiányzó constraint (a HTTP-szerződés lyukai) | **11** | ebből 3 biztonsági vagy adatvesztő következménnyel |
| Kimondatlan feltevés | **6** | ebből 2 tényszerűen félrevezető |
| Kész-kritérium `*Bizonyíték:*` sor nélkül | **14 / 14** | gépi ellenőrzéssel mérve |
| Ítélhetetlen szövegű kész-kritérium | **5** | `FA-02`, `FA-07`, `FA-09`, `FA-11`, `FA-12` |
| Két állítást csomagoló kész-kritérium | **4** | `FA-01`, `FA-03`, `FA-10`, `FA-13` |
| Hiányzó **kategória** a DoD-ból | **3** | end-to-end · regresszió · spec-karbantartás |
| A követelmény tényszerűen **helytálló** állítása | **3** | lásd 7. szakasz |

**Egy mondatban:** a dokumentum jól azonosítja a *problémát*, de nem rögzít **szerződést** — nincs
benne egyetlen útvonal, státuszkód, mezőnév vagy szó szerinti hibaüzenet sem —, a
kész-kritériumai pedig ítélet helyett benyomást kérnek.

---

## 2. Ellentmondások

### 2.1 A jelszóhossz-üzenet **nem** „meglévő katalógusszöveg" ebben a helyzetben

A követelmény (`requirements.md:42`): *„A rövid jelszóra és a profilmezőkre a meglévő
katalógusszövegek jók, azokat ne duplikáljuk."*

A valóság két helyen mond mást:

- [`spec/backend/hibakatalogus.md:72`](../../spec/backend/hibakatalogus.md) — a
  `A jelszó legalább 8 karakter legyen.` sor kiváltó oka szó szerint: **„Csak regisztrációnál"**.
- `server-java/src/main/java/hu/webshop/auth/UserValidator.java:61-70` — a `validatePassword`
  javadocja: *„SZÁNDÉKOSAN nincs a profilvalidációban: az admin felületen a jelszó nem
  módosítható, ezért ez a szabály **kizárólag a regisztrációra** vonatkozik."*

Tehát nem duplikálásról van szó, hanem **hatókör-bővítésről**: a katalógus sorát módosítani kell
(a „Csak regisztrációnál" megjegyzés megszűnik vagy bővül). Ez a `spec/backend/` írása — amire a
követelménynek nincs egyetlen kész-kritériuma sem. `H8` (a spec nem állítja meg a reflexet, hogy
„ez már megvan, nem kell hozzányúlni").

### 2.2 A `role` kezelésére két, egymásnak ellentmondó precedens van a kódban

A követelmény (`requirements.md:19-20`): *„A szerepkört … azt hagyjuk figyelmen kívül, ha mégis
beküldi."*

A kódbázis **két különböző** választ ad ugyanerre a kérdésre:

| Hely | Viselkedés |
|---|---|
| `AuthService.java:79-81` (regisztráció) | *„A kérésben érkező `role` mező szándékosan figyelmen kívül marad."* — néma eldobás |
| `UserAdminService.java:107-122` (`readRole`) | A **hiányzó** mező = „ne változzon", a **jelen lévő, érvénytelen** érték viszont **400** `Érvénytelen szerepkör.` — *„egy elgépelt szerepkör nem maradhat némán figyelmen kívül"* |

A követelmény a `"role": "admin"` esetet rendezi, az **érvénytelen** értéket (`"role": "barmi"`,
`"role": null`, `"role": 5`) nem. Az implementáló reflexe a szomszédos, tartalmilag legközelebbi
végponthoz (a 18-ashoz) igazít — vagyis 400-hoz. `H8`.

### 2.3 A „majd frissíteni kell" mondat **két** normatív helyet hagy ki, és egy számot

A követelmény (`requirements.md:71-72`) csak a `vegpontok.md`-t nevezi meg. A „a jelszó nem
módosítható" állítás valójában itt él:

| Hely | Szöveg | Sorsa |
|---|---|---|
| [`spec/backend/vegpontok.md:303`](../../spec/backend/vegpontok.md) | „Új felhasználó létrehozására **nincs végpont**, és a jelszó nem módosítható." | módosítandó |
| [`spec/backend/requirements.md:69-70`](../../spec/backend/requirements.md) | „…és a jelszó **adminisztrátori úton** nem módosítható." | pontosításra szorul (az admin úton továbbra sem lesz az) |
| `spec/backend/vegpontok.md:3` | „A webshop backend **22 végpontja**." | elavul (+2 végpont) |
| `CLAUDE.md` | „a REST API (`/api/...`), **22 endpoints**" | elavul |

Amíg ezek állnak, a `spec/backend/` **tiltja** azt, amit ez a spec előír. Az `admin-orders`
mintája szerint ütközéskor *„a `spec/backend/` nyer"* — ezt a rangsort ez a dokumentum nem is
említi. A „majd frissíteni kell" ráadásul `H1`: nem ítélhető, és nincs DoD-pontja.

### 2.4 A brute-force javaslat szembemegy egy leírt, indokolt tervezési döntéssel

A követelmény (`requirements.md:47-48`): *„a `LoginAttemptService` már megvan, azt lehetne
használni. Nem akarom, hogy a login rate limitjével összeakadjon, szóval valahogy külön kell
számolni."*

- `LoginAttemptService.java:19-23`: *„Miért **IP-alapú**, és nem fiókhoz kötött: a fiókzárolás azt
  is lehetővé tenné, hogy bárki kizárjon bárkit, akinek ismeri a felhasználónevét — a
  védekezésből támadási felület lenne."*
- [`spec/backend/requirements.md`](../../spec/backend/requirements.md) 7.2: *„**IP-nként** 10
  sikertelen próbálkozás 15 perces ablakban → 429."* — normatív.

A „valahogy külön kell számolni" nem dönti el, hogy a számlálási kulcs **IP** vagy **`userId`**
marad-e, pedig a kettő ellentétes irányba visz, és a `userId` egy kimondottan **elutasított**
alternatíva újranyitása. (Van rá védhető érv — a végponthoz érvényes token kell, tehát idegent
nem lehet vele kizárni —, de az érv **nincs leírva**, tehát a döntés sincs meghozva. `H3`.)

Amit a kód **megenged**: a `login_attempts.attempt_key` szabad szöveges elsődleges kulcs
(`V1__init.sql:97-101`), tehát névtérrel bővíthető migráció nélkül. A `recordFailure` viszont
minden hívásnál **globális** takarítást futtat az egész táblán
(`LoginAttemptService.java:64-81`) — a két számláló így nem függetlenül retenciózódik.

---

## 3. Hiányzó constraintek

### 3.1 Nincs végpont megnevezve — se útvonal, se metódus, se mezőnév

A követelmény két végpontról beszél („külön végpont, mert ez más jellegű művelet"), de **egyiket
sem nevezi meg**. A projekt szerződése végpont-szintű: a
[`vegpontok.md`](../../spec/backend/vegpontok.md) minden végpontnél útvonalat, metódust,
kérés-törzset és státuszkód-táblázatot ad. Enélkül a kliens és a szerver nem tud egymástól
függetlenül elkészülni, és a `plan.md` (az interfész szerződése) sem írható meg.

Hiányzó mezőnevek: a jelszócsere három bemenete („jelenlegi jelszó, új jelszó, megerősítés")
csak magyarul szerepel, JSON-kulcsként nem.

### 3.2 Nincs egyetlen státuszkód sem — és a rossz jelszóé kliensoldali mellékhatással jár

Ez a legdrágább hiány. **Rossz jelenlegi jelszó → 401 vagy 400?** A kliens globális
401-kezelője (`client/src/api.ts:186-199`) **kilépteti a felhasználót minden 401-nél**:

```
if (res.status === 401 && opts.signalUnauthorized !== false && authToken) {
  onUnauthorized?.();          // → setState({ user: null, token: null }) + sessionExpired
}
```

Kivétel egyedül a bejelentkezés és a regisztráció (`signalUnauthorized: false`,
`api.ts:275,288`), épp azzal az indoklással, hogy *„ott a 401 hibás jelszót jelent, nem lejárt
munkamenetet"*. A jelszócsere pontosan ilyen végpont. Ha 401-et ad, és a hívás nem kap
`signalUnauthorized: false`-t, akkor **egy elgépelt jelenlegi jelszó kidobja a felhasználót a
munkamenetéből**, „lejárt a munkameneted" magyarázattal (`SessionExpiredNotice`). A követelmény
sem a státuszkódot, sem ezt a kliensoldali kötelezettséget nem mondja ki.

### 3.3 Teljes csere vagy részleges módosítás?

A `UserValidator.validateProfile` **mindhárom** mezőt megköveteli, és a hiányzó mezőt üresként
kezeli (`UserValidator.java:40-59`) — tehát csak a címet elküldve **400** jön
(`A felhasználónév legalább 8 karakter legyen.`). A követelmény „a user átírja a nevét,
e-mailjét, címét" megfogalmazása nem dönti el, hogy a kérés teljes csere (mint a 18. végpont,
`PUT /api/admin/users/:id`) vagy mezőnkénti módosítás. `H3`: kimondatlan premissza, hogy „elég a
meglévő validátort meghívni" — ez csak teljes csere mellett igaz.

### 3.4 Kell-e a jelenlegi jelszó a **profil** mentéséhez?

A követelmény csak a jelszócserénél kéri. Következmény, ha nem kell: egy ellopott tokennel a
támadó átírja az e-mail címet, és a fiók az övé lesz — miközben a jelszócsere-védelmet épp az
ilyen tokenlopásra hivatkozva vezeti be a dokumentum (`requirements.md:46`). Ez **döntés**, nem
elírás: mindkét irány védhető (a jelszókérés súrlódás), de a specnek meg kell hoznia.

### 3.5 Nincs validációs sorrend

A [`hibakatalogus.md:33`](../../spec/backend/hibakatalogus.md) minden más validációnál kimondja:
*„A validáció az **első** hibánál megáll, tehát egyszerre egy üzenet érkezik"*, és a táblázat
sorrendje maga a szerződés. Itt nincs sorrend: mi a válasz, ha egyszerre **rossz a jelenlegi
jelszó** és **nem egyezik a megerősítés**, vagy ha az új jelszó **rövid is** és **azonos is** a
régivel? Három hibaüzenet, három lehetséges sorrend, egyik sincs rögzítve. `H5`.

### 3.6 Két hibaüzenet szövege hiányzik

| Eset | A követelmény szövege | Állapot |
|---|---|---|
| rossz jelenlegi jelszó | `A jelenlegi jelszó hibás.` | szó szerint megvan |
| az új jelszó azonos a régivel | *„valami olyasmi, hogy nem lehet azonos"* | **hiányzik** |
| a megerősítés nem stimmel | *„erre is kell egy üzenet"* | **hiányzik** |

Ebben a projektben a hibaszöveg **szerződés**: egyetlen helyen él (`hu.webshop.common.Messages`),
a konformancia-esetek és a kliens erre épülnek, az e2e Gherkin pedig szó szerint idézi, és a
tesztfájlokban is *„non-negotiably … copied verbatim from the spec's error catalogue"*. A „valami
olyasmi" ebből nem előállítható. `H1`.

### 3.7 A rate limit minden paramétere hiányzik

Nincs kimondva: **hány** próbálkozás · **mekkora** ablak · milyen **státuszkód** és **üzenet**
(a `Túl sok sikertelen próbálkozás…` átvehető-e, vagy új szöveg kell) · a **siker nullázza-e** a
számlálót (a loginnál igen, `AuthService.java:130`) · és hogy a zárolás elutasítja-e a **helyes**
jelszót is. Ez utóbbi a login legfontosabb védelmi tulajdonsága
(`AuthService.java:109-113`: *„A zárolás a HELYES jelszót is elutasítja: különben a támadó a
találat pillanatában kicsúszna a korlát alól"*) — egy naiv „csak a hibás próbákat számoljuk"
implementáció ezt csendben elveszti.

### 3.8 Kliens: az `/profile` útvonalat mi védi?

`RequireAuth` őr a repóban **nincs** — csak `RequireAdmin` (`client/src/RequireAdmin.tsx`), és a
`/orders` (a mai egyetlen belépéshez kötött vevői oldal) **őrizetlen** az `App.tsx:216`-ban. Nincs
kimondva, mit lát egy kijelentkezett látogató a `/profile`-on: átirányítást, üres űrlapot vagy
összeomlást.

### 3.9 Kliens: a mentés után frissíteni kell a tárolt munkamenetet

Az `AuthProvider` a felhasználót **és** a tokent a `webshop-auth` localStorage-kulcsban tartja
(`client/src/auth.tsx:41,88-90`), a tokent pedig renderelés közben adja át az api rétegnek
(`auth.tsx:84`). Ebből két, ki nem mondott kötelezettség következik:

- profilmentés után a `state.user` frissítése — enélkül a fejléc (`App.tsx`, „Belépve: …") és
  minden előtöltött űrlap a **régi** nevet mutatja az oldal újratöltéséig;
- jelszócsere után a **kapott új tokent** be kell írni ugyanoda — enélkül a következő kérés 401,
  és a 3.2-ben leírt globális kezelő kilépteti a felhasználót. A követelmény ezt egyetlen
  félmondattal intézi el („a kliens meg lecseréli"), kész-kritérium nélkül.

### 3.10 Nincs kimondva, hogy nincs sémaváltozás

A követelmény: *„Migráció szerintem nem kell hozzá, a `users` táblában minden mező megvan."*
Ellenőriztem: **igaz** (`V1__init.sql:30-41` — `username`, `email`, `address`, `password_hash`
mind ott van). De „szerintem" alakban van leírva, holott a kihívás-katalógus 8. pontja épp erre
mond ki szabályt: *„ha nincs sémaváltozás, **mondd ki**, hogy nincs, és tedd külön kritériummá"*
(az `admin-orders` `AR-17` pontja ezt teszi). `H3` + `H8`.

### 3.11 Konformancia: kell-e `K-xx` eset?

A [`konformancia.md:18`](../../spec/backend/konformancia.md) szándékosan hézagokat tart fenn
(`K-16…K-19`, `K-37…K-39`, `K-59`) *„hogy új esetek beszúrhatók legyenek"*, az `admin-orders`
viszont kimondottan **lezártnak** nyilvánította magára nézve a katalógust. Ez a követelmény nem
foglal állást — pedig a válasz eldönti, elavul-e a „70 eset / 54 HTTP-eset" számpár is.

---

## 4. Kimondatlan feltevések

### 4.1 A tokenrotáció „nehéz része" valójában ingyen van

A követelmény (`requirements.md:30-32`) úgy fogalmaz, mintha a régi token érvénytelenítése és a
user bent tartása két, egymással feszülő követelmény lenne. Az **I-6** invariáns miatt (egy
felhasználóhoz egy érvényes munkamenet) ez egyetlen művelet: a `SessionIssuer.issue`
felülírja a `token_hash`-t, amivel a régi token azonnal halott
(`SessionIssuer.java:34-55`, `V1__init.sql:44` `users_token_uidx` → `V2` `users_token_hash_uidx`).
A feltevés **igaz**, de kimondatlan — és ezért a spec nem is méri, hogy a rotáció tényleg
megtörtént-e. `H3`.

### 4.2 Feltételezi az egy böngészőlapot

A rotáció ára: ha a felhasználó két lapon van bejelentkezve (ugyanaz a token), a másik lap tokenje
a csere pillanatában halott, és a következő kérésnél „lejárt a munkameneted" magyarázattal
kirepül. Ez lehet elfogadott ár — de nincs leírva, tehát hibaként fog látszani.

### 4.3 „Elég a meglévő validátort meghívni" — két ponton nem elég

- **Igaz**, ahol a követelmény konkrétan állítja: a `requireAvailable(username, email,
  excludeUserId)` már támogatja a saját, változatlan név megtartását
  (`UserValidator.java:72-87`).
- **Nem elég** a jelszószabálynál (2.1) és a versenyhelyzetnél: az I-1/I-2 **atomicitását** nem az
  előzetes ellenőrzés adja, hanem a `duplicate(ex)` ág az adatbázis egyedi indexének ütközésére
  (`UserValidator.java:89-115`, K-47). Ha az új végpont ezt kihagyja, két egyidejű kérés 500-zal
  végződhet 400 helyett. A követelmény ezt nem írja elő.

### 4.4 A védettség **nem** automatikus ezen a névtéren

A `PROTECTED_PATTERNS` **tételes felsorolás**, nem névtér-minta
(`server-java/src/main/java/hu/webshop/config/WebConfig.java:36-42`):

```
"/api/admin/**", "/api/orders", "/api/orders/**", "/api/reviews",
"/api/auth/me", "/api/auth/logout",
```

Vagyis `/api/auth/**` **nincs** a listán. Egy `PUT /api/auth/me` automatikusan védett lenne (a
minta metódus-független), egy új `POST /api/auth/password` viszont **teljesen védtelen**, amíg
valaki fel nem veszi ide. Az `FA-08` („bejelentkezés nélkül egyik végpont sem érhető el") pontosan
erre a lépésre épül anélkül, hogy megnevezné — és a végpontok neve sincs meg (3.1), tehát a pont
ma nem is eldönthető. Ez a `K-58` / `K-70` tanulságának pontosan az a helye, ahol elrontható.

### 4.5 „A régi rendelésekben lévő név nem változik meg utólag" — félig igaz

- **Igaz** a rendelés `customer` blokkjára: az `orders.customer_name/email/address` a leadáskori
  másolat, szándékosan nem idegen kulcs (`V1__init.sql:8-13`, ADR-0001).
- **Nem igaz** az admin rendeléslistára: az `AdminOrderView.username` **futásidejű feloldás** a
  `userId`-ból ([`spec/admin-orders/requirements.md`](../../spec/admin-orders/requirements.md)
  2.1: *„A `username` futásidejű feloldás, nem tárolt mező"*). Egy névváltás után az admin
  rendeléslistában **visszamenőleg** az új név jelenik meg a régi rendelések mellett is — a
  `customer` blokkban viszont a régi. A két érték elválik, és ezt a viselkedést senki nem
  specifikálta.

### 4.6 Az e-mail-változás következményei máshol

Nincs kimondva, hogy az e-mail módosítása mit **nem** érint. (A rendelési értesítő a rendelés
`customer.email` mezőjére megy, nem a fiókéra — tehát a régi rendelések visszaigazolásai
változatlanok. Ez a helyes viselkedés, de csak a kód olvasásából derül ki.) Nincs továbbá szó
e-mail-megerősítésről: az új cím azonnal élesedik, ellenőrzés nélkül.

---

## 5. A Definition of Done auditja

### 5.1 Pontonként

| # | Szöveg (rövidítve) | Hibaosztály | Mi hiányzik |
|---|---|---|---|
| `FA-01` | „be tudja állítani … és utána tényleg azt látja, amit beírt" | `H5` `H6` | Két állítás (mentés + visszaolvasás). Nincs megnevezve, **hol** kell látnia: a válaszban, a `GET /api/auth/me`-ben, vagy újratöltés után a felületen. |
| `FA-02` | „A validáció rendesen működik, … értelmes hibaüzenet" | `H1` `H7` | „Rendesen" és „értelmes" nem ítélhető. Itt a hibaüzenet **szó szerinti** szerződés, nem minőségi jelző. Nincs felsorolva, melyik mező melyik hibája. |
| `FA-03` | „Nem lehet más nevét vagy e-mailjét elvenni" | `H5` `H6` | Két mező, két ág. És kimarad a **nem-triviális** ág: a **saját**, változatlan nevének megtartása sikeres kell legyen (`excludeUserId`) — ezt a követelmény törzse (`:23`) tudja, a DoD nem. |
| `FA-04` | „A szerepkört nem tudja magának átírni" | `H5` | Jó alakú állítás, de nem fedi az **érvénytelen** `role` értéket (2.2), és nem mondja, hogy a kérésnek közben **sikeresnek** kell lennie (nem 400). |
| `FA-05` | „a jelszócsere működik: az új jelszóval be lehet lépni" | — | **Ez a dokumentum legjobb pontja**: bináris, viselkedést ír le, egy állítás. Csak `*Bizonyíték:*` sora nincs. |
| `FA-06` | „A régi jelszó a csere után már nem jó" | — | Ugyanaz: jó alakú. Csak a bizonyíték-sor hiányzik. |
| `FA-07` | „A tokenkezelés a csere után **korrekt** (lásd fent)" | `H1` `H2` | Nem állítás, hanem visszautalás — méghozzá egy olyan bekezdésre (`:30-32`), amely maga is megengedő („a régi token **elvileg** nem maradhat érvényes"). Két külön mérendő ág van benne: a régi token 401-et ad, **és** az újjal a felhasználó bent marad. |
| `FA-08` | „Bejelentkezés nélkül egyik végpont sem érhető el" | `H2` `H5` | A végpontok nincsenek megnevezve (3.1), tehát a „egyik sem" halmaza üres. Nem köti ki, hogy **ténylegesen lefuttatott kérés** legyen a bizonyíték (vö. `AR-10`: *„nem az interceptor létére hivatkozás"*) — pedig itt épp az a kockázat, hogy a végpont kimarad a `PROTECTED_PATTERNS`-ből (4.4). |
| `FA-09` | „**néhány** próbálkozás után le van tiltva **egy ideig**" | `H1` | Se darabszám, se ablak, se státuszkód, se üzenet (3.7). Erre nem lehet tesztet írni, csak utólag igazolni bármit. |
| `FA-10` | „Van egy `/profile` oldal, … és a fejlécből is el lehet jutni rá" | `H6` | Két állítás (útvonal + navigáció). Nem mondja, mi történik kijelentkezve (3.8), és azt sem, hogy a link **minden** belépett usernek látszik-e (az admin menü mintája feltételes). |
| `FA-11` | „Az oldal **jól néz ki**, és a hibák megjelennek rajta" | `H1` `H6` | A „jól néz ki" nem kész-kritérium: nincs az az ítélő, aki `[nem teljesül]`-t tudna rá írni. A második fele viszont mérhető lenne — külön pontként. |
| `FA-12` | „Van rá teszt" | `H1` `H7` | A repóban **négy** tesztotthon van (`client/test/`, `server-java/src/test/java/`, `e2e/`, `spec/backend/conformance/`), és két Java tesztfajta (integrációs vs. unit). Nincs megnevezve, melyik(ek), és az sem, mit kell asszertálnia. |
| `FA-13` | „A meglévő tesztek nem törnek el" | `H6` | Két build-rendszer, két parancs. Nem regressziós kritérium a **viselkedésre**: ha valaki a `UserValidator`-t vagy a `SessionIssuer`-t bővíti, a régi hívók (regisztráció, `PUT /api/admin/users/:id`) viselkedésének változatlanságát semmi nem méri (kihívás-katalógus, „negyedik reflex"). |
| `FA-14` | „Zöld a build" | `H5` | A CI **nyolc** jobból áll; a `lint` job (ESLint + `tsc` + shellcheck + skill-validátor) külön parancs, és a `npm run lint` kimarad a felsorolásból — így a „zöld build" lokálisan igaz lehet, miközben a CI piros. |

### 5.2 Hiányzó **kategóriák** — nem egy pont hiányzik, hanem három csoport

1. **End-to-end mérő pont** (`H4`). Minden pont vagy csak a szerverről, vagy csak a kliensről szól.
   Az `admin-orders` ugyanezt a hiányt utólag, `AR-19`-ként pótolta, és sokáig az volt az egyetlen
   teljesítetlen pontja. **Fontos különbség:** akkor a repóban még nem volt böngészős tesztváz,
   ezért kézi füstteszt lett a bizonyíték — **ma van** `e2e/` (Cucumber + Playwright, magyar
   Gherkin), tehát ez a mentség már nem áll.
2. **Regressziós pont a megosztott komponensekre.** A feature három, ma is használt osztályt bővít
   (`UserValidator`, `SessionIssuer`, `LoginAttemptService`). Egyik régi hívó viselkedésére sincs
   kritérium.
3. **Spec-karbantartási pontok.** A hibakatalógus bővítése (2.1, 3.6), a `spec/backend/` két
   mondatának és a végpontszámnak a frissítése (2.3), valamint a „nincs új migráció" tilalom
   (3.10) — mind munkával jár, egyiknek sincs kész-kritériuma.

### 5.3 Formai hiány: nincs `*Bizonyíték:*` sor

Egyik pontnál sem. Az `admin-orders` mintája ezt így indokolja: *„A »Bizonyíték« oszlop megnevezi,
minek kell igazolnia — ha az nincs meg, a pont **nem** teljesült, akkor sem, ha a kód látszólag
helyes."* Ez a `H5` és a `H7` elleni egyetlen védelem: a validátor csak akkor tudja megnézni, hogy
a megnevezett teszt tényleg azt asszertálja-e, ha meg van nevezve.

### 5.4 Gépi ellenőrzés — mért kimenet

```
$ node .claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs edit-user-data

Spec-ellenőrzés — spec/edit-user-data (14 kész-kritérium, 0 hivatkozva a feladatlistából)

spec/edit-user-data/plan.md
  HIBA     Hiányzik — ez a fájl adja: az interfész szerződése.
spec/edit-user-data/requirements.md
  HIBA     :52  `FA-01`: nincs `*Bizonyíték:*` sor. …
  …        (mind a 14 kritériumra ugyanez)
spec/edit-user-data/tasks.md
  HIBA     Hiányzik — ez a fájl adja: a végrehajtási sorrend.
```

**16 HIBA**: 14× hiányzó bizonyíték-sor + 2 hiányzó fájl. (A `spec/edit-user-data/` **nem**
tartozik a három historikus mappa közé, amelyeknél a validátor bukása várt viselkedés.)

---

## 6. Amit kerestem és NEM találtam

**A spec-mappában:**

- **Nincs `plan.md` és `tasks.md`.** A mintában a `plan.md` **az interfész szerződése** —
  *„Ami ott rögzítve van, azt nem lehet menet közben átdönteni."* A hiányzó végpontdefiníciók
  (3.1) ide tartoznának.
- Nincs „Hogyan olvasd" / „Mi normatív" szakasz, nincs `ÚJ` / `MEGLÉVŐ` jelölésrendszer, és nincs
  kimondva a `spec/backend/` elsőbbsége ütközéskor.
- **Nincs „Nem cél" szakasz.** Így nem derül ki, hogy a legkézenfekvőbb scope creep — az
  **elfelejtett jelszó / e-mailes visszaállítás** — kívül van-e. A követelmény nyitómondata
  (*„a jelszavát meg egyáltalán senki nem tudja megváltoztatni, még az admin sem"*) inkább
  odaérti. Ugyanígy nincs állásfoglalás a **fiók törléséről** és az **e-mail-megerősítésről**.
- Nincs Változásnapló szakasz (a mintában kötelező, ha a spec egy lánc-futás után módosul).

**A kódbázisban** (mind mért, nem feltételezett):

- A `spec/backend/vegpontok.md` 22-es listájában **nincs** olyan végpont, ami ezt lefedné — a
  feature tényleg új szerződés, nem meglévő átfogalmazása.
- A kliensen **nincs** `/profile` útvonal (`App.tsx:208-243`), **nincs** `RequireAuth` őr, és
  **nincs** `updateProfile` / `changePassword` az `api.ts`-ben (üres grep a `client/src/` alatt a
  `profile|RequireAuth|changePassword|updateProfile` mintára). A kliensoldal nulláról indul.
- A `hu.webshop.common.Messages`-ben **egyetlen** jelszóval kapcsolatos üzenet van
  (`PASSWORD_TOO_SHORT`, `Messages.java:65`) — a három jelszócsere-üzenetből egy sem létezik.
- **Nem találtam** olyan meglévő tesztet vagy konformancia-esetet, ami ütközne a feature-rel; a
  `K-40…K-58` blokk a felhasználókezelést és a hitelesítést fedi, de a profilszerkesztést nem
  érinti.

**Külön jelzés — a downstream artefakt előrébb tart, mint a spec:**

A [`docs/scenario-catalog/scenario-katalogus-edit-user-data.md`](../scenario-catalog/scenario-katalogus-edit-user-data.md)
már egy **bővebb** specifikáció ellen íródott. Hivatkozik `FA-01…FA-30`-ra (a mai spec 14 pontot
tartalmaz), `PUT /api/auth/me`-re és `POST /api/auth/password`-re (a mai spec egy végpontot sem
nevez meg), a `requirements.md` 5.1 szakaszára és a `plan.md` 1.1-re (egyik sem létezik),
valamint eldöntöttként kezel legalább négy nyitott kérdést: a profilmentés **nem** rotál tokent,
a jelszócsere igen, a korlát kulcsa `jelszocsere:{userId}`, és a profilmentéshez **kell** a
jelenlegi jelszó. **Ezek egyike sincs a mai `requirements.md`-ben.** Vagy egy nem-verziózott
spec-változat veszett el, vagy a katalógus a saját feltevéseit írta vissza döntésként — mindkét
esetben a `requirements.md` a hiányos oldal, és a két dokumentum ma **nem** ugyanarról a
feature-ről szól.

---

## 7. Amit ellenőriztem és helytállónak találtam

Három ténybeli állítás megáll — ezeket **nem** kell újratárgyalni:

| Állítás | Bizonyíték |
|---|---|
| *„Az egyediségnél figyelni kell, hogy a saját nevét meg tudja tartani."* | A `requireAvailable(username, email, excludeUserId)` már pontosan ezt csinálja (`UserValidator.java:72-87`), és a `PUT /api/admin/users/:id` már így hívja. |
| *„Migráció szerintem nem kell hozzá, a `users` táblában minden mező megvan."* | `V1__init.sql:30-41` — `username`, `email`, `address`, `password_hash` mind ott. A rate limit tárolása sem igényel migrációt: az `attempt_key` szabad szöveges PK (`V1__init.sql:97-101`). *(A megfogalmazás viszont „szerintem" — lásd 3.10.)* |
| *„A régi rendelésekben lévő név nem változik meg utólag, az snapshot (ADR-0001)."* | Igaz a rendelés `customer` blokkjára (`V1__init.sql:8-13`). *(De nem teljes — lásd 4.5.)* |

A **problémafelvetés** is helytálló: a felhasználó ma tényleg nem tud semmit módosítani magán, és
a jelszóváltás valóban sehol nem elérhető — ezt az ugyanaznapi backlog-felmérés 6. tétele független
felméréssel is megerősítette (a tétel azóta lezárult, lásd
[`docs/backlog/feature-backlog.md`](../backlog/feature-backlog.md)).

---

## 8. Nyitott kérdések a fejlesztőnek

A kihívás-katalógus 1. pontja szerint *„a megengedő mondat azt jelenti, hogy **a döntés még nincs
meghozva**. Ne fogalmazd át szigorúbbra magadtól — kérdezd meg a fejlesztőt, melyik ág az
igazi."* Ezért az alábbiakat **nem** döntöttem el:

**Szerződés**

1. Mi a két végpont útvonala és metódusa, és melyik JSON-mezőneveket veszik? *(3.1)*
2. A profilmentés **teljes csere** (mindhárom mező kötelező) vagy részleges? *(3.3)*
3. Milyen státuszkódot ad a **rossz jelenlegi jelszó** — és ha 401, a kliens hívása
   `signalUnauthorized: false`-szal megy? *(3.2)*
4. Mi a validáció **sorrendje**, ha több hiba áll fenn egyszerre? *(3.5)*
5. Mi a két hiányzó hibaüzenet **szó szerinti** magyar szövege? *(3.6)*

**Biztonság**

6. Kell-e a jelenlegi jelszó a **profil** mentéséhez is, vagy csak a jelszócseréhez? *(3.4)*
7. A jelszócsere-korlát kulcsa **IP** vagy **`userId`**? Ha `userId`, a
   `LoginAttemptService` osztálydokumentációjában rögzített ellenérvet felül kell írni — mi az
   indoklás? *(2.4)*
8. Hány próbálkozás, mekkora ablak, milyen státusz és üzenet — és a zárolás elutasítja-e a
   **helyes** jelszót is? A siker nullázza-e a saját számlálóját? *(3.7)*
9. A profilmentés rotál-e tokent, vagy csak a jelszócsere? *(4.1, 4.2)*

**Hatókör és spec-karbantartás**

10. Az érvénytelen `role` érték némán lepattan (regisztráció-minta) vagy 400 (admin-minta)? *(2.2)*
11. Mi kerül a „Nem cél" közé — elfelejtett jelszó, fióktörlés, e-mail-megerősítés? *(6.)*
12. Kell-e új `K-xx` konformancia-eset, vagy a katalógus lezárt marad erre a feature-re? *(3.11)*
13. Ki és mikor frissíti a `spec/backend/` két mondatát, a végpontszámot és a hibakatalógust —
    és melyik kész-kritérium méri ezt? *(2.1, 2.3)*

**Kliens**

14. Mit lát a `/profile`-on egy kijelentkezett látogató? Kell-e `RequireAuth` őr? *(3.8)*
15. Az `FA-11` („jól néz ki") helyett mi a mérhető állítás a felület hibamegjelenítéséről? *(5.1)*

**Eljárás**

16. A `scenario-katalógus` `FA-01…FA-30`-as, végpontokat is megnevező specváltozata létezett-e
    valaha, vagy a katalógus feltevéseit kell visszavezetni a `requirements.md`-be? *(6.)*
