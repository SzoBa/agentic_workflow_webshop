# Webshop backend — követelmények

Ez a dokumentum a webshop **szerveroldali** viselkedését írja le olyan részletességgel, hogy
belőle a backend bármilyen programnyelven és keretrendszerben újraépíthető legyen. Nem tartalmaz
Express-, Node- vagy Spring-specifikus fogalmakat: HTTP-szerződésről, üzleti szabályokról és
invariánsokról szól.

- **Végpont-referencia:** [`vegpontok.md`](./vegpontok.md)
- **Hibaüzenetek:** [`hibakatalogus.md`](./hibakatalogus.md)
- **Elfogadási esetek:** [`konformancia.md`](./konformancia.md)
- **Megvalósítási terv:** [`plan.md`](./plan.md) · **Feladatlista:** [`tasks.md`](./tasks.md)
- **Fogalomtár:** [`../../CONTEXT.md`](../../CONTEXT.md) — a szóhasználat mérvadó forrása

---

## 0. Hogyan olvasd

### Jelölések

A dokumentum a backend **szerződését** írja le. A szabályok jelölést viselnek:

| Jelölés | Jelentés |
|---|---|
| `MA IS` | A futó rendszer így működik — követelmény. |
| `ÚJ` | Egy változtatási kör hozza; a rendszer **még nem** így működik. |
| `FORRÁS` | A **régi**, séma nélküli JSON-tároló sajátossága. Nem futásidejű követelmény. |

> **Jelenleg egyetlen `ÚJ` jelölés sincs**: minden leírt szabály a futó rendszert írja le.
> A jelölés a következő változtatási körben lesz újra hasznos.
>
> A `FORRÁS` jelölések viszont **élnek**. A backend eredetileg Node/Express + lowdb volt, és
> egy régi `db.json` átvehető ([`DbJsonImporter`](../../server-java/src/main/java/hu/webshop/bootstrap/DbJsonImporter.java));
> importáláskor ezek a szabályok érvényesek. Relációs sémán futásidőben elő sem állhatnak.
> Az átállásról: [ADR-0006](../../docs/adr/0006-atvaltas-a-java-backendre.md).

Jelölés nélküli mondat leíró jellegű (kontextus, indoklás), nem követelmény.
A döntések hátterét lásd: [ADR-0002](../../docs/adr/0002-ketretegu-backend-spec.md).

### Mi normatív

**Kötelező:** HTTP metódus és útvonal, státuszkódok, a kérés- és választest **mezőnevei és
típusai**, a mezők jelenléte/hiánya, az üzleti szabályok és invariánsok, valamint az
üzemeltetési viselkedés (7. fejezet).

**Nem kötelező:** a hibaüzenetek szó szerinti szövege — tartalmi követelmény, hogy magyar
nyelvű, a felhasználónak megmutatható, és megnevezi a hiba okát. A jelenlegi szövegek teljes
katalógusa a [`hibakatalogus.md`](./hibakatalogus.md)-ben; szó szerinti átvételük ajánlott (így a
válaszok bájtra egyeznek a referenciaimplementációval), de átfogalmazásuk nem specsértés.

**Nem tárgya a dokumentumnak:** a frontend. A kliens csak **kényszerforrásként** jelenik meg:
ahol egy mezőre vagy státuszkódra épít, ott az bekerült a kötelező szerződésbe.

---

## 1. A rendszer egy mondatban

Magyar nyelvű webáruház REST API-ja: a látogatók böngészik a termékeket, a regisztrált
felhasználók rendelnek és értékelnek, az adminok pedig a termékeket, a felhasználókat, a
rendelések teljesítését és az értékelések moderálását kezelik.

**Szereplők**

| Szereplő | Ki ez | Mit tehet |
|---|---|---|
| Látogató | Nincs bejelentkezve | Katalógus böngészése, termékadatok és jóváhagyott értékelések olvasása |
| Customer | Bejelentkezett felhasználó | Mindaz, amit a látogató + rendelés leadása, saját rendelések listázása, értékelés beküldése |
| Admin | `admin` szerepkörű felhasználó | Mindaz, amit a customer + termék-, felhasználó-, rendelés- és moderációkezelés |

`MA IS` Fiók **kizárólag regisztrációval** keletkezik; nincs végpont felhasználó létrehozására,
és a jelszó adminisztrátori úton nem módosítható.

---

## 2. Adatmodell (logikai)

Az alábbi mezőnevek a **HTTP-szerződés** részei. A tárolás módja szabad; a megfigyelhető
következmények (azonosító-formátum, sorrend, egyediség) kötelezők — lásd
[ADR-0004](../../docs/adr/0004-java-spring-postgres-migracio.md).

### Termék

