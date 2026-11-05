#!/usr/bin/env node
// PreToolUse hook a subagent-delegálásokhoz — a `cost-reducer` skill gépi fele.
//
// KÉT DOLGOT CSINÁL, ÉS A KETTŐ SÚLYA NAGYON KÜLÖNBÖZŐ:
//
//   1. MÉR — minden delegálásnál rögzíti, mekkora promptot adunk át, milyen
//      blokkokból áll, és melyik blokk hányadszor megy át ugyanabban a láncban.
//      A „lánc" a sor `futas` mezője: ugyanaz a feloldás, mint a futásmérlegé
//      (`futasFeloldas`, `futas-kozos.mjs`: env > friss jelző > session), és a
//      `merleg.mjs --futas <név>` erre szűr. A `tool_use_id` a futásmérleg naplójának
//      soraival köti össze. Ez mindig lefut, semmit nem befolyásol.
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
// ténylegesen alkalmazott egy receptet — és az változtatott is a prompton. Minden
// más úton belső `defer` (kimenet nélküli exit 0), hogy a felhasználó beállításait
// ne írja felül.
//
// Használat (`.claude/settings.json`):
//   "PreToolUse": [{ "matcher": "Agent|Task|SendMessage", "hooks": [{ "type": "command",
//     "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/kontextus-mero.mjs", "delegalas"] }]}]
//
// Kikapcsolás egy futásra: `COST_REDUCER=0`. Ez NEMCSAK az átírást kapcsolja ki,
// hanem a MÉRÉST is: a hook ilyenkor semmit nem mér, a `meresek.jsonl`-
// be nem kerül sor, és a `.scratch/cost-reducer/` előnézete sem frissül. Az így
// futtatott delegálások a cost-reducer mérlegéből utólag sem pótolhatók.
//
// Ismeretlen mód (elgépelt `args`): a hook semmit nem mér, és egy `systemMessage`-et
// ad ki (permissionDecision NÉLKÜL), hogy a kikapcsolt mérés ne maradjon néma.
//
// MODULKÉNT IS BETÖLTHETŐ: a `cost-reducer/scripts/merleg.mjs` innen importálja a
// `jovahagyott()`-at és a `receptHiba()`-t, hogy a recept aktív-voltáról UGYANAZ a
// szabály döntsön, mint a hookban (nem másolat). Az importáló az import ELŐTT
// `globalThis.KONTEXTUS_MERO_MODULKENT = true`-t állít, és akkor a hook-ág nem fut
// (nem olvas stdin-t, nem lép ki). Szándékosan nem a futtatott fájl nevéből döntünk:
// egy másképp (symlinken, más útvonal-alakkal) indított hook így sem némulhat el.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODE = process.argv[2] ?? "";

// Hookként fut-e (lásd a fejlécet: modulként importálva a hook-ág nem fut).
const FOPROGRAM = globalThis.KONTEXTUS_MERO_MODULKENT !== true;

// A futás-azonosító feloldása a futásmérleg közös moduljából — dinamikusan, hogy egy
// betöltési hiba se vigye el a mérést (fail-open: `futas: null`).
let futasFeloldas = null;
try {
  ({ futasFeloldas } = await import("./futas-kozos.mjs"));
} catch {
  futasFeloldas = null;
}

/** A mérési sor `futas` mezője: env > friss jelző > session; hiba esetén `null`. */
function futasAzonosito(input) {
  try {
    return futasFeloldas ? futasFeloldas({ session: input?.session_id ?? null }) ?? null : null;
  } catch {
    return null;
  }
}

