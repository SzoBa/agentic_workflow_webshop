# A kikérdezés döntési fája — a 2. fázis

Amit egy specnek el **kell** döntenie, sorrendben. A sorrend nem önkényes: a lentebbi
kérdések értelmetlenek a fentebbiek nélkül, és a fejlesztő ideje a legdrágább erőforrás a
láncban.

**Használat:** egy kérdés egyszerre, `AskUserQuestion`-nel, az ajánlott válasz az első
opció. Ha egy kérdésre a válasz a kódból vagy a `spec/backend/`-ből **következik**, nem
kérdés, hanem **megerősítendő állítás** — mondd ki egy mondatban, és kérj rá igent.

Ami ki van hagyva a fából, az nem hiányzik, hanem **nem kérdés**: az implementáló dönti el
(változónevek, belső osztályfelosztás, algoritmus), hacsak nem köti a két oldalt egymáshoz.

---

## A. Kapu — kell-e egyáltalán spec

1. **Mi a hiányzó lánc-közép?** Egy mondat: mit **nem** tud ma megcsinálni valaki, és
   miért. A repó feature-jei jellemzően nem új világot építenek, hanem egy meglévő lánc
   hiányzó közepét pótolják.
2. **Ki a szereplő?** Vásárló, admin, vagy a rendszer maga (ütemező)? Ez dönti el az egész
   jogosultsági ágat, ezért van elöl.
3. **Mi a határ?** Csak backend, csak kliens, vagy mindkettő. Ha a fejlesztő „az egészet"
   mondja, kérdezz rá, hogy a **böngészőből is** használható legyen-e — mert akkor kell az
   `E`-ág kritériuma is.

## B. Viselkedés — a norma

4. **Új végpont vagy meglévő bővítése?** Meglévő bővítése a drágább válasz: a meglévő
   viselkedés attól kezdve **regressziós elvárás**, amit a specnek fel kell sorolnia.
5. **Mit ad vissza pontosan?** Mezőnként. Ha egy meglévő válasz-alakot bővít, a bővítés
   **egyetlen** új mező legyen, ha lehet — és mondd ki, mi történik, ha az adat hiányzik
   (`null`, üres szöveg, vagy **hiányzó mező** — a repóban ez utóbbi a bevett).
6. **Rendezés és lapozás.** Mi a rendezőkulcs, és melyik irányban? Kell-e lapozás, és ha
   igen, mi az alap lapméret?
   *Alapértelmezés:* a listázás rendezőkulcsa a beszúrási sorrend; a lapozás
   query-paraméter-szemantikája (vágások, hibás érték → alapérték) a rendszer meglévő
   szerződése — **ne írj rá saját értelmezőt**, és a specben mondd ki, hogy a meglévőt
   használja.
7. **Szűrés.** Mely mezőkre, kis/nagybetű-érzékenyen? Mi történik **ismeretlen** szűrő-
   értékkel — 400, vagy visszaesés az alapértelmezésre?
   *Alapértelmezés:* visszaesés, mert a meglévő admin listák így viselkednek, és két admin
   lista nem viselkedhet másképp ugyanazon a néven. Ezt **külön kritériumnak** kell mérnie,
   mert a validációs reflex 400-at csinálna belőle.
8. **Mi a hibás bemenet, és mi történik vele?** Státuszkódonként. Ha a végpontnak nincs
   olyan bemenete, ami hibát okozhat, azt is **mondd ki** — az is állítás.

## C. Adat és jogosultság

9. **Kell-e sémaváltozás?** Ha **nem**, azt a specnek **kimondottan** rögzítenie kell:
   az implementáló kötelező konvenciója szerint „sémaváltozás = új migráció", és ezt a
   reflexet csak egy explicit tiltás állítja le. Ha **igen**: melyik táblák, és mi a
   visszafelé kompatibilitás?
10. **Bővül-e a hibakatalógus?** Ha igen, a **szó szerinti magyar szöveget** most kell
    kitalálni, a `spec/backend/hibakatalogus.md` hangnemében — mert a teszt erre a szövegre
    fog asszertálni, karakterre. Ha nem, azt is írd le: „a hibakatalógus változatlan".
