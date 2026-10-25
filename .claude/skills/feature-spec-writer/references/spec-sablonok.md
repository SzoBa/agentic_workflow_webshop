# A három fájl váza — a 4. fázis

Szakaszonként: mi a dolga, és mi az a minimum, ami nélkül a szakasz **hazudik**. A vázat
nem kell szolgaian követni — a szakaszok **szerepét** viszont igen, mert a lánc három
agentje ezekre a szerepekre van felkészítve (`spec-konvenciok` 5. szakasz).

Élő minta a repóban: `spec/admin-orders/` mindhárom fájlja. Olvasd el, mielőtt írsz — **egy
kivétellel: a `plan.md` 5. szakaszát („Felbontás — a subagentek munkamegosztása") ne kövesd.**
Az a régi, ma tiltott alak: agent-neveket és delegálási sorrendet ír a normába, amit minden
subagent utasításként olvas. Az 5. szakasz helyes alakja lent van („Munkacsomagok és
függőségeik"). A `spec/edit-user-data/plan.md` 6. szakasza ugyanez a régi alak.

**Méret:** a három fájl együtt jellemzően 400–700 sor. Ha rövidebb, valószínűleg maradt
eldöntetlen kérdés; ha sokkal hosszabb, valószínűleg terveztél a követelmény helyett.

---

## `requirements.md` — a viselkedés normája

```markdown
# {Feature magyar neve} — követelmények

{Egy bekezdés: mit kap a felhasználó. Plusz a viszony a fölérendelt normához:
ez a dokumentum azt KIEGÉSZÍTI, nem váltja fel.}

## 0. Hogyan olvasd

### Jelölések
- **`ÚJ`** — a viselkedést ez a feature hozza.
- **`MEGLÉVŐ`** — a hivatkozott viselkedés már a rendszer része, és VÁLTOZATLANUL kell
  maradnia. Ahol ilyen szerepel, az regressziós elvárás, nem megvalósítandó munka.

### Mi normatív
1. Ez a fájl — a viselkedés normája és a kész-kritériumok ({N}. szakasz).
2. `plan.md` — az interfész szerződése. Ami ott rögzítve van, azt nem lehet menet közben
   átdönteni.
3. `tasks.md` — a végrehajtási sorrend {és a munkacsomag-gazdák}.

Amit ez a mappa NEM ír felül: {a hibaválasz alakja, a szó szerinti hibaüzenetek, a
jogosultsági szabály, …}. Ütközés esetén a `spec/backend/` nyer.

## 1. Probléma és cél
{Mi a hiányzó lánc-közép — mit nem tud ma megcsinálni valaki, és miért. Utána egy
"Cél:" mondat. Ide jön az is, ami NEM változik.}

## 2. Viselkedés — {végpont} `ÚJ`
{Alszakaszonként: tartalom · rendezés · szűrés és lapozás · adatmodell · jogosultság ·
hibák. Mindegyik állítás, nem lehetőség.}

## 3. Viselkedés — kliens `ÚJ`
{Elérés (útvonal, őr, menü) · a képernyő tartalma · a felhasználói műveletek.}

## 4. Nem cél
{Felsorolás. Ez a hatókör másik fele — enélkül az implementáló hatóköre nyitva marad.}

## 5. Definition of Done
{Az alábbi alak, kötelezően.}

## 6. Változásnapló
{Csak ha a spec egy lezárt futás után módosul. Új specben nincs.}
```

### A DoD-lista alakja — ez a szakasz nem variálható

```markdown
A feature akkor kész, ha az alábbiak MINDEGYIKE külön-külön igazolható. Minden pont EGY
állítás, hogy pontonként ítélhető legyen. A „Bizonyíték" megnevezi, minek kell igazolnia —
ha az nincs meg, a pont NEM teljesült, akkor sem, ha a kód látszólag helyes.

### {Csoport: Végpont / Szűrés / Jogosultság / Kliens / Regresszió / Zöld build / End-to-end}

- [ ] **{XX}-01** — {mérhető állítás a VISELKEDÉSRŐL, egy mondatban}.
      *Bizonyíték:* {megnevezett teszt, tényleges parancskimenet vagy `fájl:sor`}.
```

- Az azonosító **kétjegyű sorszámmal** és a feature-re utaló 2–3 betűs előtaggal
  (`AR-01`). A számozás **folytonos**, és a csoportok nem kezdik újra.
- Minden ponthoz **`*Bizonyíték:*`** sor. Ha egy kritériumnak több ága van, a bizonyíték
  sorolja fel őket **egyenként**.
- Ahol a kritérium szövege magyarázatot kíván, jöhet **`*Miért kritérium:*`** vagy
  **`*Hatóköre:*`** sor is — az utóbbi kötelező minden tiltás mellé.
- **Zöld build** és — ha van kliensoldal — **end-to-end** csoport nélkül a lista hiányos.
- A checkboxok **üresen** maradnak.

---

## `plan.md` — az interfész szerződése

```markdown
# Megvalósítási terv — {feature}

{Mit rögzít ez a dokumentum, és hogy MINDKETTŐ kötelező: az interfész szerződését és a
munkacsomagok függőségeit. Plusz: ha a szerződés hibásnak bizonyul, azt JELENTENI kell, nem
javítani.}

## 1. HTTP-szerződés
### `{METÓDUS} /api/…`
{Jogosultság · query-paraméterek táblázata (név, alap, viselkedés) · a válasz JSON-alakja
példával · rendezés · hibaüzenetek — vagy annak kimondása, hogy nincs új.}

## 2. Típustükör
{A kliensoldali típusok pontos alakja kódblokkban. A válasz-DTO és a kliens típusa KÜLÖN
van definiálva, ezért együtt módosulnak — és a tükör annak a munkacsomagnak a tulajdona,
ahol a válasz alakja születik.}

## 3. Fájltulajdon — ki mihez nyúlhat
{Munkacsomagonként kizárólagos tulajdon. Plusz: amihez EGYIK csomag sem nyúl. Egy mappán belül
két új fájl neve ne térjen el csak kis/nagybetűben, és két JS/TS modul törzse se legyen
kis/nagybetű nélkül azonos (`kupon.ts` + `Kupon.tsx`): Windowson és macOS-en a
kiterjesztés nélküli import a rosszra oldódik fel. A `spec-ellenoriz.mjs` 9. ellenőrzése ezt HIBA-ként jelzi.
Ha **több csomag ír Flyway-migrációt**, a tábla csomagonként **külön verziószámot** oszt ki,
a `server-java/src/main/resources/db/migration` következő szabad számától (pl. B csomag:
`V4__…sql`, C csomag: `V5__…sql`). Különben két párhuzamos csomag ugyanazt a következő számot
választja: a két ág külön-külön zöld, az egyesített fán a Flyway elutasítja a duplikált
verziót, és a backend el sem indul.}

## 4. Megvalósítási döntések
{Számozott alszakaszok. Ezek DÖNTÉSEK, nem javaslatok — az implementálónak nem kell újra
végiggondolnia őket. Minden döntéshez INDOK, és ahol van, az elutasított alternatíva.}

## 5. Munkacsomagok és függőségeik
{Csomagonként egy sor, ebben az alakban: `- **{X}** — {egy mondat arról, mit szállít}`. A
betűjel PONTOSAN az, ami a `tasks.md` `*Gazda:*` soraiban áll — a `spec-ellenoriz.mjs`
10. ellenőrzése a két halmazt összeveti. A **`V` foglalt** (lásd lent): itt nem szerepel.
Utána a függőségek, egy-egy állításként, az érintkezési felület megnevezésével:
„F a B által írt `client/src/api.ts`-re épül."
Végül EGY sor: mely csomagok függetlenek egymástól (párhuzamosíthatók) — vagy hogy egyik
sem az. Egyetlen csomagnál ez a szakasz egy mondat: „Egy munkacsomag: **{X}**."}

## 6. Kockázatok
{Kockázat → kezelés táblázat. A kezelés oszlop MUTASSON egy konkrét kritériumra.}
```

**A `V` betű foglalt — a validátoré.** A `tasks.md` záró átvételi csomagja mindig
`*Gazda:* V`, és azt a lánc 6. lépésének `spec-validator`-a hajtja végre: **nem**
implementálói csomag, nem kap `spec-implementer`-t és munkafát. Ezért implementálói csomag
nem kaphatja a `V` betűt, és a `plan.md` 5. szakasza sem sorolja fel (ott csak az
implementálói csomagok állnak). A fájltulajdon-táblában szerepelhet egy „**V** — validáló:
semmi, csak olvas" sor. A `spec-ellenoriz.mjs` 10. ellenőrzése a `V`-t az 5. szakaszban HIBA-nak
veszi.

A `plan.md` legfontosabb tulajdonsága, hogy **előre** rögzül: a munkacsomagok kontextusa
elkülönített, tehát amit itt nem írsz le, azt két oldal fogja egymástól függetlenül
kitalálni. A 4. szakaszba az kerül, ami **köti** a két oldalt — nem az, ami az implementáló
szabadsága.

Az 5. szakaszba **csak munka-tény** kerül: mi a csomag, és mire épül. **Nem** kerül bele,
hogy melyik agent kapja, milyen sorrendben delegálunk, mi fut párhuzamosan, és ki milyen
kontextust kap. Ennek két oka van. A `plan.md`-t **minden** subagent normaként olvassa, tehát
egy ide írt delegálási leírás minden agentnek utasításként szól — annak is, akire nem
vonatkozik. És a szervezés nem a spec-írás döntése: a lánc alakját a `feature-full` 1. fázisa
generálja ebből a szakaszból a `docs/orchestration/{feature}/Orchestrator.md`-be
(`.claude/skills/feature-full/references/orchestrator-sablon.md`), amit egyik subagent sem lát.

---

## `tasks.md` — a végrehajtási sorrend

```markdown
# Feladatlista — {feature}

Munkaegységek végrehajtási sorrendben. Minden egység ÖNÁLLÓAN verifikálható: a *Kész, ha*
sor egy konkrét kész-kritériumra vagy egy megnevezett tesztre hivatkozik.

{Ha munkacsomagokra bomlik: a `*Gazda:*` sor mondja meg, melyik csomag hajtja végre. A
csomagok fájltulajdona a `plan.md` 3. szakaszában van — ami nem a tiéd, ahhoz nem nyúlsz.}

A checkboxokat SENKI nem pipálja ki: a `spec/` mappa a norma, nem munkaterület.

# {X} csomag — {rétegnév}

## {X}-M1 · {mérföldkő}

- [ ] **{X}1.1** {mit kell megcsinálni, egy mondatban}
      *Kész, ha:* **{XX-nn}** — {a kritérium rövid visszamondása}.
      *Érintett:* `{fájl}` {(új)}.
      *Gazda:* {X}

# V csomag — átvétel

{Munkacsomagokra bontott specnél a záró blokk betűje mindig `V`. Egy csomagos specben a blokk
ugyanez, `*Gazda:*` sor nélkül.}

- [ ] **V1.1** A kész-kritériumok tételes végigmérése, pontonként `[teljesül]` /
      `[nem teljesül]` / `[kétséges]`, bizonyítékkal.
      *Kész, ha:* minden pont ítéletet kapott.
      *Gazda:* V

## Függőségi sorrend
{ASCII-ábra + a kikötések, amiket az ábra nem mutat.}
```

- Minden munkaegységnél kötelező a **`*Kész, ha:*`** sor, és lehetőleg egy **kész-kritérium
  azonosítóra** hivatkozzon. Ha egy egységhez nincs kritérium, az vagy fölösleges munka, vagy
  hiányzó kritérium — mindkettő megállásra ok.
- Az **`*Érintett:*`** sor a `plan.md` fájltulajdon-táblázatával legyen összhangban.
- **Minden kész-kritériumra hivatkozzon legalább egy munkaegység.** Amelyikre nem, azt nem
  fogja senki megcsinálni — a validátor pedig mérni fogja.
- A **„Függőségi sorrend"** a munkaegységek szintjén beszél; a csomagok közti függőségek a
  `plan.md` 5. szakaszában vannak. A kettő nem mondhat ellent egymásnak, és itt sincs
  agent-név vagy delegálási sorrend.
- A záró csomag az **átvétel**: a kritériumlista tételes végigmérése, a dinamikus ellenőrző
  parancsok futtatása, és — ha van — az end-to-end forgatókönyv végigjátszása. Munkacsomagokra
  bontott specben a betűje mindig **`V`** (foglalt, a `spec-validator`-é); a lánc a `V`
  munkaegységeit nem delegálja implementálónak.