| Mező | Típus | Szabály |
|---|---|---|
| `id` | szöveg | `MA IS` Egyedi, stabil. Seed termékeknél `p1`…`p8`, újaknál UUID. |
| `name` | szöveg | `MA IS` Kötelező, legfeljebb 50 karakter, trimmelve tárolva. |
| `description` | szöveg | `MA IS` Kötelező, legfeljebb 100 karakter, trimmelve tárolva. |
| `price` | egész | `MA IS` Forint, egész, **szigorúan nagyobb, mint 0**. Tizedes nincs. |
| `imageUrl` | szöveg | `MA IS` Kötelező, érvényes `http` vagy `https` URL. A szerver nem tölti le. |
| `stock` | egész | `MA IS` Nem negatív egész. A **fizikai** raktárkészlet. |
| `category` | szöveg | `MA IS` Kötelező, trimmelve tárolva. Szabad szöveg, nincs külön kategória-erőforrás. |
| `active` | logikai | `MA IS` Hamis érték esetén a termék a vásárlói felület számára **nem létezik**. |

**Számolt mezők a vásárlói válaszokban** (nem tárolt adatok):

| Mező | Típus | Szabály |
|---|---|---|
| `ratingAvg` | szám | `MA IS` A jóváhagyott értékelések átlaga egy tizedesre kerekítve; értékelés nélkül `0`. |
| `ratingCount` | egész | `MA IS` A jóváhagyott értékelések száma; értékelés nélkül `0`. |
| `available` | egész | `MA IS` `stock` − érvényes foglalások. Sosem negatív. |

### Rendelés

| Mező | Típus | Szabály |
|---|---|---|
| `id` | szöveg | `MA IS` Egyedi, a szerver generálja. |
| `items` | lista | `MA IS` Legalább egy tétel. |
| `customer` | objektum | `MA IS` `name`, `email`, `address` — a leadáskori **vevői adatok másolata**, nem a fiók. |
| `total` | egész | `MA IS` Forint. **Mindig a szerver számolja** a saját áraiból. |
| `createdAt` | ISO időbélyeg | `MA IS` A leadás pillanata. |
| `userId` | szöveg | `MA IS` A leadó felhasználó azonosítója. |
| `status` | felsorolás | `MA IS` `pending` \| `delivered` · `MA IS` `expired` |
| `reservedUntil` | ISO időbélyeg | `MA IS` Számolt; **csak `pending` státusznál** van jelen. |

**Rendelési tétel** (`items[]`): `productId`, `quantity`, továbbá `name` és `unitPrice` — ez a
kettő a **leadáskori termékmásolat**. `MA IS` Mindkettő opcionális, mert a snapshot bevezetése
előtti rendeléseken nincs jelen; lásd
[ADR-0001](../../docs/adr/0001-rendelesi-tetel-snapshot.md).

### Felhasználó

| Mező | Típus | Szabály |
|---|---|---|
| `id` | szöveg | `MA IS` Egyedi, a szerver generálja. |
| `username` | szöveg | `MA IS` 8–50 karakter. Egyedi, **kis/nagybetűtől függetlenül**. |
| `email` | szöveg | `MA IS` Érvényes formátum. Egyedi, kis/nagybetűtől függetlenül. |
| `address` | szöveg | `MA IS` Kötelező, nem üres. |
| `role` | felsorolás | `MA IS` `customer` \| `admin`. Regisztrációkor mindig `customer`. |
| `createdAt` | ISO időbélyeg | `MA IS` |

`MA IS` A jelszó **soha** nem tárolódik nyersen: sózott, kulcsleszármaztatott hash formájában
igen. A jelszóhash, a só és a munkamenet-token **semmilyen válaszban nem jelenhet meg**.

**Publikus felhasználó** (bejelentkezési és profil-válaszokban): `id`, `username`, `email`,
`address`, `role`. **Admin nézet** (felhasználólistában): ugyanez + `createdAt`.

### Értékelés

| Mező | Típus | Szabály |
|---|---|---|
| `id` | szöveg | `MA IS` Egyedi, a szerver generálja. |
| `productId` | szöveg | `MA IS` |
| `author` | szöveg | `MA IS` A beküldő felhasználó azonosítója. **Mindig a tokenből**, sosem a kérés törzséből. |
| `rating` | egész | `MA IS` 1 és 5 közötti egész. |
| `body` | szöveg | `MA IS` Opcionális, legfeljebb 500 karakter. Üres/whitespace érték esetén a mező **hiányzik**. |
| `status` | felsorolás | `MA IS` `pending` \| `approved` \| `rejected` \| `removed`. Alapérték: `pending`. |
| `createdAt` | ISO időbélyeg | `MA IS` |
| `updatedAt` | ISO időbélyeg | `MA IS` Kizárólag a moderációs státuszváltást jelöli (a tartalom nem módosítható). |

`MA IS` A **publikus** értékelés-válaszokból az `author` mező **hiányzik** — a listát
bejelentkezés nélkül bárki olvashatja, és a belső felhasználó-azonosítók nem szivároghatnak ki.
A beküldés válasza a beküldőnek a teljes rekordot adja vissza.

---

## 3. Katalógus

### 3.1 Láthatóság

- `MA IS` A vásárlói oldal **minden** termékolvasása kizárólag az **aktív** termékeken dolgozik:
  listázás, egy termék lekérése, értékeléslista, és a rendelés termékfeloldása is.
- `MA IS` Az inaktív termék ugyanazt a **404**-et kapja, mint a nem létező: a válaszból az sem
  derülhet ki, hogy létezik-e.
- `MA IS` Az **elfogyott** (`available = 0`) termék ettől független: **listázódik és megnyitható**,
  csak megrendelni nem lehet. Az aktivitás és a készlet két külön fogalom.