11. **Ki férhet hozzá?** Vendég, belépett vásárló, admin. A védelem jellemzően
    útvonalminta alapján, egyetlen ponton van bekötve — de a specnek elő kell írnia, hogy
    ezt **mérni** kell (hitelesítés nélkül és rossz szereppel is), nem feltételezni.

## D. Kliens

12. **Új útvonal vagy meglévő képernyő bővítése?** Melyik őr alatt, és megjelenik-e a
    menüben, kinek?
13. **Mit lát a felhasználó soronként / elemenként?** Sorold fel a mezőket. A magyar
    címkék **meglévő** címketérképből jöjjenek, ha van rá — új magyar szöveg ugyanarra a
    fogalomra kétszeres karbantartás.
14. **Van-e meglévő komponens, ami ezt már tudja?** Ha igen, a specnek **elő kell írnia**
    a használatát, és **meg kell tiltania** a logika megismétlését — de a tiltás **hatókörét
    is** ki kell mondania (lásd `kihivas-katalogus.md`, „globálisan olvasható tiltás").
15. **Hol dönt a kliens, és hol a szerver?** Alapértelmezés: az ítélet a szerveré, a kliens
    a hibaüzenetét **változtatás nélkül** mutatja. Minden ez alóli kivétel legyen
    **mérhetően körülírva** — a „végállapoton nincs mit felkínálni" típusú kivétel rendben
    van, az állapotgép lemásolása nincs.

## E. Kész-kritériumok

16. **Végigmehet-e minden ponton egy külső ítélő?** Vedd sorra a B–D ágak válaszait, és
    mindegyikből csinálj **egy** állítást — egy pont, egy állítás, hogy pontonként lehessen
    ítélni. Két állítás egy pontban azt jelenti, hogy a fele teljesülhet.
17. **Mi igazolja?** Pontonként `*Bizonyíték:*`: megnevezett teszt, tényleges parancskimenet
    vagy `fájl:sor`. Bizonyíték nélküli kritérium nem kritérium.
18. **Mi a regressziós elvárás?** Amit a feature megérint, de nem változtathat meg. Ha egy
    közös segédfüggvényt általánosítani kell, a régi hívói **külön kritériumban** maradjanak
    zöldek.
19. **Van-e végponttól végpontig mérő pont?** Ha a feature-nek van kliensoldala, **kell**:
    a kliens-tesztek mockolt API-val mérnek, a backend-tesztek kliens nélkül — a kettő
    találkozását egyik sem bizonyítja. Ez a hiány már megtörtént (`AR-19`).

## F. Munkaszervezés

20. **Egy munkacsomag vagy több?** Ha a feature backend **és** kliens oldalt is érint,
    érdemes rétegenként csomagra bontani. Ekkor a `plan.md`-be **fájltulajdon-táblázat**
    kell: melyik csomag mihez nyúlhat kizárólagosan. Ez teszi ütközésmentessé a párhuzamos
    vagy egymást követő implementálói futásokat.
21. **Mi a függőségi sorrend?** Melyik csomag melyikre épül, és min keresztül (jellemzően a
    típustükrön). A tükör **annak a csomagnak a tulajdona, ahol a válasz alakja születik** —
    a másik olvassa, de nem írja.

---

## Amit soha ne kérdezz meg

Ezekre a válasz a kódbázisban vagy a `spec/backend/`-ben van — **nézd meg**:

- létezik-e már a végpont, van-e rá teszt, van-e kliensoldali hívó,
- mi a szó szerinti magyar hibaüzenet egy már létező hibaesetre,
- hogyan van bekötve a hozzáférés-vezérlés,
- milyen alakú egy meglévő válasz-DTO és a hozzá tartozó típustükör,
- milyen parancsokkal fut a build, a teszt és a lint (`spec-konvenciok` 3. szakasza),
- mi a projekt prózanyelve és a tesztnév-konvenció.
