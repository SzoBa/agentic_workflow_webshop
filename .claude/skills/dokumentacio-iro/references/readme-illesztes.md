# A README illesztése — a 3. fázis

A gyökér `README.md` **nem** a feature naplója, és nem is az API teljes referenciája. Egy
olvasónak szól: aki most találkozik a projekttel, és el akarja indítani, majd megérteni, mit
csinál. Minden bővítés ehhez az egy olvasóhoz méretezendő.

## Melyik szakasz mit fogad be

A README szakaszai adottak. Előbb **olvasd el a meglévő fájlt**, és azonosítsd a szakaszokat —
a lenti szerepek a jellemző alakot írják le, nem a fájl pillanatnyi tartalmát.

| A szakasz szerepe | Mi kerül bele a feature-ből | Mi NEM |
|---|---|---|
| stack / követelmény | új futásidejű elem, új verzióigény | könyvtár, amit csak egy modul használ |
| indítás | új kötelező lépés a felállításban | fejlesztői kényelmi trükk |
| környezeti változók | **minden** új változó, alapértékkel és azzal, mi történik nélküle | belső konstans, ami nem env-ből jön |
| parancsok | új futtatható parancs | egyszeri, kézzel kiadott parancs |
| mappastruktúra | új mappa vagy új, önálló szerepű fájl | minden egyes új osztály |
| API-végpontok | **minden** új végpont, egy soros leírással | kérés- és válaszsémák — az a leíró dolga |
| „hogyan működik" / viselkedés | az a szabály, ami **meglepi** az olvasót | a magától értetődő lépés |
| dokumentáció-mutatók | új, tartósan olvasandó dokumentum | átmeneti jegyzet, futási napló |
| továbbfejlesztési ötletek | **innen törlöd**, ha a feature megvalósította | új ötlet, amit senki nem kért |

Az utolsó sor a leggyakrabban elfelejtett: ha a feature egy korábban ötletként felsorolt hiányt
pótolt, az az elem **elavult** — a törlése a munka része, nem külön feladat.

## Mit írj a végponttáblába

Egy sor egy végpont: metódus, teljes útvonal, és egy magyar félmondat arról, mit ad.

**A rövidítés tilos**, akkor is, ha szemre kényelmesebb. Egy `POST | /api/auth/register ·
/login · /logout` alakú sor három végpontból egyet dokumentál: a `/login` önmagában nem
útvonal, és aki keresésre használja a README-t, nem találja meg. A leltár ezt hiányként
jelzi — nem hibásan, hanem helyesen.

A jogosultságot a tábla **elrendezése** hordozza (külön tábla a védett névtérnek, fölötte egy
mondat arról, mi a válasz token nélkül és rossz szerepkörrel), nem végpontonként ismételve.

## Mit tilos beleírni

- **Sémát.** Mezőnevek, típusok, státuszkód-táblák: az OpenAPI-leíróé. A README annyit mond,
  *mit csinál* a végpont; a *hogyan hívom* a leíróból jön. Ha mindkettőben benne van, két
  igazság lesz belőle, és a leltár csak az egyiket méri.
- **A `spec/` másolatát.** A követelményekre **hivatkozol**, nem átemeled őket. A spec a norma;
  ha a README-ben is ott a szövege, az utólagos módosítás két helyen hazudik.
- **Belső fejlesztési történetet.** Hogy melyik agent mit írt, hány javító kör volt, mennyibe
  került — az a futási napló dolga.
- **Elavult hivatkozást új mellé.** Ha egy meglévő mondat már nem igaz, azt **javítod**, nem
  kiegészíted egy „ma már inkább" mondattal.

## Az elavult rész, amit menet közben találsz

A README-t egy feature miatt olvasod végig — és ilyenkor derül ki, hogy máshol is avult.
Három eset, három válasz:

| Amit találsz | Mit csinálsz |
|---|---|
| **Tényszerűen hamis** állítás (nem létező parancs, rossz port, hiányzó végpont) | javítod, és a jelentés külön szakaszában kimondod |
| **Hiányos, de nem hamis** (egy új lehetőség nincs említve) | javítod, ha egy sor; jelented, ha szakaszt igényel |
| **Szerkezeti gond** (rossz sorrend, két helyen ugyanaz) | **nem** nyúlsz hozzá, csak jelented — az átszervezés emberi döntés |

A határ ott van, ahol a diff olvashatatlanná válik. Aki a feature commitját nézi, a feature
változását akarja látni; egy átszervezett README ezt elrejti.

## A nyelv

A README **magyar**, a projekt prózanyelvi szabálya szerint — a szakaszcímek, a táblázatok
szövege és a magyarázatok is. Ami angol marad: a kódazonosítók, a parancsok, az útvonalak, a
környezeti változók nevei és a fájlnevek. Ezeket ne fordítsd le.

Hibaszöveget, ha idézel, **szó szerint** idézel — ugyanaz a szabály, mint a leírónál.
