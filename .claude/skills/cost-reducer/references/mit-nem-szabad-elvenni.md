# Mit nem szabad elvenni — a 2. fázis biztonsági szűrője

Hat kategória, mindegyik a repó egy konkrét, leírt döntéséből. Ezek **nem** általános
óvatosság: mindegyiknél megnevezhető, mi történik, ha kikerül a promptból.

A közös bennük, hogy **mind redundánsnak látszik.** Rövid, ismétlődő, más fájlban is
megvan — pontosan az a profil, amit egy tömörítő először dob ki. Ezért kell listát vezetni
róluk, nem ítéletre bízni.

**Használat:** minden jelöltet futtass végig a hat kérdésen. Ami fennakad, azt **ne is
javasold** — a jóváhagyás nem lehet az egyetlen szűrő, mert a fejlesztő a te
összefoglalódat látja, nem a teljes promptot.

---

## 1. Negatív információ — „mit NE csinálj"

**A kérdés:** *„Ez a blokk egy reflexet állít le?"*

A subagentek kötelező konvenciói helyes szabályok, amelyek rossz helyen alkalmazva hibát
okoznak. A prompt célzott emlékeztetői pontosan ezeket fogják meg.

> **Bizonyíték:** a `Decision.md` 2. döntése két emlékeztetőt sorol fel — „ne írj
> Flyway-migrációt" és „az ismeretlen `status` nem 400" —, és kimondja: *„mindkettő olyan
> hiba, amit a saját kötelező konvenciólistája okozna"*. A `plan.md` 4.1 azért fogalmaz
> explicit tiltásként, mert az implementáló szabálya szerint „sémaváltozás = ÚJ migráció".

Egy tiltás elhagyva **nem hiányt** okoz, hanem a rossz viselkedés visszatérését — és a
subagent jelentése ettől még magabiztos lesz.

## 2. Befagyasztott szerződés, aminek szándékosan nincs útvonala

**A kérdés:** *„Megvan ez a szöveg valahol, ahonnan a címzett elő tudná venni?"*

Ha a válasz nem, a blokk **pótolhatatlan**, és a `csere` művelet nem alkalmazható rá.

> **Bizonyíték:** a `feature-implement` a UI-kiválasztói szerződést kiírja fájlba, de a
> **fájl útvonalát egyik agent sem kapja meg** — a tartalmát másolja be mindkét prompt
> törzsébe, mert a spec-agentek a `.md` fájlokat normatívnak tekintik. A két párhuzamos ág
> „sosem látja egymás kódját; az egyetlen közös pontjuk ez a lista".

Itt a beillesztés nem pazarlás, hanem a szerződés egyetlen hordozója.

## 3. Módszertani keretezés — néha egyetlen szó

**A kérdés:** *„Ez a mondat azt mondja meg, MIT csináljon, vagy azt, HOGYAN olvassa a
többit?"*

A második fajta a legrövidebb és a legdrágább.

> **Bizonyíték:** a validátor az implementálói jelentéseket **„mutató a bizonyítékhoz, nem
> bizonyíték"** megjelöléssel kapja. Enélkül ugyanaz a szöveg **bizonyítékká** válik nála,
> és a `Decision.md` 4. szerint a legrosszabb kimenet, amit produkálni tud, épp a hamis
> `[teljesül]`. Ugyanígy a „kötelező érvényű" a UI-szerződésnél, és a „szó szerint" a
> hibaüzeneteknél.

Ezek a hook `ALAP_VEDETT` listáján is rajta vannak — a gépi visszafogás ezt a kategóriát
őrzi, mert ez a legrövidebb és így a legkönnyebben elvesző.

## 4. Szó szerinti szövegek

**A kérdés:** *„Fog erre valaki karakterre asszertálni?"*

A magyar hibaüzenetekre a tesztek betű szerint asszertálnak, és a spec hibakatalógusa a
forrásuk. Egy „lásd a hibakatalógust" hivatkozás **csak akkor** egyenértékű, ha a címzett
tényleg elolvassa — lásd a `csere` buktatóját.

Ugyanez áll a felhasználói felület szövegeire: gombfelirat, mezőcímke, oldalcím.

## 5. Környezeti előírás, ami nélkül rossz helyre ír

**A kérdés:** *„Ez a blokk azt mondja meg, HOL dolgozzon?"*

> **Bizonyíték:** a párhuzamos ág promptjának **legelső bekezdése** a munkagyökér, mert a
> subagent `CLAUDE_PROJECT_DIR`-je a **fő** munkafára mutat — egy relatív útvonalú írás oda
> menne, ahol a másik ág dolgozik. A `feature-implement` szerint ez „kritikus", és a guard
> a fő fába tévedő írást nem tudja megkülönböztetni a jogostól.

Ez a blokk minden delegálásban szinte azonos, tehát ismétlődőként fog feltűnni a mérlegben.
Ne dőlj be neki.

## 6. A kihagyás ténye — ha a címzett nem tudja, pótolni kezdi

**A kérdés:** *„Ha ezt kiveszem, elkezdi keresni?"*

> **Bizonyíték:** a `Decision.md` 5. döntése az orchestration-mappát azért nem adja át, mert
> az *„elgondolkodtatja azon, hogy hiányos kontextust kapott, és elkezdheti pótolni — azaz
> olyan fájlokat olvasni, amiket szándékosan hagytam ki"*.

Vagyis a rosszul szűkített prompt **drágább** lehet, mint a bő: a subagent felderítéssel
tölti ki a hézagot, rossz irányba. Ha egy `elhagy` művelet ilyen hézagot hagy, a
helyettesítő szövegnek **ki kell mondania**, hogy az adott réteg nem az ő dolga.

---

## Az ellenpróba — ami elhagyhatónak látszik, és tényleg az

Három eset, ahol a szűkítés indokolt, és a repó maga is így csinálja:

| Mit | Miért biztonságos |
|---|---|
| **A spec szövegének beillesztése az implementálónak** | a `feature-implement` szerint „a spec fájljait az agent maga olvassa be; ez a definíciója". `csere`-re való — az útvonallal és az olvasásra szóló felszólítással együtt. |
| **A másik réteg konvenciói** | a `Decision.md` 2. és 3. döntése: a backend nem kapja a React-konvenciókat, a kliens nem kapja a JPA-t. Indok: *„minden odanemvaló konvenció növeli az esélyt, hogy »hasznos« kiegészítéseket építsen"*. |
| **Az orchestrátor saját ítélete** | a `Decision.md` 4.: ha az orchestrátor hozzátenné, hogy „szerintem ez kész", az **horgonyt** adna a validátornak. A javítókör-számláló ugyanezért marad ki. |

Figyeld meg, hogy mindhárom indok **helyességi**, nem költség. Ez a jó szűkítés ismertetőjele.

---

## A sorrend külön eset — hipotézis, nem megtakarítás

Az `elore` művelet (a stabil rész a prompt elejére) semmit nem vesz el, tehát a fenti hat
kategória nem érinti. **De az előnyét sem tudjuk mérni:** a prompt-cache találati arányát a
harness nem adja ki a hooknak.

Ezért az `elore`-t **hipotézisként** kell javasolni és jelenteni. Amit igazolni tudsz róla:
a prompt eleje delegálásról delegálásra azonos lett — ezt a mérleg meg tudja mutatni. Amit
**nem** tudsz igazolni: hogy ettől kevesebbet fizettél.
