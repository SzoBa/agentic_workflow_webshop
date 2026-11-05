# A recept-tár alakja — a 4. fázis

A tár: **`docs/orchestration/_kontextus/`**, verziókövetve.

| Fájl | Mi | Verziókövetve |
|---|---|---|
| `receptek.json` | a jóváhagyott receptek | **igen** — a receptek döntések, mint a `Decision.md` |
| `meresek.jsonl` | delegálásonként egy sor mérés | **igen** — ez a bizonyítékalap, sorai kicsik és prompt-szöveget nem tartalmaznak |
| `.scratch/cost-reducer/visszajatszas/` | az átírt delegálások **eredeti** promptja | **nem** (gitignore) — nyers szöveg, csak hibakereséshez kell |

A szétvágás oka: a **döntés** review tárgya és a repó tudása; a **nyers prompt** nem.

Az `_kontextus` név aláhúzással kezdődik, mert a `docs/orchestration/` alatt minden más
mappa egy feature-é. És mint az egész `docs/orchestration/`: **egyetlen subagent sem kapja
meg** — a szervezés metaszintje az implementálónak zaj.

---

## `receptek.json`

```json
{
  "verzio": 1,
  "minimum_arany": 0.25,
  "vedett": ["projektszintű védett szövegek"],
  "receptek": [
    {
      "id": "impl-spec-hivatkozasra",
      "jovahagyva": "2026-08-01",
      "agent": "spec-implementer",
      "indok": "Az implementáló definíció szerint maga olvassa be a spec fájljait, tehát a beillesztett szöveg nála redundáns.",
      "amikor": { "blokkok": ["a1b2c3d4e5f6"] },
      "muveletek": [
        {
          "tipus": "csere",
          "blokk": "a1b2c3d4e5f6",
          "helyette": "A megbízás normája: `spec/admin-orders/requirements.md`. **Olvasd el a delegálás első lépéseként** — a kész-kritériumok ott vannak, nem ebben a promptban."
        }
      ],
      "vedett": ["recept-szintű extra védett szöveg"],
      "minimum_arany": 0.4
    }
  ]
}
```

### Mezők

| Mező | Kötelező | Mit jelent |
|---|---|---|
| `id` | igen | a napló és a jelentés erre hivatkozik |
| `jovahagyva` | **igen** | a jóváhagyás dátuma. **Enélkül a hook nem alkalmazza** — a visszavonás módja is ez: töröld a mezőt, a recept a fájlban marad, de hatástalan |
| `agent` | nem | `subagent_type`; hiánya vagy `"*"` = minden delegálásra |
| `indok` | igen | ez kerül a jelentésbe és a review elé. Ha csak költség, azt írd oda |
| `amikor.blokkok` | igen | blokk-hashek. **Mindnek** jelen kell lennie, különben a recept nem illeszkedik |
| `muveletek` | igen | lásd lent |
| `vedett` | nem | extra védett szövegek erre a receptre |
| `minimum_arany` | nem | felülírja a tár globális küszöbét |

### Illeszkedés

A hook akkor alkalmaz egy receptet, ha **mind** igaz:

