# Szimulált felhasználó — riport

**Rendszer:** Mini Webshop, vásárlási folyamat (termékkeresés → kosár → pénztár → visszaigazolás)
**Perszóna:** Patkó Béla · **Dátum:** 2026. aug. 2. · **Topológia:** dev (`./start.sh`, Vite `:5173` → API `:3001`)
**Kimenetel:** a cél teljesült — rendelés `06a2bc02-fd0d-4ffe-8237-379ddc1e98fa`, 1 db USB-C
töltőkábel, 1490 Ft —, de **négy nekifutásból**.

**A megfigyelés rögzítéséről.** A session anyaga (2. lépés) nem külön fájlban él: a darabjai
**ebbe a riportba lettek beolvasztva**, a 2. szakaszba. Kattintásonkénti, nyers interakciós napló
nem maradt fenn, tehát az F1–F9 megfigyelések bizonyítéka az, amit a 2. szakasz leír — nem
hivatkozható mögötte további rekord. Ezen kívül egyetlen dolog ellenőrizhető függetlenül, a
rendszerből: a `06a2bc02-fd0d-4ffe-8237-379ddc1e98fa` rendelés léte, egyetlensége és tartalma
(`GET /api/orders`), ami az 1. és a 8. forgatókönyv állítását fedi. Minden más találat
**önbevalláson** alapul; ahol ez érdemben gyengíti a következtetést, ott jelezve van (F5/F6 —
lásd 3.2).

Az összehasonlítás tárgya:
[`../scenario-catalog/scenario-katalogus.md`](../scenario-catalog/scenario-katalogus.md).

---

# 1. A perszóna definíciója

## Perszóna: Patkó Béla

**Ki:**
70+-os nyugdíjas, aki nem igazán barátja az online webshopoknak, de amit keres, itt elérhető nálunk.

**Cél ebben a session-ben:**
Az általa áhított USB-C töltőkábel csak itt kapható. Már regisztrált vásárló, aki terméket
szeretne vásárolni.

**Viselkedési minták:**
- *Hogyan navigál?* — Össze-vissza kattintgat, mert nem gyakorlott, és van, hogy dupla klikket
  használ, mert azt hiszi, mindegy/azt kell.
- *Mit csinál, ha hibát kap?* — Megpróbálja ugyanazt újra, indokolatlan újra rákattintásokkal.
- *Mit csinál, ha valamit nem talál?* — A szűrőnél röviden írja be a keresendőt, hogy több találatot
  kapjon, és név szerint keres csak, más szűrő nélkül.
- *Van-e tipikus „naiv" viselkedése?* — Nem érti, hogy ha többet kattint valahová, az talán többször
  átfut, és azt hiszi, a dupla klikk a használatos mindenhová.

**Elvárások:**
- *Mit tekint „elfogadható" rendszerviselkedésnek?* — Kulcsszavakra keres, pl.: kábel.
- *Mi váltaná ki a frusztrációját?* — Hiába kattintgat duplán, azt várja, hogy töltsön be gyorsan az
  oldal, és nem érti, miért baj, ha többször kattint, illetve miért tölt be lassan, amikor csak
  rövid szavakra keres az egész kódbázisban.

---

# 2. A megfigyelési sablon kitöltve

**Perszóna neve:** Patkó Béla (70+, nyugdíjas, nem gyakorlott online vásárló, mindenhová duplán
kattint, rövid kulcsszóra és csak névre keres)

**Cél:** Az USB-C töltőkábel megvásárlása — regisztrált vásárlóként, a rendelés elküldésével.
**Teljesült:** igen, de négy nekifutásból (rendelés `06a2bc02-fd0d-4ffe-8237-379ddc1e98fa`,
1 db, 1490 Ft).

---