### 3.2 Szűrés és lapozás

`MA IS` A vásárlói terméklista opcionális szűrői:

| Paraméter | Viselkedés |
|---|---|
| `category` | Pontos egyezés, a paraméter és az érték is trimmelve. Üres/whitespace érték esetén nincs szűrés. |
| `minPrice` / `maxPrice` | Inkluzív határok. Nem szám esetén az adott szempont kimarad. |
| `search` | Kis/nagybetűre **érzéketlen** részszöveg-keresés a **névben vagy a leírásban**. |
| `inStock` | `MA IS` Csak a `"true"` érték szűr. `MA IS` A szűrés `available > 0` alapon történik (korábban `stock > 0`). |

`MA IS` Lapozás: `page` (alap 1), `pageSize` (**vásárlói** alapérték 12, **admin** alapérték 25),
felső korlát **100**, alsó korlát 1. A `page` értéke 1 és `totalPages` közé **vágódik** — az
utolsó oldal utolsó elemének törlése után sem lehet üres oldalon ragadni. `totalPages` üres
találathalmaznál is legalább 1.

`MA IS` A válasz `categories` mezője a **szűretlen** halmaz kategórialistája, hogy a szűrő
oldalsáv teljes maradjon: vásárlói oldalon az **aktív** termékekből, admin oldalon a **teljes**
katalógusból (az inaktívakét is beleértve).

`MA IS` Az admin lista `status` paramétere (`active` \| `inactive` \| `all`) szűr aktivitásra;
ismeretlen érték esetén `all` — egy elgépelt query nem rejtheti el némán a termékek felét.

### 3.3 Értékelési aggregátumok

- `MA IS` A vásárlói termékválaszok tartalmazzák a `ratingAvg` és `ratingCount` mezőket.
- `MA IS` Csak a **jóváhagyott** (`approved`) értékelések számítanak bele.
- `MA IS` Az átlag nem tárolt adat, hanem lekérdezéskor számolt, egy tizedesre kerekítve.
- `MA IS` A listázásnál az aggregátumok **csak a megjelenített oldalra** számolódnak.
- `MA IS` Az admin terméklista **nem** tartalmaz értékelési aggregátumokat — helyettük a
  foglalási adatokat hordozza (`reserved`, `available`), mert a szerkesztő felületnek arra van
  szüksége.

---

## 4. Rendelés

### 4.1 Kosár

`MA IS` A kosár **kizárólag a kliensen** él; a szerver nem tud róla, és nincs kosár-erőforrás.
Ebből következik, hogy a kosár tartalma elavulhat a katalógushoz képest.

### 4.2 Leadás

A rendelés leadása bejelentkezést igényel. Sorrendben:

1. `MA IS` **Alapvalidáció** — a tétellista nem üres, és a vevői adatok (`name`, `email`,
   `address`) mindegyike ki van töltve. Hiba → **400**.
2. `MA IS` **Termékfeloldás** az **aktív** halmazon. Ismeretlen vagy időközben inaktivált termék
   → **400**, és a hibaüzenet a termék **nevét** nevezi meg, nem a belső azonosítót. A név
   forrása fontossági sorrendben: a teljes katalógus, majd a kérésben érkező név, végül egy
   semleges helyettesítő szöveg. Nyers azonosító sosem szivárog ki.
3. `MA IS` **Mennyiség** — egészre csonkítva legalább 1. Hiba → **400**.
4. `MA IS` **Készletfedezet** — lásd 5. fejezet. Fedezethiány → **409**.
5. `MA IS` **Végösszeg** — a szerver **mindig a saját áraiból** számol; a kliens által küldött
   árat sosem fogadja el.
6. `MA IS` **Ár-egyeztetés** — az `expectedTotal` mező **kötelező**. Hiányzó vagy nem szám érték →
   **400**. A szerver által számolt összegtől való eltérés → **409**.
   `FORRÁS` Ma a mező opcionális, és hiányában az egyeztetés némán kimarad; eltérés esetén 400.
7. `MA IS` **Rögzítés** — a tételek megőrzik a leadáskori nevet és egységárat (snapshot).
   Az új rendelés státusza mindig `pending`. Válasz: **201**, a teljes rendelés.
8. `MA IS` **Értesítés** — a rendelés rögzítése után értesítés indul az üzemeltetőnek (7.4).
   Ennek **bármilyen hibája** csak naplóba kerül: a vevő válasza változatlan.

### 4.3 Lekérdezés és teljesítés

- `MA IS` A felhasználó **kizárólag a saját** rendeléseit listázhatja; mások rendelése (név,
  e-mail, cím) nem érhető el.
- `MA IS` A teljesítési státuszt **csak admin** állíthatja.
- `MA IS` `delivered`-re váltáskor a szerver **ellenőrzi a fizikai készletet**, és ténylegesen
  **levonja** a tételek mennyiségét. Fedezethiány → **409**, a státusz nem változik.
