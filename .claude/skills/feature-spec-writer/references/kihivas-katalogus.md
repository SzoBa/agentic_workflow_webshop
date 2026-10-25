# Kihívás-katalógus — a 3. fázis

Nyolc hibaosztály. Mindegyik **ténylegesen megtörtént ebben a repóban**, és mindegyiket a
review **spec-írói hibaként** azonosította: nem az implementáló tévedett, hanem a
követelmény szövege volt kétértelmű, megengedő, szűk vagy ellenőrizetlen premisszára épült.

**Használat:** vidd végig **minden** kész-kritériumot a nyolc kérdésen. Amelyik nem áll meg,
azt a fejlesztővel együtt **fogalmazd át** — ne írd megjegyzésként a spec végére. Egy
kétértelműség, amit a spec maga jelez, még mindig kétértelműség.

A hivatkozott bizonyítékok élnek: a `spec/admin-orders/requirements.md` „Változásnapló"
szakasza és a `docs/orchestration/admin-orders/Review.md` „Gyenge pontok" része.

---

## 1. Megengedő megfogalmazás — amire nem lehet ítéletet mondani

**A kérdés:** *„Erre a mondatra rá tudja írni egy külső ítélő, hogy `[teljesül]` vagy
`[nem teljesül]`?"*

Ha a mondatban „elrejtheti", „célszerű", „lehetőleg", „javasolt", „általában" szerepel, a
válasz nem. A megengedő megfogalmazásból **két védhető olvasat** következik, és mindkettő
mellett elmegy a validátor is.

> **Megtörtént:** a `plan.md` 4.6 szakasza azt írta, a kliens a `delivered` soron
> „elrejtheti" a státuszváltó vezérlőt. Ez nem volt mérhető, tehát ítélni sem lehetett rajta.
> Utólag kellett belőle állítást csinálni (`AR-20`).

**A javítás iránya:** a megengedő mondat azt jelenti, hogy **a döntés még nincs meghozva**.
Ne fogalmazd át szigorúbbra magadtól — kérdezd meg a fejlesztőt, melyik ág az igazi.

## 2. Globálisan olvasható tiltás — a hatókör hiánya

**A kérdés:** *„Mire vonatkozik ez a tiltás pontosan, és mire nem?"*

Egy „a képernyő **nem** ágazik el a státuszra" típusú mondat egy adott komponensről szól, de
a képernyő egészére is olvasható. Az implementáló ilyenkor a mérhető olvasatot választja — és
igaza van.

> **Megtörtént:** az `AR-15` eredeti szövege globálisan is olvasható volt, holott a
> foglalás-megjelenítő komponensre szólt. A hatókörét utólag kellett szűkíteni, mert
> különben ütközött volna az `AR-20`-szal.

**A javítás iránya:** minden tiltás mellé egy *Hatóköre:* mondat. Ha a tiltásnak kivétele
van, a kivétel **is** legyen mérhetően körülírva.

## 3. Ellenőrizetlen premissza

**A kérdés:** *„Ez a mondat tény, vagy feltevés? Mi cáfolná?"*

A leírt premissza önmagában érdem — de ha nem ellenőrizhető alakban van leírva, a specen
keresztül beépül a kódba.

> **Megtörtént:** a `plan.md` 4.5 kimondta, hogy a szűrés futhat memóriában, mert „a
> rendelésszám nagyságrendje ezt megengedi". A premissza **nem áll**: a katalógus korlátos,
> admin által gondozott halmaz, a rendelés viszont append-only, és felhasználók hajtják.
> Következmény: [ADR-0009](../../../../docs/adr/0009-admin-rendeleslista-sql-lapozas.md) és
> egy utólagos `AR-21` kritérium.

**A javítás iránya:** ha a premissza igaz, írd le **ellenőrizhető alakban** (mi a
nagyságrend, ki hajtja, mi növeli). Ha nem tudod ellenőrizni, ne épülj rá.

## 4. Hiányzó végponttól végpontig mérő pont

**A kérdés:** *„Melyik kritérium bizonyítja, hogy a két oldal egymással is működik?"*

A kliens-tesztek **mockolt** API-val mérnek, a backend-tesztek kliens nélkül. Mindkettő
zöld lehet úgy, hogy a kettő sosem találkozott. A mock azt adja vissza, amit a **teszt írója
elképzelt** a szerverről — nem azt, amit a szerver ad.

> **Megtörtént:** a 18 eredeti kritérium közt **egyetlen** end-to-end pont sem volt. Senki
> nem nyitotta meg a képernyőt futó backend ellen. Az `AR-19` utólag került be, és sokáig
> az volt az egyetlen teljesítetlen pont.

