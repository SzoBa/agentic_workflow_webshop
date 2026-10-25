# Feladatlista — admin rendeléskezelő

Munkaegységek végrehajtási sorrendben. Minden egység **önállóan verifikálható**: a *Kész, ha* sor
egy konkrét `AR-xx` kész-kritériumra ([`requirements.md`](./requirements.md) 5. szakasz) vagy egy
megnevezett tesztre hivatkozik.

A **`*Gazda:*`** sor mondja meg, melyik munkacsomag hajtja végre. A csomagok fájltulajdona a
[`plan.md`](./plan.md) 3. szakaszában van — ami nem a tiéd, ahhoz nem nyúlsz.

- **B** — backend-implementáló (Java + `client/src/api.ts`)
- **F** — kliens-implementáló (React)
- **V** — validáló

A checkboxokat **senki nem pipálja ki**: a `spec/` mappa a norma, nem munkaterület. Az elkészült
pontokról a jelentésben kell beszámolni.

---

# B csomag — backend és típustükör

## B-M1 · Adatelérés

- [ ] **B1.1** A `Catalog.paginate` és a `Catalog.Slice` általánosítása típusparaméterrel
      (`List<ProductEntity>` → `List<T>`, `Slice` → `Slice<T>`); a `ProductQueryService` két
      hívási helyének igazítása.
      *Kész, ha:* **AR-16** — a `CatalogConformanceTest`, `AdminProductTest` és `ProductFilterTest`
      változatlanul zöld, viselkedésváltozás nélkül.
      *Érintett:* `catalog/Catalog.java:107-118`, `catalog/ProductQueryService.java`.
      *Gazda:* B

- [ ] **B1.2** `OrderRepository`: lekérdezés a **teljes** rendeléshalmazra és státusz szerint
      szűrve, `seq` **csökkenő** sorrendben, a tételeket `@EntityGraph`-fal együtt töltve.
      *Kész, ha:* a lekérdezés létezik, `seq DESC` rendezéssel, és a tételek betöltve érkeznek
      (nincs `LazyInitializationException` az `open-in-view: false` mellett).
      *Érintett:* `repo/OrderRepository.java`.
      *Gazda:* B

## B-M2 · Végpont

- [ ] **B2.1** `OrderPage` record (`items`, `total`, `page`, `pageSize`, `totalPages`) — **`categories`
      mező nélkül**, és `AdminOrderView`: az `OrderResponse` minden mezője + `username`.
      *Kész, ha:* **AR-01**, **AR-02** — a válasz alakja megfelel a
      [`plan.md`](./plan.md) 1. szakaszának, és a `reservedUntil` csak `pending`-nél van jelen.
      *Érintett:* `order/` (új fájlok).
      *Gazda:* B

- [ ] **B2.2** Lekérdező szolgáltatás: státusz-szűrés, `search` (vevőnév, e-mail, rendelés-azonosító,
      kis/nagybetűre érzéketlenül), lapozás a **B1.1**-ben általánosított segédfüggvénnyel, és a
      `username` **kötegelt** feloldása `UserRepository.findAllById`-val.
      *Kész, ha:* **AR-03**, **AR-05**, **AR-06**, **AR-07**, **AR-08**, **AR-09** — és a
      `username` feloldása egyetlen lekérdezéssel történik (nincs N+1).
      *Érintett:* `order/` (új szolgáltatás), `repo/UserRepository.java` (csak olvasás).
      *Gazda:* B

- [ ] **B2.3** A `@GetMapping` bekötése az `AdminOrderController`-be; a leképezés az
      `OrderMapper.toResponse` eredményét bővíti, nem épít párhuzamos leképezést.
      *Kész, ha:* **AR-01**, **AR-04** — a végpont a teljes rendeléshalmazt adja, legújabb elöl.
      *Érintett:* `order/AdminOrderController.java`, `order/OrderMapper.java` (csak olvasás).
      *Gazda:* B

## B-M3 · Backend teszt

