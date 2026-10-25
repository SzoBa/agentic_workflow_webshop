# Admin szerepkör — Tasks

Scope: full-stack. Szerepkör: `role` a `User`-en (customer | admin), a védelem szerveroldali. Seed admin: `adminisztrator` / `admin123`. Mit és miért: [requirements.md](requirements.md) · Hogyan: [plan.md](plan.md) · Szótár: [CONTEXT.md](../../CONTEXT.md)

Sorrend és függőségek: **1** és **2** azonnal indítható · **3** ← 1 · **4** ← 3, 2 · **5** ← 3 · **6** ← 1 · **7** ← 3 · **8** ← 7

## [ ] 1. Adatmodell, normalizálás, seed admin
- [ ] 1.1 types.ts: `Role = "customer" | "admin"`
- [ ] 1.2 types.ts: `User` bővítése `role: Role` mezővel (kötelező)
- [ ] 1.3 types.ts: `Product` bővítése `active: boolean` mezővel (kötelező)
- [ ] 1.4 types.ts: `OrderItem` bővítése `name?: string` és `unitPrice?: number` mezőkkel (opcionális — a régi rendeléseken nincs)
- [ ] 1.5 catalog.ts: új modul — a szűrő/lapozó logika kiemelése a products.ts-ből, **változatlan viselkedéssel** (prefaktor; az aktív szűrést az 5. és a 6. szakasz építi rá). A lapszám-clamp (`page` 1..totalPages közé vágása) maradjon meg — ez kezeli azt az esetet, amikor az admin az utolsó oldal utolsó elemét törli
- [ ] 1.6 products.ts: átállás a catalog.ts-re, a válasz szerződése nem változik
- [ ] 1.7 normalize.ts: új modul, tiszta függvény (`DbData` be, normalizált `DbData` ki) — hiányzó `active` → `true`, hiányzó `role` → `"customer"`
- [ ] 1.8 normalize.ts: ha egyetlen admin sincs, seed admin beszúrása (a függvény async, mert a jelszóhash aszinkron)
- [ ] 1.9 normalize.ts: a seed admin beszúrása előtt ellenőrizni, hogy a felhasználónév és az e-mail szabad — ha foglalt, a meglévő felhasználó léptetése adminná ütközés helyett (különben duplikált felhasználónév keletkezik, ami sérti az egyediségi szabályt)
- [ ] 1.10 normalize.ts: jelzés arról, változott-e valami, hogy a hívó eldönthesse, kell-e írni
- [ ] 1.11 db.ts: a seed default kiegészítése (`active: true` minden terméken). A `users` maradjon **üres**: a seed admin beszúrása a normalize.ts dolga. Ha a default is legyártana egyet, minden szerverinduláskor lefutna egy fölösleges scrypt hash, és két párhuzamos mechanizmus felelne ugyanazért az invariánsért
- [ ] 1.12 db.ts: betöltés után normalizálás, és `db.write()` csak tényleges változás esetén
- [ ] 1.13 db.ts: a meglévő ad-hoc normalizálás (hiányzó `users` kulcs pótlása) beolvasztása az új modulba — ne maradjon két párhuzamos mechanizmus
- [ ] 1.14 routes/auth.ts: a regisztráció `role: "customer"`-t állít be
- [ ] 1.15 routes/auth.ts: `toPublicUser` visszaadja a `role`-t
- [ ] 1.16 client/api.ts: `User` típus bővítése `role`-lal
- [ ] 1.17 test/normalize.test.ts: hiányzó mezők, admin beszúrása, idempotencia (kétszer futtatva ugyanaz)
- [ ] 1.18 test/normalize.test.ts: a seed admin nem jön létre, ha a felhasználóneve már foglalt
- [ ] 1.19 README.md: a seed admin belépési adatai, fejlesztői adatként megjelölve

