#!/usr/bin/env node
// PreToolUse hook a subagent-delegálásokhoz — a `futas-merleg` skill gépi fele.
//
// KÉT DOLGOT CSINÁL, EGY HÍVÁSON BELÜL:
//
//   1. EGYEZTET — a delegálás ELŐTT lezárja az összes korábbi, még nem
//      rögzített delegálást ebben a sessionben: valódi tokent, költséget,
//      időt és (validátornál) konvergenciát ír a naplóba. Ez mindig lefut.
//   2. KAPUT TART — az egyeztetett napló alapján eldönti, mehet-e a
//      delegálás. Ha a futás elérte a keretet, megállt a konvergencia, vagy
//      egy már teljesült kritérium újra elbukott: `deny`.
//
// MIÉRT ÍGY. A `PreToolUse` a delegálás előtt fut, tehát a MOSTANI delegálás
// fogyasztását még nem ismeri — de az összes korábbiét igen. Ezért mér
// visszamenőleg. Ennek a felállásnak az a nyeresége, hogy NEM támaszkodik
// egyetlen ellenőrizetlen hook-eseményre sem (se `PostToolUse`, se `Stop`):
// ugyanezt az egyeztető modult hívja a skill riport-szkriptje is, így a lánc
// utolsó delegálása is bekerül a naplóba, hook nélkül.
//
// AMIT SOSEM AD: `allow`-t. Csak `deny` vagy `defer`. Így nem kerüli meg egy
// delegálás engedélykérését, és nem ütközik a `kontextus-mero.mjs`
// átírás-`allow`-jával sem, amely ugyanerre a matcherre van bekötve.
//
// FAIL-OPEN. Hiányzó átirat, olvasási hiba, első delegálás, kevés adat →
// `defer`. Egy mérési hiba sosem állíthat meg munkát; a tiltáshoz bizonyíték
// kell. A hook mindig 0-val lép ki.
//
// Használat (`.claude/settings.json`):
//   "PreToolUse": [{ "matcher": "Agent|Task", "hooks": [{ "type": "command",
//     "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/futas-mero.mjs", "kapu"] }]}]
//
// Kikapcsolás egy futásra: `FUTAS_KERET=0`.
// A futás egysége alapból a session; felülírható: `FUTAS_AZONOSITO=<név>`.

import { readFileSync } from "node:fs";
import { egyeztet, itelet, olvasJsonl, readJson, FUTASOK, KERETEK } from "./futas-kozos.mjs";

const MODE = process.argv[2] ?? "";

/** Egységes hook-válasz. Hiba esetén is `defer`: egy hibás mérő ne bénítsa le a láncot. */
function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        ...(reason ? { permissionDecisionReason: reason } : {}),
      },
    }),
  );
  process.exit(0);
}

function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * A tiltás szövege. Három dolgot kell tartalmaznia, mert az orchestrátor
 * ebből — és csak ebből — tudja meg, mi történt:
 *   - melyik szabály lépett és milyen SZÁMOKKAL (különben nem ellenőrizhető),
 *   - hogy ez DÖNTÉSI PONT, nem megkerülendő akadály,
 *   - hol a kikapcsoló, hogy ne kelljen találgatni.
 */
function tiltasSzovege(ok, agent) {
  return [
    `FUTÁSMÉRLEG — a lánc megállt. Szabály: "${ok.szabaly}".`,
    ok.uzenet,
    `A tiltott delegálás: ${agent ?? "ismeretlen agent"}.`,
    "",
    "Ez döntési pont, nem akadály. A helyes lépés: ÁLLJ MEG, és jelentsd a fejlesztőnek a fenti",
    "számokat és azt, mi maradt hátra. Ne kerüld meg a korlátot: ne indítsd újra ugyanazt a",
    "delegálást, ne darabold fel kisebbekre, és ne kapcsold ki a mérőt magadtól.",
    "A küszöb megemelése vagy a `FUTAS_KERET=0` a FEJLESZTŐ döntése, nem a tiéd.",
    "",
    "Mérleg: `node .claude/skills/futas-merleg/scripts/futas-merleg.mjs`",
  ].join("\n");
}

function kapu(input) {
  if (process.env.FUTAS_KERET === "0") return decide("defer");
  if (input?.tool_name !== "Agent" && input?.tool_name !== "Task") return decide("defer");

  const agent = input?.tool_input?.subagent_type ?? null;
  const transcriptPath = input?.transcript_path ?? null;
  const session = input?.session_id ?? null;
  const futas = process.env.FUTAS_AZONOSITO ?? session;

  // 1. Egyeztetés. Bármi hiba itt: mérünk, amit tudunk, és továbbengedünk.
  let hibak = [];
  let sulyos = false;
  try {
    ({ hibak, sulyos } = egyeztet({ transcriptPath, futas }));
  } catch {
    return decide("defer");
  }

  // Ha magát a mérőt nem sikerült elindítani, a kapu NEM ítélkezik. A napló
  // ilyenkor is ott van, és a régi sorai formálisan elég okot adnának a
  // tiltásra — de olyan adatból tiltani, amit már nem tudunk frissíteni,
  // pontosan az a hiba, amit a fail-open elv kizár: egy elromlott műszer
  // munkát állítana meg.
  if (sulyos) {
    return decide("defer", `Futásmérleg: a mérés nem indult el (${hibak.join("; ")}) — a kapu nem ítélkezik.`);
  }

  // 2. Ítélet.
  try {
    const keretek = readJson(KERETEK, null);
    if (!keretek) return decide("defer");

    const sorok = olvasJsonl(FUTASOK);
    const ok = itelet({ sorok, keretek, futas, agent });
    if (ok) return decide("deny", tiltasSzovege(ok, agent));
  } catch {
    return decide("defer");
  }

  // Mérési hiányt jelezni kell, de nem tiltunk miatta.
  return decide(
    "defer",
    hibak.length ? `Futásmérleg: ${hibak.length} delegálás nem volt mérhető.` : undefined,
  );
}

// --- Belépési pont ------------------------------------------------------------

const input = readInput();

switch (MODE) {
  case "kapu":
    kapu(input);
    break;
  default:
    // Ismeretlen mód: ne akadályozzuk a munkát, csak jelezzük. Ugyanaz a
    // konvenció, mint a `spec-guard.mjs`-ben és a `kontextus-mero.mjs`-ben —
    // és ugyanaz a csapda is: egy elgépelt mód-string némán kikapcsolja a
    // kaput. Ezt csak az `ellenoriz.mjs` 4. ellenőrzése fogja el.
    decide("defer", `Ismeretlen futásmérő mód: "${MODE}".`);
}
