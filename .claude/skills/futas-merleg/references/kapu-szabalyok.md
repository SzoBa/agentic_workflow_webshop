# A kapu négy szabálya

A `futas-mero.mjs` a delegálás **előtt** dönt, a már egyeztetett napló alapján.
Csak `deny`-t ad; vagy egy `systemMessage`-et `permissionDecision` NÉLKÜL (mérési hiány,
elromlott mérő — látszik, de a hívásról nem dönt); vagy kimenet nélkül zár (belső
`defer`: „nem ítélek", a `defer` szót sosem írja ki — lásd a `CLAUDE.md`-t) — `allow`-t
soha, hogy ne kerülje meg a delegálás engedélykérését, és ne ütközzön a
`kontextus-mero.mjs` átírás-`allow`-jával, amely ugyanarra a matcherre van bekötve.

**`deny` csak láncban** (döntés, 2026-11-07): ha a futás-azonosító a sessionre esett
vissza (se `FUTAS_AZONOSITO`, se friss jelző), a szabályok ugyanúgy számolnak, de a
találat `systemMessage`-figyelmeztetés, `permissionDecision` nélkül — a szöveg kimondja,
hogy láncban ez tiltás volna. A `deny` után a hook egy `allapot: "tiltva"` sort ír a
naplóba (fogyasztás nélkül): ez a tiltás nyoma, a `cost-reducer` mérlege erre szűr.

A naplót minden szabály **deduplikálva** olvassa (`egyediSorok`, kulcs: `tool_use_id` + a
szakasz kezdete): két, egyszerre futó hook kettős sora se dupla költséget, se egy második,
azonos „validátorkört" — és abból hamis konvergencia-tiltást — ne adjon. Ugyanitt esik ki
az a `hiba` sor, amelynek `tool_use_id`-jához később mért sor jött (elavult mérési hiány).
A `hiba` és a `tiltva` sor egyik szabálynál sem fogyasztás.

## Amit egyik szabály sem tilt

Ez a két kivétel a szabályok fölött áll, és mindkettő szándékos:

1. **Validátor-delegálást soha.** Ha a konvergencia megállt, az utolsó dolog,
   amit el akarunk veszíteni, a záró mérés. Egy tiltott validátor azt jelentené,
   hogy nem tudjuk, hol tartunk — miközben pont az a kérdés.
2. **Amire nincs adat.** Első delegálás (a futásnak még nincs egyeztetett sora) → nincs
   ítélet (kimenet nélküli exit 0). Hiányzó átirat, olvasási hiba, vagy egy átirat,
   amelyből **egyetlen sor sem** értelmezhető (súlyos mérési hiba) → szintén nincs ítélet,
   de egy `systemMessage` kimondja, hogy a mérő nem indult el. **A tiltáshoz
   bizonyíték kell.** Egy hibás mérő ne bénítson le munkát; a rossz irányba tévedés itt
   drágább. A „kettőnél kevesebb validátorkör → nincs ítélet" kivétel **csak a
   konvergencia- és az oszcilláció-szabályra** vonatkozik (azoknak két kör kell az
   összevetéshez); a **keret** ettől függetlenül tilt, validátorkör nélkül is — épp a
   2. körig sosem érő futást kell megfognia (`futas-kozos.mjs`, `itelet()`: a keret-ág
   a `korok.length < 2` vizsgálat ELŐTT áll).

A konvergencia- és oszcilláció-szabály ráadásul **csak javító** delegálást tilt
(`javito_agentek`: `spec-implementer`, `e2e-test-writer`). A kutató vagy a
teszt-író indítása nem az ismétlődés jele.

## 1. `keret` — futáskeret

**Tilt, ha:** a futás halmozott költség-egysége (vagy USD-je) eléri a küszöböt.

Ez fogja el azt az esetet, amit a körszámláló nem: **sok kicsi delegálást, ami
sosem ér el a 2. körig**. Egy húsz apró delegálásból álló körbe-körbe járás
körkorláttal nézve teljesen szabályos.

Mindkét ág él, amelyik előbb telik be. Ismeretlen modellnél nincs USD (a
hiányzó ár nem ingyenes delegálás) — olyankor a költség-egység az egyetlen kapu.

A **megszakadt** delegálás fogyasztása beleszámít: azt a tokent valóban
elköltöttük.

A **még futó háttéragent** eddigi körei is beleszámítanak (`allapot: "fut"`): az
egyeztetés a részleges átiratból kiszámolja őket, a kapu az ítéletbe veszi, de a naplóba
csak a lezárás után kerül a delegálás — egyszer. Konvergenciát a futó agent nem hordoz
(nincs még zárójelentése). A tiltás szövege megmondja, mennyi jött futó agentből.

## 2. `konvergencia` — a hurok megállt

**Tilt, ha:** az utolsó két validátorkör `[nem teljesül]` száma nem csökkent
(`n2 ≥ n1`), **és** `n1 > 0`.

Az `n1 > 0` feltétel nem részletkérdés: nélküle egy `0 → 0` görbe — vagyis két
egymást követő tiszta kör, a legjobb lehetséges kimenet — leállásnak
minősülne.

Ugyanez az `n1 > 0` feltétel azt is jelenti, hogy a **`0 → N`** görbét (egy tiszta
kör után újra bukó kört) ez a szabály **nem** tiltja. Ez **döntés (2026-11-06)**, nem
rés: a `0 → N` esetet az oszcilláció fogja (3. pont), mert a tiszta körben minden
kritérium `[teljesül]` volt, így ami utána bukik, az visszaesés. Bizonyíték:
`test/hooks/merok.test.mjs`, a „0 → N" esetek — a javítás előtt is zöldek voltak.

Nem számít validátorkörnek:
- a **megszakadt** delegálás (a markerei hiányosak, nem javuló mérleget
  jelentenek);
- a **marker nélküli** jelentés (`konvergencia: null`). A nulla találat mérési
  hiány, nem „nulla hiba" — ugyanaz az elv, mint hogy a `[kétséges]` nem indít
  javító kört;
- a **csupa `[kétséges]`** jelentés (egyetlen `[teljesül]`/`[nem teljesül]` sincs
  benne): ugyanúgy mérési hiány, `marker-nelkul` állapot. Korábban `nem_teljesul: 0`-ként
  „tiszta körnek" számított, és egy `2 → (csupa kétséges) → 2` görbéből `0 → 2` lett — a
  konvergencia-szabály elengedte;
- egy már látott sor **kettős példánya** (ugyanaz a `tool_use_id` és szakasz) — a
  párhuzamos hookok versenyének terméke, nem új kör.

## 3. `oszcillacio` — körbe-körbe javítás

**Tilt, ha:** egy kritérium-azonosító **bármelyik** korábbi körben `[teljesül]`
volt, most `[nem teljesül]` (az összes korábbi kör teljesült-uniójával hasonlít, nem
csak az előzővel — az 1. körben teljesült, a 2.-ban `[kétséges]`, a 3.-ban bukó
kritérium is visszaesés).

**A `0 → N` eset is ide tartozik** (döntés, 2026-11-06): egy tiszta kör után a
következő körben bukó kritérium oszcilláció-tiltást ad, a konvergencia-szabály
szándékosan nem lép. **Ismert rés:** egy olyan kritérium bukása, amelyet **egyik**
korábbi kör sem jelölt `[teljesül]`-nek (új azonosító, vagy azonosító nélküli sor),
egyik szabályt sem váltja ki — az oszcilláció azonosító-alapú, és amit nem mértünk
teljesültnek, arról nem állítja, hogy visszaesett.

**Melyik token a kritérium.** Soronként legfeljebb egy azonosító: a jelölő előtti első,
annak híján a jelölő utáni első (`N. [teljesül] <ID> — …` és `<ID> [teljesül] …` egyaránt).
Ha a futás feature-jéhez (a futás-azonosító `-ÉÉÉÉHHNN-ÓÓPP` utótag nélkül) van
`spec/{feature}/requirements.md` definiált azonosítókkal (`- [ ] **AR-01** — …`), **csak
ezek** közül választ — egy `UTF-8`, egy `K-58` vagy egy hivatkozott, de nem definiált
azonosító így nem lesz kritérium, és nem ad hamis oszcillációt. Ha nincs ilyen spec, vagy
nincs benne definíció (a történeti specek egy része), a minta-szabály marad: az első
`NAGYBETŰ{1,4}-szám` token. A sor `konvergencia.azonosito_forras` mezője mondja meg,
melyik ág futott (`spec` / `minta`).

Ez a szabály azért kell külön, mert **a darabszám elrejti**. Mért példa:

```
1. kör: [nem teljesül] AR-1, AR-4, AR-5   ·  [teljesül] AR-2, AR-3
2. kör: [nem teljesül] AR-2               ·  [teljesül] AR-1, AR-3, AR-4, AR-5
```

A szám `3 → 1`: szép javulás, a konvergencia-szabály átengedi. Közben viszont az
`AR-2` **visszaesett** — a javítás elrontott valamit, ami már működött. Ez a
klasszikus körbe-körbe járás, és csak azonosító-szinten látszik.

## 4. `kor_korlat` — alapból KIKAPCSOLVA

**Tiltana, ha:** a javító delegálások száma elérné a küszöböt.

`null` = kikapcsolva, tudatos döntés. A „legfeljebb 2 javító kör" korlátot ma a
`feature-implement/SKILL.md` 7. lépésének prózája tartja. A hely azért van meg a
`keretek.json`-ban, hogy egy későbbi döntés bekapcsolhassa kódírás nélkül.

## Ha a kapu bekattan

**A küszöböt nem visszük lejjebb.** Ugyanaz az elv, mint a JaCoCo 90%-os
áglefedettségi kapunál: a kapu nem a probléma, hanem a jel. Aki a küszöböt
igazítja a futáshoz, a mérőműszert állítja el.

A `deny` üzenete megnevezi a szabályt, a számokat és azt, hogy ez **döntési
pont**. A helyes válasz: megállni és jelenteni. A három valódi lehetőség:

| Helyzet | Lépés |
|---|---|
| Az implementáció tényleg nem közelít | kézi javítás, vagy a feladat újragondolása |
| A kritérium megfogalmazása a hibás | a spec pontosítása — **itt tényleg megtörtént**, lásd `feature-spec-writer/references/kihivas-katalogus.md` |
| A futás jogosan nagy | a fejlesztő tudatosan emeli a keretet, és frissül a `kalibralva` dátum |

**Amit soha:** ugyanazt a delegálást újraindítani, kisebb darabokra bontani a
korlát alá kerülésért, vagy `FUTAS_KERET=0`-t állítani. Az utolsó a fejlesztő
kapcsolója, egy futásra, nem az orchestrátoré.

## A csendes csapdák

- **Ismeretlen mód-string** → a hook nem mér és nem ítél (a `switch (MODE)`
  `default` ága), csak egy `systemMessage`-et ad ki, `permissionDecision` nélkül.
  Egy elgépelt mód tehát **kikapcsolja a kaput** — ez látszik, de a futást nem
  állítja meg. A futás ELŐTT csak `node .claude/skills/skill-iro/scripts/ellenoriz.mjs --mind` fogja el.
- **A `status` hazudik.** Mérve (`admin-orders`, `a566bc37caf892fd5`): egy
  session-limitbe futott, feladatát be nem fejező validátor `status`-a is
  `completed`. A csonkaságot csak a jelentés szövege árulja el. A `did NOT finish`
  minta kis/nagybetűre érzékeny: egy hétköznapi „did not finish" a jelentésben nem
  csonkaság.
- **A lejárt jelző.** Egy 6 óránál régebbi (a `frissitve`, annak híján a `kezdet`
  szerint) lánc-jelző mellett a kapu a session futásáról ítél, és ott nem tilt — a lánc
  kerete nulláról indulna. Ezért a hook ilyenkor `systemMessage`-et ad. Ha a lánc még
  fut, a lánc frissítse a `frissitve` mezőt; a jelző átírása a `deny` megkerülésére
  viszont a kapu kijátszása, nem javítás.
- **A `totalTokens` nem fogyasztás.** Az utolsó kör kontextusmérete. Mérve:
  175 120 vs. a körök tényleges összege 10 281 395 — hatvanszoros alábecslés,
  és nem hibaüzenet, hanem egy hihető szám. Ezért `zaro_kontextus` a neve a
  naplóban, és ezért nem abból számol költséget senki.