const REPO = process.env.CLAUDE_PROJECT_DIR
  ? resolve(process.env.CLAUDE_PROJECT_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const TAR = join(REPO, "docs", "orchestration", "_kontextus");
const RECEPTEK = join(TAR, "receptek.json");
const MERESEK = join(TAR, "meresek.jsonl");
const VISSZAJATSZAS = join(REPO, ".scratch", "cost-reducer", "visszajatszas");

/** Egységes hook-válasz. Hiba esetén is `defer`: egy hibás mérő ne bénítsa le a láncot. */
function decide(permissionDecision, reason, updatedInput) {
  if (permissionDecision === "defer") {
    // A belső `defer` („nem ítélek") kimenet nélkül zár, mert a 2.1.310 óta a
    // kiadott `defer` a hívást elhalasztja, nem átengedi (lásd spec-guard.mjs fejléc).
    // Az `updatedInput` itt amúgy sem érvényesülne — csak `allow` mellett hat.
    if (reason) process.stderr.write(`${reason}\n`);
    process.exit(0);
  }
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
//
// „Dátum" = valódi, NEM jövőbeli `YYYY-MM-DD`. Egy `"igen"`, egy `true` vagy egy
// `"nem"` nem jóváhagyás — korábban minden truthy érték annak számított, így a
// `"jovahagyva": "nem"` épp az ellenkezőjét érte el, mint amit mondott. A jövőbeli
// dátum sem az: jóváhagyni csak már meghozott döntést lehet.

const ISO_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A helyi naptári nap `YYYY-MM-DD` alakban (a jóváhagyó is helyi dátumot ír). */
function maiDatum() {
  const d = new Date();
  const ket = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${ket(d.getMonth() + 1)}-${ket(d.getDate())}`;
}

export function jovahagyott(ertek, ma = maiDatum()) {
  if (typeof ertek !== "string") return false;
  const m = ISO_DATUM.exec(ertek);
  if (!m) return false;
  // Naptári érvényesség: a `2026-02-31` alakra helyes, de nem létező nap.
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return false;
  return ertek <= ma;
}

function illeszkedik(recept, agent, hashek) {
  if (!recept || typeof recept !== "object") return false;
  if (!jovahagyott(recept.jovahagyva)) return false;
  if (recept.agent && recept.agent !== "*" && recept.agent !== agent) return false;
  const kell = Array.isArray(recept.amikor?.blokkok) ? recept.amikor.blokkok : [];
  if (kell.length === 0) return false;
  return kell.every((h) => hashek.has(h));
}

// Minimális recept-séma. A receptet ember írja kézzel (a `cost-reducer` skill
// javasolja, de a fájl szerkeszthető), és egy elgépelt mező korábban kezeletlen
// TypeError-ral vitte el a hookot — a mérési sor sem íródott meg. Az ellenőrzés
// nem teljes séma, csak annyi, hogy az `alkalmaz` ne dőljön el.
const MUVELET_TIPUSOK = new Set(["elhagy", "csere", "elore"]);

export function receptHiba(recept) {
  if (typeof recept.id !== "string" || !recept.id) return "hiányzik az `id`";
  // Az `indok` kötelező (SKILL.md, recept-formatum.md): ez kerül a jelentésbe és a
  // review elé. Indok nélküli recept nem alkalmazható, akkor sem, ha jóváhagyott.
  if (typeof recept.indok !== "string" || !recept.indok.trim()) return "hiányzik az `indok` (nem üres szöveg)";
  if (!Array.isArray(recept.muveletek) || recept.muveletek.length === 0) return "a `muveletek` nem nem-üres lista";
  for (const [i, mv] of recept.muveletek.entries()) {
    if (!mv || typeof mv !== "object") return `a ${i}. művelet nem objektum`;
    if (!MUVELET_TIPUSOK.has(mv.tipus)) return `a ${i}. művelet típusa ismeretlen: ${JSON.stringify(mv.tipus)}`;
    if (typeof mv.blokk !== "string" || !/^[0-9a-f]{12}$/.test(mv.blokk)) return `a ${i}. művelet \`blokk\`-ja nem 12 jegyű hash`;
    if (mv.tipus === "csere" && typeof mv.helyette !== "string") return `a ${i}. (csere) műveletből hiányzik a \`helyette\` szöveg`;
  }
  if (recept.vedett !== undefined && !Array.isArray(recept.vedett)) return "a `vedett` nem lista";
  if (recept.minimum_arany !== undefined && typeof recept.minimum_arany !== "number") return "a `minimum_arany` nem szám";
  return null;
}

/**
 * A recept műveleteinek alkalmazása. Visszaadja az új blokklistát, a naplósorokat
 * és a ténylegesen beillesztett `helyette` szövegeket (a backstop ezeket NEM
 * számolja a védett szövegek előfordulásai közé).
 */
function alkalmaz(recept, lista) {
  const naplo = [];
  const beillesztett = [];
  let out = lista.slice();

  for (const mv of recept.muveletek ?? []) {
    const idx = out.findIndex((b) => hash(b) === mv.blokk);
    if (idx === -1) continue;

    if (mv.tipus === "elhagy") {
      naplo.push({ tipus: "elhagy", blokk: mv.blokk, karakter: out[idx].length });
      out.splice(idx, 1);
    } else if (mv.tipus === "csere") {
      naplo.push({ tipus: "csere", blokk: mv.blokk, karakter: out[idx].length - mv.helyette.length });
      beillesztett.push(mv.helyette);
      out[idx] = mv.helyette;
    } else if (mv.tipus === "elore") {
      const [b] = out.splice(idx, 1);
      out.unshift(b);
      naplo.push({ tipus: "elore", blokk: mv.blokk, karakter: 0 });
    }
  }

  return { blokkok: out, naplo, beillesztett };
}

// --- Gépi visszafogás ----------------------------------------------------------
//
// A jóváhagyás emberi; ez a gépi háló alatta. Két dolgot néz:
//
//   1. VÉDETT SZÖVEGEK. Ami az eredeti promptban benne volt és a `vedett` listán
//      szerepel, annak az átírás után is benne kell lennie — ugyanannyiszor.
//      Ezek olyan mondatok, amelyek egy subagent egész módszerét szabják — ha egy
//      recept véletlenül elviszi őket, a subagent nem hibát jelez, hanem MÁSKÉPP
//      dolgozik. Két kiskapu volt itt, mindkettő zárva:
//        · csak a JELENLÉTET néztük, így ha egy védett mondat két blokkban szerepelt,
//          az egyik szabadon eltűnhetett — ezért előfordulás-számot hasonlítunk;
//        · a recept `helyette` szövegébe írt védett mondat „visszahozta" az
//          elvittet, más helyen és más kontextusban — ezért a beillesztett szöveg
//          előfordulásai NEM számítanak bele.
//   2. ARÁNY. Az átírt prompt nem lehet rövidebb az eredeti megadott hányadánál.
//      Ez a "a recept véletlenül mindent kivágott" eset ellen véd. A recept a
//      globális küszöböt csak SZIGORÍTHATJA (`Math.max`), lazítani nem: a küszöb
//      nem csökkenthető, a hibás receptet kell javítani vagy visszavonni.
//
// Ha bármelyik sérül, az átírás ELMARAD (a prompt eredetiben megy tovább), és a
// napló rögzíti, melyik recept bukott meg. Csendben nem esik vissza.

const ALAP_VEDETT = [
  "A munkagyökered",           // worktree-gyökér — enélkül a fő fába ír
  "mutató a bizonyítékhoz",    // a validátor módszertani kerete
  "kötelező érvényű",          // a befagyasztott UI-szerződés súlya
  "szó szerint",               // a hibaüzenetek és a jelentések átvételének módja
];

const ALAP_ARANY = 0.25;

/** Nem átfedő előfordulások száma. Üres mintára 0 (különben végtelen ciklus). */
function elofordulas(szoveg, minta) {
  if (!minta) return 0;
  let db = 0;
  for (let i = szoveg.indexOf(minta); i !== -1; i = szoveg.indexOf(minta, i + minta.length)) db += 1;
  return db;
}

const szovegLista = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string" && v.length > 0) : []);

function backstop(eredeti, uj, recept, tar, beillesztett = []) {
  const vedett = [...new Set([...ALAP_VEDETT, ...szovegLista(tar.vedett), ...szovegLista(recept.vedett)])];
  for (const v of vedett) {
    const elotte = elofordulas(eredeti, v);
    if (elotte === 0) continue;
    const csempeszett = beillesztett.reduce((a, h) => a + elofordulas(h, v), 0);
    const utana = elofordulas(uj, v) - csempeszett;
    if (utana < elotte) {
      return `védett szöveg tűnt el: "${v}" (${elotte} előfordulásból ${Math.max(utana, 0)} maradt a recept saját szövegén kívül)`;
    }
  }
  const globalis = typeof tar.minimum_arany === "number" ? tar.minimum_arany : ALAP_ARANY;
  const sajat = typeof recept.minimum_arany === "number" ? recept.minimum_arany : 0;
  const arany = Math.max(globalis, sajat);
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

/**
 * SendMessage-dzsel folytatott agent üzenete: CSAK mérés, recept soha. A recept
 * egy delegálási prompt blokkjaira szól, a folytató üzenet pedig nem az — egy
 * javító kör konkrét hibalistája, amiből egy blokk kiváltása épp a lényeget
 * vinné el.
 */
function folytatas(input) {
  const ti = input?.tool_input ?? {};
  const uzenet = typeof ti.message === "string" ? ti.message : null;
  if (!uzenet) return decide("defer");
  const lista = blokkok(uzenet);
  jegyez({
    ts: new Date().toISOString(),
    session: input?.session_id ?? null,
    futas: futasAzonosito(input),
    tool_use_id: input?.tool_use_id ?? null,
    agent: null,
    folytatas: true,
    cel: ti.to ?? null,
    karakter: uzenet.length,
    token_becsles: Math.round(uzenet.length / 4),
    blokkok: lista.map((b) => ({ h: hash(b), n: b.length })),
    allapot: "mert",
  });
  return decide("defer");
}

function delegalas(input) {
  if (process.env.COST_REDUCER === "0") return decide("defer");
  if (input?.tool_name === "SendMessage") return folytatas(input);
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
    futas: futasAzonosito(input),
    tool_use_id: input?.tool_use_id ?? null,
    agent,
    model: ti.model ?? null,
    karakter: prompt.length,
    // A tokenszám BECSLÉS (≈4 karakter/token). A harness nem ad ki tokenszámot a
    // hooknak, és cache-találati arányt sem — a skill ezt nem is állíthatja.
    token_becsles: Math.round(prompt.length / 4),
    blokkok: lista.map((b) => ({ h: hash(b), n: b.length })),
  };

  elonezet(lista);

  // A recept-ág minden hibája (sérült receptfájl, váratlan alak) mérési sorral és
  // átírás NÉLKÜL zár: fail-open, és a hiba a naplóban látszik, nem csak egy
  // elveszett exit 1-ben.
  let receptId = null;
  try {
    return receptAg({ prompt, ti, agent, lista, hashek, alap, jelol: (id) => (receptId = id) });
  } catch (e) {
    jegyez({ ...alap, allapot: "hiba", recept: receptId, ok: `recept-hiba: ${e?.message ?? String(e)}` });
    return decide("defer");
  }
}

function receptAg({ prompt, ti, agent, lista, hashek, alap, jelol }) {
  const nyers = readJson(RECEPTEK, null);
  const tar = nyers && typeof nyers === "object" && !Array.isArray(nyers) ? nyers : { receptek: [] };
  const receptek = Array.isArray(tar.receptek) ? tar.receptek : [];
  const recept = receptek.find((r) => illeszkedik(r, agent, hashek));

  if (!recept) {
    jegyez({ ...alap, allapot: "mert" });
    return decide("defer");
  }
  jelol(recept.id ?? null);

  const semaHiba = receptHiba(recept);
  if (semaHiba) {
    jegyez({ ...alap, allapot: "hiba", recept: recept.id ?? null, ok: `érvénytelen recept: ${semaHiba}` });
    return decide("defer");
  }

  const { blokkok: ujLista, naplo, beillesztett } = alkalmaz(recept, lista);
  const uj = ujLista.join("\n\n");

  // Hatástalan recept: egyetlen művelete sem talált blokkot (vagy csak a már elöl
  // álló blokkot tette előre). Ilyenkor NINCS átírás és NINCS `allow` — különben a
  // hook egy semmit nem változtató recept nevében kerülné meg az engedélykérést, és a
  // `join("\n\n")` közben a promptot is átnormalizálná (blokkközök, sorvégi szóköz).
  const valtozott =
    naplo.length > 0 &&
    uj !== prompt &&
    (ujLista.length !== lista.length || ujLista.some((b, i) => b !== lista[i]));
  if (!valtozott) {
    jegyez({ ...alap, allapot: "mert", recept: recept.id, ok: "a recept egyetlen művelete sem változtatott a prompton" });
    return decide("defer");
  }

  const baj = backstop(prompt, uj, recept, tar, beillesztett);
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

/**
 * Ismeretlen mód: ne akadályozzuk a munkát, de LÁTSZÓDJON. A stderr exit 0 mellett
 * néma (a harness nem mutatja), ezért egy `systemMessage` megy ki — szándékosan
 * `permissionDecision` NÉLKÜL, hogy a hívás sorsáról ne mondjon semmit.
 */
function ismeretlenMod() {
  process.stdout.write(
    JSON.stringify({
      systemMessage:
        `kontextus-mero.mjs: ismeretlen mód "${MODE}" — a delegálások mérése és a receptek KI vannak kapcsolva. ` +
        "Javítsd a `.claude/settings.json` bekötését (`delegalas`).",
    }),
  );
  process.exit(0);
}

if (FOPROGRAM) {
  try {
    const input = readInput();
    switch (MODE) {
      case "delegalas":
        delegalas(input);
        break;
      default:
        ismeretlenMod();
    }
  } catch {
    // Utolsó háló: egy váratlan hiba sem adhat exit 1-et és sem akaszthatja meg a
    // delegálást. Kimenet nélkül zár (a belső `defer` megfelelője).
    process.exit(0);
  }
}
