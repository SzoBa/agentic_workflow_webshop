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
//      egy már teljesült kritérium újra elbukott: `deny` — de csak LÁNC-futásban
//      (env vagy friss jelző); a session-tartalék futásnál `systemMessage`.
//
// MIÉRT ÍGY. A `PreToolUse` a delegálás előtt fut, tehát a MOSTANI delegálás
// fogyasztását még nem ismeri — de az összes korábbiét igen. Ezért mér
// visszamenőleg. Ennek a felállásnak az a nyeresége, hogy NEM támaszkodik
// egyetlen ellenőrizetlen hook-eseményre sem (se `PostToolUse`, se `Stop`):
// ugyanezt az egyeztető modult hívja a skill riport-szkriptje is, így a lánc
// utolsó delegálása is bekerül a naplóba, hook nélkül.
//
// AMIT SOSEM AD: `allow`-t. Háromféle kimenete van: `deny` (a kapu tilt); egy
// `systemMessage` `permissionDecision` NÉLKÜL (mérési hiány vagy elromlott mérő —
// látszik, de a hívás sorsáról nem dönt); vagy semmi (kimenet nélküli exit 0, a belső
// „nem ítélek"). A `defer` szót sosem írja ki (lásd lent, `decide`). Így nem kerüli
// meg egy delegálás engedélykérését, és nem ütközik a `kontextus-mero.mjs`
// átírás-`allow`-jával sem, amely ugyanerre a matcherre van bekötve.
//
// FAIL-OPEN. Hiányzó vagy értelmezhetetlen átirat, olvasási hiba, első delegálás,
// kevés adat → nincs ítélet. Egy mérési hiba sosem állíthat meg munkát; a tiltáshoz
// bizonyíték kell. A hook mindig 0-val lép ki.
//
// A SendMessage is ide fut (2026-10-25): egy folytatott agent új köre ugyanúgy
// fogyaszt, és enélkül a javító kör folytatása kikerülné a kaput.
//
// Használat (`.claude/settings.json`):
//   "PreToolUse": [{ "matcher": "Agent|Task|SendMessage", "hooks": [{ "type": "command",
//     "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/futas-mero.mjs", "kapu"] }]}]
//
// Kikapcsolás egy futásra: `FUTAS_KERET=0`. Ez NEMCSAK a kaput kapcsolja ki,
// hanem az EGYEZTETÉST is: a hook ilyenkor semmit nem ír a `futasok.jsonl`-be. Az
// így futott delegálások csak utólag kerülnek a naplóba, ha a riport-szkriptet
// kifejezetten az átirattal hívják (`futas-merleg.mjs --atirat <session>.jsonl`) —
// a `--atirat` nélküli riport csak a már meglévő naplót olvassa.
// A FUTÁS HATÁRA A LÁNC, NEM A SESSION (döntés, 2026-11-06). Az azonosító elsőbbsége:
// `FUTAS_AZONOSITO=<név>` env > friss jelzőfájl (`.scratch/futas-merleg/aktiv-futas.json`,
// `{"futas","kezdet","frissitve"?}`, legfeljebb 6 órás és nem jövőbeli; a kor az érvényes
// `frissitve`-ből, annak híján a `kezdet`-ből) > session. Hibás, lejárt vagy jövőbeli
// jelző → session (fail-open); egy MÁSIK sessionre szóló (`session` mezős) jelző szintén.
// A LEJÁRT, de ép jelzőről `systemMessage` megy ki (3. audit 8. sor), hogy a lánc
// keretének nulláról indulása ne maradjon néma. A jelzőt a lánc írja, frissíti és törli,
// a hook csak olvassa.
// CSAK LÁNC TILT (döntés, 2026-11-07): a session-tartalék futásnál (env és friss jelző
// nélkül) a három szabály ugyanúgy számol, de a kimenet `systemMessage`, nem `deny` —
// egy hosszú, lánc nélküli munkasession nem lánc-költség.
// MÉG FUTÓ HÁTTÉRAGENT (3. audit 25. sor): az eddigi köreit a részleges átiratból az
// ítélet a keretbe beleszámolja (`egyeztet().futok`), a naplóba viszont csak a lezárása
// után kerül. TILTÁS NYOMA (27. sor): `deny` után egy `allapot: "tiltva"` sor a naplóba.
// Delegáláskor a hook — az egyeztetés UTÁN, hogy egy új kötés ne írja felül a még
// könyveletlen korábbi folytatás futását — a `tool_use_id` → futás (SendMessage-nél a
// session + címzett + kötéskori körszám → futás) kötést a
// `.scratch/futas-merleg/delegalasok.jsonl`-be jegyzi, és az egyeztetés ebből adja a
// sornak a delegálás IDEJÉN érvényes azonosítót.
//
// Ismeretlen mód (elgépelt `args`): a hook semmit nem mér és nem ítél, és egy
// `systemMessage`-et ad ki (permissionDecision NÉLKÜL), hogy a kikapcsolt kapu ne
// maradjon néma.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  egyeztet,
  futasFeloldasForrassal,
  itelet,
  korSzam,
  kotestJegyez,
  olvasJsonl,
  readJson,
  tiltasJegyez,
  FUTASOK,
  JELZO_ERVENYES_MS,
  KERETEK,
} from "./futas-kozos.mjs";