1. a `jovahagyva` **valódi, nem jövőbeli** `ÉÉÉÉ-HH-NN` dátum (a `"igen"`, a `true`, a
   `"2026-02-31"` vagy egy holnapi dátum nem jóváhagyás; ugyanez a `jovahagyott()` dönt
   a `merleg.mjs`-ben is, ott „érvénytelen jóváhagyás" a neve),
2. az `agent` egyezik (vagy `*`),
3. az `amikor.blokkok` **minden** hashe megtalálható a promptban,
4. a recept átmegy a séma-ellenőrzésen (`receptHiba()`): van nem üres `id` és **nem üres
   `indok`**, a `muveletek` nem üres lista ismert típusokkal és 12 jegyű `blokk`-hashsel,
   a `csere`-nek van `helyette` szövege. Az 1–3. alapján illeszkedő, de sémahibás recept
   **nem** fut le: a mérés `allapot: "hiba"`-ként rögzíti az okát, és a prompt eredetiben
   megy tovább.

Az első illeszkedő recept fut le, több nem. Ha két receptet akarsz egyszerre, egyesítsd
őket egy recept több műveletévé — így egyben látszik, mit tesz.

### Műveletek

| `tipus` | Mit csinál | Kockázat |
|---|---|---|
| `csere` | a blokkot lecseréli a `helyette` szövegre | veszteségmentes, **ha** a helyettesítő tartalmazza az útvonalat **és** az olvasásra szóló felszólítást |
| `elore` | a blokkot a prompt elejére mozgatja | nincs — nem vesz el semmit |
| `elhagy` | a blokkot kiveszi | a legnagyobb; csak szerep szerinti indokkal |

Ha egy művelet `blokk`-ja nincs a promptban, azt a hook **átugorja** — a recept többi
művelete lefut. Ez szándékos: egy delegálás alakja futásról futásra kicsit változhat.

---

## A gépi visszafogás

A jóváhagyás emberi; ez a gépi háló alatta. Két feltétel, és **bármelyik** sérülése esetén
az átírás **elmarad** (a prompt eredetiben megy tovább), a mérés pedig
`allapot: "elutasitva"`-ként rögzíti, melyik recept bukott meg.

1. **Védett szövegek.** Ami az eredetiben benne volt és a védett listákon szerepel, annak az
   átírás után is bent kell lennie. A hook négy alapértelmezettet visz (`A munkagyökered`,
   `mutató a bizonyítékhoz`, `kötelező érvényű`, `szó szerint`) — mindegyik olyan mondat,
   ami egy subagent **módszerét** szabja, és a `mit-nem-szabad-elvenni.md` 3. és 5. pontja
   indokolja őket.
2. **Arány.** Az átírt prompt nem lehet rövidebb az eredeti `minimum_arany` hányadánál
   (alap: 25%). Ez a „a recept véletlenül mindent kivágott" eset ellen véd.

Egy elutasított átírás **nem** hiba a hookban — figyelmeztetés a receptről. A helyes válasz
a recept javítása vagy visszavonása, **nem** a küszöb lejjebb vétele.

---

## `meresek.jsonl`

Delegálásonként egy sor. Prompt-szöveget **nem** tartalmaz, csak méretet és hasheket.

| Mező | Mi |
|---|---|
| `ts`, `session`, `agent`, `model` | mikor, melyik munkamenetben, kinek |
| `futas` | melyik lánc — ugyanaz a feloldás, mint a futásmérlegé (env > friss jelző > session); a `merleg.mjs --futas <név>` erre szűr. A mező bevezetése előtti soroknak nincs |
| `tool_use_id` | a delegálás azonosítója — ezzel köthető a `futasok.jsonl` sorához |
| `karakter`, `token_becsles` | a prompt mérete. A token **becslés** (≈4 karakter) — a harness nem ad tokenszámot a hooknak |
| `blokkok` | `{h, n}` párok: blokk-hash és karakterszám |
| `allapot` | `mert` \| `atirva` \| `elutasitva` \| `hiba` (érvénytelen recept vagy a recept-ág hibája) |
| `recept`, `megtakaritas`, `muveletek`, `visszajatszas` | csak `atirva` esetén |
| `ok` | `elutasitva` és `hiba` esetén: mi bukott meg |

A blokk-hash a mérés egysége. Ebből derül ki, hogy ugyanaz a spec-részlet vagy kutatói
jelentés hány delegáláson ment át egy láncban — és ebből lesz a recept `amikor.blokkok`
feltétele.

**Amit ez a napló nem tud megmondani:** mennyit fizettél. Sem tokenszám, sem cache-találat,
sem pénz nincs benne, mert a hook nem kapja meg őket. A `merleg.mjs` ezért karakterben
számol, és a becslést becslésnek nevezi.
