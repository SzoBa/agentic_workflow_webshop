# 3/b. Munkacsomagokra bontott implementáció

> A `feature-implement` skill lépésének teljes mechanikája. A SKILL.md azonos számú lépése
> csak az összefoglalót tartja; **ez a fájl a norma**, a lépés végrehajtása előtt kötelező
> elolvasni. A belső hivatkozások („3/a.”, „4/6.”, „5/2.”) a SKILL.md lépésszámaira mutatnak.

Ha a `tasks.md` munkaegységei **`*Gazda:*`** sorral munkacsomagokhoz vannak rendelve (jellemzően
réteg szerint: backend / kliens), akkor **csomagonként külön** delegálsz — nem egyetlen futásban
az egészet. Ilyenkor:

- **A `V` nem implementálói csomag.** A `*Gazda:* V` munkaegységek a záró átvétel: a gazdájuk
  a 6. lépés `spec-validator`-a, aki a teljes kritériumlistával együtt méri őket. A `V`-re
  **nem** delegálsz `spec-implementer`-t, nem kap munkafát, és a merge-sorrendben sem szerepel
  (a betű foglalt — `feature-spec-writer` `references/spec-sablonok.md`). Ha a `*Gazda:*` sorok
  a `V`-n kívül nem neveznek meg csomagot, a spec nem bomlik csomagokra: az alapértelmezett
  lánc fut.
- **Minden (implementálói) csomag saját `spec-implementer` futást kap**, a `tasks.md` függőségi sorrendjében.
  Ha az egyik csomag a másik kimenetére épül (pl. a kliens a backend által megírt típusokra),
  a futások **szekvenciálisak**. Ez akkor is így van, ha **nincs `Orchestrator.md`**: a
  `*Gazda:*` sorok önmagukban elég jelzés a csomagonkénti, szekvenciális delegáláshoz, a `plan.md`
  5. szakaszának sorrendjében (0/b. kivétele — a `Running.md`-be feljegyzed).
- A promptban **nevezd meg a csomagot** („a B csomag a megbízás"), és add át a `plan.md`
  **fájltulajdon-táblázatát** kemény korlátként. Ami nincs a csomag sorában, ahhoz nem nyúl —
  ha úgy tűnik, muszáj lenne, azt **jelenti**.
- **A csomagok kontextusa elkülönített.** A második csomag nem kapja meg az első jelentését
  egészben, csak azt a szeletet, ami az érintkezési felületről szól (a `plan.md`-ben
  befagyasztott szerződés **tényleges** megvalósult alakját). Az `Orchestrator.md` megmondja,
  pontosan mit.
- **Az érintkezési felület ellenőrzése a te dolgod.** Amikor az első csomag jelentése beérkezik,
  vesd össze a `plan.md`-ben rögzített szerződéssel. Ha eltér, azt jegyezd fel a `Running.md`
  integrációs blokkjába, és a **tényleges** alakot add tovább — nem a szándékot.
- A fájltulajdon betartatása szintén a te felelősséged: ha egy csomag jelentése olyan fájlt
  említ, ami nem az övé, az **integrációs ütközés** — írd be a naplóba, és javító körrel
  rendezd.
- **A csomagok mind UGYANABBAN az implementáló worktree-ben futnak, egymás után.** Mivel a
  worktree-t a 3/a. szerint te hozod létre, ráirányíthatod a következő csomagot is — nem kell
  csomagonként integrálni. A második csomag így természetesen látja az elsőt, és a fájltulajdon
  betartatása marad az egyetlen elválasztás, ahogy a `plan.md` szánta.
- **Kivétel: párhuzamos csomagok** — csak ha az `Orchestrator.md` kifejezetten így írja (a
  „D" logika: a `plan.md` 5. szakasza szerint egymástól független csomagok). Ilyenkor minden
  párhuzamos csomag **saját** munkafát kap, ugyanazzal az időbélyeggel:
  `.claude/worktrees/{feature}-impl-{X}`, branch `wt/{feature}-impl-{X}-<ÉÉÉÉHHNN-ÓÓPP>`, a
  3/a. ellenőrzésével együtt; a delegálásuk az e2e ággal **egy üzenetben** indul. A D esetben
  **nem** jön létre toldalék nélküli `{feature}-impl` munkafa — csak a `{feature}-impl-{X}`-ek
  és a `{feature}-e2e`; a 3/a. két `git worktree add` sora közül az elsőt csomagonként a
  `-{X}` alakkal adod ki. **Előre csak a független csomagok kapnak munkafát** (és az e2e ág):
  a fan-in csomagé (lent) a 3/a.-ban még **nem** jön létre, mert az összefésült `HEAD`-ből kell
  ágaznia — egy előre nyitott munkafa a régi `HEAD`-en állna, és az útvonala meg a branch-neve
  a fan-in pillanatában már foglalt volna (a 3/a. „már létezik → állj meg” szabálya ott
  megállítaná a láncot).
  - **Egy alapcsomagra épülő csomag** annak a csomagnak a munkafájában fut, utána, amelyikre
    épül — nem kap új munkafát.
  - **Két (vagy több) párhuzamos csomagra épülő csomag („fan-in")** nem a terv hibája. A lánc
    megvárja, amíg **mindegyik** alapcsomag beolvad a feature-branchbe (a 4. lépés 1–4. és 6.
    pontja ezekre az ágakra, az e2e ág nélkül), és a ráépülő csomag **csak ekkor, az összefésült
    `HEAD`-ből** kap új munkafát: `.claude/worktrees/{feature}-impl-{X}`, branch
    `wt/{feature}-impl-{X}-<ÉÉÉÉHHNN-ÓÓPP>`, ugyanazzal az időbélyeggel, a 3/a. ellenőrzésével
    együtt (a `git worktree list` itt az összefésült `HEAD`-et mutatja). Az érintkezési felület
    tényleges alakját mindkét alapcsomag jelentéséből kapja. Az e2e ág közben fut tovább, és
    csak a lánc végén olvad be.
  - **A merge sorrendjét az `Orchestrator.md` lánc-táblázatának `#` oszlopa adja**: az
    implementálói ágak növekvő `#` szerint, az e2e ága mindig utolsóként. A 4. lépés minden
    implementálói munkafát külön ágként kezel (áganként commit, merge); egy ütközés itt is annak
    a jele, hogy a csomagok mégsem voltak függetlenek.
- **Az e2e ág a teljes csomaglánccal párhuzamos**, nem indul újra csomagonként. A saját
  worktree-je ugyanabból a HEAD-ből ágazik el — a fájltulajdon miatt a végén akkor is
  ütközésmentesen mergelhető. Az e2e-teszt-írónak a munkacsomagok felosztása nem információ:
  ő a kész-kritériumot méri, nem a munkaszervezést.
