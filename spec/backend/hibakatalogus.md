# Hibaüzenet-katalógus

A backend **összes** hibaüzenete, végponthoz és státuszkódhoz rendelve.

> **Normativitás.** A **státuszkód** és a válasz alakja (`{ "error": "..." }`) kötelező. A szöveg
> **tartalmilag** kötelező: magyar nyelvű, a felhasználónak megmutatható, és megnevezi a hiba
> okát. A lenti szövegek szó szerinti átvétele ajánlott — a konformancia-esetek és a kliens
> üzenetei ezekre épülnek —, de átfogalmazásuk nem specsértés.
>
> A megvalósításban a szövegek egyetlen helyen élnek: `hu.webshop.common.Messages`.

`MA IS` = a futó rendszer így válaszol · `ÚJ` = egy változtatási kör hozza. Jelenleg **minden
itt szereplő üzenet `MA IS`**.

A hibaüzenetek **soha** nem tartalmaznak belső azonosítót, jelszóhasht, sót, tokent vagy
verem-információt.

---

## Globális

| Státusz | Szöveg | Mikor | |
|---|---|---|---|
| 401 | `Bejelentkezés szükséges.` | Hiányzó, ismeretlen vagy üres token bármely védett végponton. `MA IS` Lejárt token is ezt kapja. | `MA IS` |
| 403 | `Ehhez adminisztrátori jogosultság szükséges.` | Érvényes token, de nem admin szerepkör, `/api/admin/*` alatt. | `MA IS` |
| 500 | `Váratlan szerverhiba.` | Bármely kezeletlen hiba. A részletek kizárólag a naplóba kerülnek. | `MA IS` |

---

## Termékvalidáció

Érvényes: `POST /api/admin/products`, `PUT /api/admin/products/:id` — mindegyik **400**.
A validáció az **első** hibánál megáll, tehát egyszerre egy üzenet érkezik.

| Szöveg | Kiváltó ok | |
|---|---|---|
| `A termék neve kötelező.` | Hiányzó, nem szöveg, vagy csak whitespace | `MA IS` |
| `A termék neve legfeljebb 50 karakter lehet.` | Trimmelt hossz > 50 | `MA IS` |
| `A termék leírása kötelező.` | Hiányzó, nem szöveg, vagy csak whitespace | `MA IS` |
| `A termék leírása legfeljebb 100 karakter lehet.` | Trimmelt hossz > 100 | `MA IS` |
| `Az ár egész szám és nullánál nagyobb legyen.` | Nem egész, `NaN`, vagy ≤ 0 | `MA IS` |
| `A készlet megadása kötelező, egész szám és nem negatív.` | Hiányzó, nem egész, vagy negatív | `MA IS` |
| `A kategória megadása kötelező.` | Hiányzó vagy csak whitespace | `MA IS` |
| `A kép megadása kötelező.` | Hiányzó vagy csak whitespace | `MA IS` |
| `A kép hivatkozása érvényes http vagy https URL legyen.` | Nem értelmezhető URL, vagy más protokoll | `MA IS` |
| `Az aktivitási állapot csak igaz vagy hamis lehet.` | Az `active` jelen van, de nem logikai érték | `MA IS` |

Ugyanez a szöveg érvényes `PATCH /api/admin/products/:id/active` **400** válaszánál is, ha az
`active` nem logikai érték.

| Státusz | Szöveg | Végpontok | |
|---|---|---|---|
| 404 | `A termék nem található.` | `GET /api/products/:id`, `GET /api/products/:id/reviews`, `POST /api/reviews`, `PUT`/`PATCH`/`DELETE /api/admin/products/:id` | `MA IS` |

> A vásárlói végpontokon az **inaktív** termék ugyanezt a 404-et kapja, mint a nem létező — a
> válaszból nem derülhet ki, hogy a termék létezik-e.

---

## Felhasználóvalidáció

Érvényes: `POST /api/auth/register`, `PUT /api/admin/users/:id` — mindegyik **400**.

