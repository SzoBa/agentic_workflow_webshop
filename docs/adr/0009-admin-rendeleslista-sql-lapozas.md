# Az admin rendeléslista a lekérdezésben szűr és lapoz

A `GET /api/admin/orders` mostantól **SQL-ben** szűr és lapoz: a státusz-szűrés, a szabadszavas
`search` és a lapozás is a lekérdezésbe kerül, és egy kérés legfeljebb egy lapnyi rendelést tölt
be. Korábban a végpont a **teljes** rendeléshalmazt behúzta — tételekkel együtt, mert a
`findAllByOrderBySeqDesc` `@EntityGraph(attributePaths = "items")`-et hordozott —, majd memóriában
szűrt és vágott. A HTTP-szerződés **egyetlen karakterrel sem változik**.

A lapozás MATEMATIKÁJA nem költözik SQL-be: a vágásokat továbbra is a `Catalog` adja, a kiemelt
`Catalog.window(total, page, pageSize, defaultPageSize)` alakban. Az `AdminOrderQueryService` ebből
képez `offset`/`limit`-et.

## Miért most, és miért csak itt

Ez a döntés **felülírja** a `Catalog` osztálydokumentációjának indoklását — de csak az admin
rendeléslistára. Az az érvelés (a szűrés/lapozás szemantikája a HTTP-szerződés része, ezért
memóriában dől el) továbbra is érvényes a **termékkatalógusra**, és ott marad is.

A különbség nem az érvelésben van, hanem az előfeltevésében. A katalógus **korlátos** halmaz:
adminisztrátor gondozza, kézzel nő, tíz-százas nagyságrend — a teljes lista betöltése olcsó. Az
`spec/admin-orders/plan.md` 4.5 ezt az érvelést vette át a rendeléslistára, kimondva a premisszát is
(„a rendelésszám nagyságrendje ezt megengedi"). A premissza viszont **nem áll**: a rendelés
append-only, felhasználók hajtják, és nincs plafonja. Ötvenezer rendelésnél, tételenként hárommal,
egy 25 soros lap kiszolgálásához nagyságrendileg 200 000 sor materializálódna JPA entitásként.

Az általánosítható szabály: ha egy döntést azzal indokolunk, hogy „ez illeszkedik a meglévő
mintához", ellenőrizni kell, hogy a mintát elfogadhatóvá tevő **tulajdonság** is fennáll-e. Itt ez
a tulajdonság a „korlátos halmaz" volt, és nem áll fenn.

## Considered Options

- **Marad a memóriában szűrés, de a premissza mérhetővé válik** („N rendelés alatt") — olcsó és
  őszinte, de csak elhalasztja a kérdést, és a korlát átlépését semmi nem jelzi futás közben.
- **`Pageable` a meglévő `@EntityGraph`-os lekérdezésre** — a kézenfekvő javítás, és **néma
  zsákutca**: a Hibernate a gyűjtemény-fetchet nem tudja SQL-ben lapozni, ezért `HHH90003004`
  figyelmeztetéssel behúzza az egész halmazt és memóriában vág. Ugyanaz a költség, csak elrejtve.
- **Kétlépcsős azonosító-lapozás** (a választott) — előbb a lap AZONOSÍTÓI (fetch join nélkül,
  `limit`/`offset`-tel, plusz egy `count`), utána a tételek betöltése csak ezekre az azonosítókra.
  Ugyanaz az alakzat, mint a már meglévő `usernamesOf` kötegelt feloldásé.
- **Natív SQL a teljes lapra** — a legnagyobb kontroll, de elveszne a `@EntityGraph` és a
  konverterek kezelése, és három helyen kellene karbantartani az entitás-leképezést.

## Consequences

- **Kérésenként három lekérdezés** fut egy helyett: `count`, azonosító-lap, majd az entitás-lap
  tételekkel. Ebből következik, hogy a `total` és a visszaadott lap **már nem ugyanabból a
  pillanatképből** származik. `READ COMMITTED` alatt egy párhuzamos rendelésleadás pillanatnyi
  eltérést okozhatna a kettő között, ezért a lekérdező tranzakció `REPEATABLE_READ` — csak olvasó
  tranzakción ez Postgresen nem jár szerializációs hibával.
- A `search` mostantól SQL `LIKE`. A mintában a `%`, a `_` és maga a menekítő jel (`!`) menekítve
  kerül a lekérdezésbe — enélkül egy `a_b` keresés az `axb`-re is illeszkedne, ami néma
  viselkedésváltozás lett volna a `String.contains` szemantikájához képest.
- A kis/nagybetű-függetlenség átkerül a Postgres `lower()`-jébe (a mintát továbbra is Java
  kisbetűsíti, `Locale.ROOT`-tal). Ez **mért** döntés, nem feltételezés: a fejlesztői és a
  teszt-adatbázis is `postgres:16-alpine`, `en_US.utf8` kollációval és `UTF8` kódolással, ahol a
  `lower('KOVÁCS ANNA')` helyesen `'kovács anna'`. ASCII-only `lower()` (`LC_CTYPE=C`) mellett ez a
  fordítás néma szerződésváltozás lenne, ezért az `AdminOrderSearchAndPagingTest` egy **nagybetűs
  ékezetes** keresést is mér — az őrzi ezt az előfeltevést. Megjegyzendő, hogy a séma már ma is
  támaszkodik a `lower()`-re (`users_username_lower_uidx`, `users_email_lower_uidx`).
- A `contains()` null-őre megszűnt: a `customer_name` és a `customer_email` `NOT NULL`, az `id`
  pedig elsődleges kulcs. Az elvesztése ártalmatlan is — az SQL `null like x` „nincs találat", pont
  amit a Java-őr adott.
- Az „ismeretlen `status` = teljes halmaz" szabály (AR-06) `in :statuses` alakban él tovább, az
  összes enum-értékkel. Ez **bizonyíthatóan** a teljes halmaz, mert a séma `status NOT NULL`
  `CHECK (status IN ('pending', 'expired', 'delivered'))`. Nullázható enum-paramétert azért nem
  használunk, mert a tipizálatlan `null` kötése Postgresen paramétertípus-hibába fut.
- **Index szándékosan NEM készül, és Flyway-migráció sem.** A `docs/backlog/admin-orders-followups.md`
  D3 tétele `LOWER()` indexet javasolt — az ezen a lekérdezésen **semmit nem érne**: a `like
  '%needle%'` minta vezető jokerrel kezdődik, amit btree index nem tud kiszolgálni. A javítás
  nyeresége nem az I/O, hanem hogy megszűnik a teljes halmaz **materializálása** JPA entitásként.
  Az a mérés, hogy mikortól kell mégis index, külön döntés: `pg_trgm` GIN index a `lower(...)`
  kifejezésekre, és egy `orders (seq)` index a rendezéshez (ma csak `(user_id, seq)` és `(status)`
  van). Ez új migrációt kíván, tehát külön specet.
- A `Catalog.window` mostantól **két** hívót szolgál ki, akik másképp használják (kivágás vs.
  `offset`/`limit`). A `CatalogWindowTest` méri, hogy a `window` és a `paginate` ugyanazokat a
  számokat adja minden query paraméter-határesetre — ez a bizonyíték arra, hogy a kiemelés a
  termék-lapozást nem változtatta meg.
