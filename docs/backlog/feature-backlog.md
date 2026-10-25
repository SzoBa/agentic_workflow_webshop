# Feature-backlog — mi nincs még kész

> **Ez a fájl nem norma.** Nem specifikáció, nem kész-kritérium, és semmilyen agent nem
> hivatkozhat rá bizonyítékként. A norma a `spec/backend/` és az élő feature-specek; ütközés
> esetén azok nyernek. Felmérés: 2026-08-02, a kóddal újra összevetve: **2026-11-05**.
>
> A méretbecslések nagyságrendet jelölnek, nem kötelezettséget:
> **XS** = egy fájl · **S** = tisztán kliens vagy tisztán teszt, séma nélkül ·
> **M** = új végpont vagy új nézet, migráció nélkül · **L** = séma- vagy állapotgép-változás,
> spec-írással kezdve.

## Nyitott tételek

| # | Feature | Méret | Állapot ma |
|---|---|---|---|
| B-1 | **Alacsony készlet jelzése az admin terméklistán** | **S** | A `reserved` / `available` már megjelenik (`client/src/pages/AdminProducts.tsx`); a küszöb, a kiemelés és a szűrő hiányzik. Tisztán kliens. |
| B-2 | **Vevői rendelés-részletoldal** | **S/M** | Az `Orders.tsx` egy lista, nincs `/orders/:id` útvonal. Új végpont nem kell: a `GET /api/orders` a tételeket és a vevőadatokat is visszaadja. |
| B-3 | **„Értékeléseim" nézet a vevőnek** | **M** | Nincs végpont, a beküldő soha nem tudja meg, jóváhagyták-e a véleményét. A történeti `spec/termek-felhasznaloi-ertekeles` `GET /api/products/:id/ratings/me`-je a Java-átírásba **nem** került át — új feature-ként, új spec-mappával kezdendő. |
| B-4 | **Kategória-kezelés** | **M** | `K-8`: a kategória szabad szöveg; elgépelés új kategóriát hoz létre, átnevezés nincs. Séma + admin felület. |
| B-5 | **E2E lefedettség a vevői útra** | **M** | Az `e2e/features/` négy fájlja az admin rendeléskezelőt, a témaváltót és a váz öntesztjét méri. A vásárlási út (katalógus → kosár → checkout → értékelés) böngészőből nincs mérve. |
| B-6 | **Termékkép-feltöltés** | **L** | Az `imageUrl` szabad szöveges URL. Tárolás, méretkorlát, kiszolgálás, validáció — a lista legnagyobb tétele. |
| B-7 | **react-router 6 → 7 migráció** | **M** | Nem feature, de **határidős**: a GHSA-wrjc és a GHSA-337j csak a 7.18.0-ban javított, az `osv-scanner.toml` kivétele **2027-02-01-én lejár**, és akkor a CI `deps` jobja piros lesz. Függőség-főverzió, tehát a fejlesztő jóváhagyásával; a kliens útvonalai, a `RequireAuth`/`RequireAdmin` őrök és a `Login` `from`-átirányítása érintett. |
| B-8 | **Admin értékelés-moderáció (`/admin/reviews`)** | **S** | A backend kész és tesztelt (`GET /api/admin/reviews?status=…`, `PATCH /api/admin/reviews/:id`, `review/AdminReviewController.java`), de a kliensben nincs hívó és nincs útvonal. Ezért a beküldött értékelés örökre `pending` marad: a publikus lista üres, a `ratingAvg`/`ratingCount` 0. Tisztán kliens, de a döntések (alapértelmezett szűrő, megerősítés a `removed`-hoz, menüpont helye) miatt spec-írással kezdendő. |
| B-9 | **Rendelés visszavonása a vevő által** | **L** | A `spec/backend/requirements.md` `K-3` korlátja ma kizárja. Új Flyway-migráció (`orders.status` CHECK), `OrderTransitions`-bővítés indoklással, a foglalás azonnali felszabadítása (`available` nő, `stock` nem — ADR-0005), új hibaüzenetek, új védett végpont (`WebConfig` `PROTECTED_PATTERNS`), kliens és mindkét oldali típus. A `dok-leltar.mjs` 25 → 26 végpontot vár. Becslés az admin-orders mért futásából: egy óra és 10–30 USD. |

A B-1 és a B-2 elfér spec-mappa nélkül is: nincs bennük szerződésváltozás. A többihez előbb a
`feature-spec-writer` kell, onnan a `feature-implement` (vagy egyben a `feature-full`) lánc.

## Máshol vezetett tételek

Ezek nyitottak, de a részletük nem itt él — ide csak a mutató kerül, hogy ne csússzon szét két
példány:

| Tétel | Hol |
|---|---|
| A bemutató két párhuzamos feladata (lezárja a B-5-öt és az `admin-orders-followups` B1-ét) | [`presentation.md`](../../presentation.md) |
| `AR-19` lezárása (admin-orders e2e kritérium) | [`spec/admin-orders/requirements.md`](../../spec/admin-orders/requirements.md), „Változásnapló" |
| A rendelés-adminisztráció spec-en túli észrevételei | [`admin-orders-followups.md`](./admin-orders-followups.md) |
| Ismert korlátok, köztük `K-4` (utolsó mentés nyer) és `K-6` (egyetlen értesítési próbálkozás) | [`spec/backend/requirements.md`](../../spec/backend/requirements.md), ismert korlátok táblája |

## Lezárva a 2026-08-02-i felmérés óta

- **Saját fiókadatok szerkesztése + jelszóváltás** — `PUT /api/auth/me`, `POST /api/auth/password`,
  `/profile` oldal.