**A javítás iránya:** ha a feature-nek van kliensoldala, **kötelező** egy ilyen kritérium.
A repónak van böngészős elfogadási teszt-váza — ha az használható, az a bizonyíték; ha nem,
egy **dokumentált, kézi** füstteszt-forgatókönyv, leírt lépésekkel és látott eredménnyel.

## 5. A bizonyíték-sor szűkebb, mint a kritérium

**A kérdés:** *„A `*Bizonyíték:*` sor a kritérium MINDEN ágát megnevezi?"*

Az implementáló pontosan azt fedi le, amit a bizonyíték-sor kér — helyesen. Ami kimarad
onnan, az kimarad a tesztből is.

> **Megtörtént:** az `AR-08` két irányban vágó viselkedést írt elő, de a bizonyíték-sora
> csak a **felső** vágást (`page=999`) és az üres találathalmazt nevezte meg. Az alsó ágat
> egyetlen teszt sem futtatta; a validátor egy **másik végponton** pótolta élő méréssel —
> érvényes érvelés, de nem a mért végpont mérése.

**A javítás iránya:** ha a kritériumban „mindkét irányban", „minden esetben", „bármelyik"
szerepel, a bizonyíték-sorban **soroljuk fel az eseteket egyenként**.

## 6. Két állítás egy pontban

**A kérdés:** *„Ha ennek a pontnak a fele teljesül, mi az ítélet?"*

Egy kritérium, ami két dolgot állít, nem tud `[teljesül]` lenni félig — tehát vagy hamis
zöldet, vagy indokolatlan pirosat ad.

**A javítás iránya:** egy pont, egy állítás. Ha két dolog **elválaszthatatlan** (pl. „a mező
jelen van, és törölt fióknál hiányzik"), az egy állítás két ágon — akkor a bizonyíték-sor
nevezze meg mindkét ágat (lásd 5.).

## 7. A kritérium a tesztet írja le, nem a viselkedést

**A kérdés:** *„Ha valaki más tesztet ír rá, akkor is ugyanezt kell mérnie?"*

A tesztet és a kódot ugyanaz az ügynök írja. Egy félreértett követelmény így **egyszerre**
kerül a kódba és a tesztbe, és a teszt zöld lesz. A védelem egyetlen pontja az, hogy a
kritérium a **viselkedést** mondja ki, és a bizonyíték-sor csak *hol keresd* — így a
validátor meg tudja nézni, hogy a megnevezett teszt **tényleg azt asszertálja-e**.

> **Megtörtént, jó irányban:** a validátor több ponton (`AR-03`, `AR-13`, `AR-15`) épp ezt
> emelte ki — pl. hogy a kliens-teszt a **valódi** címketérképre asszertál, nem beégetett
> szövegre. Ezt csak azért tudta megtenni, mert a kritérium a viselkedést írta le.

**A javítás iránya:** a kritérium főmondata sose kezdődjön tesztnévvel. A tesztnév a
`*Bizonyíték:*` sorba való.

## 8. Reflexek, amiket a specnek le kell állítania

**A kérdés:** *„Mit fog az implementáló reflexből megcsinálni, amit itt nem szabad?"*

Ezek nem az implementáló hibái — a kötelező konvenciók helyes alkalmazásai rossz helyen.
Csak a spec **explicit** mondata állítja meg őket, és a repó tapasztalata szerint mindhármat
külön kockázatként kellett kezelni:

| Reflex | Mit csinál | Mit írjon a spec |
|---|---|---|
| **Sémaváltozás-reflex** | új migrációs fájlt ír, mert „új mező = új migráció" | ha nincs sémaváltozás, **mondd ki**, hogy nincs, és tedd külön kritériummá |
| **Validációs reflex** | ismeretlen paraméter-értékre 400-at ad | ha a szerződés visszaesés az alapértelmezésre, **külön kritérium** mérje |
| **Állapotgép-másolás** | a kliensbe lemásolja a szerver átmenettábláját | tiltsd, és a **kivételt** körülhatárolva engedd (lásd 1. és 2.) |

Ha a feature közös segédfüggvényt általánosít, jön a negyedik: a **régi hívók** viselkedése.
Arra külön regressziós kritérium kell, mert a változás „viselkedés-megőrző" szándéka nem
bizonyíték.

---

## A fázis kimenete

Kritériumonként egy sor, amit a jelentésbe is beteszel:

```
AR-07 — 5. (a bizonyíték-sor csak a felső vágást nevezte meg) → az alsó ág külön felsorolva
AR-11 — átment mind a nyolc kérdésen
```

Ha egy kritérium **egy kérdésen sem akadt fenn**, azt is írd le. A katalógus akkor hasznos,
ha látszik, hogy tényleg végigment rajta minden pont.
