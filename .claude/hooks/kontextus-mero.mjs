#!/usr/bin/env node
// PreToolUse hook a subagent-delegálásokhoz — a `cost-reducer` skill gépi fele.
//
// KÉT DOLGOT CSINÁL, ÉS A KETTŐ SÚLYA NAGYON KÜLÖNBÖZŐ:
//
//   1. MÉR — minden delegálásnál rögzíti, mekkora promptot adunk át, milyen
//      blokkokból áll, és melyik blokk hányadszor megy át ugyanabban a láncban.
//      Ez mindig lefut, semmit nem befolyásol.
//   2. ÁTÍR — de KIZÁRÓLAG a fejlesztő által jóváhagyott recept alapján. Recept
//      nélkül soha nem nyúl a prompthoz. Ez a szabály nem óvatosság, hanem a
//      feladat lényege: egy modell által kitalált rövidítés pont azt az érdemi
//      információt viheti el, amitől a subagent utána hallucinál.
//
// MÉRT TÉNYEK A MECHANIZMUSRÓL (2026-08-01, Claude Code 2.1.220). Mindegyiket
// szondával mértük, mert a dokumentáció ellentmond önmagának:
//
//   - A `PreToolUse` LEFUT az `Agent` eszközre, és a `tool_input` tartalmazza a
//     teljes `prompt` mezőt. (A dokumentáció azt állítja, a subagentek nem
//     jelennek meg eszközként — ez NEM igaz.)
//   - A `SubagentStart` NEM kapja meg a promptot, csak `agent_id`/`agent_type`-ot,
//     tehát átírásra alkalmatlan.
//   - Az `updatedInput` CSAK `permissionDecision: "allow"` mellett érvényesül.
//     `defer` mellett a hook lefut, kiadja az `updatedInput`-ot, és a subagent
//     mégis az EREDETI promptot kapja — némán.
//
// Ennek az utolsó pontnak ára van: átíráshoz `allow` kell, ami megkerüli a
// delegálás engedélykérését. Ezért ez a hook `allow`-t KIZÁRÓLAG akkor ad, ha
// ténylegesen alkalmazott egy receptet. Minden más úton `defer`, hogy a
// felhasználó beállításait ne írja felül.
//
// Használat (`.claude/settings.json`):
//   "PreToolUse": [{ "matcher": "Agent|Task", "hooks": [{ "type": "command",
//     "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/kontextus-mero.mjs", "delegalas"] }]}]
//
// Kikapcsolás egy futásra: `COST_REDUCER=0`.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODE = process.argv[2] ?? "";

const REPO = process.env.CLAUDE_PROJECT_DIR
  ? resolve(process.env.CLAUDE_PROJECT_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const TAR = join(REPO, "docs", "orchestration", "_kontextus");
const RECEPTEK = join(TAR, "receptek.json");
const MERESEK = join(TAR, "meresek.jsonl");
const VISSZAJATSZAS = join(REPO, ".scratch", "cost-reducer", "visszajatszas");

/** Egységes hook-válasz. Hiba esetén is `defer`: egy hibás mérő ne bénítsa le a láncot. */
function decide(permissionDecision, reason, updatedInput) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        ...(reason ? { permissionDecisionReason: reason } : {}),
        ...(updatedInput ? { updatedInput } : {}),
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

function readJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}

// --- Blokkosítás és ujjlenyomat ----------------------------------------------
//
// A prompt üres sorral elválasztott blokkokra bomlik, és minden blokk kap egy
// rövid hasht. A hash a MÉRÉS egysége: ebből derül ki, hogy ugyanaz a
// spec-részlet vagy kutatói jelentés hány delegáláson megy át egy láncban —
// és ebből lesz később a recept illeszkedési feltétele.
//
// A normalizálás (szóközök összevonása) azért kell, hogy egy újratördelés ne
// csináljon új blokkot egy változatlan tartalomból.

function blokkok(prompt) {
  return String(prompt ?? "")
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+$/g, ""))
    .filter((b) => b.trim().length > 0);
}

function hash(s) {
  return createHash("sha256").update(s.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 12);
}

// --- Receptek ------------------------------------------------------------------
//
// Egy recept akkor illeszkedik, ha az agent egyezik (vagy a recept `*`-os), ÉS
// a `amikor.blokkok` MINDEGYIKE megtalálható a promptban. A jóváhagyás dátuma
// kötelező: dátum nélküli recept nem alkalmazható, akkor sem, ha a fájlban van.

