# A backend Java/Spring Boot + Postgres alapon íródik újra, big-bang módon, párhuzamos verifikációval

A backend (2183 sor TypeScript, 22 végpont) Java 25 + Spring Boot + Maven alapra költözik, a
lowdb JSON-fájl helyett Postgresre, Dockerrel és Testcontainers-alapú tesztekkel. Az átállás
**big-bang**: a Java-implementáció teljes egészében megépül, miközben a Node-backend állva marad
**referenciaimplementációként**, és a nyelvfüggetlen konformancia-katalógus mindkettőn futtatható.
Átváltás csak akkor történik, amikor minden eset zöld.

## Considered Options

- **Strangler minta (végpontonkénti átvezetés proxyval)** — élesben futó, kockázatérzékeny
  rendszernél ez a bevált út, itt viszont a két backend **közös adatállapotot** igényelne két
  különböző tárolással (JSON-fájl és Postgres). Az ebből fakadó szinkronizációs probléma nagyobb,
  mint amit a fokozatosság megold.
- **Rétegenkénti átállás (előbb olvasó, aztán író végpontok)** — korábbi részeredményt ad, de a
  rendszer sokáig félkész állapotban áll, és ugyanaz az adatmegosztási probléma áll fenn.
- **Köztes lépés: Java + fájl/memória alapú tárolás, Postgres később** — a migrációban egyszerre
  csak a nyelv változna. Cserébe egy teljes perzisztencia-réteg készülne el eldobásra, miközben
  a konformancia-katalógus úgyis a megfigyelhető viselkedést méri, nem a tárolást — a „két
  változó egyszerre" ellenérv így nagyrészt elesik.

## Consequences

- A tárolásváltás **szemantikát érint**, ezért a migrációs tervben tételesen szerepel: az
  azonosítók típusa és generálása, a listák sorrendje (a beszúrási sorrendet Postgresben explicit
  `ORDER BY` nélkül semmi nem garantálja), a tranzakcióhatárok, valamint az indításkori seed és
  a „legalább egy admin" invariáns megteremtése.
- A `normalizeDb` séma-migrációjának nagy része **értelmét veszti** relációs sémán (hiányzó mező
  nem létezhet `NOT NULL DEFAULT` mellett). Ez a rész a specifikációban „a forrásimplementáció
  sajátossága" jelöléssel szerepel: nem követelmény, de meglévő `db.json` importálásakor ezek a
  szabályok érvényesek.
- A Node-backend nem törölhető addig, amíg a katalógus mindkét oldalon nem zöld — a `server/`
  mappa élettartama az átváltásig tart.

## Utóélet (2026-07-26)

A big-bang átállás **végrehajtva**; a `server/` mappa törölve. A kikötés — „a Node-backend nem
törölhető addig, amíg a katalógus mindkét oldalon nem zöld" — teljesült, a mérési jegyzőkönyvvel
együtt: [ADR-0006](0006-atvaltas-a-java-backendre.md).

Amit a döntés helyesen mért fel: a tárolásváltás valóban **szemantikát érintett**. A listák
sorrendjét explicit `ORDER BY seq` tartja, az azonosítók szövegesek maradtak, a
foglalás-ellenőrzés sorzárolással egy tranzakcióban fut, és a `normalizeDb` szabályai
importáló-feladattá váltak (`DbJsonImporter`), ahogy a Consequences előre jelezte.

Amit **nem** látott előre: a jelszóhash-elés nem konvertálható (scrypt → BCrypt), ezért egy
importált adatállomány felhasználói új jelszót igényelnek. Ez nem a tárolás, hanem a
kriptográfiai könyvtár váltásából jött.