- `MA IS` Érvényes átmenetek: `pending → expired` (automatikus), `pending → delivered`,
  `expired → delivered`. A `delivered` **végállapot**: onnan más státuszra váltani **409**-et ad,
  mert a készlet már levonódott, és a visszalépés vagy kétszeres levonáshoz, vagy néma
  készlet-visszaíráshoz vezetne. A `delivered → delivered` váltás idempotens.
- `MA IS` A rendelés **tartalma** a leadás után nem változik — sem a termék módosítása, sem a
  leadó felhasználó törlése nem hat rá.

---

## 5. Készlet és foglalás `MA IS`

A fejezet egésze új; háttér: [ADR-0005](../../docs/adr/0005-keszletfoglalas-es-lejart-rendeles.md).
`FORRÁS` A jelenlegi backend a készletet nem csökkenti, ezért a túlértékesítés lehetséges.

### 5.1 Fogalmak

| Fogalom | Meghatározás |
|---|---|
| **Készlet** (`stock`) | A fizikailag raktáron lévő darabszám. Csak az admin szerkeszti, illetve a kiszállítás csökkenti. |
| **Foglalás** | Számolt érték: a `pending` státuszú, **le nem járt** rendelések adott termékre vonatkozó mennyiségeinek összege. Nem tárolt adat. |
| **Elérhető** (`available`) | `stock − foglalás`, sosem negatív. Ezt látja a vásárló. |

A `expired` és a `delivered` rendelések **nem** foglalnak: az előbbi lejárt, az utóbbi már
levonódott a készletből.

### 5.2 Szabályok

- **Mind-vagy-semmi:** ha a rendelés **bármelyik** tételére nincs elég elérhető mennyiség, a
  teljes rendelés elutasul **409**-cel. Részleges teljesítés nincs.
- A hibaüzenet megnevezi a **terméket** és az **elérhető darabszámot**, hogy a vevő tudjon dönteni.
- Az ellenőrzés és a rendelés létrehozása **atomi** kell legyen (6. fejezet).
- A leadás a `stock` mezőt **nem** írja át.
- A `delivered`-re váltás a `stock`-ot csökkenti; ez a foglalás „véglegesítése".
- Készlet-visszavezetés **nincs**: rendelés-visszavonás nem létezik, a korrekció az admin
  termékszerkesztésén keresztül történik.
- A bevezetés előtt leadott rendelések **visszamenőleg nem korrigálják** a készletet: a váltás
  pillanatában érvényes `stock` értékek számítanak igazságnak.

### 5.3 Lejárat

- A foglalás a rendelés létrehozásától számított **`ORDER_RESERVATION_HOURS`** (alapérték **72**)
  elteltével jár le.
- A lejárt rendelés státusza `expired` lesz. Ez **tárolt** állapot, amit egy **periodikus
  ütemező** ír be; a foglalás-számítás a **státuszra** épül.
- A `expired` **nem végállapot**: az admin `delivered`-re állíthatja, ha a fizikai készlet
  fedezi.
- A `pending` rendelések válasza tartalmaz egy **számolt `reservedUntil`** ISO időbélyeget
  (`createdAt` + a hatályos lejárati idő). Nem tárolt mező: a konfiguráció módosítása azonnal
  érvényesül a már leadott rendelésekre is.

---

## 6. Invariánsok és atomicitás

Az alábbiak a rendszer sérthetetlen szabályai. Mindegyiknél az **ellenőrzésnek és a
módosításnak a versenytárs kérésekhez képest atominak kell lennie** — a megvalósítás módja
(tranzakció, zárolás, egyedi megszorítás) az implementációra tartozik. Háttér:
[ADR-0003](../../docs/adr/0003-invariansok-atomicitasa.md).

| # | Invariáns | Megjegyzés |
|---|---|---|
| I-1 | `MA IS` A felhasználónév egyedi, kis/nagybetűtől függetlenül. | `MA IS` A regisztrációs ág atomicitása (ma a jelszóhash számítása megszakítja). |
| I-2 | `MA IS` Az e-mail cím egyedi, kis/nagybetűtől függetlenül. | Ugyanaz. |
| I-3 | `MA IS` **Mindig van legalább egy admin.** Az utolsó admin nem törölhető, és a szerepköre nem vehető el. | Hiba esetén 400. |
| I-4 | `MA IS` Egy felhasználó egy terméket **legfeljebb egyszer** értékelhet — a `rejected` és `removed` értékelés is számít. | Enélkül a moderáció megkerülhető lenne. |
| I-5 | `MA IS` A készlet nem mehet negatívba, és két egyidejű rendelés nem foglalhatja le ugyanazt a darabot. | Az 5.2 ellenőrzése és a létrehozás egy egységben. |
| I-6 | `MA IS` Egy felhasználóhoz **egy** érvényes munkamenet-token tartozik; új bejelentkezés érvényteleníti a korábbit. | |
| I-7 | `MA IS` A publikusan látható értékelés kizárólag `approved` státuszú. | Ez a szabály egyetlen helyen éljen. |

---

## 7. Hitelesítés és üzemeltetés

### 7.1 Munkamenet

- `MA IS` Bejelentkezéskor a szerver **kriptográfiailag véletlen** tokent állít elő; a kliens
  ezt `Authorization: Bearer <token>` fejlécben küldi vissza.
