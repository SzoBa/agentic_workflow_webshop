# Kontextus-átadási döntések — admin rendeléskezelő

Melyik subagent mit kap meg, mit nem, és miért. A felbontás terve:
[`Orchestrator.md`](./Orchestrator.md) · a futás naplója: [`Running.md`](./Running.md).

A vezérelv: **a kontextus nem ingyen van.** Amit átadok, azt a subagent normának vagy legalábbis
releváns háttérnek olvassa. Egy odaadott, de oda nem tartozó dokumentum nem semleges — irányt ad.

---

## Döntés 1 — A `spec/backend/` mint hivatkozás, nem mint melléklet

**Mit adtam át:** a `spec/admin-orders/` mappa három fájlját teljesen, és a `spec/backend/`-re egy
**hivatkozást** (a `requirements.md` 0. szakasza mondja ki, hogy az az általános norma, és ütközés
esetén az nyer).

**Mit nem adtam át:** a `spec/backend/` 1682 sorát — a hat fájlt (`requirements.md`,
`vegpontok.md`, `hibakatalogus.md`, `konformancia.md`, `plan.md`, `tasks.md`) beillesztve.

**Miért:** a `spec/backend/tasks.md` egy **lezárt, történeti** dokumentum egy befejezett
migrációról; a `konformancia.md` 67 esete pedig a *meglévő* rendszerre vonatkozik. Ha ezeket
beillesztem, az implementáló egy ma már nem létező Node-implementációról és egy lezárt
feladatlistáról olvas, miközben egy 200 soros új feature-t kellene megírnia — és a `K-xx` eseteket
összekeverheti az `AR-xx` mércével. Amire ténylegesen szükség van a `spec/backend/`-ből (a
hibaválasz alakja, az admin névtér szabálya, a `reservedUntil` szabály), azt a `plan.md`-be
**kivonatoltam**, `fájl:sor` hivatkozással. A kutató subagent dolga, hogy a hivatkozásokat
ellenőrizze — erre való.

---

## Döntés 2 — A backend-implementáló nem kapja meg a kliens-konvenciókat

**Mit adtam át:** a kutató jelentését **szó szerint**, a spec-mappa útvonalát, a B csomag
fájltulajdon-táblázatát, és két célzott emlékeztetőt (ne írj Flyway-migrációt; az ismeretlen
`status` nem 400).

**Mit nem adtam át:** a React-, Vitest- és `@testing-library`-konvenciókat, az `AdminUsers.tsx`
mintát, az ES2020-korlátot, a CSS-t.

**Miért:** a B csomag egyetlen kliensfájlt ír, az `api.ts`-t, és az **típusdeklaráció + `fetch`
burkolat** — a React-konvenciók ehhez nem kellenek. A hosszú implementálói futás vége felé sodródik
a legtöbbet a spec betűjétől; minden odanemvaló konvenció növeli az esélyt, hogy „hasznos"
kiegészítéseket építsen. A két célzott emlékeztető viszont **azért** került be, mert mindkettő
olyan hiba, amit a saját kötelező konvenciólistája okozna: a „sémaváltozás = ÚJ migráció" szabály
reflexből migrációt íratna vele oda, ahol nincs sémaváltozás, a validációs reflex pedig 400-at
adna az ismeretlen `status`-ra.

---

## Döntés 3 — A kliens-implementáló a szerződést kapja, nem a backend jelentését

**Mit adtam át:** a `plan.md` 2. szakaszát (a befagyasztott TypeScript-szerződést), és a B csomag
jelentéséből **egyetlen** dolgot: az `api.ts` új exportjainak **tényleges** alakját. Plusz a
követendő mintát (`AdminUsers.tsx`), az ES2020-korlátot és a 4.6 döntést (az átmenettáblát nem
másoljuk a kliensbe).

**Mit nem adtam át:** a JPA-t, az `@EntityGraph`-ot, a tranzakcióhatárokat, a `Catalog.paginate`
általánosítását, a Flyway-t, a `hibakatalogus.md`-t, és a B csomag Java-oldali `fájl:sor`
hivatkozásait.

**Miért:** ez a felbontás lényege. A kliens számára a backend **egyetlen** dolog: egy tipizált
függvény, ami egy `AdminOrderPage`-et ad vissza. Ha megkapná, hogy a lapozás memóriában történik
vagy hogy a `username` kötegelt lekérdezésből jön, abból semmit nem tudna kezdeni — viszont
megkísérthetné, hogy „optimalizáljon" a kliensoldalon. A `hibakatalogus.md` kihagyása tudatos és
elsőre ellentmondásosnak tűnik: a szabály az, hogy a kliens a szerver hibaüzenetét **változtatás
nélkül** jeleníti meg — ha megkapná a katalógust, épp az lenne a csábítás, hogy leképezze vagy
átfogalmazza őket.

