# Az agent frontmatter-felülete és a hook-bekötés — a 3. fázis

Ez a fájl **azt írja le, amit a repó agentjei ténylegesen használnak**. Ha egy mezőre szükséged
van, ami itt nincs, előbb nézd meg egy meglévő agentben — és ha ott sincs, a hivatalos
dokumentációt kérdezd, ne találj ki mezőnevet.

## A mezők

| Mező | Mit szabályoz | Példa a repóból |
|---|---|---|
| `name` | az azonosító; **egyeznie kell a fájlnévvel** | `spec-validator` |
| `description` | az irányítószabály — lásd `references/description-iras.md` | `MUST BE USED …` |
| `tools` | a **teljes** eszközkészlet, vesszős lista | `Read, Grep, Glob` |
| `model` | `inherit` \| `sonnet` \| `opus` \| `haiku` | a validátor `opus` |
| `effort` | gondolkodási szint (a modellhez) | a validátoron `high` |
| `maxTurns` | felső korlát a körökre | 60–120 |
| `permissionMode` | pl. `acceptEdits` — az író agenteken | az implementálón és az e2e-írón |
| `color` | megkülönböztetés a felületen | `cyan`, `orange`, `purple`, `green` |
| `skills` | a betöltendő konvenció-skillek listája | `- spec-konvenciok` |
| `hooks` | `PreToolUse` őrök, `matcher` + parancs | lásd lentebb |

**Az eszközkészlet a szerep leképezése, nem kényelmi kérdés.** A csak olvasó szerepek
(`spec-researcher`, `spec-validator`) nem kapnak `Write`/`Edit`-et — így a „nem módosítok" nem
ígéret, hanem tény. Ha egy szerepnek `Bash`-t adsz, a prózában kimondott tilalmak (ne kommitolj,
ne telepíts) **már nem tartanak**: a Bash átirányítással bármit felülír. Onnantól hook kell.

## A `skills:` bekötés

```yaml
skills:
  - spec-konvenciok
```

Ez tölti be a konvenció-skillt az agent indulásakor. Két dolgot tarts be:

- **A név a skill mappaneve.** Elgépelve a betöltés **némán elmarad** — az agent fut, csak a
  konvenciók nélkül. Az `ellenoriz.mjs` 3. ellenőrzése ezt fogja meg.
- **Amit a skill tartalmaz, azt az agent NE ismételje meg.** Az agent szakasznévre hivatkozik
  („lásd a konvenciók 3. szakaszát"), nem másolja át a tartalmat.

## A hook-bekötés és a néma kikapcsolás

```yaml
hooks:
  PreToolUse:
    - matcher: "Edit|Write|NotebookEdit"
      hooks:
        - type: command
          command: node
          args: ["${CLAUDE_PROJECT_DIR}/.claude/hooks/spec-guard.mjs", "impl-write"]
```

A `spec-guard.mjs` négy módot ismer (a fájl végi `switch (MODE)`-ból, a fejléce is felsorolja):

| Mód | Kit véd, mitől |
|---|---|
| `impl-write` | az implementáló írásai: a spec-mappa és a Flyway-migrációk tiltva |
| `impl-bash` | az implementáló parancsai: git-mutáció és függőségtelepítés tiltva |
| `readonly-bash` | a validátor parancsai: **engedélylista**, ami nincs rajta, az `ask` |
| `e2e-write` | az e2e-teszt-író írásai: csak a saját mappája írható |

**A csapda:** ismeretlen módra a hook `defer`-t ad, azaz átengedi a hívást. Egy elgépelt
mód-string tehát **nem hibázik, hanem kikapcsolja az őrt** — a futás zöld, a védelem nulla.
Emiatt van rá gépi ellenőrzés (`ellenoriz.mjs` 4.), és emiatt kell **minden** hook-bekötés után
lefuttatni.

Két további dolog a hookról, mielőtt ráépítesz:

- **Nem sandbox.** Elvi okból hiányos: a tiltólista véges felsorolás egy végtelen halmazról. A
  véletlen szabálysértést fogja el, a szándékosat nem. A hook fejléce ezt részletesen kifejti —
  olvasd el, mielőtt biztonsági garanciaként hivatkozol rá.
- **A hook sosem ad `allow`-t**, csak `deny` / `ask` / `defer`-t, hogy a felhasználó saját
  engedélyezési beállításait ne írja felül.

Ha új mód kell, azt a hookban kell felvenni (`switch (MODE)` + a fejléc módlistája), és **utána**
hivatkozni rá az agentben — fordítva a validátor jogosan bukik.
