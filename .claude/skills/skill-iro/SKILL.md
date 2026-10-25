---
name: skill-iro
description: |
  Új skillt vagy agentet vesz fel a `.claude/` alá — fedésvizsgálattal indít, eldönti az
  alakot (konvenció-skill / munkafolyamat-skill / agent / hook / CLAUDE.md), irányítószabályként
  írja meg a leírást, és gépi validálással zárja. Akkor induljon, ha a fejlesztő skillt vagy
  agentet készítene, azt kérdezi, „ez skill legyen vagy agent", nem érti, miért nem indul be a
  skillje, vagy a leírás és a kód szétcsúszását gyanítja. NE induljon egy meglévő skill tartalmi
  bővítéséhez — az annak a skillnek a dolga. Példa: „csinálj egy skillt, ami lefuttatja a
  konformancia-eseteket".
---

# skill-iro — skill és agent felvétele ebbe a repóba

A `.claude/` mappa itt önálló rendszer: skillek, agentek és három hook — az őr
(`spec-guard.mjs`) és a két mérő (`kontextus-mero.mjs`, `futas-mero.mjs`), plusz egy közös
modul (`futas-kozos.mjs`, a `futas-mero` és a `futas-merleg` skill riportja osztozik rajta) —,
amik `skills:` mezőkkel és hook-mód-stringekkel kapcsolódnak egymáshoz. Az új darabot ebbe a szövetbe kell
beleilleszteni, nem mellé tenni.

**A kimenet mindig egy jelentés** — mi jött létre, mi került `references/`-be és miért, és mit
talált a validátor. Kód nélkül nincs jelentés: az 5. fázis zöldje a feltétele.

## Nem alku tárgya

- **Csak a `.claude/skills/` és a `.claude/agents/` alá írsz.** Terméki kódhoz, `spec/`-hez,
  `docs/`-hoz, a `.claude/hooks/`-hoz és a `.claude/settings.json`-hoz nem nyúlsz. Ha a
  döntés hook-alakot hoz ki (vagy egy agentnek új guard-mód kell), a kimenet **javaslat** a
  jelentésben — a hook kódja és bekötése a fejlesztő döntése, mert egy hibás hook csendben
  kapcsolhat ki egy őrt. A `CLAUDE.md` bejegyzése az egyetlen kivétel, és azt is a 6. fázisban,
  külön kimondva.
- **Repótényt nem találsz ki.** Ami a fájlba kerül — útvonal, parancs, metódusnév, portszám,
  mezőnév —, azt előbb `Read` vagy `Grep` igazolja. Ha nem tudod igazolni, nem írod le.
- **A tény a konvenció-skillbe megy, nem az agentbe.** Ha egy projekttény az agent-fájlba
  kívánkozik, az a konvenció-skill hiánya, nem az agent bővítendő. Két megtörtént szétcsúszás
  áll emögött — lásd `references/skill-vagy-agent.md`.
- **Fedés esetén bővítesz, nem duplikálsz.** Két, egymásnak ellentmondó leírás rosszabb, mint
  egy hiányzó. A 0. fázis ezért kötelező, akkor is, ha „nyilvánvalóan" nincs fedés.
- **Új függőség tilos** (a projekt szabálya). A scriptek zéró-dep Node ESM-ek, a
  `.claude/hooks/spec-guard.mjs` mintájára.
- **Magyar próza, ékezet nélküli ASCII azonosítók.** A mappanév, a `name` és a script-kapcsolók
  angolul/ékezet nélkül; minden szöveg magyarul.
- **A validátor találatát nem nyomod el.** Ha a szabály rossz, a szabályt élesíted; ha a találat
  jogos, javítod. Kivételt csak leírt indokkal hagysz a fájlban.

## Fázisok

### 0. Leltár és fedésvizsgálat

```
node .claude/skills/skill-iro/scripts/leltar.mjs --keres "<a kért képesség szavai>"
```

A kiemelt találatokat (alapból 3, holtversenynél több) **el kell olvasni**; a `[további találat]` címkéjűeket legalább fusd át, hátha a vágás egy nyilvánvaló jelöltet tett alájuk. A pontszám csak azt mondja meg, mit
olvass — a döntés az olvasásé.

Ha a képességet egy meglévő fedi: **állj meg, és mondd ki.** Javasold a bővítést, nevezd meg a
fájlt és a szakaszt. Új mappa csak akkor nyílik, ha ezt a lépést végigvitted.

### 1. Az alak eldöntése

`references/skill-vagy-agent.md` — öt lehetséges alak, és a repó két skill-családja
(tényforrás vs. eljárás). Itt dől el az is, kell-e agent, és ha igen, hogy a pár melyik fele
viszi a tényeket.

A döntést és az indokát **írd le egy mondatban**, mielőtt továbbmész. Ha az alak később
változik, ez a mondat mutatja meg, mi dőlt el rosszul.

### 2. A `description` megírása

`references/description-iras.md`. A fázis kimenete nem csak a leírás, hanem **5 próbamondat**:
3, amire indulnia kell, és 2, amire nem. A negatívba a legközelebbi szomszéd skill tipikus
kérése menjen. Ha egy negatív mondat is illeszkedni látszik, a leírást élesítsd.