- `MA IS` A tárolóba a tokennek **csak a lenyomata** kerül (gyors kriptográfiai hash), a nyers
  token kizárólag a kiadó válaszban szerepel. A token bemutatóra szóló hitelesítő adat: nyersen
  tárolva egy adatbázis-olvasás minden belépett felhasználó megszemélyesítését jelentené —
  ugyanaz a kockázat, ami miatt a jelszót sem tároljuk. A hash **nem** jelszóhash: a token
  véletlen 32 bájt, nincs mit szótárazni, viszont minden hitelesített kérés feloldana egyet.
  Döntési háttér: [ADR-0008](../../docs/adr/0008-munkamenet-token-hash-elve-tarolva.md).
- `MA IS` Hiányzó, ismeretlen vagy üres token esetén a védett végpont **401**-et ad. A naplóba a
  token **nem** kerül be.
- `MA IS` A szerepkör minden kérésnél **frissen** olvasódik a tárolóból, tehát egy
  szerepkör-változás azonnal érvényes; a kliensoldali másolat elavulása ártalmatlan.
- `MA IS` Az admin névtér védelme **egy helyen**, a névtér szintjén van bekötve, nem
  végpontonként — így egy új végpontnál nem felejthető el. Sorrend: előbb **401** (ki vagy?),
  utána **403** (szabad-e?).
- `MA IS` Kijelentkezéskor a token érvénytelenné válik.
- `MA IS` A token **csúszó lejárattal** rendelkezik: élettartama `TOKEN_TTL_HOURS` (alapérték
  **168**, azaz 7 nap), és minden hitelesített kérés meghosszabbítja. A megújítás **csak akkor**
  jár írással, ha a hátralévő idő az élettartam felénél kevesebb. Lejárt token → **401**,
  ugyanazzal a válasszal, mint az érvénytelen.
  `FORRÁS` Ma a token nem jár le.
- `MA IS` A **hiányzó** lejárat is érvénytelenség: egy lejárat nélküli munkamenet nem
  „örökéletű", hanem 401. A biztonsági döntés hiányzó adatra tilt, nem enged. A két mező —
  tokenlenyomat és lejárat — csak **együtt** lehet kitöltve; ezt az adattároló kényszeríti ki,
  nem az alkalmazáslogika.

### 7.2 Bejelentkezés-védelem

- `MA IS` Ismeretlen felhasználónévnél is lefut egy jelszó-ellenőrzés egy álhash ellen, hogy a
  **válaszidő ne árulja el**, létezik-e a név. A hibaüzenet mindkét esetben azonos.
- `MA IS` IP-nként **10** sikertelen próbálkozás **15 perces** ablakban → **429**. Sikeres
  bejelentkezés nullázza a számlálót.
- `MA IS` Reverse proxy mögött a valós kliens IP a proxy fejlécéből (`X-Forwarded-For`) származik,
  és ez **konfigurációval kapcsolható** (alapból nincs megbízható proxy) — enélkül minden kérés a
  proxy IP-jével látszana, és egyetlen kliens az összes felhasználót kizárhatná.
- `MA IS` A fejléc **melyik elemét** olvassuk, az is normatív: az `X-Forwarded-For` egy **lánc**,
  amelynek jobb végére minden hop a saját peer-jének címét fűzi, a beérkezett fejlécet nem írja
  felül. Ezért a lánc **bal széle a kliens által küldött, hamisítható** rész, a jobb vége pedig az,
  amit a saját proxyink írtak. A valós kliens a lánc **végétől** a `TRUSTED_PROXY_HOPS`-adik elem.
  Ha a lánc rövidebb a beállított hop-számnál, vagy a fejléc hiányzik, a socket távoli címe a
  kulcs.
- `MA IS` Ha az `X-Forwarded-For` **többször is szerepel** a kérésben, az összes előfordulás
  **egyetlen láncot** alkot, a beérkezési sorrendben összefűzve (RFC 9110 5.3). Csak az első sor
  olvasása hibás: van proxy, amelyik nem a meglévő fejlécet bővíti, hanem **új sort** ír a saját
  észlelt címével — ilyenkor a kliens sora marad elöl, és a „lánc végéről olvasunk" szabály
  önmagában nem védene, mert a támadó saját, egyelemű láncának a vége is a saját hazugsága.
- `MA IS` A számlálási kulcs **nem lehet a kliens által befolyásolható**. A követelmény két
  irányban véd: a támadó sem **kerülheti meg** a korlátot azzal, hogy kérésenként más címet ír a
  fejlécbe, sem **zárhat ki mást** azzal, hogy az áldozat címét írja bele.

A bal szélső elem olvasása a korlát teljes megkerülését jelentené: a támadó kérésenként más
értéket küldve minden próbálkozásra friss számlálót kapna, és a 429 soha nem következne be — a
számláló tartóssága ilyenkor semmit nem érne. A hop-szám azért a helyes bemenet, mert ez az
egyetlen adat, amit a kliens nem tud befolyásolni: a lánc *hosszát* meg tudja növelni elemek
beszúrásával, de azok a valós címet csak jobbra tolják, a lánc végétől mért távolságát nem
változtatják meg. Döntési háttér: [ADR-0007](../../docs/adr/0007-kliens-ip-a-forwarded-lancbol.md).
- `MA IS` A számlálók **tartósak**: túlélik az újraindítást, és több példány esetén közösek. A
  lejárt bejegyzések takarításra kerülnek.
  `FORRÁS` Ma memóriában élnek, és újraindításkor nullázódnak.