const MODE = process.argv[2] ?? "";

/** Egységes hook-válasz. Hiba esetén is `defer`: egy hibás mérő ne bénítsa le a láncot. */
function decide(permissionDecision, reason) {
  if (permissionDecision === "defer") {
    // A belső `defer` („nem ítélek") kimenet nélkül zár, mert a 2.1.310 óta a
    // kiadott `defer` a hívást elhalasztja, nem átengedi (lásd spec-guard.mjs fejléc).
    // Ami a fejlesztőnek szól, az NEM ide megy (a stderr exit 0 mellett néma), hanem
    // `jelez()`-zel `systemMessage`-ként.
    process.exit(0);
  }
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

/**
 * Látható jelzés ítélet NÉLKÜL (M2-5): `systemMessage`, `permissionDecision` nélkül.
 * A mérési hiány és az elromlott mérő a fejlesztőnek szól — a stderr exit 0 mellett
 * néma, ott korábban senki nem látta. A hívás sorsáról ez nem mond semmit.
 */
function jelez(uzenet) {
  process.stdout.write(JSON.stringify({ systemMessage: uzenet }));
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

/**
 * A figyelmeztetés szövege lánc nélküli (session-tartalék) futásra: ugyanaz a mért
 * szám, de nincs tiltás — és kimondja, hogy egy LÁNCBAN ez tiltás lett volna.
 */
function figyelmeztetoSzoveg(ok, agent) {
  return [
    `Futásmérleg — figyelmeztetés (nincs futó lánc, a session futásáról mérve). Szabály: "${ok.szabaly}".`,
    ok.uzenet,
    `A delegálás (${agent ?? "ismeretlen agent"}) NEM tiltott, mert nincs lánc-jelző és FUTAS_AZONOSITO;`,
    "egy feature-láncban ugyanez tiltás volna.",
    "Mérleg: `node .claude/skills/futas-merleg/scripts/futas-merleg.mjs`",
  ].join("\n");
}

/**
 * A SendMessage címzettjének agent-típusa és agentId-ja a session
 * `subagents/agent-<id>.meta.json`-jából. A `to` lehet agentId vagy név; ha egyik meta
 * sem illik rá, a címzett nem ennek a sessionnek a subagentje (másik session, a fő
 * szál) — arról nincs ítélet. Az agentId a kötéskori körszámhoz kell (`kotestJegyez`).
 *
 * MÉRÉSI RÉS: a kapu itt a folytatásról IS ítél, de egy ELŐTÉRBEN futott agent
 * folytatásának fogyasztását az egyeztetés nem könyveli (a fő átiratbeli alakja nem
 * mért — lásd `futas-kozos.mjs`, az előtér-ág kommentje). A kapu tehát egy ilyen
 * folytatás-sorozat költségét alábecsüli; csak háttér-agentnél teljes a kép.
 *
 * AZONOS NÉV (3. audit 26. sor): egy sessionben két agent is viselheti ugyanazt a nevet.
 * Korábban a könyvtárlistázás ELSŐ találata nyert — a fájlrendszer sorrendje, nem a
 * címzett. Most a legutóbb írt (`agent-<id>.jsonl`, annak híján a meta mtime-ja)
 * név-egyezés nyer: a még futó, vagy épp most folytatott agent az, amelyik utoljára írt.
 * Hogy a harness névnél pontosan melyiket választja, NEM mért; a kötés ettől függetlenül
 * a feloldott `agent_id`-t hordozza, és az egyeztetés csak azt veszi figyelembe.
 */
function cimzett(transcriptPath, to) {
  if (typeof transcriptPath !== "string" || !transcriptPath.endsWith(".jsonl") || !to) return null;
  const dir = join(transcriptPath.slice(0, -".jsonl".length), "subagents");
  const id = String(to).replace(/\s*\[[^\]]*\]$/, "").trim();
  const kozvetlen = readJson(join(dir, `agent-${id}.meta.json`), null);
  if (kozvetlen?.agentType) return { agentType: kozvetlen.agentType, agentId: id, dir };
  const mtime = (f) => {
    try {
      return statSync(f).mtimeMs;
    } catch {
      return -Infinity;
    }
  };
  let legjobb = null;
  try {
    for (const fn of readdirSync(dir)) {
      if (!fn.endsWith(".meta.json")) continue;
      const meta = readJson(join(dir, fn), null);
      if (meta?.name !== id || !meta.agentType) continue;
      const agentId = fn.replace(/^agent-|\.meta\.json$/g, "");
      const ido = Math.max(mtime(join(dir, `agent-${agentId}.jsonl`)), mtime(join(dir, fn)));
      if (!legjobb || ido > legjobb.ido) legjobb = { agentType: meta.agentType, agentId, dir, ido };
    }
  } catch {
    /* nincs subagents mappa: nincs kiről ítélni */
  }
  if (!legjobb) return null;
  const { ido: _ido, ...cel } = legjobb;
  return cel;
}

/**
 * A lejárt lánc-jelző figyelmeztetése (3. audit 8. sor), vagy `null`. Egy létező, ép,
 * de 6 óránál régebbi jelző mellett a kapu a SESSION futásáról ítél — a lánc kerete
 * ilyenkor némán nulláról indulna. Ezt ki kell mondani.
 */
function lejartJelzoSzoveg(jelzo) {
  if (jelzo?.ok !== "lejart") return null;
  const ora = Math.round((jelzo.kor_ms ?? 0) / 360000) / 10;
  return (
    `Futásmérleg: a lánc-jelző (\`.scratch/futas-merleg/aktiv-futas.json\`, futás: "${jelzo.lejart_futas ?? "?"}") ` +
    `LEJÁRT — ${ora} órás, a határ ${JELZO_ERVENYES_MS / 3600000} óra (a \`frissitve\`, annak híján a \`kezdet\` szerint). ` +
    "A kapu most a session futásáról ítél, nem a láncéról: a lánc kerete innen nulláról indulna. " +
    "Ha a lánc még fut, a lánc frissítse a jelző `frissitve` mezőjét; ha véget ért, törölje a jelzőt."
  );
}

function kapu(input) {
  if (process.env.FUTAS_KERET === "0") return decide("defer");
  const eszkoz = input?.tool_name;
  if (eszkoz !== "Agent" && eszkoz !== "Task" && eszkoz !== "SendMessage") return decide("defer");

  const transcriptPath = input?.transcript_path ?? null;
  // A SendMessage-dzsel FOLYTATOTT agent ugyanúgy fogyaszt, mint egy új delegálás,
  // és a javító kör tipikusan így folytatódik — ezért ugyanaz a kapu ítél róla.
  // A típusát a címzett meta-fájlja adja; ha nem subagent, nincs ítélet.
  const cel = eszkoz === "SendMessage" ? cimzett(transcriptPath, input?.tool_input?.to) : null;
  const agent = eszkoz === "SendMessage" ? cel?.agentType ?? null : input?.tool_input?.subagent_type ?? null;
  if (eszkoz === "SendMessage" && !agent) return decide("defer");
  const session = input?.session_id ?? null;
  // A futás határa a lánc, nem a session: env > friss jelzőfájl > session
  // (`futasFeloldas`, `futas-kozos.mjs`). A jelzőt a lánc írja és törli; a hook csak olvas.
  const { futas, forras, jelzo } = futasFeloldasForrassal({ session });
  // A lejárt jelzőről szóló megjegyzés minden kimenő `systemMessage` elé kerül, és ha más
  // kimenet nincs, önmagában megy ki (3. audit 8. sor). `deny` mellé nem kell: lejárt
  // jelzőnél a forrás a session, ott a kapu nem tilt.
  const lejart = lejartJelzoSzoveg(jelzo);
  const jelezL = (uzenet) => jelez(lejart ? `${lejart}\n\n${uzenet}` : uzenet);
  const nincsIteletL = () => (lejart ? jelez(lejart) : decide("defer"));

  // 1. Egyeztetés. Bármi hiba itt: mérünk, amit tudunk, és továbbengedünk.
  let hibak = [];
  let sulyos = false;
  let futok = [];
  let elszallt = null;
  try {
    ({ hibak, sulyos, futok = [] } = egyeztet({ transcriptPath, futas }));
  } catch (e) {
    elszallt = e?.message ?? String(e);
  }

  // 2. A delegálás IDEJÉN érvényes azonosító rögzítése — az egyeztetés UTÁN (M2-1):
  // előbb a korábbi folytatás köreit könyveljük a RÉGI kötés szerint, csak utána jön
  // az új kötés. Fordított sorrendben egy újabb SendMessage felülírta a még
  // könyveletlen folytatás futását. Ezt a delegálást a KÖVETKEZŐ hívás (vagy a riport)
  // egyezteti, amikor a jelző már törölve lehet. Mérési hiba esetén is lefut; néma, ha
  // nem írható — a kötés hiánya csak a régi, egyeztetéskori azonosítót adja.
  try {
    kotestJegyez(
      eszkoz === "SendMessage"
        ? {
            cel: String(input?.tool_input?.to ?? "").replace(/\s*\[[^\]]*\]$/, "").trim() || null,
            futas,
            session,
            agent_id: cel.agentId,
            // A kötéskori körszám: az ezutáni körök ehhez a kötéshez tartoznak.
            kor: korSzam(join(cel.dir, `agent-${cel.agentId}.jsonl`)),
          }
        : { tool_use_id: input?.tool_use_id ?? null, futas, session },
    );
  } catch {
    /* fail-open */
  }

  if (elszallt !== null) {
    return jelezL(`Futásmérleg: az egyeztetés hibára futott (${elszallt}) — a kapu nem ítélkezik.`);
  }

  // Ha magát a mérőt nem sikerült elindítani, a kapu NEM ítélkezik. A napló
  // ilyenkor is ott van, és a régi sorai formálisan elég okot adnának a
  // tiltásra — de olyan adatból tiltani, amit már nem tudunk frissíteni,
  // pontosan az a hiba, amit a fail-open elv kizár: egy elromlott műszer
  // munkát állítana meg. Ezt LÁTNI kell (M2-5): `systemMessage`, ítélet nélkül.
  if (sulyos) {
    return jelezL(`Futásmérleg: a mérés nem indult el (${hibak.join("; ")}) — a kapu nem ítélkezik.`);
  }

  // 2. Ítélet.
  try {
    const keretek = readJson(KERETEK, null);
    if (!keretek) return nincsIteletL();

    // A napló + a még futó háttéragentek eddigi körei (3. audit 25. sor): ezek a
    // naplóba nem kerülnek (a lezárásukkor könyveljük őket), de a keret már most látja.
    const sorok = [...olvasJsonl(FUTASOK), ...(Array.isArray(futok) ? futok : [])];
    const ok = itelet({ sorok, keretek, futas, agent });
    // CSAK LÁNC TILT (döntés, 2026-11-07, 3. audit 1. sor): a session-tartalék futás
    // (se `FUTAS_AZONOSITO`, se friss jelző) nem lánc — egy hosszú munkasession
    // delegálásai összeadódnak, és a lánchoz kalibrált keret ott munkát állítana meg,
    // amit senki nem lánc-költségnek szánt. Ott a kapu mér és FIGYELMEZTET
    // (`systemMessage`, ítélet nélkül). A láncot ez nem gyengíti: a lánc a jelzőt az
    // indulásakor írja, és onnantól a jelző futásáról ítél.
    if (ok && forras === "session") return jelezL(figyelmeztetoSzoveg(ok, agent));
    if (ok) {
      // A tiltás nyoma a naplóban (3. audit 27. sor): a `kontextus-mero` ezt a delegálást
      // már lemérte, de az soha nem fut le — a `cost-reducer` mérlege erre a sorra szűr.
      try {
        tiltasJegyez({ tool_use_id: input?.tool_use_id ?? null, futas, session, agent, szabaly: ok.szabaly });
      } catch {
        /* fail-open: a tiltás a jegyzés nélkül is áll */
      }
      return decide("deny", tiltasSzovege(ok, agent));
    }
  } catch {
    return nincsIteletL();
  }

  // Mérési hiányt jelezni kell (látható `systemMessage`-ként), de nem tiltunk miatta.
  if (hibak.length) {
    return jelezL(`Futásmérleg: ${hibak.length} delegálás nem volt mérhető (${hibak.join("; ")}).`);
  }
  return nincsIteletL();
}

// --- Belépési pont ------------------------------------------------------------

/**
 * Ismeretlen mód: ne akadályozzuk a munkát, de LÁTSZÓDJON. A stderr exit 0 mellett
 * néma, ezért egy `systemMessage` megy ki — szándékosan `permissionDecision` NÉLKÜL,
 * hogy se ne engedélyezzen, se ne halasszon. Az `ellenoriz.mjs --mind` továbbra is
 * az egyetlen gépi ellenőrzés, amely egy elgépelt módot a futás ELŐTT elfog.
 */
function ismeretlenMod() {
  process.stdout.write(
    JSON.stringify({
      systemMessage:
        `futas-mero.mjs: ismeretlen mód "${MODE}" — a futásmérleg egyeztetése és kapuja KI van kapcsolva. ` +
        "Javítsd a `.claude/settings.json` bekötését (`kapu`).",
    }),
  );
  process.exit(0);
}

try {
  const input = readInput();
  switch (MODE) {
    case "kapu":
      kapu(input);
      break;
    default:
      ismeretlenMod();
  }
} catch {
  // Utolsó háló: fail-open, kimenet nélkül (a belső `defer` megfelelője).
  process.exit(0);
}