**Első akció:** A bal oldali „Keresés" mezőbe beírtam, hogy `kábel` — nem böngésztem végig a
terméklistát, nem választottam kategóriát, nem használtam árszűrőt. Egy találat jött
(„USB-C töltőkábel, 1490 Ft"), ez ment jól.

---

**Talált-e problémát, amelyet a forgatókönyv-katalógus nem tartalmaz?**

[x] Igen  [ ] Nem

**Ha igen:** Kilencet, F1-től F9-ig. Hatot önálló pontként az alábbi listában — az 5. pont két
rokon megfigyelést fog össze, ezért öt pont hat F-számot visel —, a maradék hármat a lista utáni
„kisebb megfigyelések" bekezdésben. A legsúlyosabb kettő a katalógus vakfoltjában van.

1. **A belépés előtt összerakott kosár a bejelentkezéskor elveszik** (F1, kritikus).
   Beléptem a pénztárról, visszavitt a pénztárra — és ott „A kosarad üres" fogadott. Nincs
   összefésülés, nincs figyelmeztetés, nincs „a kosarad elveszett" üzenet.
   *Miért nem fedi a katalógus:* a **10. forgatókönyv** ugyanennek a mechanizmusnak (felhasználónkénti
   kosárkulcs) a **másik oldalát** méri — hogy „B" ne lássa „A" kosarát. Az adatvédelmi irány
   megvan, a **saját** kosár elvesztése nincs benne. A **7. forgatókönyv** (munkamenet lejár)
   kifejezetten elvárja, hogy „újbóli bejelentkezés után a kosár tételszáma és végösszege azonos a
   lejárat előttivel" — az anonim → belépett átmenetre viszont senki nem mondja ki ugyanezt.

2. **A mennyiség-mezőbe gépelés a régi érték mellé ír** (F2, kritikus).
   Dupla kattintás a `2`-n + `1` begépelése → **21 db, 31 290 Ft**. A dupla kattintás nem jelöli ki
   a mező tartalmát, ahogy minden más beviteli mezőben tenné.
   *Miért nem fedi a katalógus:* a **2. forgatókönyv** átállítja a mennyiséget 1-ről 2-re, és a
   kliens–szerver összegegyezést méri. Azt méri, hogy a **helyes** bevitel helyes összeget ad —
   nem azt, hogy a mező **hogyan veszi fel** a bevitelt. A 21-es eset ugyanúgy „egyező" lenne
   mindkét oldalon, tehát a 2. forgatókönyv zöldre futna egy 31 290 Ft-os félrerendelésen is.

3. **A darabszám kitörlése (Backspace) törli az egész tételt**, megerősítés nélkül (F3, magas).
   Nem lehet „átírni" a számot, mert a törlés és az új szám begépelése közben eltűnik a sor.
   *Miért nem fedi a katalógus:* nincs olyan forgatókönyv, ami a mennyiség-mező **köztes**
   állapotait (üres mező, 0, nem szám) vizsgálná — mind kész értékekkel dolgozik.

4. **A „Kosárba" gomb dupla kattintásra 2 db-ot rak be, vizuális visszajelzés nélkül** (F4, magas).
   *Miért nem fedi a katalógus:* a **8. forgatókönyv** kimondottan foglalkozik a türelmetlen dupla
   kattintással — de csak a **„Rendelés leadása"** gombon, és ott az elvárás teljesült is (egyetlen
   rendelés jött létre). A katalógus a dupla kattintást a *rendelésleadás* problémájának tekinti,
   nem a felület általános viselkedésének. Nálam a kosárba tétel volt az, ami minden alkalommal
   duplázott.

5. **Két helyen kellett kétszer kattintani ugyanarra** (F5–F6, közepes): a „Kosár" menüpont nem
   nyílt ki elsőre, a mennyiség lefelé nyila pedig az első kattintásra csak fókuszált, csak a
   másodikra léptetett.
   *Miért nem fedi a katalógus:* minden forgatókönyv „a vevő megnyitja a kosárfiókot" szinten
   fogalmaz, azaz feltételezi, hogy egy kattintás = egy állapotváltás.