- `MA IS` A takarítás **nem függhet sikeres bejelentkezéstől**. A táblába hitelesítés nélküli
  kérés is beszúr sort, és a támadó épp az, aki sosem lép be sikeresen — ha a retenció a boldog
  úton lóg, nála soha nem fut le, és a tábla minden valaha látott kulccsal nő.

### 7.3 Napló, hibakezelés, életciklus

- `MA IS` Minden HTTP kérés naplózódik (metódus, útvonal, státusz, válaszidő).
- `MA IS` A napló **strukturált**; a szint konfigurációval állítható (alap: `info`), érvénytelen
  érték esetén visszaesés az alapszintre + figyelmeztetés.
- `MA IS` **Hitelesítő adat és token soha nem kerül naplóba.**
- `MA IS` Kezeletlen hiba esetén a válasz **egységesen 500**, semleges magyar üzenettel; a
  részletek kizárólag a naplóba kerülnek. A hiba nem állíthatja le a folyamatot.
- `MA IS` Leállításkor a folyamatban lévő kérések befejeződhetnek; ha a szabályos leállás
  beragad, időkorlát után kényszerített kilépés következik.
- `MA IS` `GET /api/health` → `200`, `{ "status": "ok" }`.

### 7.4 Rendelési értesítő

- `MA IS` Sikeres rendelés után értesítés megy egy **fix, előre konfigurált** címre. A vevő
  **nem** kap visszaigazolást.
- `MA IS` A levél magyar nyelvű, egyszerű szöveg, helyes ékezetekkel, és tartalmazza a
  rendelésazonosítót (a tárgyban is), az időpontot, a rendelő felhasználónevét, e-mail címét és
  szállítási címét, a tételeket névvel és darabszámmal, valamint a végösszeget magyar forint
  formátumban, tizedesjegy nélkül.
- `MA IS` A tételnév a rendelésen **tárolt snapshotból** jön; hiányában a katalógusból, végül a
  termékazonosítóból.
- `MA IS` Ha **bármelyik** konfigurációs érték hiányzik, a küldés **kimarad** (figyelmeztető
  naplóbejegyzéssel), és **semmilyen** e-mail nem megy ki — nincs beégetett tartalék címzett.
- `MA IS` Egyetlen próbálkozás történik: nincs újrapróbálás, sorbaállítás vagy kézbesítési
  garancia.

### 7.5 Kiszolgálás és eredetek

- `MA IS` Éles üzemben ugyanaz a szerver szolgálja ki a lefordított frontendet, SPA-visszaeséssel
  (minden nem-API útvonal az `index.html`-re).
- `MA IS` A hallgatott port konfigurációból jön (alapérték **3001**).
- `MA IS` A CORS engedélyezett eredetei konfigurációból (`CORS_ORIGINS`) származnak; **üres érték
  esetén egyáltalán nincs CORS fejléc**. A jelenlegi két üzemmód (fejlesztői proxy, éles static
  kiszolgálás) egyike sem támaszkodik CORS-ra.
  `FORRÁS` Ma minden eredet engedélyezett.

### 7.6 Konfiguráció

| Kulcs | Alapérték | Szerep |
|---|---|---|
| `PORT` | `3001` | `MA IS` A hallgatott port |
| `LOG_LEVEL` | `info` | `MA IS` Naplószint |
| `DATABASE_URL` | helyi fejlesztői adatbázis | `MA IS` Az adattároló elérése |
| `DATABASE_USER` | helyi fejlesztői felhasználó | `MA IS` Az adattároló felhasználója |
| `DATABASE_PASSWORD` | **nincs** | `MA IS` Az adattároló jelszava. Hiánya **indulási hiba** — lásd a táblázat alatti szabályt |
| `STATIC_DIR` | a lefordított kliens | `MA IS` Az éles üzemben kiszolgált statikus mappa |
| `TRUSTED_PROXY_HOPS` | `0` | `MA IS` Hány megbízható proxy áll a kliens és a szerver között; `0` esetén az `X-Forwarded-For` fejlécet nem olvassuk. Érvénytelen érték = `0` |
| `GMAIL_*`, `ORDER_NOTIFY_TO` | — | `MA IS` Rendelési értesítő; bármelyik hiánya letiltja a küldést |
| `ORDER_RESERVATION_HOURS` | `72` | `MA IS` Foglalási idő |
| `ORDER_EXPIRY_SWEEP_MINUTES` | `5` | `MA IS` A lejárati kör gyakorisága |
| `TOKEN_TTL_HOURS` | `168` | `MA IS` Munkamenet élettartama |
| `CORS_ORIGINS` | üres | `MA IS` Engedélyezett eredetek, vesszővel elválasztva |
| `IMPORT_FILE` | üres | `MA IS` Egyszeri adatátvétel egy meglévő adatfájlból; üresen nincs import |

`MA IS` Hitelesítő adat kizárólag környezetből származhat, forráskódba nem kerülhet.