## [ ] 2. Rendelési tétel snapshot és ár-egyeztetés
- [ ] 2.1 orders.ts: a POST a tételekbe menti a leadáskori `name`-et és `unitPrice`-t
- [ ] 2.2 client/api.ts: `OrderItem` bővítése a snapshot mezőkkel
- [ ] 2.3 Orders.tsx: a tétel a snapshotból jelenik meg; snapshot hiányában a termékből, **törölt vagy inaktivált** terméknél semleges helyettesítő szöveg (a névfeloldás a vásárlói listából dolgozik, amely az inaktívakat sem adja vissza)
- [ ] 2.4 Orders.tsx: a végösszeg mindig a rendelésen tárolt érték — a tételsorokból soha nem számolunk újra
- [ ] 2.5 email.ts: a rendelési e-mail tételsorai a rendelésen tárolt snapshotból épülnek, nem az élő termékadatból (különben az e-mail és a rendeléslista mást mutat ugyanarról a rendelésről)
- [ ] 2.6 orders.ts: a POST fogadja az opcionális `expectedTotal` mezőt, és eltérés esetén elutasítja a rendelést magyar hibaüzenettel
- [ ] 2.7 client/api.ts: a `createOrder` átadja a jóváhagyott végösszeget
- [ ] 2.8 Checkout.tsx: a képernyőn megjelenített végösszeg elküldése, és az eltérés miatti hibaüzenet megjelenítése
- [ ] 2.9 test/orders.test.ts: átnevezés és átárazás után a korábbi rendelés változatlan
- [ ] 2.10 test/orders.test.ts: a termék törlése után a rendelés továbbra is megjeleníthető
- [ ] 2.11 test/orders.test.ts: eltérő `expectedTotal` esetén a rendelés elutasításra kerül és nem keletkezik rekord; hiányzó `expectedTotal` esetén a korábbi viselkedés marad

## [ ] 3. Admin belépő: őr, névtér, terméklista
- [ ] 3.1 auth.ts: `requireAdmin` middleware a `requireAuth` után futva (401 → 403)
- [ ] 3.2 routes/admin/index.ts: admin router, a `requireAdmin` **router szinten** bekötve
- [ ] 3.3 routes/admin/products.ts: `GET /` — a teljes katalógus, inaktívakkal együtt
- [ ] 3.4 index.ts: az admin router regisztrálása `/api/admin` alatt
- [ ] 3.5 client/api.ts: admin terméklista hívófüggvény
- [ ] 3.6 RequireAdmin.tsx: útvonal-őr, nem-admin esetén átirányítás a főoldalra (a meglévő auth contextből olvas, saját hálózati hívás nélkül)
- [ ] 3.7 App.tsx: `/admin/products` útvonal az őrbe csomagolva
- [ ] 3.8 App.tsx: admin menüpontok csak `role === "admin"` esetén
- [ ] 3.9 AdminProducts.tsx: táblázatos lista, benne az aktivitási állapot oszlop
- [ ] 3.10 test/helpers.ts: az admin router hozzáadása a `buildApp()`-hoz — a teszt-app kézzel sorolja fel a routereket, enélkül **minden** admin teszt 404-en bukik
- [ ] 3.11 test/admin-products.test.ts: token nélkül 401, customerrel 403, adminnal 200
- [ ] 3.12 test/admin-products.test.ts: az admin lista az inaktív termékeket is tartalmazza

