# Admin szerepkör — Implementation Plan

Mit építünk: [requirements.md](requirements.md) · Lépések: [tasks.md](tasks.md) · Szótár: [CONTEXT.md](../../CONTEXT.md) · [ADR-0001](../../docs/adr/0001-rendelesi-tetel-snapshot.md)

Ez a dokumentum a **hogyan**: architekturális döntések, sorrend, érintett modulok, tesztelési stratégia. A **mit** és a **miért** a requirements.md-ben van.

## Architekturális döntések

### Mely rétegeket érintjük

Mind a négyet, de erősen aszimmetrikusan:

| Réteg | Mértéke | Mi történik |
| --- | --- | --- |
| Adat (lowdb) | közepes | Három új mező, plusz egy betöltés utáni normalizáló lépés |
| Üzleti logika | közepes | Közös validáció, közös katalógus-lekérdezés, utolsó-admin invariáns |
| API | nagy | Új, védett `/api/admin` névtér; a meglévő végpontok viselkedése alig változik |
| Frontend | nagy | Két új oldal, egy útvonal-őr, navigáció, és a rendelésmegjelenítés igazítása |

Nincs adatbázis-migráció a szó klasszikus értelmében: a lowdb sémátlan, ezért a "migráció" egy induláskor futó normalizáló függvény.

### Minták és indoklás

**Külön admin névtér, router-szintű őrzéssel — nem végpontonkénti ellenőrzés.**
Az `/api/admin` router tetején egyetlen `requireAdmin` áll. Az alternatíva (a meglévő `/api/products` bővítése írási metódusokkal, végpontonkénti őrrel) RESTesebb lenne, de minden új végpontnál újra el lehet felejteni az őrt — egy kihagyás csendes biztonsági rés. A router-szintű bekötésnél a védelem az alapértelmezés, nem a fejlesztő figyelmén múlik.

**Egyetlen közös katalógus-lekérdezés, elágazás nélkül.**
Az "aktív termékek" fogalma egy helyen valósul meg, és a vásárlói lista, az egyedi lekérdezés és a megrendelés-ellenőrzés is erre épül. A tudatosan elkerült minta: `if (admin) { mindent } else { csak aktívat }` a megosztott végpontokban. Az elágazás minden hívási helyen újra hibázható; a külön útvonal nem.

**Snapshot, nem verziózás.**
A rendelési tétel lemásolja a leadáskori nevet és egységárat. A termékverziózás teljesebb lenne, de a lowdb-alapú, szándékosan egyszerű tárolóhoz mérten aránytalan. Részletes indoklás: ADR-0001.

**Normalizálás tiszta függvényként, nem a betöltés belsejébe szőve.**
Adatszerkezet be, normalizált adatszerkezet ki, `db` és fájlrendszer nélkül. Ez teszi HTTP-mentesen tesztelhetővé a feature legkockázatosabb pontját. A betöltés csak meghívja, és eldönti, kell-e írni.

**Expand–contract nem indokolt.**
A `role` és az `active` kötelezővé tétele elsőre wide refactornak látszik, de a blast radius kicsi: `User` néhány helyen keletkezik (regisztráció, seed, tesztek), `Product` gyakorlatilag csak a seedben. Egyetlen ticket zölden landolhat, nincs szükség átmeneti kettős formára.

**Két típusdefiníció, kézi szinkronban.**
A projekt tudatosan nem használ közös csomagot: a `Product`/`Order`/`User` alak a szerveren és a kliensen külön él. Ezt nem változtatjuk meg most — de minden mezőbővítésnél mindkét oldalt módosítani kell, és a fordító **nem** jelzi, ha az egyik lemarad.

### Interfészek a komponensek között

**Kliens → szerver:** REST, `/api/...`, session Bearer tokennel. Az admin felület a `/api/admin/*` végpontokat hívja; a hibák a meglévő konvenciót követik (HTTP-státusz + `{ error: "magyar üzenet" }`).

