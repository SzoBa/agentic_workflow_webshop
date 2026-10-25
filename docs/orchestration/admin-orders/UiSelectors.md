# UI-KIVÁLASZTÓI SZERZŐDÉS — admin rendeléskezelő

> **Befagyasztva:** 2026-07-30, a `spec-researcher` jelentésének `## UI-kiválasztói szerződés`
> szakaszából, szó szerint. A `feature-implement` skill 2/b. lépése írta ki.
>
> Ez a lista a lánc **párhuzamos ágának** egyetlen közös pontja: az implementáló ennek megfelelő
> fogantyúkat állít elő, az e2e-teszt-író **kizárólag** ezeket használja. A két ág nem látja
> egymás kódját.
>
> **Ez a fájl egyik subagenthez sem jut el** — a *tartalma* igen, a promptok törzsébe másolva.
>
> **A futás során nem változik.** Ha hibásnak bizonyul, azt a `Running.md` rögzíti és a
> zárójelentés mondja ki — nem íródik át utólag.

**Ellenőrzés a kiíráskor (2/b.):** a szerződés **egyetlen `JAVASOLT` sort sem** tartalmaz —
mind a 27 tétel a mai kódból vagy a spec szó szerinti szövegéből származik, `fájl:sor`
hivatkozással. Ütközés a spec szövegével nincs: az egyetlen pont, ahol a spec is nevet ad
(`requirements.md:105` — „Rendelések" menüpont), egyezik a kóddal (`App.tsx:40`).

---

| Elem | Kiválasztó | Forrás |
|---|---|---|
| Oldalcím | `getByRole("heading", { name: "Rendelések kezelése", level: 1 })` | `client/src/pages/AdminOrders.tsx:130` |
| Navigációs menüpont | `getByRole("link", { name: "Rendelések", exact: true })`, `href="/admin/orders"` | `client/src/App.tsx:40` (a `requirements.md:105` is „Rendelések"-t ír elő) |
| Útvonal | `/admin/orders`, `RequireAdmin` alatt | `client/src/App.tsx:84-91` |
| Betöltés-jelzés (első betöltés) | `getByText("Rendelések betöltése…")` | `client/src/pages/AdminOrders.tsx:126` |
| Betöltés-jelzés (szűrés utáni frissítés) | `getByText("Frissítés…")` | `client/src/pages/AdminOrders.tsx:159` |
| Találatszám | `getByText(/^\d+ rendelés$/, { exact: true })` — pl. `"1 rendelés"` | `client/src/pages/AdminOrders.tsx:159` |
| Betöltési hiba | `getByText(/Hiba: .../)` | `client/src/pages/AdminOrders.tsx:131` |
| Kereső mező | `getByLabel("Keresés (vevő neve, email, rendelésazonosító)")` | `client/src/pages/AdminOrders.tsx:135-141` |
| Státusz-választó | `getByLabel("Státusz")` (`<select>`) | `client/src/pages/AdminOrders.tsx:143-155` |
| Státusz-választó opciói | `"Összes"` (érték `all`) + `ORDER_STATUS_LABELS` értékei: `"Feldolgozás alatt"` / `"Lejárt"` / `"Kiszállítva"` | `client/src/pages/AdminOrders.tsx:149-154`, feliratok forrása `client/src/api.ts:137-141` |
| Táblázat sora | `getByRole("row")` **szűrve** a rendelés azonosítójára (`.filter({ hasText: id })` / regex a `name`-ben) — a sor tartalmazza az azonosítót, dátumot, vevőt, tételeket, összeget, státuszt | `client/src/pages/AdminOrders.tsx:176-230`; a mintát az `e2e/steps/admin_rendelesek_lepesek.mjs:35-37` és a `client/test/AdminOrders.test.tsx:132` már használja |
| Sorban mért szöveg — vevő neve | a sor szövege tartalmazza `o.customer.name`-t | `client/src/pages/AdminOrders.tsx:187` |
| Sorban mért szöveg — vevő e-mailje | a sor szövege tartalmazza `o.customer.email`-t (`.admin-order-email` span, de a **szöveg** a mérendő, nem az osztály) | `client/src/pages/AdminOrders.tsx:188` |
| Sorban mért szöveg — felhasználónév | ha jelen van, a sor szövege tartalmazza `o.username`-et; törölt fióknál **hiányzik** | `client/src/pages/AdminOrders.tsx:189-191` |
| Sorban mért szöveg — tétel | `"{név} × {darabszám} db"`, pl. `"Bögre × 2 db"` | `client/src/pages/AdminOrders.tsx:196-199` |
| Sorban mért szöveg — végösszeg | `formatPrice(o.total)` — a számjegyek egyeznek, a formázás (NBSP, pénznemjel) böngészőfüggő, ezért csak számjegyre asszertálj | `client/src/pages/AdminOrders.tsx:204` |
| Sorban mért szöveg — státusz | `ORDER_STATUS_LABELS[o.status]` | `client/src/pages/AdminOrders.tsx:206-208` |
| Sorban mért szöveg — foglalás, `pending` | `/A foglalás még .+ érvényes\./` | `client/src/ReservationStatus.tsx:51` |
| Sorban mért szöveg — foglalás, `expired` | `"A foglalás lejárt, ezért a készletet mások is megvásárolhatják. A rendelést a bolt ettől még teljesítheti."` | `client/src/ReservationStatus.tsx:38-41` |
| Sorban mért szöveg — foglalás, `delivered` | nincs foglalás-szöveg (üres) | `client/src/ReservationStatus.tsx:44` |
| Soronkénti státuszváltó vezérlő | `getByRole("button", { name: "Kiszállítottá tétel" })`, **minden** soron jelen van (`delivered`-en is) — mentés közben `"Mentés…"` | `client/src/pages/AdminOrders.tsx:217-224` |
| Soronkénti hibaüzenet | a sor szövege tartalmazza a **szerver szó szerinti** magyar hibaüzenetét, változtatás nélkül (nincs saját ARIA-szerep, `<p className="error">`) | `client/src/pages/AdminOrders.tsx:225-227`; szó szerinti szövegek: `spec/backend/hibakatalogus.md:133-134` |
| Üres találathalmaz | `getByText("Nincs megjeleníthető rendelés.")` | `client/src/pages/AdminOrders.tsx:234-236` |
| Lapozó — előző | `getByRole("button", { name: "← Előző" })` | `client/src/pages/AdminOrders.tsx:241-247` |
| Lapozó — következő | `getByRole("button", { name: "Következő →" })` | `client/src/pages/AdminOrders.tsx:251-257` |
| Lapozó — lapjelző | szöveg `"{page} / {totalPages}"` | `client/src/pages/AdminOrders.tsx:248-250` |
| Lapozó láthatósága | csak akkor jelenik meg, ha `totalPages > 1` | `client/src/pages/AdminOrders.tsx:239` |

**Nincs `data-testid`, nincs CSS-szelektor.** Ez megfelel az `e2e/README.md` „Kiválasztás szerep
és címke szerint" elvének. Ha egy elem szerep vagy címke alapján elérhetetlen, az
akadálymentességi hiány a komponensben — javítani kell, nem megkerülni.
