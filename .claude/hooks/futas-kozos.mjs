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

// --- Alap I/O ----------------------------------------------------------------

export function readJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}

export function olvasJsonl(file) {
  if (!existsSync(file)) return [];
  const ki = [];
  for (const sor of readFileSync(file, "utf8").split("\n")) {
    if (!sor.trim()) continue;
    try {
      ki.push(JSON.parse(sor));
    } catch {
      /* egy sérült sor ne vigye el az egész naplót */
    }
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
 * Pénz — csak akkor, ha az `arak.json`-ban VAN sor az adott modellre.
 * Ismeretlen modellre `null`-t ad vissza, nem nullát: a hiányzó ár nem
 * ingyenes delegálás. A hívó a `koltseg_egyseg`-re esik vissza.
 */
export function koltsegUsd(modellenkent, arak) {
  const tabla = arak?.modellek ?? {};
  let ossz = 0;
  let volt = false;

  for (const [modell, t] of Object.entries(modellenkent)) {
    const ar = tabla[modell];
    if (!ar) continue;
    volt = true;
    const be = ar.be_millio ?? 0;
    const ki = ar.ki_millio ?? 0;
    ossz +=
      ((t.be ?? 0) * be +
        (t.ki ?? 0) * ki +
        (t.cache_ir_5m ?? 0) * be * 1.25 +
        (t.cache_ir_1h ?? 0) * be * 2 +
        (t.cache_olv ?? 0) * be * 0.1) /
      1_000_000;
  }

  return volt ? Math.round(ossz * 10000) / 10000 : null;
}

// --- Konvergencia ------------------------------------------------------------

const MARKER = {
  nem_teljesul: /\[nem teljesül\]/g,
  teljesul: /\[teljesül\]/g,
  ketseges: /\[kétséges\]/g,
};

// Kritérium-azonosító: `AR-17`, `K-58`, `KOV-3`. Ékezetes nagybetűt is enged,
// mert a spec-mappák magyar rövidítéseket használnak.
const AZONOSITO = /\b[A-ZÁÉÍÓÖŐÚÜŰ]{1,4}-\d{1,3}\b/g;

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

  // A bukott azonosítók: a `[nem teljesül]` markert tartalmazó sorokból.
  const bukott = new Set();
  const teljesult = new Set();
  for (const sor of szoveg.split("\n")) {
    const nem = sor.includes("[nem teljesül]");
    const igen = !nem && sor.includes("[teljesül]");
    if (!nem && !igen) continue;
    for (const id of sor.match(AZONOSITO) ?? []) (nem ? bukott : teljesult).add(id);
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

/** Egy subagent-átirat összegzése körönként, modellenként bontva. */
function subagentOsszeg(file) {
  const modellenkent = {};
  const ossz = { be: 0, ki: 0, cache_ir_5m: 0, cache_ir_1h: 0, cache_olv: 0 };
  let korok = 0;

  for (const sor of olvasJsonl(file)) {
    if (sor?.type !== "assistant") continue;
    const u = sor.message?.usage;
    if (!u) continue;
    const modell = sor.message?.model;
    // A `<synthetic>` sorok nem API-hívások (hibaüzenet, megszakítás) — nem
    // fogyasztás, és ártáblájuk sincs.
    if (!modell || modell === "<synthetic>") continue;

    korok += 1;
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
    const bontasOssz = t.cache_ir_5m + t.cache_ir_1h;
    const teljes = u.cache_creation_input_tokens ?? 0;
    if (bontasOssz === 0 && teljes > 0) t.cache_ir_5m = teljes;

    modellenkent[modell] ??= { be: 0, ki: 0, cache_ir_5m: 0, cache_ir_1h: 0, cache_olv: 0 };
    for (const k of Object.keys(ossz)) {
      ossz[k] += t[k];
      modellenkent[modell][k] += t[k];
    }
  }

  return { ossz, modellenkent, korok };
}

/**
 * Lezárt, még nem rögzített delegálások összegyűjtése a fő átiratból.
 *
 * „Lezárt" = a fő átiratban MÁR van hozzá `tool_result` (`toolUseResult`).
 * Egy még futó háttéragent félkész átirata így nem mérődik be félmérésként.
 */
export function egyeztet({ transcriptPath, futas } = {}) {
  // `sulyos`: magát a mérőt nem sikerült elindítani (nincs olvasható átirat).
  // Ilyenkor a kapu NEM ítélkezhet — a napló megvan ugyan, de nem tudjuk
  // frissíteni, és egy elromlott műszer sosem tilthat munkát. Ez más, mint
  // amikor EGY subagent-átirat hiányzik: az ismert, körülhatárolt hiány, azt
  // `hiba` sorként rögzítjük, és a kapu attól még dolgozik.
  const eredmeny = { ujak: [], hibak: [], sulyos: false };

  const dir = sessionMappa(transcriptPath);
  if (!dir || !existsSync(transcriptPath)) {
    eredmeny.hibak.push("nincs olvasható átirat");
    eredmeny.sulyos = true;
    return eredmeny;
  }

  const mar = new Set(olvasJsonl(FUTASOK).map((s) => s.tool_use_id).filter(Boolean));
  const keretek = readJson(KERETEK, {});
  const arak = readJson(ARAK, {});
  const subagents = join(dir, "subagents");

  let sorok;
  try {
    sorok = olvasJsonl(transcriptPath);
  } catch {
    eredmeny.hibak.push("az átirat nem olvasható");
    eredmeny.sulyos = true;
    return eredmeny;
  }

  const session = transcriptPath.split(/[\\/]/).pop().replace(/\.jsonl$/, "");
  const futasAzonosito = futas ?? process.env.FUTAS_AZONOSITO ?? session;
  const leirasMap = leirasok(subagents);

  for (const sor of sorok) {
    const r = sor?.toolUseResult;
    if (!r || typeof r !== "object" || !r.agentType || !r.agentId) continue;

    const blokk = Array.isArray(sor.message?.content)
      ? sor.message.content.find((b) => b?.type === "tool_result")
      : null;
    const toolUseId = blokk?.tool_use_id;
    if (!toolUseId || mar.has(toolUseId)) continue;
    mar.add(toolUseId);

    const atirat = join(subagents, `agent-${r.agentId}.jsonl`);
    if (!existsSync(atirat)) {
      // Fail-open: a delegálás megtörtént, csak nem tudjuk megmérni.
      const hibasor = {
        ts: new Date().toISOString(),
        futas: futasAzonosito,
        session,
        tool_use_id: toolUseId,
        agent: r.agentType,
        allapot: "hiba",
        ok: `nincs subagent-átirat: agent-${r.agentId}.jsonl`,
      };
      if (jegyez(hibasor)) eredmeny.ujak.push(hibasor);
      eredmeny.hibak.push(hibasor.ok);
      continue;
    }

    const { ossz, modellenkent, korok } = subagentOsszeg(atirat);
    const validatorok = keretek.validator_agentek ?? ["spec-validator"];
    const jelentes = jelentesSzoveg(r.content);
    const megszakadt = typeof jelentes === "string" && MEGSZAKADT.test(jelentes);
    // Csonka delegálásból SOHA nem olvasunk konvergenciát: a félbeszakadt
    // validátor markerei hiányosak, nem javuló mérleget jelentenek.
    const konv = !megszakadt && validatorok.includes(r.agentType) ? konvergencia(jelentes) : null;

    const uj = {
      ts: sor.timestamp ?? new Date().toISOString(),
      futas: futasAzonosito,
      session,
      tool_use_id: toolUseId,
      agent: r.agentType,
      leiras: leirasMap.get(r.agentId) ?? null,
      // A `status` mért módon megbízhatatlan (lásd `MEGSZAKADT`): egy csonka
      // delegálásra is `completed`. Rögzítjük, de nem építünk rá.
      status: r.status ?? null,
      modellek: Object.keys(modellenkent),
      korok,
      token: ossz,
      // NEM a fogyasztás: az utolsó kör kontextusmérete. Lásd a fejlécet.
      zaro_kontextus: typeof r.totalTokens === "number" ? r.totalTokens : null,
      ido_ms: typeof r.totalDurationMs === "number" ? r.totalDurationMs : null,
      koltseg_egyseg: koltsegEgyseg(ossz, keretek.suly),
      koltseg_usd: koltsegUsd(modellenkent, arak),
      arak_ervenyes: arak?.ervenyes ?? null,
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
  return sorok.filter((s) => s.futas === futas && s.allapot !== "hiba");
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
  const usd = enyeim.reduce((a, s) => a + (s.koltseg_usd ?? 0), 0);

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
  if (k.konvergencia && elozo.nem_teljesul > 0 && utolso.nem_teljesul >= elozo.nem_teljesul) {
    return {
      szabaly: "konvergencia",
      uzenet:
        `A konvergencia megállt: az utolsó két validátorkör [nem teljesül] száma ` +
        `${elozo.nem_teljesul} → ${utolso.nem_teljesul} (nem csökkent). ` +
        `A megmaradt pontok: ${utolso.bukott_idk.join(", ") || "azonosító nélkül"}.`,
    };
  }

  // 3. Oszcilláció — ezt a puszta darabszám elrejti.
  if (k.oszcillacio) {
    const visszaesett = utolso.bukott_idk.filter((id) => elozo.teljesult_idk.includes(id));
    if (visszaesett.length) {
      return {
        szabaly: "oszcillacio",
        uzenet:
          `Oszcilláció: ${visszaesett.join(", ")} az előző körben még [teljesül] volt, ` +
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
  for (const s of sorok) {
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
      });
    }
    const f = futasok.get(s.futas);
    if (s.allapot === "hiba") {
      f.hibak += 1;
      continue;
    }
    f.db += 1;
    f.egyseg += s.koltseg_egyseg ?? 0;
    f.usd += s.koltseg_usd ?? 0;
    f.ido_ms += s.ido_ms ?? 0;
    for (const k of Object.keys(f.token)) f.token[k] += s.token?.[k] ?? 0;

    const a = f.agentek.get(s.agent) ?? { db: 0, egyseg: 0, usd: 0 };
    a.db += 1;
    a.egyseg += s.koltseg_egyseg ?? 0;
    a.usd += s.koltseg_usd ?? 0;
    f.agentek.set(s.agent, a);

    if (s.konvergencia) f.gorbe.push(s.konvergencia.nem_teljesul);
    else if (s.allapot === "marker-nelkul") f.gorbe.push(null);
  }
  return [...futasok.values()];
}

export { ALAP_KERETEK };
