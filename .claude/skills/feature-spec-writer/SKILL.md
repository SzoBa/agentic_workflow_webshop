---
name: feature-spec-writer
description: |
  Egy feature specifikációját írja meg a fejlesztő rövid kéréséből: előbb felderíti,
  mi van már készen, majd egyesével visszakérdez és a kimondatlan premisszákat
  megtámadja, végül kiírja a `spec/{feature}/` mappát — követelmények, megvalósítási
  terv, feladatlista —, mérhető kész-kritériumokkal.
  Aktiválódjon, ha a fejlesztő egy MÉG NEM LÉTEZŐ feature specifikációját kéri, egy
  ötletet akar spec-mappává érlelni, vagy azt kérdezi, „mi kell ahhoz, hogy ezt meg
  lehessen csinálni". NE induljon egy MÁR MEGLÉVŐ spec megvalósítására (az a
  `feature-implement` dolga), és egy meglévő spec szövegének javítására sem.
  Példa: „csinálj specet a kupon-beváltáshoz".
---

# feature-spec-writer — egy feature specifikációjának megírása

A bemenet egy **mondat**: egy ötlet, egy kérés, egy hiányérzet. A kimenet egy
`spec/{feature}/` mappa három fájllal, amit a `feature-implement` skill már kóddá tud
váltani. A kettő között az a munka történik, amit ez a skill vezet: **felderítés,
kikérdezés, kihívás.**

```
egy mondat ──► felderítés ──► kikérdezés ──► kihívás ──► spec/{feature}/ ──► feature-implement
              (te nézed meg)  (a fejlesztő   (te támadod   requirements.md
                               dönt)          a premisszát) plan.md
                                                            tasks.md
```

**A spec akkor jó, ha később ítélni lehet rajta.** Nem attól, hogy szép, és nem attól,
hogy hosszú. A repó két lezárt lánc-futása pontosan azt mutatja, hogy a hibák nagyobb
része **spec-írói hiba** volt, nem implementálói — a 3. fázis katalógusa ezekből áll.

Minden szöveg **magyar** (a projekt prózanyelve). Az azonosítók (`AR-01`, `B2.1`) és a
mappanév ékezet nélküliek.

## Nem alku tárgya

- **A tény a kódbázisé, a döntés a fejlesztőé.** Amit `Read`/`Grep` meg tud válaszolni,
  azt **megnézed, nem megkérdezed**. Amit el kell dönteni, azt **megkérdezed, nem
  eldöntöd**. Ez a két mondat a kikérdezés egész ökonómiája.
- **Egy kérdés egyszerre**, `AskUserQuestion`-nel, és **mindig javaslattal** — az ajánlott
  válasz legyen az első opció. Több kérdés egyszerre elveszi a fejlesztő figyelmét attól,
  amit tényleg el kell dönteni.
- **Repótényt nem találsz ki.** Útvonal, osztálynév, végpont, hibaüzenet, tesztnév csak
  akkor kerül a specbe, ha `Read` vagy `Grep` igazolta. Amit nem tudsz igazolni, azt nem
  írod le — vagy megkérdezed.
- **Minden kész-kritérium mérhető állítás.** „elrejtheti", „célszerű", „lehetőleg",
  „általában" nem kritérium: nem lehet rá `[teljesül]`-t mondani. Ha megengedő
  megfogalmazás kívánkozik a tollra, az azt jelenti, hogy a **döntés még nincs meghozva** —
  kérdezz rá.
- **Csak a `spec/{feature}/` alá írsz**, és csak **új** mappába. Terméki kódhoz,
  `docs/`-hoz, `.claude/`-hoz nem nyúlsz, és **meglévő spec-mappát nem írsz felül** — lásd
  „Ha a mappa már létezik".
- **Nem implementálsz, és nem is tervezel meg mindent.** A spec a viselkedés normája és az
  interfész szerződése; az algoritmus megválasztása az implementálóé, hacsak egy döntés
  nem **köti** a két oldalt egymáshoz.
- **A `spec/backend/` a fölérendelt norma.** Az új mappa azt **kiegészíti**, nem váltja
  fel; ütközés esetén a `spec/backend/` nyer, és ezt a specnek ki kell mondania.

## Fázisok

### 0. Hatókör és mappanév

- A feature nevét a fejlesztőtől kapod, vagy javaslatot teszel rá: **ékezet nélküli
  kebab-case**, a funkcióról elnevezve (`admin-orders`, `kupon-bevaltas`), nem a rétegről.
