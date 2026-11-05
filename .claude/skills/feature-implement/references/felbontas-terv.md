# 0/b. A felbontás tervének megkeresése

> A `feature-implement` skill lépésének teljes mechanikája. A SKILL.md azonos számú lépése
> csak az összefoglalót tartja; **ez a fájl a norma**, a lépés végrehajtása előtt kötelező
> elolvasni. A belső hivatkozások („3/a.”, „4/6.”, „5/2.”) a SKILL.md lépésszámaira mutatnak.

Nézd meg, létezik-e **`docs/orchestration/{feature}/`** mappa. Ha igen, az tartalmazza a feature
subagent-felbontásának tervét, és **az** szabja meg a lánc alakját — nem az alábbi
alapértelmezett sorrend.

| Fájl | Szerep |
|---|---|
| `Orchestrator.md` | **A felbontás terve.** Melyik subagent mit kap, mit ad vissza, mi a validálási szempontja, mi fut párhuzamosan, és mit tart meg magának az orchestrátor. A `feature-full` 1/b. fázisa generálja a `plan.md` 5. szakaszából (váz: `.claude/skills/feature-full/references/orchestrator-sablon.md`), vagy a fejlesztő írja kézzel. |
| `Running.md` | **Futási napló.** Kitöltetlen sablon, amit ez a futás tölt ki (1/c. lépés). Ha egy **korábbi** futás már kitöltötte, ne írd felül: nyiss új, dátumozott futás-blokkot alatta, vagy kérdezz vissza. |
| `Decision.md` | A kontextus-átadási döntések indoklása. Olvasd el, de ne add tovább. |
| `UiSelectors.md` | **A befagyasztott UI-kiválasztói szerződés** — nem előfeltétel, ezt a futás állítja elő (2/b. lépés). Ha már létezik egy korábbi futásból, azt **felülírod**: a szerződést mindig az aktuális kutatói jelentés adja. |

Ha **nincs `Orchestrator.md`** — önálló futásnál ez a gyakori eset, és a mappát egy korábbi
futás `UiSelectors.md`-je is létrehozhatta —, az **alapértelmezett lánc-alak** fut: a mappa léte
önmagában nem felbontási terv. Ezt **nem csendben** teszed: a `Running.md` „Kiinduló állapot"
blokkjának *Felbontás* mezőjébe beírod („alapértelmezett lánc — nincs `Orchestrator.md`"),
`Running.md` híján a jelentés fejlécének *Felbontás* sorába. Önálló futásban `Orchestrator.md`-t
**nem** generálsz — az a `feature-full` 1/b. fázisának dolga.

**Kivétel: nincs `Orchestrator.md`, de a `tasks.md` `*Gazda:*` sorokat tartalmaz.** Ilyenkor a
`*Gazda:*` szabály nyer: az implementálói lépés **csomagonként külön** delegálás (3/b.), a
`plan.md` 5. szakaszának függőségi sorrendjében, **szekvenciálisan**, egyetlen
`{feature}-impl` munkafában — párhuzamos csomag (D) nincs, mert azt csak egy `Orchestrator.md`
írhatja elő. A *Felbontás* mezőbe ezt írod: „nincs `Orchestrator.md` — a `*Gazda:*` sorok
szerint csomagonként, szekvenciálisan ({csomagok sorrendje})".

Amit az `Orchestrator.md`-ből ki kell venned: **hány delegálás van, milyen sorrendben, melyik
subagenttel, mi fut párhuzamosan, és mindegyik pontosan milyen kontextust kap.** Ha a terv
négy delegálást ír le, négyet futtatsz, nem hármat.

**Régi alakú spec** (a `plan.md` 5. szakasza „Felbontás — a subagentek munkamegosztása", agent-
nevekkel és lépéssorrenddel, pl. `spec/admin-orders/plan.md`): a szakasz szervezési része nem
kerül át egyetlen subagenthez sem normaként — a lánc az `Orchestrator.md`-t (ennek hiányában az
alapértelmezett alakot) követi, a delegálási leírást nem idézed a promptba, és a subagent
megbízása a promptban megnevezett csomag akkor is, ha a `plan.md` mást sorol fel.

**Ez a mappa egyetlen subagenthez sem jut el.** Sem a tartalma, sem a hivatkozás rá. Két oka
van: a szervezés metaszintje az implementálónak zaj, és a `spec/` mappán kívül azért van, mert
a spec-agentek `Glob`-bal beolvassák a spec-mappa összes `.md` fájlját, és **normatívnak**
tekintik — egy futási napló ott hamis követelményként viselkedne.

Egyetlen finomítás: a `UiSelectors.md` **tartalma** eljut mindkét párhuzamos ághoz (3. lépés) —
az az egész értelme. Az **útvonala** nem: a szerződést a prompt törzsébe másolod be.

Ha nincs ilyen mappa, a lánc alakja az alapértelmezett, és nincs naplóvezetés (a
felbontás tényét ilyenkor a jelentés fejléce rögzíti) — de a `UiSelectors.md` akkor is
elkészül (2/b.), mert a párhuzamos ágnak az a feltétele.