**Az `api.ts` tényleges alakját** azért adom át a szerződés *mellett*, mert a szerződés szándék, a
tényleges kód pedig valóság. Ha a kettő eltér, azt itt kell észrevenni — ezért van rá külön sor a
`Running.md` integrációs blokkjában.

---

## Döntés 4 — Az implementálói jelentések a validátornak: mutató, nem bizonyíték

**Mit adtam át:** mindkét implementálói jelentést, kifejezetten **„mutató a bizonyítékhoz, nem
bizonyíték"** megjelöléssel, plusz a spec-mappa útvonalát.

**Mit nem adtam át:** semmilyen összefoglalót arról, hogy szerintem mi készült el, és a
javítókör-számlálót.

**Miért:** a validátor definíciója szerint a legrosszabb kimenet, amit produkálni tud, a **hamis
`[teljesül]`** — arra a lánc készként épít tovább. A jelentések átadása mégis hasznos: gyorsítja a
tájékozódást (melyik fájlban keresse). De ha az orchestrátor hozzátenné a saját ítéletét
(„szerintem ez kész"), az horgonyt adna, és a validátor a megerősítés felé sodródna. Ugyanezért nem
tudja meg, hányadik javító körben van: az „utolsó esély" tudata engedékenységre nyom.

---

## Döntés 5 — Az orchestration-mappa senkinek

**Mit adtam át:** semmit ebből a mappából.

**Mit nem adtam át:** az `Orchestrator.md`-t, a `Running.md`-et és ezt a `Decision.md`-et.

**Miért:** két okból. Egyrészt ezek a **szervezésről** szólnak, nem a feature-ről — egy
implementálónak a „mit nem adok át és miért" metaszintje semmit nem segít, viszont elgondolkodtatja
azon, hogy hiányos kontextust kapott, és elkezdheti pótolni (azaz olyan fájlokat olvasni, amiket
szándékosan hagytam ki). Másrészt **technikailag** is ezért vannak a `spec/` mappán kívül:
mindhárom agent a definíciója szerint `Glob`-bal beolvassa a spec-mappa **összes** `.md` fájlját, és
a mellékleteket **normatívnak** tekinti. Egy kitöltetlen futási napló ott hamis követelményként
viselkedne — a validátor jóhiszeműen keresné, melyik `AR-xx` felel meg neki.

---

## Döntés 6 — A feature kiválasztásának indoklása az orchestrátornál marad

**Mit adtam át:** a `requirements.md` 1. szakaszát — a problémát **felhasználói nézetből**.

**Mit nem adtam át:** a mérnöki érvelést, ami miatt ez a feature készül el (hogy ez volt a
legnagyobb valódi hézag a 22 végpontban, hogy a `PATCH .../status` az egyetlen út a `delivered`-hez,
és hogy a rendeléskezelés a funkció-lánc hiányzó közepe).

**Miért:** ez az érvelés egy **prioritási** döntés indoklása, nem viselkedési norma. Az
implementálónak a spec betűje a mérce; a „miért fontos ez" viszont pont abba az irányba nyom, hogy
a kereteken túl is építsen — riportot, exportot, e-mail értesítőt —, mert azok is „a hiányzó közepet
töltenék ki". A `requirements.md` 4. szakasza (Nem cél) épp ezért sorolja fel tételesen, mi az,
ami *nem* fér bele.

---

## Tanulság

A legnehezebb döntés az **`api.ts` tulajdonjoga** volt: mindkét rétegnek szüksége van rá, de csak
egy írhatja — ha mindkettő írhatná, a felbontás előnye (elkülönített kontextus) épp ott bukna meg,
ahol a két réteg találkozik. A backendhez rendeltem, mert ott születik a DTO alakja, és így a
kliens egy kész, típusos felületre épül. Ha újracsinálnám, a szerződést nem prózában és
kódblokkban rögzíteném a `plan.md`-ben, hanem **magát az `api.ts` típusdeklarációit írnám meg
előre, a spec részeként** — így nem lenne „szándék vs. valóság" eltérés, amit utólag kell
integrációkor összevetni, és a `Running.md`-ből törölhetném az erre való ellenőrző kérdést.
