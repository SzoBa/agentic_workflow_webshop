# Webshop

Egyetlen kontextus: egy magyar nyelvű webáruház, ahol a látogatók termékeket böngésznek,
regisztrált felhasználók rendelnek, az adminok pedig a termék- és felhasználóadatokat kezelik.

## Language

### Felhasználók és jogosultság

**Felhasználó**:
Egy regisztrált fiók a rendszerben: belépési adatok, szállítási cím és pontosan egy szerepkör.
Fiók kizárólag regisztrációval keletkezik.
_Avoid_: account, ügyfél (a kódban), vevő

**Szerepkör**:
A felhasználó jogosultsági szintje. Pontosan kettő létezik, és minden felhasználónak pontosan
egy van: **customer** és **admin**.
_Avoid_: jogosultság, permission, jog

**Customer**:
Az alapértelmezett szerepkör: böngészhet, rendelhet, és a saját rendeléseit láthatja.
Minden új regisztráció ezt kapja.

**Admin**:
A customer fölé rendelt szerepkör: mindent megtehet, amit a customer, és emellett kezelheti
a termékeket és a felhasználókat. Egyszerre több admin is létezhet, de **legalább egynek
mindig lennie kell**.
_Avoid_: üzemeltető, moderátor, superuser

**Fiókadat**:
A felhasználó azon adatai, amelyeket önmagáról módosíthat: felhasználónév, e-mail cím és
szállítási cím. A fiók **élő** állapota — szemben a **Vevői adatok**-kal, amely egy rendelés
befagyasztott másolata. A kettő a regisztrációkor egybeesik, és onnantól külön utat jár:
a fiókadat módosítása a korábbi rendeléseket nem érinti.
_Avoid_: profil (a kódban), personal data, mesteradat

**Hitelesítő adat**:
Az az adat, amivel a felhasználó bizonyítja, hogy ő ő: a **jelszó** és a **munkamenet-token**.
A rendszer egyiket sem tárolja nyersen, csak a lenyomatát, és egyiket sem adja vissza semmilyen
válaszban — a token kizárólag a kiadó válaszban szerepel. Hitelesítő adat cseréje mindig
**munkamenetet is cserél**. Nem hitelesítő adat a felhasználónév: azt a rendszer nyíltan tárolja
és visszaadja, még ha belépéskor meg is kell adni.
_Avoid_: credential, azonosító, belépési adat (kétértelmű: a felhasználónevet is jelentheti)

> **Figyelem — névütközés.** A magyar felületen a felhasználókat kezelő oldal felirata
> „Ügyfelek", de az ott szerkesztett dolog a **Felhasználó**. A kódbeli `Customer` típus
> valami _mást_ jelent — lásd lentebb, a Rendelések alatt.

### Termékek

**Termék**:
Egy eladásra kínált tétel: név, leírás, ár, kép, készlet, kategória és aktivitási állapot.
_Avoid_: cikk, áru, item

**Aktív termék**:
Olyan termék, amely szerepel a kínálatban: megjelenik a listákban, megnyitható és megrendelhető.

**Inaktív termék**:
Levettük a polcról, de megőriztük. A vásárlói felület számára **nem létezik**: nem listázódik,
közvetlen linken sem érhető el, és nem is rendelhető meg. Kizárólag az admin látja.
_Avoid_: rejtett, archivált, soft-deleted

**Termék törlése**:
Végleges megszüntetés — a termék eltűnik a kínálatból. Nem azonos az inaktiválással:
az inaktiválás a „levettem a polcról", a törlés a „ez tévedésből került ide" eset.

**Készlet**:
A raktáron **fizikailag** meglévő darabszám. A rendelés leadása nem csökkenti — a leadás
foglalást hoz létre —, a készlet akkor csökken, amikor a rendelés kiszállítottá válik.
_Avoid_: stock (magyar szövegben), raktárkészlet

