# 1/b. Modellválasztás a spec mérete alapján

> A `feature-implement` skill lépésének teljes mechanikája. A SKILL.md azonos számú lépése
> csak az összefoglalót tartja; **ez a fájl a norma**, a lépés végrehajtása előtt kötelező
> elolvasni. A belső hivatkozások („3/a.”, „4/6.”, „5/2.”) a SKILL.md lépésszámaira mutatnak.

A subagentek frontmatterében van alapértelmezett modell, de az `Agent` hívás `model`
paramétere **felülírja** azt. A spec beolvasása után döntsd el, melyik kategória, és a
delegáláskor add át a `model` paramétert. A szabály **mérhető** — ne érzésre dönts:

**Összetett a spec, ha bármelyik igaz:**
- háromnál több `.md` fájl van benne (azaz normatív melléklete is van: végpont-referencia,
  hibakatalógus, konformancia-esetek),
- **fázisokra** oszlik,
- a spec fájljai együtt **800 sornál** hosszabbak,
- **20-nál több** kész-kritérium van benne.

Egyébként egyszerű.

| Subagent | Egyszerű spec | Összetett spec |
|---|---|---|
| `spec-researcher` | `sonnet` | `opus` |
| `spec-implementer` | `inherit` (a session modellje) | `opus` |
| `e2e-test-writer` | `inherit` | `opus` |
| `spec-validator` | `opus` | `opus` |

Két szándékos aszimmetria:

- **Felfelé lépünk, lefelé nem.** Az implementáló sosem kap a session modelljénél
  gyengébbet: itt a hiba a legdrágább, mert végigfut a láncon, és csak egy teljes
  validátor-körben derül ki.
- **A validátor mindig `opus`.** Ő a lánc bizalmi horgonya; egy gyenge validátor hamis
  `[teljesül]`-t ad, amire a lánc készként épít tovább. A spórolás itt pont a legrosszabb
  helyen jönne be, és keveset is hoz — a validátor kevesebbet olvas, mint a kutató.

**Javító körben** (7. lépés) a javító ág egy fokozattal feljebb megy (`inherit` → `opus`):
amit egy modell egyszer elrontott, azt másodszor is elronthatja. A javító körök ritkák, a
költsége elhanyagolható.

Ha a `CLAUDE_CODE_SUBAGENT_MODEL` környezeti változó be van állítva, az **mindent felülír**,
és ez a triázs hatástalan — ilyenkor ne is írj róla a jelentésben.