| Szöveg | Kiváltó ok | |
|---|---|---|
| `A felhasználónév legalább 8 karakter legyen.` | Trimmelt hossz < 8 | `MA IS` |
| `A felhasználónév legfeljebb 50 karakter lehet.` | Trimmelt hossz > 50 | `MA IS` |
| `Érvénytelen email cím.` | Nem illeszkedik az e-mail formátumra | `MA IS` |
| `A szállítási cím megadása kötelező.` | Hiányzó vagy csak whitespace | `MA IS` |
| `Ez a felhasználónév már foglalt.` | Ütközés, kis/nagybetűtől függetlenül | `MA IS` |
| `Ezzel az email címmel már regisztráltak.` | Ütközés, kis/nagybetűtől függetlenül | `MA IS` |
| `A jelszó legalább 8 karakter legyen.` | Csak regisztrációnál | `MA IS` |
| `Érvénytelen szerepkör.` | A `role` nem `customer` és nem `admin` (csak admin szerkesztésnél) | `MA IS` |

### Az „utolsó admin" védelme — **400**

| Szöveg | Végpont | |
|---|---|---|
| `Ez az utolsó admin jogú felhasználó, ezért a szerepköre nem vehető el. Előbb léptess elő egy másik felhasználót adminná.` | `PUT /api/admin/users/:id` | `MA IS` |
| `Ez az utolsó admin jogú felhasználó, ezért nem törölhető. Előbb léptess elő egy másik felhasználót adminná.` | `DELETE /api/admin/users/:id` | `MA IS` |

| Státusz | Szöveg | Végpontok | |
|---|---|---|---|
| 404 | `A felhasználó nem található.` | `PUT`/`DELETE /api/admin/users/:id` | `MA IS` |

---

## Bejelentkezés

| Státusz | Szöveg | Mikor | |
|---|---|---|---|
| 401 | `Hibás felhasználónév vagy jelszó.` | Ismeretlen név **vagy** hibás jelszó — a kettő megkülönböztethetetlen, és a válaszidő is azonos | `MA IS` |
| 429 | `Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később.` | IP-nként 10 sikertelen próbálkozás 15 perces ablakban | `MA IS` |

---

## Rendelés

### `POST /api/orders` — 400

| Szöveg | Kiváltó ok | |
|---|---|---|
| `A kosár üres vagy hibás.` | Az `items` nem tömb, vagy üres | `MA IS` |
| `Hiányzó vevői adatok (név, email, cím).` | A `customer` bármely mezője hiányzik vagy üres | `MA IS` |
| `{terméknév} már nem elérhető, ezért a rendelés nem adható le. Kérjük, vedd ki a kosárból, és próbáld újra.` | Ismeretlen vagy időközben inaktivált termék | `MA IS` |
| `Hibás mennyiség a(z) {terméknév} terméknél.` | A `quantity` egészre csonkítva < 1, vagy nem szám | `MA IS` |
| `A jóváhagyott végösszeg megadása kötelező.` | Hiányzó vagy nem szám `expectedTotal` | `MA IS` |

> **A terméknév forrása** (fontossági sorrendben): a teljes katalógus → a kérésben érkező név →
> `Egy termék`. A nyers termékazonosító **sosem** kerül a hibaüzenetbe.

### `POST /api/orders` — 409

| Szöveg | Kiváltó ok | |
|---|---|---|
| `A kosárban lévő termékek ára időközben megváltozott. Kérjük, frissítsd az oldalt és ellenőrizd a végösszeget.` | Az `expectedTotal` eltér a szerver által számolt összegtől | `MA IS` |
| `A(z) {terméknév} termékből jelenleg {n} db érhető el, ezért a rendelés nem adható le.` | Elégtelen elérhető mennyiség; `{n}` az `available` értéke | `MA IS` |
| `A(z) {terméknév} termék elfogyott, ezért a rendelés nem adható le.` | Ugyanaz, ha az elérhető mennyiség 0 | `MA IS` |

> Mind-vagy-semmi: az **első** fedezethiányos tétel üzenete megy vissza, és a teljes rendelés
> elutasul.

> **A két 409 sorrendje:** ha egyszerre áll fenn fedezethiány és áreltérés, a **készlethiány**
> üzenete megy vissza — a validációs sorrend (requirements.md 4.2) a fedezetet a 4., az
> ár-egyeztetést a 6. lépésben méri. A vevőnek hiába frissítené az árat, ha nincs áru.

### `PATCH /api/admin/orders/:id/status`

