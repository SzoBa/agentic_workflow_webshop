# Az `Orchestrator.md` sablonja — az 1. fázis

A `docs/orchestration/{feature}/Orchestrator.md` a lánc **alakja**: hány delegálás van,
melyik agenttel, milyen sorrendben, mi fut párhuzamosan, és ki milyen kontextust kap. A
`feature-full` 1. fázisa **generálja** ebből a sablonból; a `feature-implement` 0/b. lépése
**olvassa**, és ez szabja meg a lánc alakját. A fejlesztő kézzel is írhatja — élő, kézi
példány: `docs/orchestration/admin-orders/Orchestrator.md` (a 2. fázis e2e-ága előtti
állapotot rögzíti, ezért abban nincs `e2e-test-writer` delegálás).

**Egyik subagent sem kapja meg** — sem a tartalmát, sem az útvonalát. Ezért van a `spec/`
mappán kívül: a spec-agentek a spec-mappa minden `.md` fájlját normaként olvassák, és egy
delegálási terv ott mindegyiknek utasítás volna.

## Bemenet — a tartalom forrása

| Forrás | Mit veszel ki belőle |
|---|---|
| `plan.md` 5. szakasza („Munkacsomagok és függőségeik") | a csomagok betűjelét, a függőségeket és a független csomagok sorát — **ez a levezetés alapja** |
| `plan.md` 3. szakasza (fájltulajdon) | hogy a „független" csomagok tényleg diszjunkt fájlokat írnak-e |
| `plan.md` 2. szakasza (típustükör) | az érintkezési felületet: a ráépülő csomag ennek **tényleges** alakját kapja |
| `tasks.md` `*Gazda:*` sorai | hogy a csomagok betűjelei egyeznek-e az 5. szakaszéval |
| `requirements.md` kliens-szakasza | van-e e2e-ág (kliens-felület nélkül nincs) |

**Régi alakú spec** (az 5. szakasz „Felbontás — a subagentek munkamegosztása", agent-nevekkel,
pl. `spec/admin-orders/plan.md`): a csomagokat és a függőségeket abból is ki lehet olvasni, de
a benne álló delegálási leírás **javaslat**, nem bemenet — a `tasks.md` és a fájltulajdon
ellenőrzi.

## A logika kiválasztása — levezetési szabály

| Amit a `plan.md` 5. szakasza mond | Javasolt logika |
|---|---|
| egy munkacsomag | **A — szerep szerint**: a `feature-implement` alapértelmezett lánca, egy implementálói delegálással |
| több csomag, és mindegyik a másikra épül | **C — hibrid**: szerep szerinti lánc, az implementálói lépés csomagonként külön delegálás, **szekvenciálisan**, a függőség sorrendjében |
| több csomag, és van köztük független | **D — párhuzamos csomagok**: a független csomagok egyszerre, csomagonként külön worktree-ben; ami rájuk épül, utánuk. Ha egy csomag **két (vagy több)** párhuzamos csomagra épül („fan-in"), az **nem** a terv hibája: a lánc megvárja, amíg mindegyik alapcsomag beolvad a feature-branchbe, és a ráépülő csomag az összefésült `HEAD`-ből kap új worktree-t (`{feature}-impl-{X}`; a mechanika a `feature-implement` 3/b. lépésében) |

A **B — réteg szerint** (párhuzamos implementálók felderítés és validálás nélkül) a
kézi példány mérlegelésében szerepel, de **nem generálható**: a kutatót és a validátort
dobja el, és a `feature-implement` lánca mindkettőt megköveteli.

Az e2e-ág (`e2e-test-writer`, előretolt módban) mindhárom logikában az **egész**
implementálói lánccal párhuzamos, ha van kliens-felület — a csomagolás neki nem információ.

**Kérdezz (`AskUserQuestion`, az ajánlott válasz az első opció), ha a levezetés nem
egyértelmű** — és csak akkor:

- a `plan.md`-ben nincs 5. szakasz, vagy régi alakú, és a `tasks.md` `*Gazda:*` sorai mást
  mondanak, mint ami benne áll,
- két „független" csomag a fájltulajdon szerint **közös** fájlt ír, vagy egyik a másik
  fájlját olvassa (ide tartozik az is, ha két migrációt író csomag nem kapott külön
  Flyway-verziószámot a 3. szakaszban) — akkor nem függetlenek, és a kérdés az, hogy a függőség vagy a tábla a rossz
  (a specet ilyenkor **nem** javítod: a fejlesztő dönt, a kérdés a `Running.md`-be kerül),
- a `*Gazda:*` sorokban olyan betűjel áll, ami az 5. szakaszban nem szerepel (vagy fordítva).

Ami a táblából következik, arra **nem** kérdezel — legfeljebb egy mondatban kimondod, mit
vezettél le. **A fan-in sem kérdés:** ha egy csomag két (vagy több) független csomagra épül, a
logika D marad, a ráépülő csomag a lánc-táblázatban az alapcsomagjai **után** áll, a „Mire vár"
oszlopában mindegyik alapcsomag `#`-ával, és a „Levezetés" kimondja, hogy az összefésült
`HEAD`-ből kap új worktree-t.

**A lánc-táblázat `#` oszlopa egyben a merge sorrendje** (a `feature-implement` 3/b. és 4/3.
pontja ebből dolgozik): az implementálói delegálásokat úgy számozd, hogy egy csomag `#`-a
mindig nagyobb legyen, mint bármelyik alapcsomagjáé. Az e2e ág merge-e mindig utolsó, a `#`-ától
függetlenül.

## A váz

```markdown
# Felbontási terv — {feature}

> Az orchestrátor (a fő session) ez alapján delegál. **Egyik subagent sem kapja meg** — ez a
> szervezés könyvelése, nem a feature normája.
>
> Generálta: `feature-full` 1. fázis, {ÉÉÉÉ-HH-NN}, a `spec/{feature}/plan.md` 5. szakaszából
> {| kézzel írta: …}. Kapcsolódó: [`Running.md`](./Running.md){ · [`Decision.md`](./Decision.md)}.

## Választott logika

- **A — szerep szerint.** kutató → implementáló → validáló (∥ e2e-író), egy implementálói futás.
- **C — hibrid.** Szerep szerinti lánc, az implementálói lépés csomagonként, szekvenciálisan.
- **D — párhuzamos csomagok.** A független csomagok egyszerre, külön worktree-ben.

**Választott: `[ ] A   [ ] C   [ ] D   [ ] Egyéb: ____`**

**Levezetés.** {A `plan.md` 5. szakaszának függőségei szó szerint, és ami belőlük következik:
melyik csomag párhuzamos melyikkel, és melyik vár melyikre — min keresztül (pl. „F a B által
írt `api.ts`-re épül, ezért B után fut").}

{Ha kérdés volt: a kérdés, a felkínált opciók és a fejlesztő válasza.}

## A lánc

{ASCII-ábra, a párhuzamos ágakat egymás mellett.}

| # | Agent | Csomag | Párhuzamos-e (kivel) | Mire vár |
|---|---|---|---|---|
| 1 | `spec-researcher` | — | nem | — |
| 2 | `spec-implementer` | {X} | {nem | a 3-mal} | 1 |
| … | `e2e-test-writer` | — | igen — a teljes implementálói lánccal | 1 (a befagyasztott UI-kiválasztói szerződés) |
| n | `spec-validator` | — | nem | az e2e futás |

## {k}. delegálás — `{agent}` {({X} csomag)}

**Feladata:** {egy-két mondat; csomagnál a `tasks.md` {X}-M1 … {X}-Mn munkaegységei.}

**Kontextus, amit megkap:** {a `feature-implement` megfelelő lépésének átadási listája az alap
— azt NE másold ide. Ide csak a csomag-specifikus rész kerül: melyik csomag a megbízás, a
fájltulajdon-táblázat mint kemény korlát, és a ráépülő csomagnál az érintkezési felület
**tényleges** alakja az előző csomag jelentéséből.}

**Amit szándékosan NEM kap meg:** {a másik réteg konvenciói, a másik csomag nyers
jelentése, …}

**Elvárt kimenet:** {jelentés `fájl:sor` hivatkozásokkal, a csomaghoz tartozó kritériumok
önellenőrzése, a build/teszt/lint **tényleges** kimenete; az érintkezési felületet birtokló
csomagnál annak megvalósult alakja.}

**Validálási szempont:** {mitől elfogadható a jelentés: zöld parancsok, a szerződéssel egyező
felület, idegen fájl nem változott.}

**Párhuzamos-e:** {nem — vár a {j}. delegálásra | igen — a {j}. delegálással egy üzenetben,
külön worktree-ben}

{… delegálásonként ismételve …}

## Amit az orchestrátor megtart magának

1. **A másik subagent nyers jelentése.** A ráépülő csomag csak az érintkezési felület
   tényleges alakját kapja belőle.
2. **A feature kiválasztásának indoklása.** A „miért fontos" a subagentnek zaj: a spec
   keretein túli „hasznos" munkára bírja.
3. **A modell-triázs** (`feature-implement` 1/b.) — költség-döntés, a munkára irreleváns.
4. **A javítókör-számláló.** A javító ág a konkrét hibákat kapja, nem azt, hányadik körben
   tart a lánc.
5. **Az orchestration-mappa** — ez a fájl, a `Running.md`, a `Decision.md`. A
   `UiSelectors.md`-nek csak a **tartalma** jut el a két párhuzamos ághoz, az útvonala nem.

{6. … feature-specifikus tétel, ha van.}

## Egyik subagent sem kapja meg

Ez a fájl — sem a tartalma, sem az útvonala — egyetlen delegálás promptjába sem kerül.
```

## Amit generáláskor tilos

- **A `feature-implement` mechanikáját átmásolni** — worktree-parancsokat, a
  UI-kiválasztói szerződés befagyasztását, a merge parancsait. Az ott él, egy helyen; ide csak
  a lánc **alakja** kerül. A merge **sorrendje** ennek a része: azt a lánc-táblázat `#` oszlopa
  adja (lásd „A logika kiválasztása"), külön prózában nem ismétled.
- **Kontextust kitalálni.** Ha egy delegálásnál nincs csomag-specifikus átadnivaló, a
  „Kontextus" mező annyi: „a `feature-implement` {lépés} szerint".
- **Meglévő `Orchestrator.md`-t felülírni.** Ha a fájl már létezik (kézi vagy korábbi futás
  terve), azt használod, és a `Running.md` „Kiinduló állapot" blokkjába beírod, hogy nem
  generáltál. Ha szerinted ütközik a `plan.md` 5. szakaszával, kérdezz.
- **Futás közben igazítani.** Ha a terv rossznak bizonyul, az a `Running.md`-be megy, és a
  jelentésbe — a tervet nem írod át utólag úgy, mintha eleve az lett volna.