**Hitelesítés → jogosultság:** a `requireAdmin` a `requireAuth` **után** fut, és annak eredményére épül — előbb 401 (ki vagy?), utána 403 (szabad-e?). Nem duplikálja a token-feloldást.

A szerepkör **minden kérésnél frissen olvasódik** az adatbázisból (a `requireAuth` a tokenhez tartozó felhasználót a `db`-ből keresi ki), tehát egy szerepkör-változás azonnal érvényes a szerveren. Ez teszi ártalmatlanná a kliensoldali másolat elavulását: a felület tévedhet, a szerver nem.

**Megrendelés → ár-egyeztetés:** a `POST /api/orders` body-ja egy **opcionális** `expectedTotal` mezőt fogad. Ha jelen van és eltér a szerver által a DB-árakból számolt összegtől, a rendelés elutasításra kerül. Ha hiányzik, a jelenlegi viselkedés marad érvényben. Az opcionalitás szándékos: a szerződés visszafelé kompatibilis, a meglévő rendelés-tesztek változatlanul futnak. A kliens mindig küldi.

**Végpont → üzleti logika:** a route-kezelők validálnak, majd egy közös validációs és egy közös katalógus-modult hívnak. A szabályok nem a route-kezelőkben élnek, hogy a regisztráció és az admin szerkesztés ugyanazt a szabályt lássa.

**Teljes csere vs. részművelet:** a termék `PUT`-ja teljes csere, ezért minden mezőt újravalidál. Az aktivitás váltása viszont **külön végpontot** kap (`PATCH /:id/active`), mert különben egy régebbi, a mai validációnak már nem megfelelő termék (túl hosszú név, nem http(s) kép) nem lenne elrejthető a vásárlók elől anélkül, hogy előbb ki ne javítanánk egy hozzá nem tartozó mezőt. Épp az elrejtés az a művelet, amire hibás adatnál a leginkább szükség van.

**Kliens belső:** az útvonal-őr a meglévő auth contextből olvas. Nem indít saját hálózati hívást; a szerepkör a bejelentkezett felhasználó adatai között érkezik.

## Az implementáció sorrendje

A sorrend a ticketek függőségi gráfját követi ([tasks.md](tasks.md)).

1. **Szerepkör, aktivitás, normalizálás, seed admin** (01) — ez teremti meg a fogalmakat, amikre minden más hivatkozik, és ez teszi belépésre késszé az admin fiókot. Azért kell elsőnek lennie, mert nélküle nincs mit őrizni és nincs kivel tesztelni. Egyben ez a legkockázatosabb lépés: rossz normalizálás mellett a bolt némán üres terméklistával indul — a tesztjét érdemes a kód előtt megírni.

2. **Rendelési tétel snapshot** (02) — függetlenül indítható a 01-től, akár párhuzamosan. A sorrendben azért van elöl, mert a 04 hozza az első valódi átárazást és törlést: ha addigra a snapshot nincs kész, az első admin-művelet visszamenőleg elrontja a meglévő rendeléseket.

3. **Admin belépő: őr, névtér, terméklista, kliens guard** (03) — a 01-re épül (kell hozzá a szerepkör és egy admin fiók). Ez az első demózható szelet, és ez teremti meg azt a védett felületet, amelybe a 04, 05 és 07 beköt.

4. **Termék CRUD és validáció** (04) — a 03-ra épül (kell a védett felület) és a 02-re (a végleges törlés csak snapshot mellett biztonságos).

5. **Keresés, szűrés, lapozás** (05) — a 03-ra épül. A 04-től független, párhuzamosítható vele, mert nem a szerkesztést, hanem a listát bővíti.

6. **Inaktív termék a vásárlói felületen** (06) — csak a 01-től függ, mert a tesztek közvetlenül beállíthatják az állapotot. Kézi demózáshoz kényelmesebb a 04 után, amikor a felületen is át lehet kapcsolni egy terméket.

7. **Felhasználók megtekintése és szerkesztése** (07) — a 03-ra épül. Itt áll át a regisztráció a közös validációra; ez az egyetlen pont, ahol meglévő, működő végponthoz nyúlunk, ezért regressziós teszt kell rá.

