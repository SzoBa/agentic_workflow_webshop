# A `description` — a 2. fázis

A `description` **nem összefoglaló, hanem irányítószabály.** Ez az egyetlen mező, amit a rendszer
minden munkamenetben lát, és ez alapján dönti el, betöltse-e a skillt. Egy pontos, de általános
leírású skill soha nem indul el — a leggyakoribb hibája egy egyébként jól megírt skillnek.

## Anatómia

Négy elem, ebben a sorrendben:

1. **Mit csinál** — egy tagmondat, konkrét főnevekkel.
2. **Mikor induljon** — a fejlesztő tipikus megfogalmazásai, az ő szavaival.
3. **Mikor NE** — a szomszédos skilltől való elhatárolás, névvel.
4. **Példa** — egy szó szerinti kérés, ahogy elhangzana.

A 3. pontot hagyják el a leggyakrabban, és ez okozza a legtöbb bajt: két skill, aminek átfed a
leírása, felváltva indul, kiszámíthatatlanul.

## Példák a repóból

**Jó — `feature-implement`:** kimondja a *mikor ne*-t és a szomszédját is:

> „Aktiválódjon, ha a fejlesztő egy **MÁR MEGLÉVŐ** spec-mappát akar megvalósítani (a
> `feature-spec-writer` skill a specet írja meg, ez a skill a spec meglététől indul). Példa:
> »implementáld a spec/product-rating specet«."

**Jó — az agentek `MUST BE USED …` nyitánya** a delegálás küszöbét viszi le: nem csak leír, hanem
**előír**. A `spec-researcher`-nél ehhez még három olyan mondat is társul, ahogy a fejlesztő tényleg
kérdez („hogyan van ez a projektben megoldva").

**Rossz minta — csak leírás:**

> „Segít a tesztek megírásában."

Nincs benne se trigger, se elhatárolás, se konkrétum. Nem fog elindulni.

**Rossz minta — projekttény a leírásban:** az `e2e-test-writer` leírásából ezért került ki az
`e2e/` útvonal (ma: „a projekt e2e vázára"). A leírás a **szerepet** hordozza; a mappanév a
konvenció-skillbe való, mert az változhat.

## Az 5 próbamondat — ez a fázis kimenete

Írj le **3 mondatot, amire indulnia kell**, és **2-t, amire nem**. A kettes csoport nehezebb és
fontosabb: a legközelebbi szomszéd skill tipikus kérése menjen bele.

Ha egy negatív mondat is illeszkedni látszik a leírásra, a **leírást** kell élesíteni — nem a
mondatot lecserélni.

Példa a `skill-iro`-hoz:

| | Mondat | Vár |
|---|---|---|
| + | „csinálj egy skillt, ami lefuttatja a konformancia-eseteket" | indul |
| + | „ez most skill legyen vagy agent?" | indul |
| + | „miért nem indul be a skillem, amikor kérem?" | indul |
| − | „bővítsd a spec-konvenciok 3. szakaszát a lint-paranccsal" | **nem** indul (az a skill dolga) |
| − | „írj unit tesztet a ClientIpResolver-hez" | **nem** indul (`test-writer-java-unit`) |

## Forma

- **Blokk-skalár** (`description: |`), ha többsoros — ez a repó bevett alakja mind a négy
  magyar leírásnál.
- **Magyarul**, a projekt prózanyelvén. Kivétel a `test-writer-java-unit`, ami külső projekteken is
  fut, ezért angol — ha az új skill is ilyen, ez indok, de írd le a SKILL.md-ben, hogy miért.
- **1024 karakter a felső korlát** (az `ellenoriz.mjs` méri). A gyakorlatban 3–8 sor a jó.
