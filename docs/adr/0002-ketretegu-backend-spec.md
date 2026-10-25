# A backend specifikációja a célállapotot írja le, szabályonként megjelölve, mi újdonság

A backend Java/Spring újraírásához teljes specifikációra van szükség, a jelenlegi rendszernek
viszont van hat ismert, javítandó eltérése. Ahelyett, hogy két dokumentumot vezetnénk (egy
„ahogy most van" felmérést és egy „ahogy legyen" tervet), egyetlen specifikáció készül, amely a
**célállapotot** írja le, és minden szabálynál megjelöli, hogy az `MA IS` érvényes-e, vagy `ÚJ`
— vagyis a javítási fázis hozza. Amikor egy javítás elkészül, a jelölés `MA IS`-re fordul, és a
dokumentum a végén pontosan a létező rendszert írja le.

## Considered Options

- **Hibahű felmérés, javítások külön** — a spec kizárólag a jelenlegi viselkedést rögzíti, a hat
  eltérés pedig „ismert hibák" listaként szerepel. A migráció így bájtra összevethető marad a
  Node-implementációval, viszont a javításokat egy második dokumentumkörben kellene megtervezni,
  és a Java-oldalnak előbb a hibás viselkedést kellene reprodukálnia, hogy aztán átírja.
- **Csak célállapot, jelölés nélkül** — rövidebb dokumentum, de olvasás közben nem derül ki,
  melyik mondat írja le a futó rendszert és melyik a szándékot. Egy hiba bejelentésekor nem
  eldönthető, hogy a kód vagy a spec a hibás.

## Consequences

- A dokumentum **élő**: a javítási fázis minden lépése után jelöléseket kell átvezetni benne.
  Ha ez elmarad, a spec csendben félrevezetővé válik — ez a karbantartási ára a döntésnek.
- A konformancia-katalógus (`konformancia.md`) a célállapotot méri, ezért a javítások elkészülte
  előtt a **jelenlegi Node-backend sem teljesíti** az összes esetet. Ez szándékos: ugyanaz a
  katalógus vezérli a javítási és a migrációs fázist.
- A Java-implementációnak sosem kell szándékosan hibás viselkedést megépítenie.

## Utóélet (2026-07-26)

A kétrétegű jelölés **betöltötte a szerepét**, és a migráció lezárultával nagyrészt tárgytalan:
minden szabály `MA IS`, mert a rendszer utolérte a specet. Két tanulság maradt:

- A `MA IS` / `ÚJ` jelölés **karbantartási költsége valós volt**: az A fázis végén három jelölés
  bennfelejtve maradt `ÚJ`-ként olyan viselkedésnél, ami már működött. Ez pontosan az a csendes
  félrevezetés, amit a Consequences előre jelzett.
- A `FORRÁS` jelölés **túlélte a döntést**, sőt szerepet váltott: már nem a futó rendszer
  sajátosságát írja le, hanem a régi `db.json` importálásakor érvényes szabályokat
  (`DbJsonImporter`). Ez a réteg tehát nem törölhető a specből.