8. **Felhasználó törlése és utolsó-admin védelem** (08) — a 07-re épül, mert ugyanazon a felületen és végponton dolgozik.

## Érintett fájlok és modulok

> A fájlnevek javaslatok; ha az implementáció közben jobb elhelyezés adódik, az elv számít, nem a konkrét útvonal.

### Új fájlok — szerver

- `server/src/routes/admin/index.ts` — az admin router, itt és csak itt van bekötve a `requireAdmin`. Azért külön router, hogy az őrzés ne végpontonként múljon a figyelmen.
- `server/src/routes/admin/products.ts` — termék CRUD. Külön fájl, mert a vásárlói `routes/products.ts` más nézetet szolgál ki (csak aktív, csak olvasás), és a kettő összeolvasztása hozná vissza a kerülendő `if (admin)` elágazást.
- `server/src/routes/admin/users.ts` — felhasználók olvasása, módosítása, törlése. Itt él az utolsó-admin invariáns.
- `server/src/validation.ts` — termék- és felhasználóvalidáció. Azért új, közös modul, mert két hívó van (regisztráció és admin szerkesztés), és duplikálva garantáltan elcsúsznának.
- `server/src/catalog.ts` — az "aktív termékek" fogalma és a közös szűrő/lapozó logika. Azért új modul, mert három hívója lesz (vásárlói lista, egyedi lekérdezés, megrendelés), és a szabálynak egyetlen helyen kell élnie.
- `server/src/normalize.ts` — a betöltés utáni normalizálás tiszta függvényként. Azért nem a `db.ts`-be kerül, hogy `db` és fájlrendszer nélkül tesztelhető legyen.
- `server/src/password.ts` — jelszóhash, jelszó-ellenőrzés és token-generálás, **a `db` importja nélkül**. Ez a fájl a terv első változatában nem szerepelt, és az implementáció közben derült ki, hogy szükség van rá: a `normalize.ts`-nek kell jelszóhash a seed adminhoz, de ha azt az `auth.ts`-ből venné, körkörös import keletkezne (`db` → `normalize` → `auth` → `db`), ami a `db.ts` top-level `await`-jével holtpontra fut. Az `auth.ts` innen veszi és újra exportálja a három függvényt, így egyetlen meglévő hívó sem változik.

### Új fájlok — kliens

- `client/src/RequireAdmin.tsx` — útvonal-őr; nem-admin esetén a főoldalra irányít.
- `client/src/pages/AdminProducts.tsx` — termékkezelő oldal (lista, szűrők, szerkesztő űrlap).
- `client/src/pages/AdminUsers.tsx` — "Ügyfelek" oldal. A felirat magyar, a modell `User` — lásd CONTEXT.md.

### Új fájlok — tesztek

- `server/test/normalize.test.ts` — hiányzó mezők kitöltése, admin beszúrása, idempotencia. Az egyetlen nem-HTTP seam.
- `server/test/admin-products.test.ts` — hozzáférés-vezérlés, CRUD, validációs határesetek, szűrés.
- `server/test/admin-users.test.ts` — hozzáférés-vezérlés, szerkesztés, egyediség szerkesztéskor, utolsó-admin védelem.

### Módosított fájlok — szerver

