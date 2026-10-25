# A rendelési tétel a leadáskori termékadatok másolatát tárolja

Az admin szerepkör bevezetésével a termékek adatai először válnak szerkeszthetővé futásidőben,
és ez láthatóvá tett egy meglévő hibát: a rendelési tétel eddig csak a termék azonosítóját és
a darabszámot tárolta, így a leadott rendelések visszamenőleg megváltoztak a termék minden
átnevezésekor és átárazásakor, a termék törlésekor pedig megjeleníthetetlenné váltak.
Ezért a rendelési tétel mostantól a leadás pillanatában lemásolja a termék nevét és egységárát
is — a rendelés önhordó bizonylattá válik, amelyet a termékkatalógus későbbi változásai
nem érintenek.

## Considered Options

- **Termékverziózás** — minden szerkesztés új termékverziót hoz létre, a rendelés egy konkrét
  verzióra hivatkozik. Teljesebb megoldás és a teljes szerkesztési előzményt megőrzi, de a
  lowdb-alapú, szándékosan egyszerű adattárolóhoz mérten aránytalan bonyolultság.
- **Soft delete snapshot nélkül** — a termék sosem tűnik el véglegesen. Megoldja a törlés esetét,
  de az átnevezést és az átárazást nem: a régi rendelés tartalma továbbra is visszamenőleg
  változna. Nem elégíti ki a követelményt.

## Consequences

- A termék **valódi törlése** biztonságossá vált, mert a rendeléstörténet nem függ tőle. Az
  inaktiválás így nem a törlés helyettesítője, hanem önálló jelentésű művelet („levettem a polcról").
- A snapshot mezők **opcionálisak**, mert a feature előtt keletkezett rendeléseken nem szerepelnek.
  Ezeknél a megjelenítés visszaesik a termék felkeresésére, törölt termék esetén semleges
  helyettesítő szövegre. Migrációt szándékosan nem futtatunk: a leadáskori árat utólag nem lehet
  rekonstruálni, a friss adatból visszatöltött érték pedig igaznak látszó kitalált adat lenne.
- A termék neve és ára ezentúl **két helyen** szerepel (a katalógusban és a lezárt rendeléseken).
  Ez szándékos redundancia, nem normalizálási hiba — ne „javítsa ki" senki azzal, hogy a
  rendelés megjelenítését visszaköti az élő termékadatra.