## [ ] 4. Termék CRUD és validáció
- [ ] 4.1 validation.ts: új modul — termékvalidáció (név kötelező ≤50, leírás **kötelező** ≤100, ár egész >0, készlet **kötelező** egész ≥0, kategória kötelező, kép kötelező és valid http(s))
- [ ] 4.2 routes/admin/products.ts: `POST /` — új termék, `active: true` alapértelmezéssel
- [ ] 4.3 routes/admin/products.ts: `PUT /:id` — módosítás (teljes csere, minden mező újravalidálva)
- [ ] 4.3b routes/admin/products.ts: `PATCH /:id/active` — kizárólag az aktivitás váltása, a többi mező validálása nélkül. Enélkül egy régebbi, szabálysértő adatú termék nem lenne elrejthető a vásárlók elől
- [ ] 4.4 routes/admin/products.ts: `DELETE /:id` — végleges törlés
- [ ] 4.5 client/api.ts: create / update / delete hívófüggvények
- [ ] 4.6 AdminProducts.tsx: szerkesztő űrlap, a szerverhiba megjelenítése az űrlapállapot felülírása **nélkül**
- [ ] 4.7 AdminProducts.tsx: képméret-ellenőrzés `new Image()`-dzsel — külön üzenet a "nem tölthető be" és a "nem 400*300" esetre
- [ ] 4.8 AdminProducts.tsx: aktív/inaktív kapcsoló a listában, a `PATCH /:id/active` végpontot hívva (nem teljes mentéssel)
- [ ] 4.9 AdminProducts.tsx: törlés megerősítő kérdéssel
- [ ] 4.10 test/admin-products.test.ts: mezőnként egy határeset (51 karakteres név, üres és 101 karakteres leírás, tört ár, nulla ár, hiányzó és negatív készlet, üres kategória, hiányzó kép) → 400 + magyar üzenet
- [ ] 4.11 test/admin-products.test.ts: a mentett módosítás megjelenik a vásárlói végponton

## [ ] 5. Keresés, szűrés, lapozás az admin listán
- [ ] 5.1 types.ts: `AdminProductQuery` — a `ProductQuery` `status: "active" | "inactive" | "all"` mezővel, `inStock` nélkül
- [ ] 5.2 catalog.ts: a `status` szerinti szűrés támogatása. Ismeretlen/elgépelt érték esetén `"all"` — a néma szűrés rosszabb hiba lenne, mert az admin azt hinné, termékek tűntek el
- [ ] 5.2b routes/admin/products.ts: az admin kategórialistája a **teljes** katalógusból épül, az inaktívak kategóriáit is beleértve — különben egy csak inaktív termékeket tartalmazó kategória eltűnne a szűrőből, és épp azt nem lehetne megtalálni, amit keresünk
- [ ] 5.3 routes/admin/products.ts: a `GET /` fogadja a keresés, kategória, ártartomány, státusz és lapozás paramétereket
- [ ] 5.4 routes/admin/products.ts: az admin lista alapértelmezett lapmérete 25 (a vásárlói 12 kártyás elrendezéshez van szabva)
- [ ] 5.5 client/api.ts: a szűrőparaméterek átadása
- [ ] 5.6 AdminProducts.tsx: kereső mező, kategória- és státuszszűrő, ártartomány, lapozó. A szűrők miatti újratöltés **ne** cserélje le a teljes oldalt betöltés-jelzőre, csak a legelső betöltés — különben a keresőmező kikerül a DOM-ból, és gépelés közben elveszik a fókusz
- [ ] 5.7 test/admin-products.test.ts: keresés, státuszszűrés, és a szűrés+lapozás együttes helyessége

## [ ] 6. Az inaktív termék eltűnik a vásárlói felületről
- [ ] 6.1 catalog.ts: `activeProducts()` — az "aktív termék" fogalom egyetlen forrása
- [ ] 6.2 products.ts: `GET /` csak aktív termékeket listáz
- [ ] 6.3 products.ts: `GET /:id` inaktív termékre ugyanazt a 404-et adja, mint a nem létezőre
- [ ] 6.4 products.ts: a kategórialista csak aktív termékekből épül
- [ ] 6.5 orders.ts: a termékfeloldás a `activeProducts()`-ra áll át, így az inaktív tétel a meglévő ágon akad el
- [ ] 6.6 orders.ts: a hibaüzenet pontosítása, hogy a vevő tudja a teendőt (a termék már nem elérhető, vegye ki a kosárból). A név forrása fontossági sorrendben: (1) a **teljes** katalógus — inaktivált terméknél a szerver tudja az igazit, ne a kliensét használjuk; (2) a kliens kosarából érkező név — csak a ténylegesen **törölt** terméknél marad ez; (3) semleges szöveg. A nyers azonosítót sosem mutatjuk
- [ ] 6.6b Checkout.tsx + client/api.ts: a kosár tételei a **nevet is** elküldik. Enélkül a 6.6 nem teljesíthető a törölt termék esetére. A név KIZÁRÓLAG a hibaüzenethez használatos — a rendelésbe mentett snapshot továbbra is a szerver DB-jéből jön
- [ ] 6.7 test/products.test.ts: az inaktív termék nincs a listában, `:id`-je 404, kategóriája nincs a szűrőben
- [ ] 6.8 test/orders.test.ts: inaktív tétellel a megrendelés 400, és nem keletkezik rendelés

