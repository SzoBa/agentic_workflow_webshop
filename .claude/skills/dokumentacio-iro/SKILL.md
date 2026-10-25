---
name: dokumentacio-iro
description: |
  A munkafa gyökerében lévő README-t és OpenAPI-leírót hozza szinkronba a kóddal: a
  controllerekből végpontleltárt vesz, a hiányzó leírót az EGÉSZ projektre létrehozza, a
  meglévőt a feature változásaival bővíti, és gépi kapuval zár (kód ↔ leíró ↔ README).
  A `feature-full` láncban a `docs-api-writer` agenten át, a unit-teszt körrel
  párhuzamosan fut. Aktiválódjon, ha a fejlesztő a README vagy az API-dokumentáció
  frissítését kéri, OpenAPI/Swagger leírót akar a projekthez, vagy azt kérdezi, naprakész-e
  a dokumentáció. NE induljon kódkommentek, docstringek vagy almappa-README-k írására (az a
  `docs-writer` agent), és ne a `spec/` szövegének írására (az a `feature-spec-writer`).
  Példa: „frissítsd a readme-t és az openapi leírót a kupon-beváltás után".
---

# dokumentacio-iro — a gyökér README és az OpenAPI-leíró a kódhoz igazítva

Két fájlért felelsz, mindkettő a **munkafa gyökerében**: a `README.md`-ért és az
OpenAPI-leíróért. A bemenet vagy egy feature (mi változott), vagy egy puszta kérés
(„naprakész-e a dokumentáció"). A kimenet **mért** állítás: a leltár-kapu zöldje.

**A kód az igazság.** A dokumentáció leírja a rendszert, nem előírja. Ha a kettő eltér, a
dokumentum a hibás — kivéve, ha az eltérés a `spec/`-hez képest áll fenn, mert az meg
**norma**, és akkor a kód a gyanús. A kettőt nem szabad összekeverni: az egyikből szerkesztés
következik, a másikból jelentés.

## Nem alku tárgya

- **Csak a gyökér `README.md`-t és a gyökér OpenAPI-leírót írod.** A leírt rendszer forrásához
  (`client/`, `server-java/`) nem nyúlsz, és az almappák README-ihez sem — azok más olvasónak
  szólnak, más ütemben változnak. Az agent-alakban ezt `PreToolUse` hook is kikényszeríti.
- **A `spec/` érinthetetlen.** Ha a leltár olyan végpontot talál, ami a kódban van, de a
  specben nincs (vagy fordítva), az **jelentés**, nem szerkesztés. A spec javítása emberi
  döntés, és a `feature-spec-writer` külön szabálya tiltja az utólagos átírást.
- **Meg nem figyelt viselkedést nem írsz le.** Minden státuszkód, mezőnév és hibaszöveg, ami a
  leíróba kerül, előbb `Read`/`Grep` által igazolt. A „valószínűleg 400-at ad" tiltott: vagy
  megnézed, vagy kihagyod és jelented.
- **Hibaszöveget szó szerint másolsz.** A magyar hibaüzenetek a hibakatalógusból és a
  `common/Messages`-ből jönnek — nem fordítod, nem fogalmazod át, nem rövidíted.
- **Nem törölsz.** A README meglévő szakaszait bővíted; ami elavult, azt **javítod**, de a
  szerkezetét nem szervezed át, és fejezetet nem vágsz ki azért, mert a feature-höz nem kell.
- **Új függőség tilos** — sem npm, sem Maven. Nincs `springdoc`, nincs YAML-parser: a leírót
  kézzel írod, a leltár zéró-dep. Ha úgy látod, generátor kellene, az **javaslat a
  jelentésben**, nem telepítés.
- **Nem kommitolsz és nem pusholsz.** A commit a hívóé (a láncban az orchestrátoré).

## Fázisok

### 0. A hatókör tisztázása

Döntsd el, **melyik a két eset**, mert a 2. és a 3. fázis mérce más lesz:

| Eset | Mikor | Mit jelent |
|---|---|---|
| **Teljes igazítás** | nincs még leíró, vagy a leltár a feature-en kívül is hiányt mutat | a leíró az **egész** projektet fedi, nem csak a feature-t |
| **Bővítés** | van leíró, és csak a feature végpontjai hiányoznak | a feature változásait vezeted át |

A **hiányzó leíró mindig teljes igazítás** — a felhasználó ezt kérte, és egy csak-a-feature-re
készült leíró rosszabb a semminél: azt sugallja, hogy a projektnek öt végpontja van.

Ha kaptál feature-spec mappát, olvasd el a végpont- és hibaleírásait. **Kiindulópont, nem
bizonyíték:** amit leírsz, azt a kódból igazold.

### 1. Leltár

```
node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs
```

A kódból, a leíróból és a README-ből ugyanazt a végponthalmazt olvassa ki, és összeveti.
**Ne vezesd le kézzel** — pont az a hibaosztály nem olvasható ki szemmel, ami itt számít: a
HIÁNYZÓ sor. Egy végigolvasott dokumentáció mindig naprakésznek látszik, mert csak azt látod
benne, ami benne van.

A `--csak-kod` a puszta leltárt adja (akkor is működik, ha még nincs leíró); a `--json` a
gépi alakot. A kilépési kód `1`, amíg van eltérés — ez a 4. fázis kapuja, itt még **várt**.

A kimenet négyféle eltérést sorol fel. Nem egyformák:

| Eltérés | Mit jelent | Mit csinálsz |
|---|---|---|
| hiányzik a leíróból / README-ből | a dokumentum lemaradt | pótolod (2–3. fázis) |
| a dokumentumban van, a kódban nincs | **fölösleg** — az olvasó meghívja azt, ami nincs | törlöd a dokumentumból, és jelented |
| a kódban van, a `spec/`-ben nincs | vagy specen kívüli fejlesztés, vagy elavult spec | **csak jelented** |
| a leltár kevesebbet olvas ki, mint amennyit szemre látsz | a szűk YAML-olvasó korlátja | jelented, és a leírót hozod egyszerűbb alakra |

### 2. Az OpenAPI-leíró

`references/openapi-vaz.md` — **ekkor töltsd be**: a leíró váza, a kötelező blokkok, a
hitelesítési séma, a közös hibaválasz, és a hat hely, ahonnan az adat származik.

A lényeg előre: a leíró **statikus fájl**, kézzel írva, a gyökérben. Nincs generátor és nincs
annotáció — ez tudatos, a függőség-szabály miatt. Cserébe a fájl **kizárólag** attól marad
igaz, hogy a 4. fázis kapuja méri.

### 3. A README

`references/readme-illesztes.md` — **ekkor töltsd be**: melyik meglévő szakasz mit fogad be,
mit tilos beleírni, és mi a teendő az elavult résszel, amit menet közben találsz.

Ha a feature nem érint végpontot (kliensoldali változás), a README akkor is módosulhat — a
viselkedés leírása, a parancsok, a mappastruktúra ott is avul. A 2. fázis viszont ilyenkor
kimarad, és ezt **ki kell mondani** a jelentésben.

### 4. A kapu

Futtasd újra a leltárt. **A fázis akkor kész, ha a kilépési kód `0`.** Nem akkor, ha
„lényegében kész", és nem akkor, ha a maradék eltérés magyarázható.

Egy eltérés csak akkor maradhat, ha a **kódban** van a hiba (a végpont nem szándékos, vagy a
specnek mond ellent). Ilyenkor a leltár piros marad, és a jelentés **ezt mondja ki** — a
dokumentumot nem igazítod egy hibás kódhoz azért, hogy a kapu zöld legyen.

Ha a leíró YAML: ellenőrizd, hogy a leltár annyi műveletet olvasott ki, amennyit írtál. A
szűk olvasó alulmérhet, és egy alulmért kapu **zölden hazudik**.

### 5. Jelentés

```markdown
# Dokumentáció: {feature | teljes igazítás}

## Módosított fájlok
- `README.md` — mely szakaszok, mivel
- `openapi.yaml` — létrehozva | {N} művelettel bővült

## Leltár-kapu
A `dok-leltar.mjs` **tényleges** záró kimenete és a kilépési kódja.
{N} végpont a kódban · {N} a leíróban · {N} a README-ben.

## Amit a kódból nem lehetett kiolvasni
Mezők, státuszkódok, hibaágak, amiket nem írtam le, mert nem voltak igazolhatók.

## Eltérés a spec/-től
A kód és a `spec/` végpontlistájának különbsége — jelentés, nem javítás.

## Amit elavultnak találtam
A README meglévő, a feature-től független elavult állításai — javítva | jelentve.

## Javaslatok — nem hajtottam végre
```

A „naprakész a dokumentáció" állítás **csak a zöld kapuval** érvényes. Ha piros maradt, a
jelentés első sora ezt mondja, nem az utolsó bekezdése.

## Fájlok

Fázisonként olvasd be, ne előre:

- `references/openapi-vaz.md` — a 2. fázis: a leíró váza, forrásai, és amit tilos beleírni
- `references/readme-illesztes.md` — a 3. fázis: melyik szakasz mit fogad be
- `scripts/dok-leltar.mjs` — az 1. és a 4. fázis leltára és kapuja