function illeszkedik(recept, agent, hashek) {
  if (!recept?.jovahagyva) return false;
  if (recept.agent && recept.agent !== "*" && recept.agent !== agent) return false;
  const kell = recept.amikor?.blokkok ?? [];
  if (kell.length === 0) return false;
  return kell.every((h) => hashek.has(h));
}

/** A recept műveleteinek alkalmazása. Visszaadja az új blokklistát és a naplósorokat. */
function alkalmaz(recept, lista) {
  const naplo = [];
  let out = lista.slice();

  for (const mv of recept.muveletek ?? []) {
    const idx = out.findIndex((b) => hash(b) === mv.blokk);
    if (idx === -1) continue;

    if (mv.tipus === "elhagy") {
      naplo.push({ tipus: "elhagy", blokk: mv.blokk, karakter: out[idx].length });
      out.splice(idx, 1);
    } else if (mv.tipus === "csere") {
      naplo.push({ tipus: "csere", blokk: mv.blokk, karakter: out[idx].length - mv.helyette.length });
      out[idx] = mv.helyette;
    } else if (mv.tipus === "elore") {
      const [b] = out.splice(idx, 1);
      out.unshift(b);
      naplo.push({ tipus: "elore", blokk: mv.blokk, karakter: 0 });
    }
  }

  return { blokkok: out, naplo };
}

// --- Gépi visszafogás ----------------------------------------------------------
//
// A jóváhagyás emberi; ez a gépi háló alatta. Két dolgot néz:
//
//   1. VÉDETT SZÖVEGEK. Ami az eredeti promptban benne volt és a `vedett` listán
//      szerepel, annak az átírás után is benne kell lennie. Ezek olyan mondatok,
//      amelyek egy subagent egész módszerét szabják — ha egy recept véletlenül
//      elviszi őket, a subagent nem hibát jelez, hanem MÁSKÉPP dolgozik.
//   2. ARÁNY. Az átírt prompt nem lehet rövidebb az eredeti megadott hányadánál.
//      Ez a "a recept véletlenül mindent kivágott" eset ellen véd.
//
// Ha bármelyik sérül, az átírás ELMARAD (a prompt eredetiben megy tovább), és a
// napló rögzíti, melyik recept bukott meg. Csendben nem esik vissza.

const ALAP_VEDETT = [
  "A munkagyökered",           // worktree-gyökér — enélkül a fő fába ír
  "mutató a bizonyítékhoz",    // a validátor módszertani kerete
  "kötelező érvényű",          // a befagyasztott UI-szerződés súlya
  "szó szerint",               // a hibaüzenetek és a jelentések átvételének módja
];

function backstop(eredeti, uj, recept, tar) {
  const vedett = [...ALAP_VEDETT, ...(tar.vedett ?? []), ...(recept.vedett ?? [])];
  for (const v of vedett) {
    if (eredeti.includes(v) && !uj.includes(v)) {
      return `védett szöveg tűnt el: "${v}"`;
    }
  }
  const arany = recept.minimum_arany ?? tar.minimum_arany ?? 0.25;
  if (uj.length < eredeti.length * arany) {
    return `az átírt prompt a ${(uj.length / eredeti.length * 100).toFixed(0)}%-a az eredetinek, a küszöb ${(arany * 100).toFixed(0)}%`;
  }
  return null;
}

// --- Naplózás -------------------------------------------------------------------

function jegyez(sor) {
  try {
    mkdirSync(TAR, { recursive: true });
    appendFileSync(MERESEK, JSON.stringify(sor) + "\n", "utf8");
  } catch {
    /* a mérés elmaradása sosem akaszthatja meg a delegálást */
  }
}

/**
 * Blokk-előnézetek indexe: hash → az első pár szó.
 *
 * A verziókövetett `meresek.jsonl` szándékosan CSAK hasht tárol, prompt-szöveget nem.
 * A mérleg viszont használhatatlan lenne előnézet nélkül — egy hash nem mondja meg,
 * MIT ismételünk. Ezért az előnézet a gitignore-olt `.scratch/` alá megy: a döntés
 * (a recept) review tárgya, a nyers szöveg nem.
 */