- [ ] **B3.1** `AdminOrderListTest` az `hu.webshop.support.IntegrationTest` bázison: valódi HTTP,
      valódi Postgres. **Minden előfeltétel kizárólag a publikus API-n** épül — admin belépés,
      regisztráció, termékfelvétel, rendelésleadás —, közvetlen adatbázisírás nélkül.
      Mintája: `order/OrderTestSupport.java` és `order/AdminOrderStatusTest.java`.
      *Kész, ha:* **AR-01…AR-09** mindegyikéhez tartozik egy asszertáló teszteset, és a
      `mvn test -Dtest=AdminOrderListTest` zöld.
      *Érintett:* `server-java/src/test/java/hu/webshop/order/AdminOrderListTest.java` (új).
      *Gazda:* B

- [ ] **B3.2** Jogosultsági esetek: kérés token nélkül és customer tokennel — ténylegesen
      lefuttatva, nem az interceptor létére hivatkozva.
      *Kész, ha:* **AR-10**, **AR-11** — 401, illetve 403, `{ error }` törzzsel.
      *Érintett:* `AdminOrderListTest`.
      *Gazda:* B

## B-M4 · Típustükör

- [ ] **B4.1** `client/src/api.ts` bővítése a [`plan.md`](./plan.md) 2. szakaszában rögzített
      **pontos** alakkal: `AdminOrder`, `AdminOrderQuery`, `AdminOrderPage`, `getAdminOrders`,
      `updateAdminOrderStatus`. A meglévő `Order`, `OrderStatus`, `ORDER_STATUS_LABELS`
      exportokra épül, nem definiál újat.
      *Kész, ha:* `npm run build` zöld (ES2020-korlát betartva), és a `client/test/api.test.ts`
      lefedi a query-paraméterek összeállítását.
      *Érintett:* `client/src/api.ts`, `client/test/api.test.ts`.
      *Gazda:* B

- [ ] **B4.2** Ellenőrzés: `cd server-java && mvn test`, majd `npm run build` és `npm test` a repó
      gyökeréből.
      *Kész, ha:* mindhárom zöld. Piros esetén a jelentésbe a **valódi** hibakimenet kerül.
      *Gazda:* B

---

# F csomag — kliens

> Az F csomag a **kész** `client/src/api.ts`-re épül. Ha egy szükséges típus vagy függvény
> hiányzik onnan, azt **jelenteni** kell — az `api.ts` nem az F csomag tulajdona.

## F-M1 · Képernyő

- [ ] **F1.1** `client/src/pages/AdminOrders.tsx`: táblázatos lista (azonosító, dátum, vevő +
      `username`, tételek, végösszeg, státusz), a `getAdminOrders` hívásával. A státuszcímkék az
      `ORDER_STATUS_LABELS`-ből jönnek. Betöltési és hibaállapot kezelése.
      Mintája: `client/src/pages/AdminUsers.tsx` (betöltés, hibakezelés, `Intl.DateTimeFormat`).
      *Kész, ha:* **AR-13**.
      *Érintett:* `client/src/pages/AdminOrders.tsx` (új).
      *Gazda:* F

- [ ] **F1.2** Szűrő- és lapozó-vezérlők: státusz-választó (`pending` / `expired` / `delivered` /
      összes) és kereső mező; lapozó, ha egynél több lap van.
      *Kész, ha:* a vezérlők a `getAdminOrders` query paramétereire képződnek le, és a lapozó a
      válasz `page` / `totalPages` mezőit használja.
      *Gazda:* F

- [ ] **F1.3** Foglalás-állapot: **minden** sor a meglévő `ReservationStatus` komponenst rendereli
      (`<ReservationStatus order={…} />`, `client/src/ReservationStatus.tsx:35`). A státusz
      szerinti elágazás a komponens dolga — a képernyő **nem** ismétli meg, és nem számol saját
      hátralévő időt.
      *Kész, ha:* **AR-15**.
      *Érintett:* `client/src/ReservationStatus.tsx` (csak felhasználás, nem módosul).
      *Gazda:* F

