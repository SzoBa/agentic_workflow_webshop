# A kapu négy szabálya

A `futas-mero.mjs` a delegálás **előtt** dönt, a már egyeztetett napló alapján.
Csak `deny`-t ad; vagy egy `systemMessage`-et `permissionDecision` NÉLKÜL (mérési hiány,
elromlott mérő — látszik, de a hívásról nem dönt); vagy kimenet nélkül zár (belső
`defer`: „nem ítélek", a `defer` szót sosem írja ki — lásd a `CLAUDE.md`-t) — `allow`-t
soha, hogy ne kerülje meg a delegálás engedélykérését, és ne ütközzön a
`kontextus-mero.mjs` átírás-`allow`-jával, amely ugyanarra a matcherre van bekötve.

A naplót minden szabály **deduplikálva** olvassa (`egyediSorok`, kulcs: `tool_use_id` + a
szakasz kezdete): két, egyszerre futó hook kettős sora se dupla költséget, se egy második,
azonos „validátorkört" — és abból hamis konvergencia-tiltást — ne adjon.

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
  `completed`. A csonkaságot csak a jelentés szövege árulja el.
- **A `totalTokens` nem fogyasztás.** Az utolsó kör kontextusmérete. Mérve:
  175 120 vs. a körök tényleges összege 10 281 395 — hatvanszoros alábecslés,
  és nem hibaüzenet, hanem egy hihető szám. Ezért `zaro_kontextus` a neve a
  naplóban, és ezért nem abból számol költséget senki.