**Kisebb, szintén nem katalogizált megfigyelések:** a „Tovább a vásárláshoz" link az üres
kosárfiókból törli a keresési szűrőt (F7); a pénztár „Név" mezőjébe a **felhasználónév** kerül, és
így is megy el a rendelésre (F8) — az **5. forgatókönyv** csak azt méri, hogy a három mező „a fiók
megfelelő értékeit" tartalmazza, azt nem, hogy a `username` alkalmas-e szállítási névnek; a
kosárfiók „Törlés" gombja pedig megerősítés nélkül, azonnal viszi a tételt (F9) — a mennyiség
javítása közben egyszer rá is nyomtam, és a sor visszavonhatatlanul eltűnt. Ez **nem** ugyanaz,
mint F3: ott a mező kiürítése törölt magától, itt a szándékos törlés nem kérdez vissza.

**Amit a katalógus lefed, és tényleg állt:** 1. forgatókönyv (végigvitt rendelés, azonosítóval,
kiürült kosárral — szerveroldalról is ellenőrizve), 5. forgatókönyv (előtöltött pénztár-űrlap),
8. forgatókönyv (dupla kattintás a leadás gombon **nem** duplázott: pontosan egy rendelés).

---

**Volt-e „naiv" viselkedési minta — amelyet a perszóna elkövetett, de a katalógus nem jelzett?**