| Státusz | Szöveg | Kiváltó ok | |
|---|---|---|---|
| 400 | `A rendelés státusza csak a következő lehet: pending, expired, delivered.` | Érvénytelen státuszérték. A felsorolás az érvényes státuszok **egyetlen forrásából** épül (`OrderStatus`), ezért egy új státusz bevezetése automatikusan bővíti az üzenetet | `MA IS` |
| 404 | `A rendelés nem található.` | Nem létező azonosító | `MA IS` |
| 409 | `A(z) {terméknév} termékből nincs elegendő készlet a rendelés teljesítéséhez (elérhető: {n} db).` | `delivered`-re váltás, de a fizikai készlet nem fedezi | `MA IS` |
| 409 | `A kiszállított rendelés státusza már nem módosítható.` | Kísérlet egy `delivered` rendelés más státuszra állítására | `MA IS` |
| 409 | `A lejárt rendelés már nem állítható vissza feldolgozás alá.` | Kísérlet egy `expired` rendelés `pending`-re állítására | `MA IS` |

> A `delivered` **végállapot**: a készlete már levonódott, ezért a visszalépés vagy kétszeres
> levonáshoz, vagy néma készlet-visszaíráshoz vezetne. A `delivered` → `delivered` váltás
> ártalmatlan (idempotens), és nem von le újra.

> Az `expired` rendelés **teljesíthető**, de nem éleszthető újra: a foglalása megszűnt, a
> készletét időközben más is megvehette, tehát a `pending` állapot foglalás-ígéretét már nem
> lehetne betartani.

> **Érvényes átmenetek** (minden más 409): `pending → {pending, expired, delivered}`,
> `expired → {expired, delivered}`, `delivered → {delivered}`. Az azonos státuszra állítás
> mindenhol idempotens.

> A státuszlistát tartalmazó üzenet az érvényes értékek **felsorolásából** épül, tehát egy új
> státusz bevezetése automatikusan megjelenik benne.

---

## Értékelés

### `POST /api/reviews`

| Státusz | Szöveg | Kiváltó ok | |
|---|---|---|---|
| 400 | `Az értékelés 1 és 5 közötti egész szám lehet.` | A `rating` nem egész, vagy tartományon kívüli | `MA IS` |
| 400 | `A szöveges vélemény csak szöveg lehet.` | A `body` jelen van, de nem szöveg | `MA IS` |
| 400 | `A szöveges vélemény legfeljebb 500 karakter lehet.` | A `body` hossza > 500 | `MA IS` |
| 403 | `Csak olyan terméket értékelhetsz, amelyet már megrendeltél, és a rendelésed kiszállítottként van nyilvántartva.` | Nincs `delivered` rendelés a termékre | `MA IS` |
| 404 | `A termék nem található.` | Nem létező vagy inaktív termék | `MA IS` |
| 409 | `Ezt a terméket már értékelted.` | Létező értékelés — **bármilyen** státusszal | `MA IS` |

### `PATCH /api/admin/reviews/:id`

| Státusz | Szöveg | Kiváltó ok | |
|---|---|---|---|
| 400 | `A státusz csak a következő értékek egyike lehet: approved, rejected, removed.` | Érvénytelen érték; a `pending` szándékosan nem állítható be | `MA IS` |
| 404 | `Az értékelés nem található.` | Nem létező azonosító | `MA IS` |

---

## Naplóüzenetek

Nem a HTTP-szerződés része, de az üzemeltetési viselkedéshez tartozik. Egyik sem tartalmazhat
tokent vagy hitelesítő adatot.

| Szint | Esemény | |
|---|---|---|
| warn | Hitelesítés nélküli kérés elutasítva (az útvonallal) | `MA IS` |
| warn | Admin jogosultság nélküli kérés elutasítva (útvonal + felhasználóazonosító) | `MA IS` |
| warn | Az értesítő nincs konfigurálva, e-mail kihagyva | `MA IS` |
| warn | Érvénytelen naplószint-beállítás, visszaesés az alapértelmezettre | `MA IS` |
| info | Rendelési e-mail elküldve (rendelésazonosítóval) | `MA IS` |
| info | Szerver elindult (porttal) / leállítás folyamatban / a szerver leállt | `MA IS` |
| error | Rendelési e-mail küldése sikertelen (hiba + rendelésazonosító) | `MA IS` |
| error | Kéréskezelési hiba (hiba + metódus + útvonal) | `MA IS` |
| error | A szerver indítása meghiúsult / a szabályos leállás túllépte az időkorlátot | `MA IS` |
| info | Lejárt foglalások lezárva (az érintett rendelések számával) | `MA IS` |