## [ ] 7. Felhasználók megtekintése és szerkesztése
- [ ] 7.1 validation.ts: felhasználóvalidáció (név ≥8, e-mail formátum, cím kötelező)
- [ ] 7.2 validation.ts: egyediség kis-nagybetű-függetlenül, `excludeUserId` paraméterrel
- [ ] 7.3 routes/auth.ts: a regisztráció átáll a közös validációra
- [ ] 7.4 routes/admin/users.ts: `GET /` — felhasználólista jelszó- és tokenmezők nélkül
- [ ] 7.5 routes/admin/users.ts: `PUT /:id` — név, e-mail, cím és szerepkör módosítása
- [ ] 7.6 client/api.ts: felhasználólista és -módosítás hívófüggvények
- [ ] 7.7 AdminUsers.tsx: lista és szerkesztő űrlap, szerepkör-választóval — a felület felirata "Ügyfelek", a modell `User`
- [ ] 7.8 App.tsx: `/admin/users` útvonal az őrbe csomagolva + menüpont
- [ ] 7.9 test/admin-users.test.ts: hozzáférés-vezérlés (401 / 403 / 200), és hogy a válasz nem tartalmaz jelszóadatot
- [ ] 7.10 test/admin-users.test.ts: másik felhasználó nevére váltás 400; a **saját, változatlan** név megtartása sikeres
- [ ] 7.11 test/auth-routes.test.ts: regressziós teszt — a regisztráció változatlanul működik és customert ad

## [ ] 8. Felhasználó törlése és az utolsó admin védelme
- [ ] 8.1 routes/admin/users.ts: `DELETE /:id` — a felhasználó törlése, a rendelései érintetlenül
- [ ] 8.2 routes/admin/users.ts: utolsó-admin ellenőrzés a `PUT`-ban (lefokozás) és a `DELETE`-ben is, magyar hibaüzenettel
- [ ] 8.3 routes/admin/users.ts: az ellenőrzés és a `db.data` módosítása **egyetlen szinkron blokkban**, `await` nélkül közte (a kiírás csak utána) — különben két egyidejű kérés nullára viheti az adminok számát
- [ ] 8.4 client/api.ts: törlés hívófüggvény
- [ ] 8.5 AdminUsers.tsx: törlés megerősítő kérdéssel, a szerverhiba megjelenítésével
- [ ] 8.6 test/admin-users.test.ts: az egyetlen admin lefokozása és törlése is 400
- [ ] 8.7 test/admin-users.test.ts: két admin esetén mindkét művelet sikeres
- [ ] 8.8 test/admin-users.test.ts: két egyidejű kérés (két admin egyidejű törlése, illetve lefokozása) nem viheti nullára az adminok számát. A teszt a **viselkedést** mérje — az adminok száma sose legyen nulla, és a két kérés közül sose sikerüljön mindkettő —, **ne a konkrét státuszpárt**: a második kérés 400-zal (invariáns), 401-gyel (a kérést küldő admin tokenje megszűnt) és 403-mal (elvesztette a jogát) is helyesen bukhat el
- [ ] 8.9 test/admin-users.test.ts: a törölt felhasználó rendelései megmaradnak a leadáskori vevői adatokkal
