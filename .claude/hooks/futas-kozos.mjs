// A futásmérleg közös fele: EGYEZTETÉS és ÍTÉLET.
//
// Két fogyasztója van, és mindkettőnek ugyanazt kell látnia:
//   - `futas-mero.mjs`  — a PreToolUse hook (mér, majd kaput nyit vagy tilt)
//   - `futas-merleg.mjs` — a skill riport-szkriptje (mér, majd jelent)
//
// Ezért van külön modulban: ha a két fél külön számolna, a kapu és a riport
// előbb-utóbb más számot mondana ugyanarról a futásról.
//
// ─────────────────────────────────────────────────────────────────────────────
// MÉRT TÉNYEK AZ ÁTIRATRÓL (2026-08-04, Claude Code 2.1.221)
//
// A `.claude/README.md` korábban azt állította, hogy tokenszámot a harness nem
// ad ki. KIADJA — csak nem a hook payloadjában, hanem az átiratban:
//
//   - a hook payload tartalmazza a `transcript_path`-ot és a `tool_use_id`-t;
//   - a `<session>.jsonl` mellett van egy `<session>/subagents/` mappa,
//     delegálásonként egy `agent-<id>.jsonl` + egy `agent-<id>.meta.json`;
//   - a fő átirat `toolUseResult` mezője (a `tool_result` user-soron) hozza az
//     `agentId`-t, `agentType`-ot, `status`-t, `totalDurationMs`-t és a
//     subagent ZÁRÓJELENTÉSÉNEK szövegét;
//   - A KÖTÉS: a delegálás azonosítója (a napló `tool_use_id`-ja) a fő átirat
//     `tool_result` blokkjának `tool_use_id`-ja, a subagent-átirat pedig
//     UGYANANNAK a sornak a `toolUseResult.agentId`-ja alapján található meg
//     (`subagents/agent-<agentId>.jsonl`). A `.meta.json`-ban is van `toolUseId`,
//     de a kód arra NEM épít — a meta csak `agentType`-ot, `finished`-et és
//     `description`-t ad;
//   - a subagent `agent-<id>.jsonl` minden `assistant` sora valódi `usage`-et
//     hoz: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
//     `cache_read_input_tokens` (+ `cache_creation.ephemeral_5m/1h`), `model`.
//
// A LEGFONTOSABB CSAPDA. A `toolUseResult.totalTokens` NEM a delegálás
// fogyasztása, hanem az UTOLSÓ kör kontextusmérete. Mérve az admin-orders
// futáson: `totalTokens` = 175 120, a körök tényleges összege = 10 281 395.
// Aki a kézenfekvő mezőt olvassa, hatvanszoros alábecslést kap — és nem hibát,
// hanem egy hihető számot. Ezért a költség alapja MINDIG a subagent-átirat
// köreinek összege; a `totalTokens` külön mezőben, `zaro_kontextus` néven megy
// a naplóba, mert az meg egy másik, szintén hasznos szám.
// ─────────────────────────────────────────────────────────────────────────────
// MÉRT TÉNYEK, 2. RÉSZ (2026-10-25, Claude Code 2.1.310) — mindkettő csendben
// hamis számot adott, nem hibát:
//
//   - EGY API-VÁLASZ TÖBB SOR. Az átirat egy `assistant` üzenet minden
//     tartalomblokkját (szöveg, tool_use) külön sorba írja, és MINDEGYIK sor
//     ugyanazt a `usage`-et hordozza. Soronként összeadva a fogyasztás az
//     üzenetenkénti blokkszámmal szorzódik — mérve 13 üzenet / 56 sor, 44 / 102.
//     A kör egysége ezért a `message.id`, nem a sor.
//   - A HÁTTÉR-DELEGÁLÁS MÁS ALAKÚ. `run_in_background` (vagy a harness által
//     háttérbe tett) delegálásnál a fő átirat `toolUseResult`-ja
//     `{ isAsync: true, status: "async_launched", agentId, … }` — `agentType` és
//     zárójelentés NÉLKÜL, és a delegálás végén sem íródik új. Ilyenkor:
//       · az `agentType` és a lezártság (`finished: true`) a
//         `subagents/agent-<id>.meta.json`-ban van;
//       · a zárójelentés a subagent átiratában, a `SubagentHandback` tool_use
//         `input.message` mezőjében;
//       · egy SendMessage-dzsel FOLYTATOTT agent ugyanabba az átiratba ír tovább,
//         ezért a már rögzített körökön túli rész `folytatas` sorként kerül a
//         naplóba (a kör-szám a különbség alapja). A könyveletlen köröket a
//         SendMessage-kötések kör-határai szakaszokra bontják (M2-1, `kotestJegyez`):
//         minden szakasz a saját kötésének futását kapja, és külön sor lesz.
// ─────────────────────────────────────────────────────────────────────────────

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = process.env.CLAUDE_PROJECT_DIR
  ? resolve(process.env.CLAUDE_PROJECT_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const TAR = join(REPO, "docs", "orchestration", "_kontextus");
export const FUTASOK = join(TAR, "futasok.jsonl");
export const KERETEK = join(TAR, "keretek.json");
export const ARAK = join(TAR, "arak.json");

// A gitignore-olt munkaterület: a lánc jelzője és a delegálás-kori kötések. Egyik
// sem verziózott adat — a napló (`futasok.jsonl`) a verziózott, ezek csak a
// futás-azonosító feloldásához kellenek.
export const MERLEG_SCRATCH = join(REPO, ".scratch", "futas-merleg");
export const JELZO = join(MERLEG_SCRATCH, "aktiv-futas.json");
export const KOTESEK = join(MERLEG_SCRATCH, "delegalasok.jsonl");

// --- Futás-azonosító ---------------------------------------------------------
//
// DÖNTÉS (2026-11-06): a futás határa a LÁNC, nem a session. Elsőbbség:
//   1. `FUTAS_AZONOSITO` környezeti változó (üres/csupa szóköz érték = nincs megadva);
//   2. friss jelzőfájl: `<CLAUDE_PROJECT_DIR>/.scratch/futas-merleg/aktiv-futas.json`,
//      `{"futas": "<feature>", "kezdet": "<ISO-8601>"}` — a láncot vezető skill írja
//      az elején és törli a végén; a hook CSAK olvassa;
//   3. a session azonosítója.
// Friss = a `kezdet` értelmezhető, NEM jövőbeli és legfeljebb 6 órás. Minden más
// (hiányzó fájl, hibás JSON, hiányzó/üres `futas`, értelmezhetetlen, időzóna nélküli,
// jövőbeli vagy lejárt `kezdet`) → a jelzőt figyelmen kívül hagyjuk: fail-open a
// session felé. A 6 óra azért kell, hogy egy megszakadt lánc ottfelejtett jelzője ne
// ragassza a következő napok delegálásait egy régi futáshoz.
//
// Opcionális `session` mező: ha a jelzőben van, és NEM egyezik a hívó session-
// azonosítójával, a jelző nem számít (fail-open: session). Enélkül egy ugyanabban a
// repóban párhuzamosan futó MÁSIK session delegálásai is a lánchoz ragadnának. A
// mező nélküli jelző minden sessionre érvényes (a régi viselkedés).

export const JELZO_ERVENYES_MS = 6 * 60 * 60 * 1000;

// ISO-8601 dátum+idő, KÖTELEZŐ időzónával (`Z` vagy `±hh:mm`/`±hhmm`). Időzóna
// nélkül a `Date.parse` helyi időnek venné — gépenként más pillanat, ezért elvetjük.
const ISO_IDO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * A jelzőfájl futás-azonosítója, ha a jelző friss; egyébként `null`.
 * Soha nem dob: minden hiba „nincs jelző".
 */
export function jelzoFutas({ file = JELZO, most = Date.now(), session } = {}) {
  const j = readJson(file, null);
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const futas = typeof j.futas === "string" ? j.futas.trim() : "";
  if (!futas) return null;
  // A `session` mező megadott, ha nem üres szöveg; egy nem-szöveg érték hibás jelző.
  if (j.session !== undefined && j.session !== null) {
    if (typeof j.session !== "string") return null;
    const js = j.session.trim();
    if (js && js !== session) return null;
  }
  if (typeof j.kezdet !== "string" || !ISO_IDO.test(j.kezdet.trim())) return null;
  const kezdet = Date.parse(j.kezdet.trim());
  if (Number.isNaN(kezdet)) return null;
  const kor = most - kezdet;
  if (kor < 0 || kor > JELZO_ERVENYES_MS) return null;
  return futas;
}

/** A futás-azonosító feloldása: env > friss jelző > session (lásd fent). */
export function futasFeloldas({ session = null, env = process.env, jelzo = JELZO, most = Date.now() } = {}) {
  const kezi = typeof env?.FUTAS_AZONOSITO === "string" ? env.FUTAS_AZONOSITO.trim() : "";
  if (kezi) return kezi;
  return jelzoFutas({ file: jelzo, most, session }) ?? session;
}

/**
 * A delegálás IDEJÉN érvényes futás-azonosító rögzítése (a hook hívja, a kapu előtt).
 *
 * Miért kell: a hook mindig a KORÁBBI delegálásokat egyezteti. Ha az egyeztetés a
 * mostani azonosítót adná, a lánc utolsó delegálása — amit a lánc vége után, a
 * jelző törlése után zár le a következő hívás vagy a riport — a session-höz
 * kerülne, nem a lánchoz. Ezért a hook delegáláskor feljegyzi a `tool_use_id` →
 * futás kötést (SendMessage-nél a címzett → futás kötést), és az egyeztetés ezt
 * használja; csak kötés híján esik vissza az egyeztetéskori feloldásra.
 *
 * A SendMessage-kötés (M2-1) a `session`-t, a feloldott `agent_id`-t és a kötéskori
 * KÖRSZÁMOT (`kor`: a címzett átiratának addigi köre) is hordozza: a folytatás köreit
 * az egyeztetés EZ alapján osztja szét — a `kor` utáni körök ennek a kötésnek a
 * futásához tartoznak, egészen a következő kötés `kor`-áig. Így egy későbbi SendMessage
 * nem írja felül a még könyveletlen korábbi folytatás futását, és egy még FUTÓ agentnek
 * küldött második üzenet is külön szakaszt kap. `kor` híján a kötés `ts`-e a határ.
 *
 * A fájl gitignore-olt munkaadat, csak hozzáírással bővül. Írási hiba néma: a
 * kötés kényelmi adat, a hiánya csak a régi (egyeztetéskori) viselkedést adja.
 */
export function kotestJegyez({ tool_use_id = null, cel = null, futas, session = null, agent_id = null, kor = null }) {
  if (!futas || (!tool_use_id && !cel)) return false;
  try {
    mkdirSync(MERLEG_SCRATCH, { recursive: true });
    const sor = {
      ts: new Date().toISOString(),
      futas,
      ...(session ? { session } : {}),
      ...(tool_use_id ? { tool_use_id } : {}),
      ...(cel ? { cel } : {}),
      ...(cel && agent_id ? { agent_id } : {}),
      ...(cel && Number.isInteger(kor) && kor >= 0 ? { kor } : {}),
    };
    appendFileSync(KOTESEK, JSON.stringify(sor) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * A kötések beolvasása: `tool_use_id` → futás, és a SendMessage-kötések listája
 * fájlsorrendben (= időrendben). A címzett-kötés kulcsa a session ÉS a címzett:
 * egy agent-név (`h1`, `kutato`) két sessionben is előfordulhat. A régi, session
 * nélküli kötés bármelyik sessionre illik (visszafelé kompatibilitás).
 */
function kotesekOlvas() {
  const delegalas = new Map();
  const cel = [];
  for (const s of olvasJsonl(KOTESEK)) {
    if (typeof s?.futas !== "string" || !s.futas) continue;
    if (typeof s.tool_use_id === "string" && s.tool_use_id) delegalas.set(s.tool_use_id, s.futas);
    if (typeof s.cel === "string" && s.cel) cel.push(s);
  }
  return { delegalas, cel };
}

/** Egy háttéragent SendMessage-kötései (session + agentId vagy név szerint), időrendben. */
function celKotesei(lista, { session, agentId, nev }) {
  return lista.filter(
    (k) =>
      (!k.session || k.session === session) &&
      (k.agent_id === agentId || k.cel === agentId || (nev && k.cel === nev)),
  );
}

/**
 * Melyik kötéshez tartozik az `sorszam`-adik (1-től számolt) kör: a legkésőbbi
 * kötés, amelynek `kor`-a kisebb a sorszámnál (`kor` híján: amelynek `ts`-e nem
 * későbbi a kör idejénél). Nincs ilyen → `null` (az eredeti delegálás része).
 */
function korKotese(kotesek, sorszam, korTs) {
  let ki = null;
  for (const k of kotesek) {
    if (Number.isInteger(k.kor)) {
      if (k.kor < sorszam) ki = k;
    } else {
      const t = Date.parse(k.ts ?? "");
      if (!Number.isNaN(t) && korTs !== null && t <= korTs) ki = k;
    }
  }
  return ki;
}

// --- Alap I/O ----------------------------------------------------------------

export function readJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}

export function olvasJsonl(file) {
  return olvasJsonlReszletes(file).sorok;
}

/** Mint az `olvasJsonl`, de a sérült (nem értelmezhető) sorok számát is visszaadja. */
export function olvasJsonlReszletes(file) {
  if (!existsSync(file)) return { sorok: [], hibas: 0 };
  const sorok = [];
  let hibas = 0;
  for (const sor of readFileSync(file, "utf8").split("\n")) {
    if (!sor.trim()) continue;
    try {
      sorok.push(JSON.parse(sor));
    } catch {
      /* egy sérült sor ne vigye el az egész naplót */
      hibas += 1;
    }
  }
  return { sorok, hibas };
}

// --- Deduplikálás (M2-2) -------------------------------------------------------
//
// Két, egyszerre futó hook (a lánc párhuzamos delegálásai) ugyanazt a lezárt
// delegálást láthatja könyveletlennek, és mindkettő beírja. A napló csak
// hozzáírással bővül, zár nincs — ezért a kettős sort OLVASÁSKOR szűrjük, determinisztikus
// kulccsal, mindenhol, ahol a sorok összeadódnak (`egyeztet`, `itelet`, `osszesites`,
// a riport). Az első előfordulás nyer.
//
// A kulcs: `tool_use_id` + a szakasz kezdete. Nem-folytatás sornál a kezdő kör
// (`kezdo_kor`, régi sornál 1); `folytatas` sornál a szakasz azonosítója (`szakasz`:
// az első kör `message.id`-ja), annak híján a kezdő kör, végül — régi sornál — a `ts`
// és a körszám. `hiba` sornál az ok. `tool_use_id` nélküli sort nem szűrünk.

export function sorKulcs(s) {
  if (!s || typeof s.tool_use_id !== "string" || !s.tool_use_id) return null;
  if (s.allapot === "hiba") return `${s.tool_use_id}|hiba|${s.ok ?? ""}`;
  if (s.folytatas) return `${s.tool_use_id}|f|${s.szakasz ?? s.kezdo_kor ?? `${s.ts ?? ""}:${s.korok ?? ""}`}`;
  return `${s.tool_use_id}|k|${s.kezdo_kor ?? 1}`;
}

export function egyediSorok(sorok) {
  const latott = new Set();
  const ki = [];
  for (const s of Array.isArray(sorok) ? sorok : []) {
    const k = sorKulcs(s);
    if (k !== null) {
      if (latott.has(k)) continue;
      latott.add(k);
    }
    ki.push(s);
  }
  return ki;
}

function jegyez(sor) {
  try {
    mkdirSync(TAR, { recursive: true });
    appendFileSync(FUTASOK, JSON.stringify(sor) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

// --- Költségmodell -----------------------------------------------------------

/**
 * Relatív költség-egység: ártáblától FÜGGETLEN, ezért sosem avul el.
 *
 * A súlyok az Anthropic szokásos arányai az input árához képest (kimenet ≈5x,
 * cache-írás 1,25x/2x a TTL szerint, cache-olvasás 0,1x). Ez FELTEVÉS, nem
 * mérés — a `keretek.json` `suly` mezőjében egy helyen átírható.
 */
export const ALAP_SULY = { be: 1, ki: 5, cache_ir_5m: 1.25, cache_ir_1h: 2, cache_olv: 0.1 };

export function koltsegEgyseg(token, suly = ALAP_SULY) {
  const s = { ...ALAP_SULY, ...(suly ?? {}) };
  return Math.round(
    (token.be ?? 0) * s.be +
      (token.ki ?? 0) * s.ki +
      (token.cache_ir_5m ?? 0) * s.cache_ir_5m +
      (token.cache_ir_1h ?? 0) * s.cache_ir_1h +
      (token.cache_olv ?? 0) * s.cache_olv,
  );
}

/**
 * Egy modell ársora. Előbb a pontos névre keres, utána a dátum-utótag
 * (`claude-haiku-4-5-20251001` → `claude-haiku-4-5`) levágásával: az átirat a
 * `message.model`-ben gyakran a dátumozott azonosítót hozza, az ártábla a
 * dátum nélkülit.
 */
function arSor(tabla, modell) {
  if (tabla[modell]) return tabla[modell];
  const alap = String(modell).replace(/-\d{8}$/, "");
  return tabla[alap] ?? null;
}

/**
 * Pénz — csak arra a részre, amire az `arak.json`-ban VAN sor.
 *
 * Visszatérés: `{ usd, reszleges, araznatlan }`.
 *   - `usd`: `null`, ha EGYIK modellnek sincs ára (a hiányzó ár nem ingyenes
 *     delegálás — a hívó a `koltseg_egyseg`-re esik vissza);
 *   - `reszleges`: igaz, ha van `usd`, de legalább egy modell áratlan maradt —
 *     ilyenkor az `usd` ALSÓ korlát, nem a teljes költség. Korábban ez a rész
 *     csendben kimaradt, és a részösszeg teljesként ment a naplóba;
 *   - `araznatlan`: a dátum-utótag levágása után is áratlan modellek.
 */
export function koltsegUsdReszletes(modellenkent, arak) {
  const tabla = arak?.modellek ?? {};
  let ossz = 0;
  let volt = false;
  const araznatlan = [];

  for (const [modell, t] of Object.entries(modellenkent ?? {})) {
    const ar = arSor(tabla, modell);
    if (!ar) {
      araznatlan.push(modell);
      continue;
    }
    volt = true;
    const be = ar.be_millio ?? 0;
    const ki = ar.ki_millio ?? 0;
    // A cache-árak alapból az input szorzói; ahol a modell eltér (az Opus 5.5
    // cache-olvasása 0,05x, nem 0,1x), az `arak.json` sora felülírja.
    const ir5 = ar.cache_ir_5m_millio ?? be * 1.25;
    const ir1h = ar.cache_ir_1h_millio ?? be * 2;
    const olv = ar.cache_olv_millio ?? be * 0.1;
    ossz +=
      ((t.be ?? 0) * be +
        (t.ki ?? 0) * ki +
        (t.cache_ir_5m ?? 0) * ir5 +
        (t.cache_ir_1h ?? 0) * ir1h +
        (t.cache_olv ?? 0) * olv) /
      1_000_000;
  }

  const usd = volt ? Math.round(ossz * 10000) / 10000 : null;
  return { usd, reszleges: usd !== null && araznatlan.length > 0, araznatlan };
}

/** Visszafelé kompatibilis alak: csak a szám (vagy `null`). */
export function koltsegUsd(modellenkent, arak) {
  return koltsegUsdReszletes(modellenkent, arak).usd;
}

/**
 * Az ártábla dátumának figyelmeztetése a riporthoz. Az `ervenyes` hiánya nem
 * hiba és nem kapu (küszöb nincs rá), de a levezetett pénzösszeg forrása ettől
 * dátumozatlan — ezt ki kell mondani, nem csendben kihagyni.
 */
export function arakFigyelmeztetes(arak) {
  if (arak?.ervenyes) return null;
  return "arak_ervenyes: null — az `arak.json`-ban nincs `ervenyes` dátum, a USD-összegek forrása dátumozatlan.";
}

/** Az egyeztetett sor pénz-mezői egy helyen, hogy a két ág ne térjen el. */
function penzMezok(modellenkent, arak) {
  const { usd, reszleges, araznatlan } = koltsegUsdReszletes(modellenkent, arak);
  return {
    koltseg_usd: usd,
    koltseg_usd_reszleges: reszleges,
    araznatlan_modellek: araznatlan,
    arak_ervenyes: arak?.ervenyes ?? null,
  };
}

// --- Konvergencia ------------------------------------------------------------

const MARKER = {
  nem_teljesul: /\[nem teljesül\]/g,
  teljesul: /\[teljesül\]/g,
  ketseges: /\[kétséges\]/g,
};

// Kritérium-azonosító: `AR-17`, `K-58`, `KOV-3`, `ÁR-01`. Unicode-nagybetű és
// Unicode-határ: a régi `\b[A-ZÁ…]` alak az ékezetes első betűt határnak vette
// (a `\b` u-flag nélkül csak ASCII-t ismer), így `ÁR-01`-ből `R-01` lett.
const AZONOSITO = /(?<![\p{L}\p{N}])\p{Lu}{1,4}-\d{1,3}(?![\p{L}\p{N}])/gu;

const ITELET_JELOLOK = [
  ["nem", "[nem teljesül]"],
  ["igen", "[teljesül]"],
  ["ketseges", "[kétséges]"],
];

/**
 * Egy jelentéssor ítélete és kritérium-azonosítója — soronként LEGFELJEBB egy.
 *
 * Az ítélet a sor ELSŐ jelölője. Az azonosító az ítéletjelölő előtti első
 * azonosító; ha előtte nincs, a jelölő utáni első (a sor elejéhez legközelebbi).
 * A második ág kell: a `spec-validator` jelentésmintája `1. [teljesül] {feltétel}`,
 * tehát ott a jelölő áll elöl.
 *
 * Korábban a sor MINDEN illeszkedése kritériumnak számított: a `FA-01 [teljesül]
 * UTF-8 kódolás rendben` sorból `UTF-8` is „teljesült kritérium" lett, a
 * `FA-02 [nem teljesül] — lásd FA-03` sorból `FA-03` is „bukott". Két kör között
 * egy ilyen hivatkozás hamis oszcilláció-tiltást adott.
 *
 * Ára: egy több azonosítót felsoroló összegző sorból (`[nem teljesül] AR-1, AR-4`)
 * csak az első kerül be. Ez fail-open irányú hiány — kevesebb oszcillációt lát,
 * hamisat nem.
 */
function sorItelete(sor) {
  let itelet = null;
  let poz = Infinity;
  let hossz = 0;
  for (const [nev, jel] of ITELET_JELOLOK) {
    const i = sor.indexOf(jel);
    if (i !== -1 && i < poz) {
      itelet = nev;
      poz = i;
      hossz = jel.length;
    }
  }
  if (!itelet) return null;
  const elotte = sor.slice(0, poz).match(AZONOSITO);
  const utana = sor.slice(poz + hossz).match(AZONOSITO);
  const id = elotte?.[0] ?? utana?.[0] ?? null;
  return { itelet, id };
}

/**
 * A validátor zárójelentéséből olvassa ki a konvergencia-jelet.
 *
 * Ha EGYETLEN marker sincs a szövegben, `null`-t ad — és ez fontos: a nulla
 * találat mérési hiány, nem „nulla hiba". Ugyanaz az elv, mint hogy a
 * `[kétséges]` nem indít javító kört: amit nem mértünk, arról nem állítunk.
 */
export function konvergencia(szoveg) {
  if (typeof szoveg !== "string" || !szoveg) return null;

  const db = {};
  let ossz = 0;
  for (const [nev, re] of Object.entries(MARKER)) {
    const talalat = szoveg.match(re) ?? [];
    db[nev] = talalat.length;
    ossz += talalat.length;
  }
  if (ossz === 0) return null;

  // Soronként egy ítélet és egy azonosító (lásd `sorItelete`). A `[kétséges]`
  // sor egyik halmazba sem kerül: arról nem állítunk semmit.
  const bukott = new Set();
  const teljesult = new Set();
  for (const sor of szoveg.split("\n")) {
    const it = sorItelete(sor);
    if (!it?.id || it.itelet === "ketseges") continue;
    (it.itelet === "nem" ? bukott : teljesult).add(it.id);
  }

  return {
    nem_teljesul: db.nem_teljesul,
    teljesul: db.teljesul,
    ketseges: db.ketseges,
    bukott_idk: [...bukott],
    teljesult_idk: [...teljesult],
  };
}

// --- Egyeztetés --------------------------------------------------------------

function sessionMappa(transcriptPath) {
  if (typeof transcriptPath !== "string" || !transcriptPath.endsWith(".jsonl")) return null;
  return transcriptPath.slice(0, -".jsonl".length);
}

function jelentesSzoveg(tartalom) {
  if (!Array.isArray(tartalom)) return null;
  const reszek = tartalom.filter((b) => b?.type === "text" && typeof b.text === "string");
  return reszek.length ? reszek.map((b) => b.text).join("\n") : null;
}

/**
 * Félbeszakadt delegálás felismerése.
 *
 * MÉRT TÉNY (admin-orders, `a566bc37caf892fd5`): egy session-limitbe futott,
 * feladatát be NEM fejező validátor `status` mezője is **`completed`**. A
 * `status` tehát alkalmatlan a megszakadás felismerésére — a jelentés szövege
 * az egyetlen jel. Ez azért számít, mert egy csonka validátorkör markerek
 * nélkül érkezik, és marker nélkül a „0 hiba" és a „nem mértük" ugyanúgy néz ki.
 */
const MEGSZAKADT = /Agent terminated early|PARTIAL output recovered|did NOT finish/i;

/** agentId → description a `subagents/*.meta.json`-ból (a fő átirat nem hozza). */
function leirasok(subagents) {
  const ki = new Map();
  try {
    for (const fn of readdirSync(subagents)) {
      if (!fn.endsWith(".meta.json")) continue;
      const meta = readJson(join(subagents, fn), null);
      if (meta?.description) ki.set(fn.replace(/^agent-|\.meta\.json$/g, ""), meta.description);
    }
  } catch {
    /* a leírás kényelmi adat — a mérést nem akaszthatja meg */
  }
  return ki;
}

/**
 * Egy subagent-átirat köreinek listája, időrendben.
 *
 * Egy kör = egy API-válasz (`message.id`), nem egy sor — lásd a fejléc 2. részét.
 * Ugyanannak az üzenetnek a további sora a `usage`-et csak ismétli (nem új
 * fogyasztás), de az időbélyegét és a `SubagentHandback` jelentését hozzávesszük.
 * Körönként: `id`, `modell`, `t` (tokenek), `elso`/`utolso` (ms), `jelentes`.
 */
function korokOlvas(file) {
  const korok = [];
  const index = new Map();
  for (const sor of olvasJsonl(file)) {
    if (sor?.type !== "assistant") continue;
    const u = sor.message?.usage;
    if (!u) continue;
    const modell = sor.message?.model;
    // A `<synthetic>` sorok nem API-hívások (hibaüzenet, megszakítás) — nem
    // fogyasztás, és ártáblájuk sincs.
    if (!modell || modell === "<synthetic>") continue;

    const id = sor.message?.id ?? null;
    let kor = id ? index.get(id) : undefined;
    if (!kor) {
      const cc = u.cache_creation ?? {};
      const t = {
        be: u.input_tokens ?? 0,
        ki: u.output_tokens ?? 0,
        cache_ir_5m: cc.ephemeral_5m_input_tokens ?? 0,
        cache_ir_1h: cc.ephemeral_1h_input_tokens ?? 0,
        cache_olv: u.cache_read_input_tokens ?? 0,
      };
      // Ha a bontás hiányzik, a teljes cache-írás az 5 perces vödörbe megy: az a
      // konzervatívabb (olcsóbb) becslés, és így sosem állítunk túl nagy költséget.
      const teljes = u.cache_creation_input_tokens ?? 0;
      if (t.cache_ir_5m + t.cache_ir_1h === 0 && teljes > 0) t.cache_ir_5m = teljes;
      kor = { id, modell, t, elso: null, utolso: null, jelentes: null };
      korok.push(kor);
      if (id) index.set(id, kor);
    }
    const ts = Date.parse(sor.timestamp ?? "");
    if (!Number.isNaN(ts)) {
      kor.elso ??= ts;
      kor.utolso = ts;
    }
    for (const b of Array.isArray(sor.message?.content) ? sor.message.content : []) {
      if (b?.type === "tool_use" && b.name === "SubagentHandback" && typeof b.input?.message === "string") {
        kor.jelentes = b.input.message;
      }
    }
  }
  return korok;
}

/** Egy subagent-átirat eddigi köreinek száma — a SendMessage-kötés `kor`-a. */
export function korSzam(file) {
  try {
    return korokOlvas(file).length;
  } catch {
    return null;
  }
}

/**
 * Egy kör-szakasz összegzése modellenként bontva. A `jelentes` a szakasz UTOLSÓ
 * `SubagentHandback` üzenete, az `ido_ms` a szakasz első és utolsó sora közti
 * falióra, az `utolso_ts` a szakasz utolsó körének időbélyege (ms).
 */
function osszegez(korok) {
  const modellenkent = {};
  const ossz = { be: 0, ki: 0, cache_ir_5m: 0, cache_ir_1h: 0, cache_olv: 0 };
  let jelentes = null;
  let elso = null;
  let utolso = null;
  for (const kor of korok) {
    if (kor.elso !== null) elso ??= kor.elso;
    if (kor.utolso !== null) utolso = kor.utolso;
    if (kor.jelentes !== null) jelentes = kor.jelentes;
    modellenkent[kor.modell] ??= { be: 0, ki: 0, cache_ir_5m: 0, cache_ir_1h: 0, cache_olv: 0 };
    for (const k of Object.keys(ossz)) {
      ossz[k] += kor.t[k];
      modellenkent[kor.modell][k] += kor.t[k];
    }
  }
  return {
    ossz,
    modellenkent,
    korok: korok.length,
    jelentes,
    ido_ms: elso !== null && utolso !== null ? utolso - elso : null,
    utolso_ts: utolso,
  };
}

/** Egy subagent-átirat összegzése (`kihagy`: ennyi kört az elejéről átugrik). */
function subagentOsszeg(file, kihagy = 0) {
  return osszegez(korokOlvas(file).slice(kihagy));
}

function hatterDelegalas(r) {
  return r?.isAsync === true || r?.status === "async_launched";
}

/**
 * Lezárt, még nem rögzített delegálások összegyűjtése a fő átiratból.
 *
 * „Lezárt" = a fő átiratban MÁR van hozzá `tool_result` (`toolUseResult`).
 * Egy még futó háttéragent félkész átirata így nem mérődik be félmérésként.
 *
 * `most`: a meta-hiány türelmi idejéhez (tesztelhetőség); alapból `Date.now()`.
 */
export function egyeztet({ transcriptPath, futas, most = Date.now() } = {}) {
  // `sulyos`: magát a mérőt nem sikerült elindítani (nincs olvasható átirat, vagy
  // egyetlen sora sem értelmezhető). Ilyenkor a kapu NEM ítélkezhet — a napló megvan
  // ugyan, de nem tudjuk frissíteni, és egy elromlott műszer sosem tilthat munkát. Ez
  // más, mint amikor EGY subagent-átirat hiányzik: az ismert, körülhatárolt hiány, azt
  // `hiba` sorként rögzítjük, és a kapu attól még dolgozik.
  const eredmeny = { ujak: [], hibak: [], sulyos: false };

  const dir = sessionMappa(transcriptPath);
  if (!dir || !existsSync(transcriptPath)) {
    eredmeny.hibak.push("nincs olvasható átirat");
    eredmeny.sulyos = true;
    return eredmeny;
  }

  // A naplót deduplikálva olvassuk (M2-2): egy kettős sor különben a rögzített
  // körszámot is megduplázná, és a folytatás könyvelése elmaradna.
  const naplo = egyediSorok(olvasJsonl(FUTASOK));
  const mar = new Set(naplo.map((s) => s.tool_use_id).filter(Boolean));
  // Háttér-delegálásonként a már rögzített körök száma — a folytatás alapja.
  const rogzitettKor = new Map();
  for (const s of naplo) {
    if (!s.tool_use_id || s.allapot === "hiba") continue;
    rogzitettKor.set(s.tool_use_id, (rogzitettKor.get(s.tool_use_id) ?? 0) + (s.korok ?? 0));
  }
  const keretek = readJson(KERETEK, {});
  const arak = readJson(ARAK, {});
  const subagents = join(dir, "subagents");

  let sorok;
  try {
    ({ sorok } = olvasJsonlReszletes(transcriptPath));
  } catch {
    eredmeny.hibak.push("az átirat nem olvasható");
    eredmeny.sulyos = true;
    return eredmeny;
  }
  // M2-10: egy átirat, amelyből EGYETLEN sor sem értelmezhető, nem „üres session",
  // hanem elromlott műszer: a valódi átiratban a PreToolUse idején már ott van
  // legalább a delegálást kérő assistant-sor. Ilyenkor a kapu nem ítél.
  if (sorok.length === 0) {
    eredmeny.hibak.push("az átiratból egyetlen sor sem értelmezhető");
    eredmeny.sulyos = true;
    return eredmeny;
  }

  const session = transcriptPath.split(/[\\/]/).pop().replace(/\.jsonl$/, "");
  // Kötés híján ez az azonosító: a hívó megadhatja (a hook a már feloldott
  // mostanit adja, a riport a `--futas` értékét), különben ugyanaz a feloldás fut,
  // mint a hookban (env > friss jelző > session).
  const futasAzonosito = futas ?? futasFeloldas({ session });
  // A delegálás IDEJÉN érvényes azonosító (lásd `kotestJegyez`) mindig nyer az
  // egyeztetéskori fölött: a sor annak a futásnak a része, amelyikben elindult.
  const kotesek = kotesekOlvas();
  const futasa = (toolUseId) => kotesek.delegalas.get(toolUseId) ?? futasAzonosito;
  const leirasMap = leirasok(subagents);
  const metaHianyok = metaHianyOlvas();

  const validatorok = keretek.validator_agentek ?? ["spec-validator"];

  for (const sor of sorok) {
    const r = sor?.toolUseResult;
    if (!r || typeof r !== "object" || !r.agentId) continue;

    const blokk = Array.isArray(sor.message?.content)
      ? sor.message.content.find((b) => b?.type === "tool_result")
      : null;
    const toolUseId = blokk?.tool_use_id;
    if (!toolUseId) continue;

    if (hatterDelegalas(r)) {
      hatterEgyeztet({ r, sor, toolUseId });
      continue;
    }

    // MÉRÉSI RÉS (ellenőrizetlen alak): egy ELŐTÉRBEN futott agent SendMessage-
    // folytatása ugyanabba az `agent-<id>.jsonl`-be ír tovább, de hogy a fő
    // átiratban ez milyen `toolUseResult`-ot hagy (van-e `agentId`, ugyanaz-e a
    // `tool_use_id`), nem mértük. Ezért itt NINCS folytatás-könyvelés: a már
    // rögzített `tool_use_id` kimarad, és a folytatás fogyasztása nem kerül a
    // naplóba — a keret alábecsül. Találgatott alakra szándékosan nem építünk;
    // egy valódi átiratból kell kimérni, mielőtt ide kód kerül.
    if (!r.agentType || mar.has(toolUseId)) continue;
    mar.add(toolUseId);

    const atirat = join(subagents, `agent-${r.agentId}.jsonl`);
    if (!existsSync(atirat)) {
      // Fail-open: a delegálás megtörtént, csak nem tudjuk megmérni.
      hibaSor({ toolUseId, agent: r.agentType, ok: `nincs subagent-átirat: agent-${r.agentId}.jsonl` });
      continue;
    }

    const { ossz, modellenkent, korok } = subagentOsszeg(atirat);
    const jelentes = jelentesSzoveg(r.content);
    const megszakadt = typeof jelentes === "string" && MEGSZAKADT.test(jelentes);
    // Csonka delegálásból SOHA nem olvasunk konvergenciát: a félbeszakadt
    // validátor markerei hiányosak, nem javuló mérleget jelentenek.
    const konv = !megszakadt && validatorok.includes(r.agentType) ? konvergencia(jelentes) : null;

    const uj = {
      ts: sor.timestamp ?? new Date().toISOString(),
      futas: futasa(toolUseId),
      session,
      tool_use_id: toolUseId,
      agent: r.agentType,
      leiras: leirasMap.get(r.agentId) ?? null,
      // A `status` mért módon megbízhatatlan (lásd `MEGSZAKADT`): egy csonka
      // delegálásra is `completed`. Rögzítjük, de nem építünk rá.
      status: r.status ?? null,
      kezdo_kor: 1,
      modellek: Object.keys(modellenkent),
      korok,
      token: ossz,
      // NEM a fogyasztás: az utolsó kör kontextusmérete. Lásd a fejlécet.
      zaro_kontextus: typeof r.totalTokens === "number" ? r.totalTokens : null,
      ido_ms: typeof r.totalDurationMs === "number" ? r.totalDurationMs : null,
      koltseg_egyseg: koltsegEgyseg(ossz, keretek.suly),
      ...penzMezok(modellenkent, arak),
      konvergencia: konv,
      allapot: megszakadt
        ? "megszakadt"
        : validatorok.includes(r.agentType) && konv === null
          ? "marker-nelkul"
          : "egyeztetve",
    };

    if (jegyez(uj)) eredmeny.ujak.push(uj);
    else eredmeny.hibak.push("a napló nem írható");
  }

  return eredmeny;

  function hibaSor({ toolUseId, agent, ok, extra = {} }) {
    const hibasor = {
      ts: new Date(most).toISOString(),
      futas: futasa(toolUseId),
      session,
      tool_use_id: toolUseId,
      agent,
      allapot: "hiba",
      ok,
      ...extra,
    };
    if (jegyez(hibasor)) eredmeny.ujak.push(hibasor);
    eredmeny.hibak.push(ok);
  }

  /**
   * Háttér-delegálás egyeztetése a `meta.json` és a subagent-átirat alapján
   * (lásd a fejléc 2. részét). „Lezárt" = `finished: true`; egy még futó agent
   * félkész átirata nem mérődik be. Egy folytatott agent új köre `folytatas` sor.
   */
  function hatterEgyeztet({ r, sor, toolUseId }) {
    const meta = readJson(join(subagents, `agent-${r.agentId}.meta.json`), null);
    const atirat = join(subagents, `agent-${r.agentId}.jsonl`);
    const agent = meta?.agentType ?? null;

    // Még fut (vagy épp folytatják): a következő egyeztetés zárja le. Ennek a
    // hiányzó-átirat vizsgálat ELŐTT kell állnia — egy frissen indított háttéragentnek
    // már van meta-ja, de átirata még nincs, és korábban ez hamis `hiba` sort írt.
    if (meta && meta.finished === false) return;

    // M2-6: a hiányzó meta az ELSŐ észleléskor nem hiba — a hook épp a meta megírása
    // előtt futhatott. Az első észlelést a munkaterületre jegyezzük, és csak egy
    // KÉSŐBBI egyeztetésnél (legalább `META_TURELEM_MS` múlva) lesz belőle `hiba` sor,
    // `elso_eszlelve` mezővel.
    if (!meta) {
      if (mar.has(toolUseId)) return; // már van sora (mért rész vagy hiba): nincs teendő
      const elso = metaHianyok.get(toolUseId);
      if (elso === undefined) {
        metaHianyJegyez({ session, tool_use_id: toolUseId, ts: new Date(most).toISOString() });
        metaHianyok.set(toolUseId, most);
        return;
      }
      if (most - elso < META_TURELEM_MS) return;
      mar.add(toolUseId);
      hibaSor({
        toolUseId,
        agent: null,
        ok: `nincs meta: agent-${r.agentId}.meta.json`,
        extra: { elso_eszlelve: new Date(elso).toISOString() },
      });
      return;
    }

    // A meta van, de nincs benne `finished` (vagy nem logikai): az alak, amire a
    // lezártság épül, nem az, amit mértünk. Korábban ez néma kihagyás volt — most `hiba`.
    if (typeof meta.finished !== "boolean" || !agent || !existsSync(atirat)) {
      if (mar.has(toolUseId)) return;
      mar.add(toolUseId);
      hibaSor({
        toolUseId,
        agent,
        ok: typeof meta.finished !== "boolean"
          ? `a meta-ban nincs \`finished\` mező: agent-${r.agentId}.meta.json`
          : !agent
            ? `a meta-ban nincs agentType: agent-${r.agentId}.meta.json`
            : `nincs subagent-átirat: agent-${r.agentId}.jsonl`,
      });
      return;
    }

    const kesz = rogzitettKor.get(toolUseId) ?? 0;
    const ujKorok = korokOlvas(atirat).slice(kesz);
    if (ujKorok.length === 0) return;
    rogzitettKor.set(toolUseId, kesz + ujKorok.length);
    mar.add(toolUseId);

    // M2-1: a könyveletlen köröket a SendMessage-kötések kör-határai szerint
    // szakaszokra bontjuk: minden kör annak a kötésnek a futásához tartozik, amelyik
    // UTOLJÁRA előzte meg (a kötés `kor`-a kisebb a kör sorszámánál). Kötés híján az
    // eredeti delegálásé. Így egy későbbi SendMessage nem viszi át a korábbi folytatás
    // köreit a saját futásába, és egy futó agentnek küldött második üzenet utáni körök
    // külön sort kapnak.
    const sajatKotesek = celKotesei(kotesek.cel, { session, agentId: r.agentId, nev: meta.name });
    const szakaszok = [];
    ujKorok.forEach((kor, i) => {
      const sorszam = kesz + i + 1;
      const kotes = korKotese(sajatKotesek, sorszam, kor.elso ?? kor.utolso);
      const utolsoSz = szakaszok[szakaszok.length - 1];
      if (utolsoSz && utolsoSz.kotes === kotes) utolsoSz.korok.push(kor);
      else szakaszok.push({ kotes, kezdo: sorszam, korok: [kor] });
    });

    szakaszok.forEach((sz, i) => {
      const { ossz, modellenkent, korok, jelentes, ido_ms, utolso_ts } = osszegez(sz.korok);
      const folytatas = sz.kezdo > 1;
      const utolsoSzakasz = i === szakaszok.length - 1;
      const megszakadt = typeof jelentes === "string" && MEGSZAKADT.test(jelentes);
      const validator = validatorok.includes(agent);
      const konv = !megszakadt && validator ? konvergencia(jelentes) : null;

      const uj = {
        // M2-4: a folytatás-sor ideje a szakasz UTOLSÓ körének időbélyege — az
        // eredeti indítás ideje egy napokkal későbbi folytatást is a múltba tenne.
        ts: folytatas && utolso_ts !== null
          ? new Date(utolso_ts).toISOString()
          : sor.timestamp ?? new Date().toISOString(),
        futas: sz.kotes?.futas ?? futasa(toolUseId),
        session,
        tool_use_id: toolUseId,
        agent,
        leiras: meta.description ?? leirasMap.get(r.agentId) ?? null,
        status: "async",
        // Igaz, ha ez egy SendMessage-dzsel folytatott agent rögzítés utáni része:
        // fogyasztásként számít, új delegálásként nem.
        folytatas,
        kezdo_kor: sz.kezdo,
        // A szakasz azonosítója (a deduplikálás kulcsa): az első kör `message.id`-ja.
        szakasz: sz.korok[0].id ?? `kor-${sz.kezdo}`,
        modellek: Object.keys(modellenkent),
        korok,
        token: ossz,
        zaro_kontextus: null,
        // Falióra a szakasz első és utolsó köre között — egy elakadt, majd
        // folytatott agent állásidejét is tartalmazhatja.
        ido_ms,
        koltseg_egyseg: koltsegEgyseg(ossz, keretek.suly),
        ...penzMezok(modellenkent, arak),
        konvergencia: konv,
        // Egy NEM utolsó, jelentés nélküli szakasz (egy futó agentnek küldött üzenet
        // előtti rész) nem validátorkör, csak fogyasztás: nem `marker-nelkul`.
        allapot: megszakadt
          ? "megszakadt"
          : validator && konv === null && (utolsoSzakasz || jelentes !== null)
            ? "marker-nelkul"
            : "egyeztetve",
      };

      if (jegyez(uj)) eredmeny.ujak.push(uj);
      else eredmeny.hibak.push("a napló nem írható");
    });
  }
}

// --- Meta-hiány türelmi ideje (M2-6) ------------------------------------------
//
// A hiányzó `meta.json` első észlelése gitignore-olt munkaadat, nem napló: csak
// annyit mond, mikor láttuk először. Egy későbbi egyeztetés ebből dönti el, hogy a
// hiány tartós-e. A türelmi idő azért kell, hogy két, ugyanabban a pillanatban
// induló hook (párhuzamos delegálás) ne számítson „későbbi" egyeztetésnek.

export const META_TURELEM_MS = 60 * 1000;
export const META_HIANY = join(MERLEG_SCRATCH, "meta-hiany.jsonl");

function metaHianyOlvas() {
  const ki = new Map();
  for (const s of olvasJsonl(META_HIANY)) {
    const t = Date.parse(s?.ts ?? "");
    if (typeof s?.tool_use_id !== "string" || Number.isNaN(t)) continue;
    if (!ki.has(s.tool_use_id) || t < ki.get(s.tool_use_id)) ki.set(s.tool_use_id, t);
  }
  return ki;
}

function metaHianyJegyez(sor) {
  try {
    mkdirSync(MERLEG_SCRATCH, { recursive: true });
    appendFileSync(META_HIANY, JSON.stringify(sor) + "\n", "utf8");
  } catch {
    /* a türelmi idő kényelmi adat: írási hiba esetén a hiány sosem lesz hiba-sor */
  }
}

// --- Ítélet ------------------------------------------------------------------

const ALAP_KERETEK = {
  keret: { koltseg_egyseg: null, koltseg_usd: null },
  konvergencia: true,
  oszcillacio: true,
  kor_korlat: null,
  validator_agentek: ["spec-validator"],
  javito_agentek: ["spec-implementer", "e2e-test-writer"],
};

function futasSorai(sorok, futas) {
  // Deduplikálva (M2-2): egy kettős validátor-sor különben két „kört" adna, és a
  // második kör `n2 ≥ n1` feltétele hamis konvergencia-tiltást váltana ki.
  return egyediSorok(sorok).filter((s) => s.futas === futas && s.allapot !== "hiba");
}

/**
 * A kapu ítélete a delegálás ELŐTT.
 *
 * Visszatérés: `null`, ha mehet; `{ szabaly, uzenet }`, ha tiltani kell.
 *
 * Két dolgot SOSEM tilt:
 *   - validátor-delegálást — a konvergencia megállásakor is akarjuk a záró mérést;
 *   - olyat, amire nincs adat — hiányzó mérés nem bizonyíték.
 */
export function itelet({ sorok, keretek, futas, agent }) {
  const k = { ...ALAP_KERETEK, ...(keretek ?? {}) };
  if (k.validator_agentek.includes(agent)) return null;

  const enyeim = futasSorai(sorok, futas);
  if (enyeim.length === 0) return null;

  // 1. Futáskeret — ez fogja el azt, amit a körszámláló nem: sok kicsi
  //    delegálást, ami sosem ér el a 2. körig.
  const egyseg = enyeim.reduce((a, s) => a + (s.koltseg_egyseg ?? 0), 0);
  // A RÉSZLEGESEN árazott sor (`koltseg_usd_reszleges`) USD-je önmagában nem
  // tilthat: az ártábla hiányos, és egy hiányos műszer nem állít meg munkát. Ezért a
  // USD-ág csak a teljesen árazott sorokat adja össze; a részleges sor fogyasztása a
  // költség-egységben benne van, és az a kapu.
  const usd = enyeim.reduce((a, s) => a + (s.koltseg_usd_reszleges ? 0 : s.koltseg_usd ?? 0), 0);

  if (k.keret?.koltseg_egyseg && egyseg >= k.keret.koltseg_egyseg) {
    return {
      szabaly: "keret",
      uzenet:
        `A futás elérte a költségkeretet: ${egyseg.toLocaleString("hu-HU")} költség-egység ` +
        `(küszöb ${k.keret.koltseg_egyseg.toLocaleString("hu-HU")}), ${enyeim.length} delegálásból.`,
    };
  }
  if (k.keret?.koltseg_usd && usd >= k.keret.koltseg_usd) {
    return {
      szabaly: "keret",
      uzenet:
        `A futás elérte a költségkeretet: ≈ ${usd.toFixed(2)} USD ` +
        `(küszöb ${k.keret.koltseg_usd} USD), ${enyeim.length} delegálásból.`,
    };
  }

  // A konvergencia- és oszcilláció-szabály csak JAVÍTÓ delegálást tilt: a
  // kutató vagy a teszt-író indítása nem az ismétlődés jele.
  if (!k.javito_agentek.includes(agent)) return null;

  const korok = enyeim.filter((s) => s.konvergencia).map((s) => s.konvergencia);
  if (korok.length < 2) return null;

  const elozo = korok[korok.length - 2];
  const utolso = korok[korok.length - 1];

  // 2. Konvergencia-megállás.
  //    DÖNTÉS (2026-11-06): a 0 → N esetet (egy tiszta kör után újra bukó kör) az
  //    OSZCILLÁCIÓ-szabály fogja (3. pont), ezért ez a szabály SZÁNDÉKOSAN nem — az
  //    `elozo.nem_teljesul > 0` feltétel marad. A tiszta körben minden kritérium
  //    `[teljesül]` volt, így a következő körben bukó azonosító a korábbi körök
  //    teljesült-uniójában van: visszaesés. Teszt: `merok.test.mjs`, „0 → N".
  //    Ismert rés: egy addig EGYIK körben sem `[teljesül]`-nek jelölt (új vagy
  //    azonosító nélküli) kritérium bukását egyik szabály sem tiltja.
  if (k.konvergencia && elozo.nem_teljesul > 0 && utolso.nem_teljesul >= elozo.nem_teljesul) {
    return {
      szabaly: "konvergencia",
      uzenet:
        `A konvergencia megállt: az utolsó két validátorkör [nem teljesül] száma ` +
        `${elozo.nem_teljesul} → ${utolso.nem_teljesul} (nem csökkent). ` +
        `A megmaradt pontok: ${utolso.bukott_idk.join(", ") || "azonosító nélkül"}.`,
    };
  }

  // 3. Oszcilláció — ezt a puszta darabszám elrejti. Az ÖSSZES korábbi kör
  //    teljesült-uniójával hasonlít, nem csak az előzővel: a szabály szövege „egy
  //    korábban teljesült kritérium újra bukik", és az 1. körben teljesült, a 2.-ban
  //    nem mért (vagy `[kétséges]`), a 3.-ban bukó kritérium is visszaesés.
  if (k.oszcillacio) {
    const korabbanTeljesult = new Map(); // azonosító → az utolsó kör sorszáma, amikor teljesült
    korok.slice(0, -1).forEach((kor, i) => {
      for (const id of kor.teljesult_idk ?? []) korabbanTeljesult.set(id, i + 1);
    });
    const visszaesett = (utolso.bukott_idk ?? []).filter((id) => korabbanTeljesult.has(id));
    if (visszaesett.length) {
      const hol = visszaesett.map((id) => `${id} (${korabbanTeljesult.get(id)}. kör)`).join(", ");
      return {
        szabaly: "oszcillacio",
        uzenet:
          `Oszcilláció: ${hol} egy korábbi körben már [teljesül] volt, ` +
          `most újra [nem teljesül]. A javítás körbe-körbe jár.`,
      };
    }
  }

  // 4. Körkorlát — alapból kikapcsolva (`null`), mert a korlátot ma a
  //    `feature-implement` prózája tartja. A hely azért van meg, hogy egy
  //    döntés bekapcsolhassa anélkül, hogy kódot kellene írni hozzá.
  if (k.kor_korlat) {
    const javitok = enyeim.filter((s) => k.javito_agentek.includes(s.agent)).length;
    if (javitok >= k.kor_korlat) {
      return {
        szabaly: "kor_korlat",
        uzenet: `A javító delegálások száma elérte a korlátot: ${javitok} / ${k.kor_korlat}.`,
      };
    }
  }

  return null;
}

/** Segéd a riporthoz: futásonkénti összesítés. */
export function osszesites(sorok) {
  const futasok = new Map();
  const datumok = new Map();
  for (const s of egyediSorok(sorok)) {
    if (!futasok.has(s.futas)) {
      futasok.set(s.futas, {
        futas: s.futas,
        db: 0,
        hibak: 0,
        egyseg: 0,
        usd: 0,
        ido_ms: 0,
        token: { be: 0, ki: 0, cache_ir_5m: 0, cache_ir_1h: 0, cache_olv: 0 },
        agentek: new Map(),
        gorbe: [],
        // Igaz, ha legalább egy sor USD-je részleges (áratlan modell) — az `usd`
        // ilyenkor alsó korlát.
        usd_reszleges: false,
        araznatlan_modellek: [],
        // Az ártábla dátuma; `null`, ha bármelyik árazott sorban hiányzott.
        arak_ervenyes: null,
        // A futás árazott sorainak SAJÁT ártábla-dátumai (rendezve, ismétlés nélkül), és
        // hogy volt-e dátum nélküli árazott sor — a riport ebből írja a forrást.
        arak_datumok: [],
        arak_datum_hiany: false,
        figyelmeztetesek: [],
      });
    }
    const f = futasok.get(s.futas);
    if (s.allapot === "hiba") {
      f.hibak += 1;
      continue;
    }
    // A folytatás fogyasztás, de nem új delegálás.
    if (!s.folytatas) f.db += 1;
    f.egyseg += s.koltseg_egyseg ?? 0;
    f.usd += s.koltseg_usd ?? 0;
    if (s.koltseg_usd_reszleges) f.usd_reszleges = true;
    for (const m of s.araznatlan_modellek ?? []) {
      if (!f.araznatlan_modellek.includes(m)) f.araznatlan_modellek.push(m);
    }
    // Az árazott sorok ártábla-dátuma: a legfrissebb, de ha EGY is hiányzik, `null`.
    if (typeof s.koltseg_usd === "number") {
      const d = datumok.get(f) ?? { hiany: false, max: null, mind: new Set() };
      if (!s.arak_ervenyes) d.hiany = true;
      else {
        d.mind.add(s.arak_ervenyes);
        if (!d.max || s.arak_ervenyes > d.max) d.max = s.arak_ervenyes;
      }
      datumok.set(f, d);
    }
    f.ido_ms += s.ido_ms ?? 0;
    for (const k of Object.keys(f.token)) f.token[k] += s.token?.[k] ?? 0;

    const a = f.agentek.get(s.agent) ?? { db: 0, egyseg: 0, usd: 0 };
    if (!s.folytatas) a.db += 1;
    a.egyseg += s.koltseg_egyseg ?? 0;
    a.usd += s.koltseg_usd ?? 0;
    f.agentek.set(s.agent, a);

    if (s.konvergencia) f.gorbe.push(s.konvergencia.nem_teljesul);
    else if (s.allapot === "marker-nelkul") f.gorbe.push(null);
  }
  for (const f of futasok.values()) {
    const d = datumok.get(f);
    f.arak_ervenyes = d && !d.hiany ? d.max : null;
    f.arak_datumok = d ? [...d.mind].sort() : [];
    f.arak_datum_hiany = Boolean(d?.hiany);
    if (d?.hiany) f.figyelmeztetesek.push(arakFigyelmeztetes(null));
    if (f.usd_reszleges) {
      f.figyelmeztetesek.push(
        `koltseg_usd_reszleges: az USD alsó korlát — áratlan modell(ek): ${f.araznatlan_modellek.join(", ")}. ` +
          "A USD-keret ezekre a sorokra nem tilt; a költség-egység a kapu.",
      );
    }
  }
  return [...futasok.values()];
}

/**
 * A riport pénz-sora egy `osszesites` futásához (SB2-2). A forrás a futás SAJÁT
 * soraiban rögzített `arak_ervenyes` dátum — nem a mai `arak.json`-é, mert egy régi
 * futás a régi árakkal lett levezetve. Több dátumnál `vegyes: d1, d2`; dátum nélküli
 * árazott sornál `dátum nélkül` is a listába kerül. Részleges összeg (áratlan modell)
 * alsó korlát: `≥ X USD (részleges, áratlan: …)`. `null`, ha nincs USD.
 */
export function usdSzoveg(f) {
  if (!f || !(f.usd > 0)) return null;
  const datumok = [...(f.arak_datumok ?? []), ...(f.arak_datum_hiany ? ["dátum nélkül"] : [])];
  const forras =
    datumok.length === 0 ? "dátum nélkül" : datumok.length === 1 ? datumok[0] : `vegyes: ${datumok.join(", ")}`;
  const osszeg = f.usd.toFixed(2);
  return f.usd_reszleges
    ? `≥ ${osszeg} USD (részleges, áratlan: ${(f.araznatlan_modellek ?? []).join(", ") || "?"}) · arak.json, ${forras}`
    : `≈ ${osszeg} USD (arak.json, ${forras})`;
}

/**
 * A legutóbbi futás azonosítója a naplóból (a `futas-merleg` `--utolso` kapcsolójához).
 *
 * „Legutóbbi" = a legkésőbbi `ts`-ű sor futása; azonos vagy hiányzó `ts` esetén a
 * fájlban későbbi sor nyer (a napló csak hozzáírással bővül). A `hiba` sorok is
 * számítanak: egy futás, amelynek csak mérhetetlen delegálása volt, attól még futás.
 * Üres vagy futás-azonosító nélküli naplóra `null`.
 */
export function utolsoFutas(sorok) {
  let legjobb = null;
  let legjobbTs = -Infinity;
  for (const s of Array.isArray(sorok) ? sorok : []) {
    if (!s || typeof s.futas !== "string" || !s.futas) continue;
    const ts = Date.parse(s.ts ?? "");
    const t = Number.isNaN(ts) ? legjobbTs : ts;
    if (t >= legjobbTs) {
      legjobbTs = t;
      legjobb = s.futas;
    }
  }
  return legjobb;
}

export { ALAP_KERETEK };