Öt ilyen volt. Mindegyik közös vonása, hogy a katalógus **eredményeket** ír le („a vevő 2-re állítja
a mennyiséget"), nem **mozdulatokat** — így az a rés esik ki belőle, ahogy egy gyakorlatlan kéz
odajut az eredményhez.

1. **A dupla kattintás mint alapértelmezett mozdulat, mindenhol.** Nem csak a leadás gombon (amit a
   8. forgatókönyv ismer), hanem a „Kosárba" gombon, a menüpontokon, a beviteli mezőkön és a
   „Bejelentkezés" gombon is. Ez egyetlen sessionben három különböző következményt szült: fölös
   tétel a kosárban, szövegkijelölés a lapon, és két hitelesítési kísérlet.

2. **Számot úgy „átírni", hogy a régit nem jelölöm ki.** A perszóna a Wordből hozott reflexet
   használja (dupla kattintás = kijelölés), és nem nézi vissza, mi lett a mezőben. A katalógus a
   mennyiséget mindig kész értékként kezeli.

3. **Mező „kiürítése" mint javítási módszer.** Előbb törlöm a rosszat, aztán írom a jót — két
   lépésben. Az alkalmazás a köztes, üres állapotot végleges szándéknak vette.

4. **A saját nevem beírása felhasználónévként** (`Patkó Béla`), majd **ugyanannak a hibás
   bevitelnek a változtatás nélküli megismétlése**. A katalógusban nincs bejelentkezési
   forgatókönyv, pedig a vásárlási folyamat itt bukott meg a leglátványosabban — és a második
   próbálkozás értelmetlen ismétlése az IP-nkénti 10/15 perc korlát felé viszi a felhasználót.

5. **Kosárba pakolás bejelentkezés előtt.** A katalógus minden forgatókönyve „bejelentkezett
   vásárló"-val indul. Egy gyakorlatlan felhasználó nem lép be előre — nem tudja, hogy kellene.
   Ez az egyetlen premissza okozta a session legdrágább hibáját (F1).

---

**A szimuláció „okosabb" volt-e a perszónánál valahol?**

[x] Igen  [ ] Nem

**Ha igen:** Négy helyen, és ezek közül kettő érdemben megváltoztatta a kimenetelt — vagyis egy
valódi Patkó Béla vélhetően **nem** fejezte volna be a vásárlást.

1. **A számmező apró léptető-nyilainak felfedezése és használata.** Ez oldotta meg a feladatot,
   miután a gépelés kétszer is kudarcba fulladt. A nyilak ~10×10 képpontosak, csak hover-re
   láthatók igazán, és a perszóna leírása szerint Béla „nem gyakorlott" — reális, hogy ezeket nem
   veszi észre. **Ez a legsúlyosabb túllövés: e nélkül a session a 21 db-os kosárnál vagy a
   negyedik újrakezdésnél elakadt volna.**

2. **A `End` és `Backspace` billentyűk célzott használata** a mennyiség javítására. Béla feltehetően
   csak kattintgatna, vagy a „Törlés"-t nyomná meg — ahogy egyszer meg is tette.

3. **A „Rendeléseim" megnyitása ellenőrzésképpen**, kifejezetten azért, mert duplán kattintottam a
   leadás gombon. Ez tesztelői reflex. Béla legfeljebb utólag, e-mailre várva vette volna észre,
   ha két rendelés lett volna — a katalógus 8. forgatókönyvének kritériumát tehát a *szimuláció*
   ellenőrizte, nem a perszóna.

4. **A `patkobela` felhasználónév „papírról" való felidézése** a második sikertelen belépés után.
   Ezt a szimuláció tudta (a fiókot maga hozta létre); egy valódi 70+ felhasználónál ez a pont
   ugyanúgy végződhetett volna elakadással vagy a 10 próbálkozásos korlát elérésével.

**Amit tudatosan nem tettem meg, hogy ne legyek okosabb a perszónánál:** nem használtam kategória-
vagy árszűrőt, nem néztem meg a termék részletes oldalát, nem próbáltam a „Kosár megnyitása"
teljes oldalt (a fiókban maradtam), és nem következtettem ki magamtól, hogy a bejelentkezést előre
kellene elvégezni — a hibát megvártam.

---

# 3. Az összehasonlítás eredménye

## 3.1 Talált-e a szimuláció olyat, ami nincs a katalógusban? Felveszik-e?

Igen, kilenc megfigyelés (F1–F9) egyike sem szerepel a katalógus tíz forgatókönyvében. Ez azonban
**nem jelenti azt, hogy mind a kilenc forgatókönyv-anyag** — a katalógus tárgya a vásárlási
folyamat *viselkedése*, nem a felület minden apró hibája. Az alábbi bontás azt mondja meg,
melyikből lesz forgatókönyv és melyikből hibajegy.

### Felvéve — három új forgatókönyv

Ez a három nem javaslat maradt: a
[`../scenario-catalog/scenario-katalogus.md`](../scenario-catalog/scenario-katalogus.md) végén, a
„Szimulált felhasználói session alapján felvett forgatókönyvek" szakaszban a katalógus saját
formátumában, kontextussal és satisfaction kritériummal szerepelnek. Az alábbi tábla az indoklásuk,
nem a szövegük.

| Új # | Miből lesz | Miért **ide** való, és nem hibajegybe |
|---|---|---|
| **11. Az anonim kosár túléli a bejelentkezést** | F1 | A katalógus **7. forgatókönyve** már kimondja ugyanezt a szabályt a munkamenet-lejárat utáni visszatérésre: „a kosár tételszáma és végösszege azonos a lejárat előttivel". Az anonim → belépett átmenet ugyanannak a szabálynak a másik fele, csak senki nem írta le. Bináris, kritikus. **Fontos:** a forgatókönyv a *döntést* rögzíti (összefésülés **vagy** explicit figyelmeztetés belépés előtt), nem a jelenlegi viselkedést — ezért van benne két megengedett ág, és bukik az eset, ha egyik sem áll. Lásd 3.2. |
| **12. A mennyiség-mező bevitelének épsége** | F2 + F3 | Egy mező két hibája, egy forgatókönyvben. Azért katalógus-anyag, mert a **2. forgatókönyv** (kliens–szerver összegegyezés) **zölden átmegy** egy 31 290 Ft-os félrerendelésen is: mindkét oldal ugyanazt a rossz számot számolja. Egy összehasonlító metrika nem tudja megfogni azt, ami mindkét oldalon egyformán rossz — ehhez külön, bináris eset kell. Kritikus. |
| **13. Ismételt kattintás a „Kosárba" gombon** | F4 | A **8. forgatókönyv** már kimondta az elvet a leadás gombra; ez ugyanannak a kiterjesztése a katalógus deklarált tárgyára („kosárba tétel → kosár → pénztár"). A satisfaction kritérium **nem** feltétlenül „1 db legyen": lehet szándékos, hogy két kattintás két darabot kér. Amit a forgatókönyv előírjon, az a **láthatóság** — a felhasználó lássa, mi történt, mielőtt a kosárfiókot megnyitná. Magas. |

