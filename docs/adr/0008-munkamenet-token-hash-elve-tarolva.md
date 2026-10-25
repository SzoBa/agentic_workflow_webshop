# A munkamenet-tokennek csak a lenyomata tárolódik, és a hiányzó lejárat érvénytelenséget jelent

A jelszót (helyesen) sosem tároljuk, csak a BCrypt-hashét — pont azért, hogy egy adatbázis-szivárgás
ne adjon fiókokat. A munkamenet-token viszont **nyersen** feküdt a `users.token` oszlopban, és a
token bemutatóra szóló hitelesítő adat: aki elolvassa, az jelszó ismerete nélkül lesz bárki. Egy
mentésfájl, egy lekérdezés a naplóban, egy csak olvasható riportáló replika vagy egy jövőbeli
végpont SQL-injektálásra hajazó hibája elég hozzá. A jelszó melletti aszimmetria tehát nem tartott:
az egyik mező hash, a másik mellette a hozzá tartozó belépőkártya.

Ezért a kiadó válasz továbbra is a **nyers** tokent adja a kliensnek, az adattárolóba viszont csak
a `sha256(token)` hexadecimális lenyomata kerül, és a feloldás is a lenyomat szerint keres. A
művelet ezzel nem lesz drágább: egy hash a kiadásnál, egy a feloldásnál, az egyediségi index
változatlanul működik.

A **hash típusa** külön döntés: gyors kriptográfiai hash (SHA-256), nem jelszóhash. A jelszó
alacsony entrópiájú emberi találmány, ezért kell hozzá szándékosan lassú, sózott függvény. A token
32 bájt `SecureRandom` kimenete: nincs szótár, amivel támadható lenne, viszont **minden**
hitelesített kérés feloldana egyet — a BCrypt költségét itt a normál üzem fizetné, cserébe semmiért.

Ugyanez a kör zárja a másik fail-open alapállást is: a `tokenExpiresAt == null` eddig „nem járt le"
jelentett, azaz örökéletű munkamenetet. A hiányzó biztonsági adat helyes olvasata a **tiltás**, nem
az engedés — az állapot pedig elérhető volt, mert a séma megengedte, és a `db.json` import olyan
adatból dolgozik, ahol lejárat egyáltalán nem létezett.

## Considered Options

- **A token nyers tárolása (a korábbi megvalósítás)** — az egyetlen előnye, hogy a `findByToken`
  közvetlenül a kapott értékkel keres. Cserébe az adatbázis olvasása minden belépett felhasználó
  megszemélyesítését jelenti. Ez volt a hiba, amit ez az ADR javít.
- **BCrypt a tokenre is** — a jelszóval azonos kezelés vonzó egységesség, de a BCrypt keresésre
  alkalmatlan: nincs determinisztikus érték, amire indexelni lehetne, tehát a feloldáshoz végig
  kellene próbálni a felhasználókat. Ráadásul a lassúság itt tiszta veszteség (lásd fent).
- **Sózott SHA-256** — a só a szótártámadás ellen véd, ami véletlen 32 bájtnál nem létező fenyegetés.
  Cserébe a lenyomat felhasználónként más lenne, tehát a globális egyediségi index (I-6) és a
  „tokenből felhasználó" keresés is elveszne.
- **A token kivétele az adatbázisból (aláírt, állapotmentes token)** — megszüntetné a tárolt titkot,
  de a visszavonhatóságot is: a spec szerint a kijelentkezés azonnal érvényteleníti a tokent (7.1),
  és egy felhasználóhoz egy munkamenet tartozik (I-6). Mindkettő szerver oldali állapotot kíván.
- **`NOT NULL` a lejárat oszlopon** — a fail-open állapotot szerkezetileg zárná ki, de nem járható:
  a kijelentkezett felhasználónál mindkét mező üres. A helyes megszorítás nem a mező kitöltöttsége,
  hanem a kettő **együttállása**.

## Consequences

- Az adatbázisban a `users.token` oszlop `token_hash` néven él tovább (`V2` migráció): a név nem
  hazudhat arról, mi van benne. Az egyediségi index vele együtt átnevezésre került.
- A migráció **minden meglévő munkamenetet töröl** (a nyers tokenekből nem képezhető visszamenőleg
  a hozzájuk tartozó lenyomat úgy, hogy a kliens kezében lévő érték is működjön). Következmény:
  a frissítés után mindenki újra bejelentkezik. Ez egyszeri, látható és magyarázható esemény —
  szemben azzal, hogy a tokenek nyersen maradnak.
- A `users_session_pair_chk` megszorítás kikényszeríti, hogy a tokenlenyomat és a lejárat csak
  **együtt** legyen kitöltve. A `SessionService.isExpired` fail-open ága ezzel nemcsak javítva,
  hanem elérhetetlenné is vált: az invariáns szerkezeti, nem konvenció. A `DbJsonImporter` eddig is
  nullázta mindkét mezőt, tehát az importálási út változatlan.
- A `⚙` katalógus új esettel bővült (**K-57**): bejelentkezés után a tárolt érték nem a kiadott
  token. HTTP-n nem mérhető — közvetlen adatbázis-olvasást igényel —, ezért integrációs teszt fedi
  (`auth/SessionTokenStorageTest.java`).
- A napló és a válaszok szerződése nem változik: a token továbbra sem kerül naplóba (7.3), és a
  publikus nézetekben sem jelenik meg (K-55).
- Amit ez az ADR **nem** old meg: a seed admin rögzített jelszava (`requirements.md` 8., K-9
  korlát). Ugyanabba az osztályba tartozik — tárolt, ismert hitelesítő adat —, de a konformancia
  bootstrapje (B-1) épp ezekre az értékekre épül, ezért a csere spec-módosítás. A rendes megoldás,
  ha egyszer sorra kerül: a seed jelszó környezeti változóból jön, és ennek hiányában a rendszer
  vagy nem hoz létre fiókot, vagy véletlen jelszót generál és **egyszer** naplózza — így az „elfelejtettem
  lecserélni" nem lehet a csendes alapértelmezés.