- `Glob`-bal nézd meg a meglévő `spec/*/` mappákat — a névütközés és a **tartalmi** fedés
  is itt derül ki. Közülük három **történeti** spec (a `week3/` alól kerültek ide
  2026-08-02-án); melyik és miért, azt a `spec-konvenciok` 5. szakasza mondja meg. A
  névütközésnél ezek is számítanak, a tartalmi fedésnél viszont **nem** normák: ha az új
  feature egyikük témáját folytatja, az nem fedés, hanem előzmény — hivatkozd a specben,
  és a mai állapotot a kódból és a `spec/backend/`-ből vedd, ne belőlük.
- Tisztázd egy mondatban, mi a megbízás **határa**: egy végpont, egy képernyő, vagy a
  kettő együtt. Ezt a mondatot a fejlesztőnek vissza kell igazolnia, mielőtt bármit kérdezel.

**Ha a mappa már létezik:** állj meg, és mondd ki. Két út van, és a választás a fejlesztőé:
másik feature-név, vagy a meglévő spec kézi módosítása. A meglévő spec átírása **nem ennek
a skillnek a dolga** — a `spec/admin-orders/requirements.md` „Változásnapló" szakasza
mutatja, miért: egy lezárt lánc-futás után a módosítás visszamenőleg **meghamisítja a
mérleget**, ha a nyoma nem marad meg. Ez emberi döntés, nem generálás.

### 1. Felderítés — mielőtt bármit kérdezel

A cél, hogy a kikérdezés **ne** olyasmiről szóljon, amit meg lehet nézni. Olvasd el:

| Mit | Miért |
|---|---|
| `CLAUDE.md` és `CONTEXT.md` | a működési szabályok és a **szóhasználat** mérvadó forrása — a spec fogalmai innen jönnek |
| `.claude/skills/spec-konvenciok/SKILL.md` 5. szakasza | a spec-mappa fájlszerepei és a kész-kritérium keresési sorrendje. **Ez a tények egyetlen otthona** — ne másold ide, hivatkozz rá |
| `spec/backend/vegpontok.md` és `hibakatalogus.md` | van-e már végpont a közelben, és mi a **szó szerinti** magyar hibaüzenet, amit használni kell |
| `spec/admin-orders/` mindhárom fájlja | a **kimeneti alak** mintája — ez a repó legfrissebb, teljes feature-spece |
| `docs/adr/` | ha egy kérdésre a spec nem válaszol, gyakran itt a válasz |

Ezután **`Grep`-pel derítsd fel a kódbázisban**, mi van már készen: létezik-e a végpont,
van-e hozzá séma, van-e kliensoldali hívó, van-e rá teszt. A repó tanulsága, hogy a
feature-ök jellemzően **egy lánc hiányzó közepét** pótolják — az admin rendeléskezelőnél a
státuszváltás és a rendelésleadás is megvolt, csak a listázás nem.

A felderítés kimenete egy **rövid, a fejlesztőnek megmutatott összefoglaló**: mi van meg,
mi hiányzik, és melyik ponton kell dönteni. Ezzel indul a 2. fázis.

### 2. Kikérdezés

`references/kikerdezes-fa.md` — a döntési fa: mit **kell** egy specnek eldöntenie, milyen
sorrendben, és mi a bevett alapértelmezés ebben a repóban.

Szabályok:

- **Egy kérdés egyszerre**, és megvárod a választ. A következő kérdés függhet az előzőtől —
  ez a fa lényege.
- **Minden kérdéshez adj ajánlott választ**, és mondd meg, miért az. A fejlesztő dolga a
  döntés, nem a tervezés.
- Ha egy kérdésre a válasz a kódból vagy a `spec/backend/`-ből következik, **ne kérdezd meg** —
  mondd ki, hogy mi következik belőle, és kérj rá megerősítést egy mondatban.
- **A „nem cél" lista ugyanolyan fontos, mint a cél.** Külön kérdezz rá: mi az, amit ez a
  feature kifejezetten **nem** csinál. Enélkül az implementáló hatóköre nyitva marad.

### 3. Kihívás — a kimondatlan premisszák megtámadása

`references/kihivas-katalogus.md` — a repóban **ténylegesen megtörtént** spec-írói hibák
katalógusa, mindegyikhez a bizonyítékkal, és a kérdéssel, ami megfogta volna.