**Foglalás**:
Egy még nem teljesített rendelés igénye a készletre. Nem önálló nyilvántartás, hanem a
lejáratlan, kiszállítatlan rendelések tételeiből adódik. A foglalás a lejáratáig él.
_Avoid_: rezerválás, zárolás, reservation

**Elérhető mennyiség**:
Az a darabszám, amit egy vásárló most megrendelhet: a készlet és az érvényes foglalások
különbsége. A vásárlói felület ezt mutatja, nem a készletet.
_Avoid_: szabad készlet, eladható mennyiség

### Rendelések és kosár

**Kosár**:
A vásárló által összeválogatott tételek gyűjteménye a megrendelés előtt. Kizárólag a böngészőben
él, a szerver nem tud róla, és a tartalma elavulhat a kínálathoz képest.

**Rendelés**:
Egy leadott, végleges megrendelés: tételek, vevői adatok, végösszeg és időpont.
A **tartalma** leadás után **nem változik** — sem a termékek módosítása, sem a rendelést leadó
felhasználó törlése nem hat rá. Az egyetlen kivétel a **teljesítési státusz**, amely nem a
rendelés tartalma, hanem a sorsa: ez a leadás után is változhat.
_Avoid_: vásárlás, tranzakció, purchase

**Teljesítési státusz**:
A rendelés útja a leadástól a kézhezvételig. Három létezik: **pending** (leadva, még nem
érkezett meg), **expired** (a foglalása lejárt) és **delivered** (kiszállítva). Minden új
rendelés `pending`; `delivered`-re csak admin állíthatja. Ez a státusz dönti el, hogy a
vásárló írhat-e értékelést a termékről.
_Avoid_: rendelés állapota (kétértelmű), fulfillment, szállítási állapot

**Lejárt rendelés** (a kódban `expired`):
Olyan leadott rendelés, amelynek a foglalása letelt, ezért a készletét mások megvehetik.
Nem lezárt ügy: a bolt utólag is teljesítheti, ha a készlet fedezi.
_Avoid_: visszavont, törölt, sztornó, cancelled

**Rendelési tétel**:
Egy sor a rendelésen. **A leadás pillanatában befagyasztott termékmásolat**, nem élő hivatkozás
a termékre: a megrendelt darabszám mellett megőrzi az akkori nevet és egységárat is. Ezért marad
a rendelés hiteles akkor is, ha a terméket később átnevezik, átárazzák vagy törlik.
_Avoid_: kosártétel, sor, line item

**Értékelés** (a kódban `Review`):
Egy vásárló véleménye egy termékről: 1–5 csillag és opcionális szöveges indoklás.
Beküldés után **nem módosítható**, és egy vásárló egy terméket csak egyszer értékelhet.
_Avoid_: vélemény (a kódban), komment, rating mint entitás

**Ellenőrzött vásárló**:
Az a felhasználó, akinek van olyan **delivered** teljesítési státuszú rendelése, amely
tartalmazza az adott terméket. Kizárólag ő írhat értékelést a termékre — a puszta megrendelés
nem elég.
_Avoid_: igazolt vevő, verified buyer

**Moderációs státusz**:
Az értékelés láthatósági állapota. Négy létezik: **pending** (beküldve, még nem bírálták el —
ez az alapérték), **approved** (jóváhagyva), **rejected** (elutasítva) és **removed** (utólag
eltávolítva). Publikusan **kizárólag az approved** látszik, és csak az számít bele a termék
átlagába. A `removed` soft delete: az adatbázisban megmarad.
_Avoid_: review állapota, láthatóság, publikálási státusz

**Vevői adatok** (a kódban `Customer`):
A rendeléshez tartozó szállítási adatok — név, e-mail cím, szállítási cím —, ahogy a megrendelés
pillanatában megadták őket. Ez **nem** a felhasználói fiók: önálló másolat, amely a fiók törlése
után is megmarad, és a fiók későbbi módosítása nem érinti.
_Avoid_: ügyfél, vevő mint fiók, felhasználó
