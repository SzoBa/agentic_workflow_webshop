# A készletfoglalás számolt adat, a lejárt rendelés önálló státusz

A túlértékesítés megszüntetéséhez a rendelés leadása immár készletet igényel. A megvalósítás
foglalás-alapú: a `stock` a **fizikai** darabszám marad, amit a leadás nem ír át; a foglalt
mennyiség **nem tárolt adat**, hanem a lejáratlan, kiszállítatlan rendelések tételeiből
számolódik, az elérhető mennyiség pedig a kettő különbsége. A készlet akkor csökken ténylegesen,
amikor a rendelés `delivered` státuszba kerül. A foglalás egy idő után lejár, és a rendelés ekkor
**`expired`** státuszt kap — ami nem végállapot: az admin utólag is teljesítheti, ha a fizikai
készlet fedezi.

## Considered Options

- **Azonnali levonás a leadáskor, foglalás-nyilvántartás nélkül** — egyszerűbb, de a `stock`
  jelentése elmosódik (se nem fizikai, se nem elérhető), és egy elhagyott rendelés véglegesen
  elveszi a darabszámot, mert nincs mi visszaadja.
- **Külön `reserved` számláló a terméken** — gyorsabb lekérdezés, de két számot kell szinkronban
  tartani, és a `Product` alakja is változik. A denormalizált mező minden lejáratnál és minden
  státuszváltásnál elcsúszhat.
- **`cancelled` mint státusznév** — a szó azt sugallja, hogy valaki visszavonta a rendelést,
  pedig itt egy határidő telt le. A `expired` megnevezi a tényleges okot.
- **`expired` mint végállapot** — tisztább életciklus, de ha az áru késve érkezik meg, a bolt nem
  tudja teljesíteni a rendelést, és a vevőnek újra kell rendelnie a mostani áron.

## Consequences

- A vásárlói termékválaszok új, **számolt `available` mezőt** kapnak (`ratingAvg`/`ratingCount`
  mintájára), és az `inStock` szűrő erre vonatkozik. A `stock` az admin által szerkesztett
  fizikai szám marad — a két mező **nem** ugyanaz, és nem is cserélhető fel.
- A `delivered`-re váltás mostantól **elbukhat** (409), ha a fizikai készlet nem fedezi a
  tételeket. Ez zárja ki a negatív készletet.
- A lejáratot **tárolt státusz** jelöli, amit periodikus ütemező ír be. Ebből következik egy
  vállalt korlát: ha az ütemező nem futott le (például a szerver állt), egy már lejárt foglalás
  még mindig számít, és a vevőt olyan készlet miatt utasíthatjuk el, ami valójában felszabadult.
  A választott alternatíva (az időbélyegből számolt lejárat) ezt kizárta volna, de két helyen
  kellett volna karbantartani a lejárat fogalmát.
- A `pending` rendelések válaszában megjelenik a **számolt `reservedUntil`** időbélyeg, hogy a
  felület visszaszámlálót mutathasson anélkül, hogy ismerné a szerver konfigurációját.