`MA IS` Hitelesítő adatnak **nincs beégetett tartalék értéke**. A többi kulcsnál az alapérték a
helyes viselkedés (a hiányzó `PORT` nem indok a leállásra), a jelszónál viszont pont fordítva:
egy működő, de kitalálható alapértékkel az elfelejtett környezeti változó **csendben** marad
hiba, és élesben is elindul a szerver. A hiánynak ezért **hangosnak és azonnalinak** kell
lennie. A fejlesztői kényelem helye a külön, kifejezetten fejlesztői üzemmód — nem az
alapértelmezés.

`MA IS` A **beállított, de üres** jelszó ugyanúgy hiánynak számít, mint a be nem állított. A
kettő szétválasztása a gyakorlatban csak csapda: a konfigurációs sablonok minden kulcsot üresen
sorolnak fel, és a helyőrző-alapértékek jellemzően csak a *hiányzó* kulcsra lépnek be — az üres
érték így észrevétlenül felülírná a fejlesztői üzemmód alapértékét is. Az indulási hibának ezért
mindkét esetben ugyanúgy meg kell szólalnia, és **meg kell mondania a kiutat** (fejlesztői
üzemmód, illetve környezeti változó): egy szabály, ami csak akadályt állít, nem visz közelebb a
helyes beállításhoz.

---

## 8. Induló állapot

- `MA IS` Üres adattároló esetén **8 demó termék** jön létre rögzített azonosítókkal (`p1`…`p8`),
  mind aktív.
- `MA IS` Értékelés seedelése **szándékosan nincs**: a hamis társadalmi bizonyíték rosszabb, mint
  a „nincs értékelés" állapot.
- `MA IS` Ha egyetlen admin sincs, a rendszer **létrehoz egy seed admint**. Ha a seed admin
  felhasználóneve vagy e-mail címe már foglalt, **nem** hoz létre új fiókot, hanem a meglévő
  felhasználót **lépteti elő** — különben sérülne az egyediségi szabály.
- `MA IS` A seed admin belépési adatai **rögzítettek**, mert a konformancia-esetek bootstrapje
  ezekre épül: felhasználónév `adminisztrator`, jelszó `admin123`, e-mail `admin@example.com`.
  Ezek fejlesztői adatok; éles üzemben az első bejelentkezés után cserélendők.
  Ez **vállalt kockázat**, nem felügyelet: az admin nélküli adattároló mindig ismert jelszavú
  fiókkal indul, és a „cserélendő" tanács — nem mechanizmus. A gyakorlat leggyakrabban
  kihasznált hibaosztályáról van szó (alapértelmezett hitelesítő adat), ezért a korlátot a
  9. fejezet is nyilvántartja (K-8), a rendes megoldás pedig az
  [ADR-0008](../../docs/adr/0008-munkamenet-token-hash-elve-tarolva.md)-ban szerepel.
- `FORRÁS` A jelenlegi implementáció induláskor **sémanormalizálást** is végez (hiányzó
  gyűjtemények pótlása, `active` → igaz, `role` → `customer`, ismeretlen rendelési státusz →
  `pending`). Ez a séma nélküli JSON-tároló sajátossága, és **nem követelmény** — relációs
  tárolásnál ezek az esetek nem állhatnak elő. Meglévő `db.json` importálásakor viszont ezek a
  szabályok érvényesek.

---

## 9. Ismert korlátok

Tudatosan vállalt, dokumentált korlátok. Nem hibák: nem „javítandók" külön döntés nélkül.

| # | Korlát | Következmény |
|---|---|---|
| K-1 | A kosár kizárólag a kliensen él, és teljes termék-pillanatképet tárol. | A kosár tartalma elavulhat; az ár-egyeztetés és a készletellenőrzés a leadásnál fog. |
| K-2 | `MA IS` A lejáratot tárolt státusz jelöli, amit **csak periodikus ütemező** ír be. | Ha az ütemező nem futott le (pl. a szerver állt), egy lejárt foglalás még számít: a vevőt olyan készlet miatt utasíthatjuk el, ami valójában szabad. |
| K-3 | Nincs rendelés-visszavonás. | Készletet kizárólag admin adhat vissza, kézi szerkesztéssel. |
| K-4 | Egyidejű termékszerkesztésnél az utolsó mentés nyer. | Nincs zárolás és nincs ütközésjelzés. |
| K-5 | Egy felhasználóhoz egy aktív munkamenet tartozik. | Új bejelentkezés kilépteti a másik eszközt. |
| K-6 | Az értesítés a rendelési kérés kiszolgálása közben megy ki, egyetlen próbálkozással. | A külső szolgáltató lassúsága a vevő válaszidejét is lassítja; átmeneti hiba esetén az értesítés véglegesen elvész. |
| K-7 | Az értesítés személyes adatot tartalmaz. | A címzett postafiókja PII-t tárol. |
| K-8 | A termékkategória szabad szöveg. | Elgépelés új kategóriát hoz létre; nincs átnevezés. |
| K-9 | A seed admin jelszava rögzített, és nem konfigurálható (8. fejezet). | Minden admin nélkül induló telepítés ismert hitelesítő adattal jön létre; a csere kézi fegyelem kérdése. |