- `server/src/types.ts` — `User.role`, `Product.active`, `OrderItem` snapshot mezői. Minden más módosítás innen indul.
- `server/src/db.ts` — seed admin, és a normalizálás behívása betöltés után. A fájl **már tartalmaz** egy ad-hoc normalizálást (a hiányzó `users` kulcs pótlását); ez beolvad az új normalizáló modulba, ne maradjon két párhuzamos mechanizmus.
- `server/src/auth.ts` — új `requireAdmin` middleware a meglévő `requireAuth` mellé, arra épülve.
- `server/src/routes/auth.ts` — a regisztráció customer szerepkört ad és a közös validációra áll át; a publikus felhasználóadatok kiegészülnek a szerepkörrel.
- `server/src/routes/products.ts` — a lista, az egyedi lekérdezés és a kategórialista a közös katalógus-modulra áll át, feltétel nélkül csak aktív termékekkel.
- `server/src/routes/orders.ts` — a tételek snapshotot kapnak; a termékfeloldás a közös katalógus-modulon át megy, így az inaktív tétel a meglévő ágon akad el (a hibaüzenet szövege pontosítandó, terméknévvel). Itt valósul meg az `expectedTotal` egyeztetése is.
- `server/src/email.ts` — **a tervben eredetileg hiányzott.** A rendelési e-mail tételsorai jelenleg az élő termékadatból oldják fel a neveket; a snapshot bevezetése után a rendelésen tárolt névből kell dolgozniuk, különben ugyanarról a rendelésről két különböző igazság keletkezik (a lista a befagyasztott nevet mutatja, az e-mail az aktuálisat).
- `server/src/index.ts` — az admin router bekötése.

### Módosított fájlok — kliens

- `client/src/api.ts` — a típusok igazítása a szerverhez, plusz az admin végpontok hívófüggvényei.
- `client/src/App.tsx` — a két új útvonal az őrbe csomagolva, és az admin menüpontok szerepkör szerinti megjelenítése.
- `client/src/pages/Orders.tsx` — a rendelési tételek a snapshotból jelennek meg; snapshot hiányában a termékből, **törölt vagy inaktivált** terméknél semleges helyettesítő szövegből. Fontos: a névfeloldás a vásárlói terméklistából dolgozik, amely a feature után az inaktív termékeket sem adja vissza — a fallback tehát nem csak a törlésre kell.
- `client/src/pages/Checkout.tsx` — a megrendeléssel együtt elküldi a képernyőn jóváhagyott végösszeget, és megjeleníti az eltérés miatti hibaüzenetet.

### Módosított fájlok — teszt és dokumentáció

- `server/test/helpers.ts` — **a tervben eredetileg hiányzott.** A teszt-app kézzel sorolja fel a routereket (szándékosan nem az `index.ts`-t importálja), ezért az admin routert külön be kell kötni. Enélkül minden admin teszt 404-en bukik, nem nyilvánvaló okkal.
- `server/test/products.test.ts` — kiegészül az inaktív termék láthatósági eseteivel.
- `server/test/orders.test.ts` — kiegészül a snapshot-regresszióval (átnevezés és átárazás után a rendelés változatlan) és az inaktív tétel elutasításával.
- `server/test/auth-routes.test.ts` — a regisztráció továbbra is működik és customer szerepkört ad.
- `README.md` — a seed admin belépési adatai, fejlesztői adatként megjelölve.

## Tesztelési stratégia

**Mi számít jó tesztnek.** Csak a külső, megfigyelhető viselkedést teszteljük: a HTTP-kérésre adott státuszt és választörzset. Nem tesztelünk belső függvényhívást, middleware-sorrendet vagy adatszerkezetet, hogy a tesztek egy átszervezést túléljenek. A tesztnevek és az elvárt hibaüzenetek magyarul, a projekt konvenciója szerint.

**A seam: a HTTP-végpont.** A meglévő `startServer()` teszthelper (`server/test/helpers.ts`) valódi szervert indít, és `fetch`-csel hívjuk — ez a lehető legmagasabb seam, és már létezik, nem kell újat bevezetni. Prior art: `server/test/products.test.ts`, `orders.test.ts`, `auth-routes.test.ts`. Az izolációs minta is átvehető: `db.data` pillanatkép a teszt elején, `db.write` mockolva, visszaállítás a végén — így a tesztek nem írnak a valódi adatfájlba.

**Egy kivétel, ami új seamet indokol:** a normalizálás tiszta függvényként tesztelhető, mert a szerver indulása *előtt* fut le, tehát HTTP-n át nem érhető el. Ez a feature legkockázatosabb pontja, ezért kap közvetlen tesztet.