### 3. A váz felvétele

Mappa és `SKILL.md` a családjának megfelelő alakkal:

- **Konvenció-skill:** számozott szakaszok; kötelező a „kiindulópont, nem bizonyíték" és a
  „a projekttények egyetlen otthona ez a fájl" kitétel.
- **Munkafolyamat-skill:** nem-alkuképesek → fázisok → jelentés.

Ha agent is készül: `references/agent-bekotes.md` — a frontmatter-felület, a `skills:` bekötés
és a hook-módok. **Minden hook-bekötés után futtasd az 5. fázist**, mert az elgépelt mód-string
némán kapcsolja ki az őrt.

### 4. Tartalom és tehermegosztás

Ami **minden** futáshoz kell, az a `SKILL.md`-be megy; ami csak egy fázishoz, az
`references/`-be, és a fázisánál töltődik be. A `SKILL.md` a navigáció, nem a tudástár.

**Determinisztikus munkát ne prózában írj le.** Ha egy lépés gépileg elvégezhető — leltár,
ellenőrzés, összesítés —, script legyen belőle. Az így írt lépés nem felejt el és nem hazudik.

A `references/` fájlra a `SKILL.md`-ben **hivatkozni kell**, különben sosem töltődik be (a
validátor árva fájlként jelzi).

### 5. Validálás

```
node .claude/skills/skill-iro/scripts/ellenoriz.mjs <nev>     # egy bejegyzés
node .claude/skills/skill-iro/scripts/ellenoriz.mjs --mind    # a teljes készlet
```

Kilenc ellenőrzés: frontmatter · holt hivatkozás és árva fájl · `skills:`-bekötés · hook-bekötés
és mód-string (az agent-frontmatterben, `--mind` mellett a `.claude/settings.json` és a
`settings.local.json` `hooks` blokkjában is — a két mérőhook ott van bekötve, és egy elgépelt
mód ott ugyanúgy némán kapcsolja ki a kaput) · ténykiszivárgás · méret · és `--mind` mellett
még három: a hook-válasz (minden hookot lefuttat minden módjában, ideiglenes projektgyökérrel a
`.scratch/tmp/` alatt, és HIBA, ha bármelyik `defer`-t ír a stdout-ra) · az engedélyminták
összevetése az előírt parancsalakokkal · a két README „N skill, M agent és K hook” készletszáma
a tényleges készlettel (HIBA, ha eltér — új skill vagy agent után tehát a README-számot is
frissíteni kell). `HIBA` esetén nem nulla a kilépési kód — **addig nem mész tovább**.

A `FIGYELEM` mérlegelést kér: vagy javítod, vagy leírod a fájlban, miért nem. Az 5. és a 6.
ellenőrzésnél a leírás gépileg olvasható, **egysoros** jelölő a törzsben, kötelező indokkal:

```
<!-- ellenoriz: teny-kivetel `server-java/src/test/`, `docs/test-plans/` — miért tudatos -->
<!-- ellenoriz: meret-kivetel max=360 — miért nem bontható -->
<!-- ellenoriz: hordozhato — miért fut idegen projekten (skillre: bekapcsolja az 5.-et) -->
```

A `teny-kivetel` csak a felsorolt tokenen **belüli** találatot menti fel, és szól, ha egy token
már semmit nem ment fel; a `meret-kivetel` felső korlátja kötelező, hogy a kivétel ne fedjen el
korlátlan növekedést. A felmentett találatokat a záró összesítő megszámolja.

A `--mind` a **meglévő** készletet is végigméri. Az ott talált, nem a te munkádból származó
találatokat **jelentsd, de ne javítsd** — az külön döntés, külön kör.

### 6. Jelentés

- a létrejött és módosított fájlok,
- mi került `references/`-be, és **miért nem** a `SKILL.md`-be,
- az 5 próbamondat, és hogy a leírás melyikre hogyan viselkedik,
- a validátor kimenete szó szerint, a `FIGYELEM`-ekkel együtt,
- amit szándékosan kihagytál, indokkal.

Ha az új darab önállóan hívható munkafolyamat-skill vagy tartósan használt agent, **kérdezd meg
a fejlesztőt**, felvegyük-e a `CLAUDE.md`-be egy rövid alfejezettel. Magadtól ne írd bele.

## Fájlok

Fázisonként olvasd be, ne előre:

- `references/skill-vagy-agent.md` — az 1. fázis döntési táblája, és a két megtörtént szétcsúszás
- `references/description-iras.md` — a 2. fázis: az irányítószabály anatómiája, az 5 próbamondat
- `references/agent-bekotes.md` — a 3. fázis: frontmatter-mezők, `skills:`, hook-módok
- `scripts/leltar.mjs` — a 0. fázis leltára és fedéskeresője
- `scripts/ellenoriz.mjs` — az 5. fázis validátora
- `scripts/kozos.mjs` — a két script közös segédei (frontmatter-parser, repógyökér)