function elonezet(lista) {
  try {
    const dir = join(REPO, ".scratch", "cost-reducer");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "blokkok.jsonl");
    const ismert = new Set();
    if (existsSync(file)) {
      for (const sor of readFileSync(file, "utf8").split("\n")) {
        const h = /"h":"([0-9a-f]{12})"/.exec(sor);
        if (h) ismert.add(h[1]);
      }
    }
    const ujak = [];
    for (const b of lista) {
      const h = hash(b);
      if (ismert.has(h)) continue;
      ismert.add(h);
      ujak.push(JSON.stringify({ h, n: b.length, elonezet: b.replace(/\s+/g, " ").trim().slice(0, 90) }));
    }
    if (ujak.length) appendFileSync(file, ujak.join("\n") + "\n", "utf8");
  } catch {
    /* az előnézet kényelmi funkció — a mérést nem akaszthatja meg */
  }
}

/** Az eredeti prompt elmentése, hogy egy elrontott futás visszajátszható legyen. */
function visszajatszas(azonosito, prompt) {
  try {
    mkdirSync(VISSZAJATSZAS, { recursive: true });
    writeFileSync(join(VISSZAJATSZAS, `${azonosito}.txt`), prompt, "utf8");
  } catch {
    /* ha nem sikerül, az átírás akkor is elmarad — lásd a hívási helyet */
    return false;
  }
  return true;
}

// --- Fő ág -----------------------------------------------------------------------

function delegalas(input) {
  if (process.env.COST_REDUCER === "0") return decide("defer");
  if (input?.tool_name !== "Agent" && input?.tool_name !== "Task") return decide("defer");

  const ti = input?.tool_input ?? {};
  const prompt = typeof ti.prompt === "string" ? ti.prompt : null;
  if (!prompt) return decide("defer");

  const agent = ti.subagent_type ?? null;
  const lista = blokkok(prompt);
  const hashek = new Set(lista.map(hash));

  const alap = {
    ts: new Date().toISOString(),
    session: input?.session_id ?? null,
    agent,
    model: ti.model ?? null,
    karakter: prompt.length,
    // A tokenszám BECSLÉS (≈4 karakter/token). A harness nem ad ki tokenszámot a
    // hooknak, és cache-találati arányt sem — a skill ezt nem is állíthatja.
    token_becsles: Math.round(prompt.length / 4),
    blokkok: lista.map((b) => ({ h: hash(b), n: b.length })),
  };

  elonezet(lista);

  const tar = readJson(RECEPTEK, { verzio: 1, receptek: [] });
  const recept = (tar.receptek ?? []).find((r) => illeszkedik(r, agent, hashek));

  if (!recept) {
    jegyez({ ...alap, allapot: "mert" });
    return decide("defer");
  }

  const { blokkok: ujLista, naplo } = alkalmaz(recept, lista);
  const uj = ujLista.join("\n\n");

  const baj = backstop(prompt, uj, recept, tar);
  if (baj) {
    jegyez({ ...alap, allapot: "elutasitva", recept: recept.id, ok: baj });
    return decide("defer");
  }

  // Az átírás csak akkor mehet, ha az eredeti biztonságban elmenthető: enélkül
  // egy rossz recept nyomtalanul rontana el egy futást.
  const azonosito = `${alap.ts.replace(/[:.]/g, "-")}-${agent ?? "ismeretlen"}`;
  if (!visszajatszas(azonosito, prompt)) {
    jegyez({ ...alap, allapot: "elutasitva", recept: recept.id, ok: "az eredeti prompt nem menthető el" });
    return decide("defer");
  }

  jegyez({
    ...alap,
    allapot: "atirva",
    recept: recept.id,
    uj_karakter: uj.length,
    megtakaritas: prompt.length - uj.length,
    muveletek: naplo,
    visszajatszas: azonosito,
  });

  return decide(
    "allow",
    `cost-reducer: "${recept.id}" recept alkalmazva — ${prompt.length} → ${uj.length} karakter. ` +
      `Az eredeti prompt: .scratch/cost-reducer/visszajatszas/${azonosito}.txt`,
    { ...ti, prompt: uj },
  );
}

// --- Belépési pont ------------------------------------------------------------------

const input = readInput();

switch (MODE) {
  case "delegalas":
    delegalas(input);
    break;
  default:
    // Ismeretlen mód: ne akadályozzuk a munkát, csak jelezzük. Ugyanaz a
    // konvenció, mint a `spec-guard.mjs`-ben — és ugyanaz a csapda is: egy
    // elgépelt mód-string némán kikapcsolja a mérést.
    decide("defer", `Ismeretlen kontextus-mérő mód: "${MODE}".`);
}
