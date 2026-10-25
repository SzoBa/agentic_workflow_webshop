# A dokumentációs ág — a 4. fázis párhuzamos fele

A `docs-api-writer` a munkafa gyökerében lévő README-t és OpenAPI-leírót igazítja a kódhoz.
**Ezt a fájlt mindig töltsd be a 4. fázisnál** — a `references/unit-teszt-kor.md`-del
ellentétben ez az ág **kliens-only feature-nél is fut**.

## Miért fut mindig

A unit-teszt kör a `server-java/` elágazásos logikáját méri; ha nincs Java-oldali rész, nincs
mit mérni. A README viszont nem csak végpontokat ír le: a parancsokat, a környezeti változókat,
a mappastruktúrát, a viselkedés meglepő szabályait és a továbbfejlesztési ötleteket is — és
ezek bármelyike avulhat egy tisztán kliensoldali változástól.

Kliens-only feature-nél tehát a 4. fázisnak **ez az egyetlen delegálása**, és az 5–6. fázis
marad ki.

## A delegálás

**Ezt indítsd el először**, még a unit-teszt delegálások előtt, `run_in_background: true`
mellett. Hosszan fut (a leltár, a leíró és a README együtt), és **semmi nem függ tőle** —
a várakozása tiszta veszteség.

`Agent` eszköz, `subagent_type: docs-api-writer`, **egyetlen** hívás. Worktree nem kell: a két
ág ekkor már egyesült. A unit-teszt körrel nem ütközik — az a teszt-forrásfába ír, ez a gyökér
két dokumentumába —, tehát a két ág nyugodtan futhat egyszerre.

A `model` a 2. fázis triázsát követi.

**Amit átadsz:**

- **mi változott** — a spec mappa útvonala és a 2. fázis kiinduló commitja, hogy a változást
  meg tudja nézni,
- az implementáló jelentésének **a végpontokra és a viselkedésre vonatkozó szeletét**,
  kimondva, hogy ez **mutató a bizonyítékhoz, nem bizonyíték**,
- hogy a záró leltár-kapunak **zöldnek** kell lennie, és piros kapunál a jelentés **első sora**
  mondja ki, mi maradt piros.

**Amit ne adj át:** a felbontási tervet, a futási naplót, a validátor teljes jelentését, a
unit-teszt kör anyagát. A dokumentáció a **viselkedést** írja le; aki a megvalósítás tervét
kapja meg, azt fogja dokumentálni, ami ott áll — nem azt, ami a kódban van. Ez ugyanaz a
csapda, mint a unit-teszt körnél, csak itt a kimenete hihetőbb, ezért veszélyesebb.

## A kapu

A kör akkor kész, ha az agent jelentésében a leltár-kapu **kilépési kódja `0`**.

Az agent jelentése a kapu **tényleges** kimenetét tartalmazza — ezt írd a napló 8/b.
blokkjába, ne az összegzését. Ha az agent számot állít, de a szkript kimenetét nem hozta, az
**mérési hiány**, nem zöld kapu: kérd vissza.

## Ha a kapu piros marad

Három eset, és **nem ugyanaz a válasz**:

| Amit az agent visszahozott | Mit jelent | Mi a teendő |
|---|---|---|
| A dokumentum lemaradt, de az agent nem tudta pótolni | eszköz- vagy hatókör-probléma | újra-delegálás a konkrét hiánnyal |
| A **kódban** van olyan végpont, ami a specnek ellentmond vagy nem szándékos | terméki hiba | a **6. fázis** bemenete — `spec-implementer`, majd teljes újravalidálás |
| A kód és a `spec/` végpontlistája eltér, de a kód helyes | elavult spec | **csak jelentés** — a spec javítása emberi döntés |

Amit egyik esetben sem szabad: a kaput **kézzel zöldíteni**, akár úgy, hogy te írod meg a
hiányzó sort, akár úgy, hogy a hibás viselkedést dokumentálod helyesként. Mindkettő azt éri
el, hogy a mérés kikerül a láncból — és onnantól a „naprakész dokumentáció" állítás mögött
semmi nem áll.
