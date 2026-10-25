# Az átváltás megtörtént: a Node-backend eltávolítva, a szerveroldal Java/Postgres

Az [ADR-0004](0004-java-spring-postgres-migracio.md) big-bang migrációja lezárult. A
Java/Spring Boot + PostgreSQL implementáció (`server-java/`) átvette a szerveroldalt, a
Node/Express + lowdb backend (`server/`) pedig **törölve** lett. A repó ettől kezdve egy npm
workspace-t (`client/`) és egy Maven-modult (`server-java/`) tartalmaz.

Az ADR-0004 kikötése — „a `server/` mappa élettartama az átváltásig tart", és a Node-backend
addig nem törölhető, amíg a katalógus mindkét oldalon nem zöld — **teljesült**. Ez az ADR a
teljesülés jegyzőkönyve is, mert a mérés az átváltás után már nem megismételhető.

## Mire alapozva (mérés: 2026-07-26)

| Mérés | Node (referencia) | Java |
|---|---|---|
| Konformancia-katalógus, HTTP-n futtatható esetek | 54 / 54 | **54 / 54** |
| A 13 `⚙` eset (HTTP-n nem mérhető) | nincs lefedve | **13 / 13**, integrációs teszttel |
| Saját teszt-készlet | 390 teszt | **220 teszt** |
| Válasz-összehasonlítás (`compare.mjs`, 58 lépés) | — | **0 érdemi eltérés** |

A válasz-összehasonlítás a döntő bizonyíték: nem csak azt méri, hogy mindkét backend teljesíti-e
a katalógust, hanem hogy **ugyanazt válaszolják-e** — mezőnév, érték, státuszkód és
`Content-Type` szinten. Két implementáció attól még eltérhet, hogy mindkettő zöld.

Az egyetlen megmaradt különbség a **JSON-kulcssorrend** volt hat válaszban. Elfogadva: a
kulcssorrend a szabvány szerint nem hordoz jelentést, a kliens névvel olvas, és a *referencia
maga sem következetes* (a lowdb a létrehozáskori mezősorrendet őrzi, ezért egy seed termék más
sorrendet ad, mint egy adminként felvett). A mezők halmaza és értéke azonos volt.

A meglévő kliens **kódmódosítás nélkül** működött a Java backend ellen (katalógus, bejelentkezés,
admin nézet, SPA-visszaesés, mélylink). A mérés közben előkerült egy kliensoldali hiba — a
munkamenet-token effektben állt be, így a gyermekkomponensek betöltő effektjei token nélkül
indultak —, ez **nem** migrációs eltérés volt (bármely helyes backend 401-et ad fejléc nélküli
kérésre), és azóta javítva van.

## Considered Options

- **A `server/` megtartása „biztonsági másolatként"** — a git történet ezt már megoldja, futó
  kódként viszont árat kérne: két implementációt kellene szinkronban tartani minden
  spec-változásnál, miközben az egyiket senki nem futtatja. A kétfejű szerződés a legdrágább
  fajta dokumentációs adósság.
- **A `server/` átalakítása „referencia-teszthámmá"** (csak a konformancia-futtatáshoz) — vonzó,
  de a katalógus **nyelvfüggetlen** és kizárólag HTTP-n mér: a futtatónak nincs szüksége a
  Node-implementációra. A hám a valódi backend nélkül önmagában nem bizonyít semmit.
- **Fokozatos leépítés (előbb a route-ok, aztán a tesztek)** — a big-bang döntés (ADR-0004) épp
  azért született, mert a két backend közös adatállapotot igényelne két különböző tárolással.
  Ugyanez az érv a leépítésre is áll: félig eltávolítva egyik oldal sem futtatható.

## Consequences

- **A `spec/backend/` szerepe megváltozott.** Eddig két rétegre mutatott (a Node „mai"
  viselkedése és a célállapot); mostantól egyetlen implementáció szerződése. A `MA IS` / `ÚJ`
  jelölések már csak a dokumentum olvasástörténetét őrzik — minden szabály `MA IS`.
  A `FORRÁS` jelölések viszont **továbbra is élnek**: a séma nélküli JSON-tároló sajátosságai a
  `db.json` importálásakor érvényes szabályok maradnak
  ([`DbJsonImporter`](../../server-java/src/main/java/hu/webshop/bootstrap/DbJsonImporter.java)).
- **A teszt-lefedettség szerkezete átrendeződött, és ez nem 1:1 csere**: 390 Vitest szerver-teszt
  helyett 221 JUnit teszt. A darabszám önmagában félrevezető (a Vitest-esetek finomabb
  szemcsézetűek voltak), de az őszinte megfogalmazás az, hogy **a backend egységszintű
  asszertációiból nettó veszteség van**. Amit cserébe kaptunk: minden teszt **valódi
  Postgresszel és valódi HTTP-n** fut — tehát a migrációk, a részleges és `LOWER()`-es indexek
  meg a sorszintű zárolás is mérve van —, és köztük van az a 13 `⚙` eset, amit a Node oldalon
  soha nem sikerült mérni. A viselkedési lefedettség végső mércéje továbbra is a
  konformancia-katalógus. A `npm test` mostantól kizárólag a kliens 233 tesztje.
- **A backend indítása már nem `npm` dolga.** Nincs `npm start`, és az `npm run dev` csak a
  klienst indítja; a szerver `cd server-java && mvn spring-boot:run`. Aki eddig egyetlen
  paranccsal indította a teljes stacket, annak ez két terminál.
  *(2026-07-27: az egyparancsos indítást a repó gyökerében lévő `start.sh` visszahozta —
  a két build-lánc külön maradt, csak a kézi lépéssort fogja össze.)*
- **Fejlesztéshez Docker kell**, mert a Postgres onnan jön — a lowdb „nulla infrastruktúra"
  kényelme elveszett. Cserébe a séma valódi megszorításokkal védi az invariánsokat.
- **A `docs/migration/` megszűnt.** A B-M7 mérési jegyzőkönyve ebbe az ADR-be olvadt, a
  2026-07-19-i félbehagyott scaffold pedig okafogyottá vált, amikor a `server-java/` elkészült.
- **Az importáló egyszeri eszköz.** A `db.json` átvétele a migráció idejére szól; ha már nincs
  átveendő állomány, a `DbJsonImporter` és az `IMPORT_FILE` kulcs elhagyható. A jelszavak
  szándékosan **nem** jönnek át (scrypt → BCrypt nem konvertálható), tehát az importált fiókok
  új jelszót igényelnek.