### Nem kerül be — öt megfigyelés (négy sorban), hibajegyként vagy sehogy

| # | Miért marad ki |
|---|---|
| **F5** (a „Kosár" menüpont nem nyílt ki elsőre) és **F6** (a léptető-nyíl első kattintása csak fókuszál) | Nem viselkedési szabály, hanem widget-szintű hiba, és — ami fontosabb — **nem bizonyított** (3.2/2. pont): nem tudom szétválasztani a valódi hibát a mérési hibától, és a szétválasztáshoz szükséges nyers napló nem maradt fenn (lásd a riport elején). Bizonytalan reprodukcióra nem írunk elfogadási esetet: egy villódzó teszt rosszabb, mint a hiánya. Kézi reprodukció után hibajegy. |
| **F7** (a „Tovább a vásárláshoz" törli a keresési szűrőt) | Navigációs kényelmetlenség, a vásárlási folyamat állapotát nem rontja el. Backlog-tétel. |
| **F8** (a pénztár „Név" mezőjében a felhasználónév) | Ez **nem hiba, hanem az adatmodell következménye**: a `users` táblában nincs külön teljes-név mező, a `customer.name` a `username`-ből jön. A rendelés így is önhordó és helyes (ADR-0001). Ha zavaró, az terméki döntés (új mező), nem E2E-teszttel elkapható regresszió. Legfeljebb az **5. forgatókönyv** szövege pontosítandó, hogy tudatos legyen. |
| **F9** (a „Törlés" nem kérdez rá) | Védhető UX-döntés: egytételes kosárnál a megerősítés több súrlódás, mint haszon. Ha mégis megoldandó, „visszavonás" formában — az nem forgatókönyv-kérdés. |

### Amit a katalógus lefedett, és tényleg állt

Az **1.** (végigvitt rendelés azonosítóval, kiürült kosárral — szerveroldalról `GET /api/orders`-szel
ellenőrizve), az **5.** (előtöltött pénztár-űrlap) és a **8.** (dupla kattintás a leadás gombon nem
duplázott: pontosan egy rendelés). A **3.**, **4.**, **6.**, **9.** és **10.** forgatókönyv admin-
beavatkozást vagy második vevőt igényel, ezért ez a session nem érintette őket — a hiányuk **nem**
negatív eredmény.

## 3.2 A szimuláció „tévedett"-e valahol?

Igen, három helyen — és mindhárom tanulságos, mert mind a három abból fakadt, hogy a perszóna
elvárásait készpénznek vettem volna.

**1. A „lassú oldal" — a perszóna elvárása majdnem hamis találatot szült.**
A perszóna definíciója kifejezetten említi, hogy Bélát frusztrálja, „miért tölt be lassan". A session
alatt hétszer futott bele az automatizálás képernyőkép-időtúllépésbe, és kétszer felnagyítva
renderelt az oldal — kényelmes lett volna ezt teljesítményproblémának minősíteni, hiszen *pont ezt
vártam*. **Nem az:** a mérés az automatizálási rétegre vonatkozik, nem az alkalmazásra; a
termékszűrés és minden `/api` hívás azonnal jött. Ezért került a naplóban külön szakaszba, nem a
találatok közé. Ez a riport legnagyobb csapdája volt: egy perszóna elvárása **hipotézis**, nem
bizonyíték.

**2. F5/F6 — problémának jelöltem, de csak gyanú.**
Az első „nem nyílt ki a kosár" eset pontosan egy felnagyított renderelésű képernyőn történt, ahol a
kattintásom vélhetően más koordinátára esett. Nem tudom megkülönböztetni a valódi hibától a mérési
hibát, tehát ezek **gyanúk, nem találatok** — ezért nem is javaslom őket katalógusba (3.1).

**3. F8 — súlyosságot tévesztettem.**
A „Név" mezőben álló felhasználónevet problémaként vettem fel, holott az a séma szándékolt
következménye. Nem hiba, legfeljebb hiányzó funkció.

**Egy pontosítás F1-hez, ami nem tévedés, de közel jár hozzá:** azt **nem** bizonyítottam, hogy a
kosár elvesztése hiba. Lehet szándékos — a kosár felhasználónkénti kulcson van, és a **10.
forgatókönyv** pont ezt az izolációt követeli meg. Amit bizonyítottam, az az, hogy **néma**: nincs
figyelmeztetés, nincs összefésülés, nincs magyarázat. A találat helyes megfogalmazása tehát nem
„elromlott", hanem „szó nélkül eldobja a felhasználó munkáját" — és a javasolt 11. forgatókönyv is
így szól.

## 3.3 Mi volt a legmeglepőbb megfigyelés?

**Hogy a dupla kattintás elleni védelem pontosan azon az egyetlen gombon volt meg, amelyikre a
katalógus gondolt — és sehol máshol.**

A 8. forgatókönyv írásakor a türelmetlen dupla kattintás a *rendelésduplázás* kockázataként
fogalmazódott meg, és a védelem is pontosan így épült meg: a „Rendelés leadása" gomb a kérés
idejére letiltódik, a rendeléslistám valóban eggyel lett hosszabb, nem kettővel. A forgatókönyv
tehát **működik** — a mögötte lévő gondolat viszont túl szűk volt.

A valóságban a türelmetlen kattintás **nem egy gomb tulajdonsága, hanem a felhasználóé**. Ugyanaz a
kéz ugyanúgy kattint a „Kosárba"-ra (→ 2 db), a menüpontra (→ szövegkijelölés), a számmezőre (→ 21
db) és a „Bejelentkezés"-re (→ két hitelesítési kísérlet). A katalógus nem *rosszul* fedte le a
viselkedést, hanem **egyetlen képernyőelemre kötött egy felhasználói szokást**. Ez a riport
legátvihetőbb tanulsága: ha egy forgatókönyv egy emberi mintát ír le, a kritériumát végig kell
vinni minden felületen, ahol az a minta előfordulhat.

**Második helyen meglepő:** a session legdrágább hibája (F1, a kosár elvesztése) **egyetlen
hibaüzenet nélkül** történt. A rendszer a saját szempontjából hibátlanul működött — 200-as
válaszok, sikeres belépés, korrekt átirányítás a pénztárra. Az egyetlen hely, ahol látszott, az a
felhasználó fejében volt. Ezért is nem találta meg a katalógus: mind a tíz forgatókönyv
„bejelentkezett vásárló"-val indul, tehát az az átmenet, ahol ez történik, **soha nem került mérés
alá**.

---

# 4. Reflexiós kérdések

## A perszóna „okosabb" volt-e a valódi felhasználónál egy ponton?

Igen, élesen — és a bizonyíték magában a perszóna szövegében van. Ez **külön kérdés** attól, amit a
megfigyelési sablon zárókérdése vizsgál: ott azt mértem, hol volt a *szimuláció* okosabb a
*perszónánál*; itt azt, hol volt maga a *perszóna definíciója* felkészültebb egy valódi 70+
kezdőnél. Az előbbi végrehajtási hiba, az utóbbi tervezési.

### 1. A keresési stratégia — ez a legsúlyosabb

A definíció szerint Béla „röviden írja be a keresendőt, **hogy több találatot kapjon**". Ez nem
gyakorlatlanság, hanem *stratégia*: működő mentális modell arról, hogyan viselkedik egy keresőmező
(rövidebb szó = tágabb halmaz). Egy valódi gyakorlatlan felhasználó jellemzően az ellenkezőjét
teszi — beírja a teljes mondatot („usb c töltő kábel a telefonomhoz"), vagy meg sem találja a
keresőt, és görgetéssel keres.

**A bizonyíték:** az elvárások szekcióban a példa szó szerint `kábel` — ami **pontosan részszava** a
katalógusban lévő „USB-C töltő**kábel**" terméknek. A perszónát visszafelé írták a rendszerből.
Ezért lett a session legsimább része pont az, amit a perszóna a legidealizáltabban ír le: első
próbálkozás, egy találat, nulla súrlódás.

### 2. Ékezethelyes gépelés

`kábel`-t írtam be, á-val, és véletlenül működött. Sosem derült ki, hogy az ékezet nélküli `kabel`
talál-e — a perszóna elrejtette előlem ezt a rést. Egy valódi Béla ékezet nélkül vagy záró szóközzel
gépel.

### 3. Nincs kilépési feltétele

A definíció említ frusztrációt, de nem ad **küszöböt**. Ezért a 31 290 Ft-os pillanatban tovább
küzdöttem, és a riport azt írja, „a cél teljesült". Egy valódi Béla ott bezárja a fület. Ez
rendszerszintű torzítás: **egy kilépési feltétel nélküli perszóna mindig sikert jelent** — vagyis
pont azt a metrikát teszi mérhetetlenné (elhagyás), ami terméki szempontból a legfontosabb.

### 4. Egydimenziós hibamodell

„Megpróbálja ugyanazt újra" — tiszta retry-hurok. A valódi kezdő nem csak ismétel, hanem **menekül**:
böngésző Vissza gomb, F5, fül bezárása és újranyitás, telefonálás valakinek. A perszóna a „hurok"
viselkedést leírja, a „menekülés" viselkedést nem. Emiatt a teszt a böngésző-navigációt meg sem
érintette — pedig egy localStorage-kosaras SPA-nál épp ott a legvalószínűbb az állapot-hiba.

## Hogyan lett volna reálisabban megtervezhető?

| Javítás | Mit fogott volna meg |
|---|---|
| **Billentyűleütés, ne szándék.** Ne „röviden írja be", hanem: *„azt írja a keresőbe, amit a boltban mondana: `usb c tolto kabel`, ékezet nélkül, kisbetűvel."* | Ez az egy sor a legfontosabb. **Adatot** ad, nem stratégiát — így a szimuláció nem tud véletlenül helyes bemenetet választani. |
| **Türelmi költségvetés.** *„Három sikertelen nekifutás után feladja és felhívja az unokáját."* | A kimenetel nem „sikerült" lett volna, hanem „a 3. körben elhagyta a kosarat" — sokkal használhatóbb terméki adat, és a katalógus nyelvén is megfogalmazható (bináris kritérium). |
| **Explicit vakfolt-lista.** Ne „nem gyakorlott", hanem felsorolva: *nem veszi észre a hover-re megjelenő ikonokat, a 20 px alatti kontrollokat, a badge-et mint visszajelzést.* | A run legsúlyosabb túllövése pontosan ezen múlt: a léptető-nyilak felfedezése oldotta meg a feladatot, e nélkül a vásárlás nem fejeződött volna be. |
| **Menekülő útvonalak a hibareakcióba.** *„Ha kétszer ugyanaz a hiba: Vissza gomb, vagy bezárja és újranyitja az oldalt."* | Megnyitotta volna az egész SPA-állapot / localStorage felületet, ahol a kosár tényleg lakik. |
| **Bizonytalan fiókállapot.** *„Nem tudja fejből a felhasználónevét; nem biztos benne, hogy van-e fiókja."* | A belépés a run-ban két helyen volt döntő, és mindkétszer a szimuláció tudása mentette meg (lásd a sablon 4. túllövését). |

## Módszertani tanulság

A perszóna **viselkedési** szekciója jó volt — a dupla kattintás mint reflex valódi, és négy
különböző hibát hozott felszínre (F1 kivételével gyakorlatilag az összeset). Az **elvárások**
szekciója romlott el, mert ott már a rendszer ismerete írta a szöveget.

Gyakorlati szabály belőle: **a viselkedési mintákat és a konkrét bemeneteket a termékkatalógus
megnézése előtt kell rögzíteni.** Ha ez nem lehetséges, a keresőkifejezéseket legalább kérje valaki
mástól, aki nem látta a terméklistát. Ugyanez a hiba fordítva is jelentkezett a
scenario-katalógusban (lásd 3.3): ott a *rendszer* ismerete szűkítette le a dupla kattintást egyetlen
gombra. Mindkét esetben ugyanaz történt — a leírás nem a felhasználót modellezte, hanem a
megoldást.
