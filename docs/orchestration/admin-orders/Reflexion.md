# Önreflexió

## Mit mértem, és mit nem

A `Running.md` négy delegálást rögzít (`spec-researcher`, két `spec-implementer`, `spec-validator`),
delegálásonkénti modellszinttel, **0 javító körrel** és **18/18** teljesült kritériummal — újra-delegálás
és pontosítás nélkül. Ez valós adat, és ennyit mond: a lánc **elsőre helyes** kimenetet adott egy
ekkora feature-re, méghozzá úgy, hogy a validátor több pontot a saját mérésével is visszaellenőrzött.

Amit viszont **nem** mértem: a **költséget**. A napló nem rögzít sem token-, sem időadatot. Ezért az
alábbi három megfigyelésből az első kettő a futásból következik, a harmadik viszont **intuíció**,
és annak is nevezem.

## Három megfigyelés

**1. A kontextus átadása a drága pont, nem a munka.** Ahol a subagentek párhuzamosan futnak, a
költség nem a feladat méretével nő, hanem azzal, hogy mennyi anyagot kell újra átadni. Érdemes egy
másik skill/agenttel „előemészteni" a bemenetet — a nyers spec újraküldése minden delegálásnál
gyorsan elszáll. Ez a futásból is látszik: a validátornak **szándékosan** nem adtam át a saját
összefoglalómat és a javítókör-számlálót, mert horgonyt adott volna a megerősítés felé — a kontextus
megválogatása tehát nemcsak költség-, hanem **helyességi** kérdés is.

**2. A skillek és agentek karbantartást igényelnek, esetről esetre.** Nem egyszer megírható
tárgyak. A `feature-implement` skill ebben a futásban is módosult.

**3. A projekt-specifikus skill többet ér az általánosnál** — mert a kiválasztást a
„description-be vágó" feladatleírás és a jól definiált hivatkozások hajtják, nem a skill általános
képessége. Ezért **jelenleg** nem látom érdemi létjogosultságát a mindenre jó, projektek között
másolható skilleknek. Ha valaki megvalósítja a lokálisan futtatott LLM-es változatot, azzal a
költséget csökkenti és a nagy kontextus is kevésbé zavaró — de a butább modell épp a nehezét nem
fogja tudni: megtalálni a megfelelő skillt és levezényelni a flow-t.

## Amit állítottam, és amit igazolni tudok

Korábban azt írtam, hogy a beállított subagent-workflow „hatékonyabb **és olcsóbb**, mint egy
általános prompt". A **hatékonyabb** részre van adatom (0 javító kör, 18/18, 0 újra-delegálás).
Az **olcsóbb** részre nincs: pont azt nem mértem.

Ez azért kellemetlen, mert nálam volt a mérőműszer. A `Running.md` szerkezete már ma is
delegálásonként rögzít modellszintet — a token- és időadat felvétele ugyanoda nem lett volna nagy
munka.

**Mi cáfolná.** Ugyanez a munkacsomag egyetlen prompttal, lánc nélkül, a teljes speckel — és a két
futás token-, idő- és javítókör-adata egymás mellett. Az eredmény akár ellenem is szólhat: négy
delegálás újraküldött kontextussal simán kerülhet **többe**, és akkor a lánc nem az árával, hanem a
**helyességével** keresi meg a helyét. Ez védhetőbb és érdekesebb állítás lenne, mint amit írtam.

Egy fenntartás a mérés értékéről: `n = 1`, LLM-nondeterminizmussal, ráadásul a spec eleve a
lánchoz készült — egy naiv prompt olyan specet kapna, ami nem neki íródott. A számot tehát nem
szabadna egyetlen futásból általánosítani.

---

*A „hatékonyabb és olcsóbb" bizonyítatlan felére egy külső review hívta fel a figyelmet
(2026-07-31). A kritika jogos volt.*