---

## 10. Nem cél

Nem része a követelményeknek: vevői rendelés-visszaigazoló e-mail; állapotváltozás-értesítés;
fizetés és számlázás; szállítási módok; rendelés-visszavonás vagy sztornó; több eszközön
párhuzamos munkamenet; jelszó-helyreállítás; e-mail cím megerősítése; termékvariánsok; kedvencek;
kuponok; több nyelv; értékelés szerzőnevének megjelenítése; értékelés módosítása; szerver oldali
kosár.

---

## 11. Definition of Done

A backend akkor tekinthető késznek, ha az alábbiak mindegyike igazolható. A hivatkozott
esetazonosítók a [`konformancia.md`](./konformancia.md)-ben találhatók.

**Katalógus**
- [ ] A vásárlói végpontok inaktív terméket sem listában, sem közvetlen hivatkozással nem adnak vissza (K-01…K-04).
- [ ] A szűrés és lapozás minden paramétere a 3.2 szerint viselkedik, a `page` vágásával együtt (K-05…K-12).
- [ ] Az aggregátumok kizárólag jóváhagyott értékelésekből számolnak, egy tizedesre kerekítve (K-13…K-15).

**Rendelés és készlet**
- [ ] A végösszeget a szerver számolja; a kliens által küldött ár nem érvényesül (K-20).
- [ ] Hiányzó vagy nem szám `expectedTotal` → 400; eltérő érték → 409 (K-21, K-22).
- [ ] Elégtelen elérhető mennyiség esetén a **teljes** rendelés elutasul 409-cel, és a hibaüzenet megnevezi a terméket és az elérhető darabszámot (K-23, K-24).
- [ ] A leadás nem írja át a `stock` mezőt; a `delivered`-re váltás levonja, fedezethiány esetén 409 (K-25, K-26).
- [ ] Az `available` mező a vásárlói válaszokban `stock − foglalás`, és sosem negatív (K-27).
- [ ] A `pending` rendelés válasza tartalmaz `reservedUntil` mezőt; más státuszban nincs jelen (K-28).
- [ ] A lejárati idő letelte után a rendelés `expired` lesz, a foglalása megszűnik, és `delivered`-re állítható, ha a készlet fedezi (K-29…K-31).
- [ ] A felhasználó kizárólag a saját rendeléseit látja (K-32).

**Felhasználók és hitelesítés**
- [ ] A regisztráció és a szerkesztés validációi azonos szabályokat alkalmaznak (K-40…K-45).
- [ ] Az egyediség kis/nagybetűtől független, és két egyidejű, azonos nevű regisztrációból csak az egyik sikerül (K-46, K-47).
- [ ] Az utolsó admin nem törölhető és nem fokozható le (K-48, K-49).
- [ ] Ismeretlen és létező felhasználónévnél a hibás jelszó válasza megkülönböztethetetlen (K-50).
- [ ] 10 sikertelen próbálkozás után 429; a korlát újraindítás után is érvényes (K-51, K-52).
- [ ] A korlát **nem kerülhető meg** hamisított `X-Forwarded-For` fejléccel (K-56).
- [ ] Lejárt token 401-et ad; érvényes token használata meghosszabbítja a munkamenetet (K-53, K-54).
- [ ] A tárolóban a kiadott token nem szerepel, csak a lenyomata (K-57).
- [ ] Jelszóhash, só és token semmilyen válaszban nem jelenik meg (K-55).

**Értékelés és moderáció**
- [ ] Értékelést kizárólag olyan felhasználó küldhet be, akinek `delivered` rendelése tartalmazza a terméket (K-60, K-61).
- [ ] Ugyanaz a felhasználó ugyanarra a termékre másodszor 409-et kap — moderált értékelés esetén is (K-62, K-63).
- [ ] Az új értékelés `pending`, és publikusan nem látszik (K-64).
- [ ] A publikus lista kizárólag jóváhagyott értékeléseket ad vissza, legújabb elöl, `author` nélkül (K-65…K-67).
- [ ] A moderáció csak `approved`/`rejected`/`removed` értéket fogad el, és frissíti az `updatedAt`-ot (K-68, K-69).

**Jogosultság és hibakezelés**
- [ ] Minden admin végpont token nélkül 401-et, customer tokennel 403-at ad (K-70, K-71).
- [ ] A védelem a kiszolgálás alá fűzött útvonalprefixtől (context path) függetlenül érvényes (K-58).
- [ ] Kezeletlen hiba esetén a válasz 500, semleges üzenettel, és a szerver fut tovább (K-72).

**Üzemeltetés**
- [ ] A `/api/health` 200-at ad.
- [ ] Hiányos e-mail konfiguráció mellett a rendelés sikeres, e-mail nem megy ki, és figyelmeztetés kerül a naplóba (K-73, K-74).
- [ ] Az e-mail küldésének hibája nem befolyásolja a vevő válaszát (K-75).
- [ ] Üres `CORS_ORIGINS` mellett nincs CORS fejléc a válaszban (K-76).
- [ ] Üres adattárolóból indulva 8 aktív termék és legalább egy admin jön létre (K-77, K-78).