**Amit nem fedünk le automatával.** A kliensoldali útvonal-őrt és a képméret-ellenőrzést nem teszteljük: a Vitest `node` környezetben fut, DOM nélkül, és a komponens-teszt infrastruktúra bevezetése új függőségeket igényelne, amit a projekt szabályai kizárnak. Ezek kézi ellenőrzéssel igazolandók — a hozzáférés-vezérlés érdemi bizonyítéka amúgy is a szerveroldali teszt.

**A regressziós fókusz.** Két pont érdemel kiemelt figyelmet, mert meglévő, működő viselkedéshez nyúlunk: a rendelési snapshot (átnevezés és átárazás után a régi rendelés változatlan) és a regisztráció átállítása a közös validációra.

## Eldöntött elvek

Ezek a döntések már beépültek a lépésekbe, de az indoklásuk itt marad, mert a kódból nem lenne látható:

- **A tárolt végösszeg az igazság.** A megjelenítés soha ne számoljon újra összeget a tételsorokból. A snapshot nélküli régi rendeléseknél a kettő eltérhet, és egy oldalon két különböző szám a legrosszabb kimenet.
- **Az utolsó-admin ellenőrzés atomi.** Az ellenőrzés és a `db.data` módosítása egyetlen, megszakítás nélküli szinkron blokkban fut; `await` csak utána következik (a kiírás). A Node egy szálon fut, de az `await` ponton befutó másik kérés különben nullára vihetné az adminok számát — épp azt az invariánst sértve, amit a követelmény sérthetetlennek nevez.
- **Az ár-egyeztetés opcionális mezővel történik.** Így a szerződés visszafelé kompatibilis, és a meglévő rendelés-tesztek nem törnek el.

## Ismert korlátok

Vállalt, dokumentált korlátok — nem hiányosságok, hanem tudatos határok:

- **Az utolsó admin kizárhatja magát.** A védelem a *szerepkör* megszűnése ellen véd, nem a fiók elérhetetlenné válása ellen: a felhasználónév elrontásával (a bejelentkezés azzal történik, és nincs jelszó-visszaállítás) az admin használhatatlanná teheti a saját fiókját. A helyreállítás az adatbázis kézi szerkesztése vagy törlése.
- **Egyidejű szerkesztés: az utolsó mentés nyer.** Nincs zárolás, nincs verziómező, nincs ütközésjelzés — kivéve az adminok számára vonatkozó invariánst.
- **A böngészőben tárolt adat elavulhat.** A kosár teljes termékmásolatokat őriz (ezekben az `active` mező sosem lesz jelen, mert a régi bejegyzések a mező bevezetése előtt keletkeztek), a szerepkör-másolat pedig a következő munkamenet-ellenőrzésig elavult maradhat. A szerveroldali ellenőrzés minden esetben lefogja ezt; kliensoldali normalizálás nem készül.
- **Nincs komponens-teszt infrastruktúra.** A Vitest `node` környezetben fut, DOM nélkül; az útvonal-őr és a képméret-ellenőrzés automata teszttel nem fedhető le új függőségek nélkül, amit a projekt szabályai kizárnak. Kézi ellenőrzés marad — a hozzáférés-vezérlés érdemi bizonyítéka amúgy is a szerveroldali teszt.

## Nyitott kérdések

- **Az űrlapállapot megőrzése hibás mentéskor.** A követelmény megköveteli, hogy a hibaüzenet ne dobja el a beírt adatokat, de a projektben nincs bevett űrlapkezelési minta, amit követni lehetne. _Javaslat:_ a szerkesztő komponens saját állapotában tartsa az űrlapot, és a szerverhibát csak megjelenítse — ne írja felül belőle az állapotot. Ha ez a két admin oldalon eltérően sülne el, érdemes utólag egységesíteni.

- **A seed termékek száma.** A seed nyolc terméket definiál, a fejlesztői adatbázisban tizenhat van. A normalizálás egyiket sem érinti (csak a hiányzó mezőket pótolja), de érdemes tudni, hogy friss telepítésnél nyolc termékkel indul a bolt — a kézi teszteléskor ez meglepő lehet.
