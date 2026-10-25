# A futásmérleg kapuja

> A `feature-implement` skill lépésének teljes mechanikája. A SKILL.md azonos számú lépése
> csak az összefoglalót tartja; **ez a fájl a norma**, a lépés végrehajtása előtt kötelező
> elolvasni. A belső hivatkozások („3/a.”, „4/6.”, „5/2.”) a SKILL.md lépésszámaira mutatnak.

A `futas-mero.mjs` hook a delegálás előtt megállíthatja a láncot, ha a futás elérte a
költségkeretet, megállt a konvergencia (két egymást követő kör nem csökkentette a `[nem teljesül]`
számot), vagy **oszcilláció** van (egy már teljesült kritérium újra bukik). A tiltás szövege
megnevezi a szabályt és a számokat.

Ha ez bekövetkezik, **az a lánc vége, nem egy akadály**:

1. Állj meg, és jelentsd a fejlesztőnek a tiltás számait, a konvergenciagörbét és azt, mi maradt.
2. **Ne kerüld meg.** Ne indítsd újra ugyanazt a delegálást, ne darabold kisebbekre a korlát alá
   kerülésért, és ne állítsd `FUTAS_KERET=0`-ra. A küszöb és a kikapcsoló a **fejlesztő** döntése.
   A futásjelző törlése vagy átírása **folytatás céljából** szintén megkerülés: jelző nélkül
   a hook a session-azonosítóra könyvel, és a keret nulláról indulna. Ugyanez a `futas` vagy a
   `kezdet` mező átírása. A `frissitve` lépésenkénti frissítése (0/c. 0. pont) **nem** az — az
   ugyanazt a futást tartja életben —, de `deny` után már nincs frissítés. A jelzőt azért törlöd
   (4. pont), mert a lánc **véget ért**, nem azért, hogy továbbmenj.
3. A részletes mérleghez — alapból `--atirat` **nélkül**:
   `node .claude/skills/futas-merleg/scripts/futas-merleg.mjs --futas <futásnév>`
   A `<futásnév>` a `Running.md`-be írt futás-azonosító: `{feature}-<ÉÉÉÉHHNN-ÓÓPP>` (0/c.
   0. pont), vagy a `FUTAS_AZONOSITO` értéke, ha az be volt állítva. Az `--atirat` a session
   átiratát olvasná, és az a munkaterületen **kívül** él (a Claude Code projektmappájában) —
   a fejlesztő globális szabálya szerint oda natív eszközzel csak az ő kifejezett
   engedélyével lehet nyúlni. Ezért az utolsó, még nem egyeztetett delegálás a riportból
   **hiányozhat** (a hook egy delegálást csak a következő előtt egyeztet) — ezt a jelentésben
   **jelezd**. Az `--atirat <a session átirata>` csak a fejlesztő **kifejezett jóváhagyásával**
   (`AskUserQuestion`) használható.
4. Zárd le a láncot: ha a lánc indította, állítsd le a stacket, és **töröld a futásjelzőt**
   (0/c. 0. pont). Ha a `feature-full` hívott be, ez az ő 7/a. korai megállása — ugyanez a két
   lépés.

A kapu a körkorlátot **nem** kényszeríti ki (az alapból kikapcsolva van) — azt továbbra is a fenti
két-kör szabály tartja. A kapu azt fogja el, amit a körszámláló nem: a sok kicsi delegálást, ami
sosem ér el a 2. körig.