- [ ] **F1.4** Státuszváltó vezérlő soronként, az `updateAdminOrderStatus` hívásával. Sikernél a sor
      frissül; hibánál a **szerver magyar hibaüzenete** jelenik meg változtatás nélkül. Az
      átmenettáblát a kliens **nem** másolja le.
      *Kész, ha:* **AR-14**.
      *Gazda:* F

- [ ] **F1.5** Útvonal és menü: `/admin/orders` a `RequireAdmin` őr alatt, és „Rendelések" link a
      fejléc admin menüjében a „Termékek" és „Ügyfelek" mellé.
      *Kész, ha:* **AR-12**.
      *Érintett:* `client/src/App.tsx:38-39` (menü), `client/src/App.tsx:73-89` (admin útvonalak).
      *Gazda:* F

## F-M2 · Kliens teszt

- [ ] **F2.1** `client/test/AdminOrders.test.tsx` az `AdminUsers.test.tsx` mintájára: mockolt `api`
      modul, `@testing-library/react` + `user-event`. Lefedi a lista megjelenítését, a `pending`
      sor visszaszámlálóját, a sikeres státuszváltást és a szerverhiba megjelenítését.
      *Kész, ha:* **AR-12…AR-15** mindegyikéhez tartozik asszertáló eset, és az `npm test` zöld.
      *Érintett:* `client/test/AdminOrders.test.tsx` (új).
      *Gazda:* F

- [ ] **F2.2** Ellenőrzés: `npm run build` és `npm test` a repó gyökeréből.
      *Kész, ha:* mindkettő zöld. Piros esetén a jelentésbe a **valódi** hibakimenet kerül.
      *Gazda:* F

---

# V csomag — átvétel

- [ ] **V1.1** A `requirements.md` 5. szakaszának tételes végigmérése: `AR-01` … `AR-19`,
      pontonként `[teljesül]` / `[nem teljesül]` / `[kétséges]`, mindegyik mellé bizonyítékkal
      (`fájl:sor`, tesztnév vagy tényleges kimenet).
      *Kész, ha:* mind a 19 pont ítéletet kapott, és egyetlen `[teljesül]` sincs bizonyíték nélkül.
      *Gazda:* V

- [ ] **V1.3** Az **`AR-19`** end-to-end forgatókönyvének végigjátszása a `./start.sh`
      (Windowson `.\start.cmd`) által felhozott teljes stacken, a lépések és a látott eredmény
      rögzítésével. Ez az **egyetlen** kézi ellenőrzési pont a listán.
      *Kész, ha:* **AR-19** — a forgatókönyv le van írva, végig lett játszva, és a látott
      eredmény szerepel a jelentésben.
      *Gazda:* V

- [ ] **V1.2** Dinamikus ellenőrzés: `cd server-java && mvn test` (Docker kell hozzá), valamint
      `npm run build` és `npm test` a repó gyökeréből. A **tényleges** kimenet kerül a jelentésbe.
      *Kész, ha:* **AR-18** — vagy ha piros, a valódi hibakimenettel indokolva.
      *Gazda:* V

---

## Függőségi sorrend

```
B1.1 ─┬─► B2.1 ──► B2.2 ──► B2.3 ──► B3.1 ──► B3.2 ──► B4.1 ──► B4.2
B1.2 ─┘                                                            │
                                                                   ▼
                                              F1.1 ──► F1.2 ──► F1.3 ──► F1.4 ──► F1.5 ──► F2.1 ──► F2.2
                                                                                                     │
                                                                                                     ▼
                                                                                              V1.1 ──► V1.2
```

- **B1.1 és B1.2** egymástól függetlenek, de mindkettő megelőzi a B2-t.
- **Az F csomag csak B4.1 után indulhat** — az `api.ts`-re épül.
- **A V csomag a legvégén**, friss szemmel, a teljes kritériumlistára.