Ez nem stílusgyakorlat. A `spec/admin-orders/requirements.md` változásnaplója négy javítást
sorol fel, és a review **mindegyiket spec-írói hibaként** azonosította: nem az implementáló
tévedett, hanem a kritérium szövege volt kétértelmű, megengedő, vagy ellenőrizetlen
premisszára épült.

A fázis akkor kész, ha **minden** kész-kritériumot végigvittél a katalógus kérdésein, és
amelyik nem állt meg, azt a fejlesztővel együtt **átfogalmaztad**. Az itt talált
kétértelműségeket **javítani kell**, nem megjegyzésként a spec végére írni.

### 4. Írás

`references/spec-sablonok.md` — a három fájl váza, szakaszonként azzal, hogy mi a dolga, és
mi az a minimum, ami nélkül a szakasz hazudik.

A tehermegosztás — **ezt a hármat nem szabad összekeverni**:

| Fájl | Mit rögzít | Mit **nem** |
|---|---|---|
| `requirements.md` | a **viselkedés normája** és a számozott kész-kritériumok | nem tervez: nem mondja meg, melyik osztályban |
| `plan.md` | az **interfész szerződése** (útvonal, paraméterek, válasz-alak, típustükör, fájltulajdon) és a megkötő döntések | nem ismétli meg a követelményt |
| `tasks.md` | a **végrehajtási sorrend**, munkaegységenként egy `*Kész, ha:*` visszahivatkozással | nem hoz új követelményt |

Amit a specnek **mindig** ki kell mondania, mert a repóban ezen múlt már futás:

- a **kész-kritériumok azonosítóval** (`AR-01`, `KB-01`…) és **`*Bizonyíték:*` sorral** —
  ha nincs megnevezve, minek kell igazolnia, a pont nem ítélhető meg,
- hogy van-e **sémaváltozás**, és ha nincs, azt **kimondva** — az implementáló kötelező
  konvenciója szerint „sémaváltozás = új migráció", és ezt a reflexet a specnek kell
  leállítania,
- hogy a **hibakatalógus bővül-e**, és ha igen, a **szó szerinti** magyar szöveggel,
- a **jogosultsági viselkedés mérve, nem feltételezve** (token nélkül / rossz szereppel),
- egy **végponttól végpontig** mérő kritérium, ha a feature-nek van kliensoldala.

A checkboxokat **üresen** hagyod (`- [ ]`): a `spec/` a norma, nem munkanapló, és a
`spec-guard.mjs` gépileg is tiltja, hogy egy agent kipipálja őket.

### 5. Ellenőrzés

```
node .claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs <feature>
```

Nyolc gépi ellenőrzés a most kiírt mappán: hiányzó fájl · azonosító nélküli vagy duplikált
kész-kritérium · hiányzó `*Bizonyíték:*` · olyan kritérium, amire egyetlen munkaegység sem
hivatkozik (és fordítva) · hiányzó `*Kész, ha:*` · kipipált checkbox · megengedő
megfogalmazás · holt belső hivatkozás.

`HIBA` esetén nem nulla a kilépési kód — **addig nem jelentesz készet**. A `FIGYELEM`
mérlegelést kér: vagy javítod, vagy a jelentésben leírod, miért nem.

### 6. Jelentés

- a létrejött fájlok és a méretük,
- **a kész-kritériumok listája azonosítóval, egy sorban** — ez az, amin a `spec-validator`
  később ítélni fog,
- **mit támadott meg a 3. fázis, és mi lett belőle** — kérdésenként egy sor,
- amit a fejlesztő **kifejezetten nem célnak** jelölt,
- a validátor kimenete szó szerint,
- a következő lépés: `feature-implement` a most megírt mappára.

Ha maradt eldöntetlen kérdés, **mondd ki** — egy „majd az implementáló eldönti" pont a
specben pontosan az a hiba, amit ez a skill kiküszöbölni hivatott.

## Fájlok

Fázisonként olvasd be, ne előre:

- `references/kikerdezes-fa.md` — a 2. fázis döntési fája és a repó alapértelmezései
- `references/kihivas-katalogus.md` — a 3. fázis: megtörtént spec-írói hibák és a kérdés, ami megfogta volna
- `references/spec-sablonok.md` — a 4. fázis: a három fájl váza szakaszonként
- `scripts/spec-ellenoriz.mjs` — az 5. fázis validátora
