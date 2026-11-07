#!/usr/bin/env node
// A futás élő nézete — „hol tartunk" a böngészőben, minden lánc-futás alatt.
//
// A `futas-merleg.mjs` utólag mondja meg, mi fogyott; ez a nézet KÖZBEN mutatja, mi történik:
// a lánc fázisait (Spec → Felderítés → Implementáció ∥ e2e-írás → Integráció → E2E futás →
// Validálás → Javító kör → Unit ∥ dokumentáció → Zárás), agentenként egy sávot az idővonalon,
// eszközhívásonként egy pöttyöt (olvas / ír / parancs / guard-tiltás), a tokeneket és a becsült
// költséget, a worktree-k változásait, a stack állapotát és a párhuzamossági szorzót.
//
// Forrás: a session-átiratok (~/.claude/projects/<projekt>/<session>.jsonl és
// <session>/subagents/agent-*.jsonl + .meta.json), a futásjelző
// (.scratch/futas-merleg/aktiv-futas.json), a `git worktree list` és a két port. SEMMIT nem ír,
// semmit nem indít, és a mérlegbe nem könyvel — az a hook és a `futas-merleg.mjs` dolga.
//
// A session-átirat a munkaterületen kívül van. Ezt a nézetet a fejlesztő 2026-11-07-én
// kifejezetten jóváhagyta arra, hogy minden lánc-futásnál olvassa (csak olvassa); a
// `futas-merleg.mjs --atirat` jóváhagyási szabálya ettől független, az ír.
//
// Függőség nélkül fut (node:http), és SZÁNDÉKOSAN csak 127.0.0.1-re köt: az átiratokban a
// teljes promptok és parancsok benne vannak, ez a nézet nem mehet ki a gépről.
//
// Indítás (a repó gyökeréből, háttérben — a lánc 0/c. lépése ezt hívja):
//   node .claude/skills/futas-merleg/scripts/elo-nezet.mjs [--port 4300] [--cel-perc 20]
//        [--session <id>] [--since <ISO-idő>]
// Idempotens: ha a porton már ez a nézet fut, kiírja a címét, és 0-val kilép.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);

// --- Argumentumok ----------------------------------------------------------

function arg(nev, alap) {
  const i = process.argv.indexOf(`--${nev}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : alap;
}

if (process.argv.includes("--help")) {
  console.log(
    "Használat: node .claude/skills/futas-merleg/scripts/elo-nezet.mjs " +
      "[--port 4300] [--cel-perc N] [--session <id>] [--since <ISO>] [--projekt-dir <dir>]",
  );
  process.exit(0);
}

const PORT = Number(arg("port", "4300"));
const SESSION_FIX = arg("session", null);
const SINCE_FIX = arg("since", null);
// Opcionális cél-idő (perc): bemutatón piros függőleges vonal az idővonalon. 0 = nincs.
const CEL_PERC = Number(arg("cel-perc", "0"));

// A repó gyökere: a szkript helyétől felfelé az első mappa, amiben `.git` van (egy worktree-ben
// a `.git` fájl, nem mappa — az is jó).
function repoGyoker() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const fel = path.dirname(dir);
    if (fel === dir) return process.cwd();
    dir = fel;
  }
}
const REPO = repoGyoker();

// A Claude Code a projekt abszolút útvonalából képzi a mappanevet: minden nem alfanumerikus
// karakter kötőjel. Windowson a meghajtóbetű kis- és nagybetűs alakja is előfordul.
function projektMappa() {
  const fix = arg("projekt-dir", null);
  if (fix) return fix;
  const slug = REPO.replace(/[^a-zA-Z0-9]/g, "-");
  const alap = path.join(os.homedir(), ".claude", "projects");
  for (const nev of [slug, slug.charAt(0).toLowerCase() + slug.slice(1)]) {
    const p = path.join(alap, nev);
    if (fs.existsSync(p)) return p;
  }
  return path.join(alap, slug);
}
const PROJEKT = projektMappa();

// --- Árak (a mérleg saját ártáblájából, hogy a két szám ugyanabból jöjjön) --

function arak() {
  try {
    const t = JSON.parse(
      fs.readFileSync(path.join(REPO, "docs/orchestration/_kontextus/arak.json"), "utf8"),
    );
    return t.modellek ?? {};
  } catch {
    return {};
  }
}
const ARAK = arak();

function koltsegUsd(modell, u) {
  const ar = ARAK[String(modell ?? "").replace(/-\d{8}$/, "")];
  if (!ar) return null;
  const be = ar.be_millio / 1e6;
  const olv = (ar.cache_olv_millio ?? ar.be_millio * 0.1) / 1e6;
  const ir5 = (ar.cache_ir_5m_millio ?? ar.be_millio * 1.25) / 1e6;
  const ir1 = (ar.cache_ir_1h_millio ?? ar.be_millio * 2) / 1e6;
  return u.be * be + u.ki * (ar.ki_millio / 1e6) + u.olv * olv + u.ir5 * ir5 + u.ir1 * ir1;
}

// --- Inkrementális JSONL-olvasó --------------------------------------------
// Minden lekérdezésnél csak az új, teljes sorokat dolgozza fel. Egy félig kiírt utolsó sor
// a következő körre marad.

class Farok {
  constructor(fajl, onLine) {
    this.fajl = fajl;
    this.onLine = onLine;
    this.offset = 0;
    this.maradek = "";
  }
  olvas() {
    let st;
    try {
      st = fs.statSync(this.fajl);
    } catch {
      return;
    }
    if (st.size < this.offset) {
      this.offset = 0;
      this.maradek = "";
    }
    if (st.size === this.offset) return;
    const fd = fs.openSync(this.fajl, "r");
    try {
      const buf = Buffer.alloc(st.size - this.offset);
      fs.readSync(fd, buf, 0, buf.length, this.offset);
      this.offset = st.size;
      const sorok = (this.maradek + buf.toString("utf8")).split("\n");
      this.maradek = sorok.pop() ?? "";
      for (const s of sorok) {
        if (!s.trim()) continue;
        try {
          this.onLine(JSON.parse(s));
        } catch {
          /* sérült sor: kihagyjuk, a nézet nem állhat meg miatta */
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  }
}

// --- Egy sáv (agent vagy a fő session) állapota ---------------------------

const OLVAS = new Set(["Read", "Grep", "Glob", "LS"]);
const IR = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);
const PARANCS = new Set(["Bash", "PowerShell"]);
const DELEGAL = new Set(["Agent", "Task", "SendMessage"]);

function fajta(nev) {
  if (OLVAS.has(nev)) return "olvas";
  if (IR.has(nev)) return "ir";
  if (PARANCS.has(nev)) return "parancs";
  if (DELEGAL.has(nev)) return "delegal";
  return "egyeb";
}

function rovid(s, n = 110) {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// Egy útvonalat a repó- vagy worktree-gyökérhez képest mutat — a teljes abszolút útvonal a
// kivetítőn olvashatatlan.
function relativ(p) {
  if (!p) return "";
  let s = String(p).replace(/\\/g, "/");
  const r = REPO.replace(/\\/g, "/");
  const i = s.toLowerCase().indexOf(r.toLowerCase());
  if (i >= 0) s = s.slice(i + r.length).replace(/^\//, "");
  const wt = s.match(/^\.claude\/worktrees\/([A-Za-z0-9._-]+)\/(.*)$/);
  return wt ? `[${wt[1]}] ${wt[2]}` : s;
}

function cimke(nev, input = {}) {
  if (input.file_path) return `${nev} ${relativ(input.file_path)}`;
  if (input.command) return `${nev} ${rovid(input.command, 90)}`;
  if (input.pattern) return `${nev} ${rovid(input.pattern, 60)}`;
  if (nev === "Agent" || nev === "Task")
    return `${nev} → ${input.subagent_type ?? "?"}: ${rovid(input.description, 50)}`;
  if (nev === "SendMessage") return `${nev} → ${input.to ?? "?"}`;
  return nev;
}

// Csak valódi mappanév: a parancsszövegekben `{feature}-impl`-féle helyőrzők is előfordulnak.
function worktreeNeve(p) {
  const m = String(p ?? "")
    .replace(/\\/g, "/")
    .match(/\.claude\/worktrees\/([A-Za-z0-9._-]+)(?:\/|\s|"|$)/);
  return m ? m[1] : null;
}

function tartalomSzoveg(c) {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b === "string" ? b : b?.text ?? "")).join(" ");
  return "";
}

class Sav {
  constructor(id) {
    this.id = id;
    this.tipus = null;
    this.leiras = "";
    this.kesz = false;
    this.kezdet = null;
    this.utolso = null;
    this.modell = null;
    this.uzenetek = new Map(); // message.id → usage (mezőnkénti maximum: egy válasz több sor)
    this.eszkozok = [];
    this.eszkozById = new Map();
    this.irt = new Set();
    this.worktreek = new Set();
    this.hibak = 0;
    this.tiltasok = 0;
    this.csakFoSession = false;
  }

  sor(o) {
    if (this.csakFoSession && o.isSidechain) return;
    const ts = o.timestamp ? Date.parse(o.timestamp) : null;
    if (ts) {
      if (this.kezdet === null || ts < this.kezdet) this.kezdet = ts;
      if (this.utolso === null || ts > this.utolso) this.utolso = ts;
    }
    const m = o.message;
    if (o.type === "assistant" && m) {
      if (m.model) this.modell = m.model;
      const u = m.usage;
      if (u && m.id) {
        const elozo = this.uzenetek.get(m.id) ?? { be: 0, ki: 0, olv: 0, ir5: 0, ir1: 0 };
        const ir1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
        const ir5 =
          u.cache_creation?.ephemeral_5m_input_tokens ??
          Math.max(0, (u.cache_creation_input_tokens ?? 0) - ir1);
        this.uzenetek.set(m.id, {
          be: Math.max(elozo.be, u.input_tokens ?? 0),
          ki: Math.max(elozo.ki, u.output_tokens ?? 0),
          olv: Math.max(elozo.olv, u.cache_read_input_tokens ?? 0),
          ir5: Math.max(elozo.ir5, ir5),
          ir1: Math.max(elozo.ir1, ir1),
          modell: m.model,
          t: elozo.t ?? ts,
        });
      }
      for (const b of Array.isArray(m.content) ? m.content : []) {
        if (b.type !== "tool_use") continue;
        const parancs = b.input?.command ?? "";
        const fp = b.input?.file_path ?? b.input?.notebook_path;
        const e = {
          t: ts,
          nev: b.name,
          fajta: fajta(b.name),
          cimke: cimke(b.name, b.input),
          parancs: typeof parancs === "string" ? parancs : "",
          irtFajl: IR.has(b.name) && fp ? relativ(fp) : "",
          ok: null,
          tiltva: false,
        };
        this.eszkozok.push(e);
        this.eszkozById.set(b.id, e);
        if (IR.has(b.name) && fp) this.irt.add(relativ(fp));
        const wt = worktreeNeve(fp) ?? worktreeNeve(e.parancs);
        if (wt) this.worktreek.add(wt);
      }
    } else if (o.type === "user" && Array.isArray(m?.content)) {
      for (const b of m.content) {
        if (b.type !== "tool_result") continue;
        const e = this.eszkozById.get(b.tool_use_id);
        const szoveg = tartalomSzoveg(b.content);
        // A guard tiltása így érkezik vissza: „PreToolUse:Bash hook error: Parancs megtagadva …"
        const tiltas = /^PreToolUse:\w+ hook/.test(szoveg);
        if (e) {
          e.ok = tiltas ? false : !b.is_error;
          e.tiltva = tiltas;
          if (tiltas) e.megj = rovid(szoveg.replace(/^PreToolUse:\w+ hook error:\s*/, ""), 140);
        }
        if (tiltas) this.tiltasok++;
        else if (b.is_error) this.hibak++;
      }
    }
  }

  // `ota`: csak az ennél nem korábbi válaszok — a fő session a futás előtti munkát is hordozza.
  tokenek(ota = null) {
    const s = { be: 0, ki: 0, olv: 0, ir5: 0, ir1: 0, usd: 0, usdHianyos: false, korok: 0 };
    for (const u of this.uzenetek.values()) {
      if (ota && u.t && u.t < ota) continue;
      s.korok++;
      s.be += u.be;
      s.ki += u.ki;
      s.olv += u.olv;
      s.ir5 += u.ir5;
      s.ir1 += u.ir1;
      const k = koltsegUsd(u.modell, u);
      if (k === null) s.usdHianyos = true;
      else s.usd += k;
    }
    return s;
  }
}

// --- A session követése ----------------------------------------------------

function legfrissebbSession() {
  if (SESSION_FIX) return SESSION_FIX;
  let best = null;
  try {
    for (const f of fs.readdirSync(PROJEKT)) {
      if (!f.endsWith(".jsonl")) continue;
      const st = fs.statSync(path.join(PROJEKT, f));
      if (!best || st.mtimeMs > best.mtime) best = { id: f.slice(0, -6), mtime: st.mtimeMs };
    }
  } catch {
    /* nincs még projektmappa */
  }
  return best?.id ?? null;
}

let session = null;
let foSav = null;
let foFarok = null;
const savok = new Map(); // agentId → { sav, farok }

function sessionValtas(id) {
  session = id;
  savok.clear();
  foSav = new Sav("orchestrator");
  foSav.tipus = "orchestrátor";
  foSav.leiras = "fő session";
  foSav.csakFoSession = true;
  foFarok = id ? new Farok(path.join(PROJEKT, `${id}.jsonl`), (o) => foSav.sor(o)) : null;
}

function frissit() {
  const id = legfrissebbSession();
  if (id !== session) sessionValtas(id);
  if (!session) return;
  foFarok?.olvas();
  const dir = path.join(PROJEKT, session, "subagents");
  let fajlok = [];
  try {
    fajlok = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const f of fajlok) {
    const m = f.match(/^agent-(.+)\.jsonl$/);
    if (!m) continue;
    let bejegyzes = savok.get(m[1]);
    if (!bejegyzes) {
      const sav = new Sav(m[1]);
      bejegyzes = { sav, farok: new Farok(path.join(dir, f), (o) => sav.sor(o)) };
      savok.set(m[1], bejegyzes);
    }
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, `agent-${m[1]}.meta.json`), "utf8"));
      bejegyzes.sav.tipus = meta.agentType ?? bejegyzes.sav.tipus;
      bejegyzes.sav.leiras = meta.description ?? bejegyzes.sav.leiras;
      bejegyzes.sav.kesz = meta.finished === true;
    } catch {
      /* a meta a delegálás elején még hiányozhat */
    }
    bejegyzes.farok.olvas();
  }
}

// --- Futásjelző, worktree-k, stack ----------------------------------------

function futasJelzo() {
  try {
    const j = JSON.parse(
      fs.readFileSync(path.join(REPO, ".scratch/futas-merleg/aktiv-futas.json"), "utf8"),
    );
    const kezdet = Date.parse(j.kezdet);
    return Number.isFinite(kezdet) && j.futas ? { nev: j.futas, kezdet } : null;
  } catch {
    return null;
  }
}

// A lánc a végén törli a jelzőt — a nézet ettől még a lezárt futást mutatja tovább, amíg új
// futás nem indul. Különben a záró pillanatban eltűnne minden, amit a közönség nézett.
let emlekJelzo = null;

let worktreeAllapot = [];
let utolsoWorktree = 0;

async function git(args, cwd = REPO) {
  const { stdout } = await execFileP("git", args, { cwd, timeout: 4000, windowsHide: true });
  return stdout;
}

async function worktreekFrissit() {
  if (Date.now() - utolsoWorktree < 3000) return;
  utolsoWorktree = Date.now();
  try {
    const lista = await git(["worktree", "list", "--porcelain"]);
    const fak = [];
    let akt = null;
    for (const s of lista.split("\n")) {
      if (s.startsWith("worktree ")) {
        akt = { ut: s.slice(9).trim(), ag: "" };
        fak.push(akt);
      } else if (s.startsWith("branch ") && akt) akt.ag = s.slice(7).replace("refs/heads/", "");
    }
    worktreeAllapot = await Promise.all(
      fak.map(async (f) => {
        const nev = worktreeNeve(`${f.ut}/`) ?? "fő fa";
        try {
          const sorok = (await git(["status", "--porcelain"], f.ut)).split("\n").filter(Boolean);
          const stat = await git(["diff", "--shortstat", "HEAD"], f.ut);
          return {
            nev,
            ag: f.ag,
            valtozott: sorok.length,
            uj: sorok.filter((x) => x.startsWith("??")).length,
            plusz: Number(stat.match(/(\d+) insertion/)?.[1] ?? 0),
            minusz: Number(stat.match(/(\d+) deletion/)?.[1] ?? 0),
            fajlok: sorok.slice(0, 6).map((x) => x.slice(3)),
          };
        } catch {
          return { nev, ag: f.ag, valtozott: null };
        }
      }),
    );
  } catch {
    worktreeAllapot = [];
  }
}

let stack = { be: null, fe: null };
let utolsoStack = 0;

async function stackFrissit() {
  if (Date.now() - utolsoStack < 2000) return;
  utolsoStack = Date.now();
  const proba = async (url) => {
    try {
      return (await fetch(url, { signal: AbortSignal.timeout(800) })).ok;
    } catch {
      return false;
    }
  };
  const [be, fe] = await Promise.all([
    proba("http://localhost:3001/api/health"),
    proba("http://localhost:5173/"),
  ]);
  stack = { be, fe };
}

// --- „Hol tartunk" — a lánc fázisai ---------------------------------------
// A fázist nem a skill mondja be, hanem a nézet vezeti le abból, ami ténylegesen történt: melyik
// agent-típus futott (a meta `agentType`-ja), és milyen parancsot adott ki a fő session. Ezért
// minden lánc-alakra működik (alapértelmezett, csomagolt, párhuzamos), és nem kell hozzá
// semmilyen jelzést küldeni. Amit nem lát, azt nem találja ki: egy sosem látott fázis „vár",
// vagy „kihagyva", ha egy későbbi már elindult.

const FAZISOK = [
  { k: "indulas", nev: "Indulás" },
  // A spec-írás jele a `spec/` alá írás és a validátora — egy `AskUserQuestion` önmagában nem
  // az, mert a lánc menet közben is kérdez (újraindítás, `down -v`).
  { k: "spec", nev: "Spec", fo: /spec-ellenoriz\.mjs/, foFajl: /^spec\// },
  { k: "kutatas", nev: "Felderítés", agentek: ["spec-researcher"] },
  { k: "impl", nev: "Implementáció ∥ e2e-írás", agentek: ["spec-implementer", "e2e-test-writer"], elott: true },
  { k: "integracio", nev: "Integráció", fo: /\bgit\b.*\bmerge\b/ },
  { k: "e2e", nev: "E2E futás", fo: /npm run e2e/ },
  { k: "validalas", nev: "Validálás", agentek: ["spec-validator"] },
  { k: "javitas", nev: "Javító kör", agentek: ["spec-implementer", "e2e-test-writer"], utan: true },
  { k: "unit", nev: "Unit-teszt ∥ dokumentáció", agentek: ["java-unit-test-writer", "docs-api-writer"] },
  { k: "zaras", nev: "Zárás", fo: /\brm\b.*aktiv-futas\.json/ },
];

function fazisok({ kezdet, agentek, foEszkozok, lezarva, most }) {
  const validatorok = agentek.filter((s) => s.tipus === "spec-validator");
  const elsoValidatorVege = validatorok.length
    ? Math.min(...validatorok.map((s) => (s.fut ? Infinity : s.vege)))
    : Infinity;

  const eredmeny = FAZISOK.map((f) => {
    let kezd = null;
    let vege = null;
    let fut = false;
    let db = 0;
    if (f.k === "indulas") {
      kezd = kezdet;
      const elsoMas = agentek.length ? Math.min(...agentek.map((s) => s.kezdet)) : null;
      vege = elsoMas;
    } else if (f.agentek) {
      const tagok = agentek.filter(
        (s) =>
          f.agentek.includes(s.tipus) &&
          (!f.elott || s.kezdet < elsoValidatorVege) &&
          (!f.utan || s.kezdet >= elsoValidatorVege),
      );
      db = tagok.length;
      if (db) {
        kezd = Math.min(...tagok.map((s) => s.kezdet));
        vege = Math.max(...tagok.map((s) => s.vege));
        fut = tagok.some((s) => s.fut);
      }
    } else {
      const talalat = foEszkozok.filter(
        (e) => (f.fo && f.fo.test(e.parancs)) || (f.foFajl && f.foFajl.test(e.irtFajl)),
      );
      db = talalat.length;
      if (db) {
        kezd = talalat[0].t;
        vege = talalat[talalat.length - 1].t;
      }
    }
    return { k: f.k, nev: f.nev, kezd, vege, fut, db };
  });

  // Parancs-alapú fázis addig „fut", amíg utána nem indult más fázis; a lezárt futásban semmi.
  const legutobbi = eredmeny.filter((f) => f.kezd !== null).sort((a, b) => b.kezd - a.kezd)[0];
  return eredmeny.map((f, i) => {
    let allapot;
    if (f.kezd === null) {
      allapot = eredmeny.slice(i + 1).some((x) => x.kezd !== null) ? "kihagyva" : "var";
    } else if (f.fut) {
      allapot = "fut";
    } else if (!lezarva && f === legutobbi && f.k !== "zaras" && !eredmeny.some((x) => x.fut)) {
      allapot = "fut";
      f.vege = most;
    } else {
      allapot = "kesz";
    }
    return { ...f, allapot };
  });
}

// --- Az állapot összerakása -----------------------------------------------

function savJson(s, most, ota = null) {
  const vege = s.kesz ? s.utolso : most;
  const tok = s.tokenek(ota);
  const utolsoEszkoz = s.eszkozok[s.eszkozok.length - 1];
  return {
    id: s.id,
    tipus: s.tipus ?? "?",
    leiras: s.leiras,
    modell: s.modell,
    kezdet: s.kezdet,
    vege,
    fut: !s.kesz,
    korok: tok.korok,
    tokenek: tok,
    eszkozSzam: s.eszkozok.length,
    most: !s.kesz && utolsoEszkoz ? utolsoEszkoz.cimke : s.kesz ? "kész" : "gondolkodik…",
    pottyok: s.eszkozok.slice(-500).map((e) => ({
      t: e.t,
      f: e.tiltva ? "tiltva" : e.ok === false ? "hiba" : e.fajta,
    })),
    irt: [...s.irt].slice(-8),
    worktreek: [...s.worktreek],
    hibak: s.hibak,
    tiltasok: s.tiltasok,
  };
}

function csucsEgyideju(intervallumok) {
  const ev = [];
  for (const [a, b] of intervallumok) ev.push([a, 1], [b, -1]);
  ev.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let akt = 0;
  let max = 0;
  for (const [, d] of ev) {
    akt += d;
    max = Math.max(max, akt);
  }
  return max;
}

function allapot() {
  const most = Date.now();
  const friss = futasJelzo();
  if (friss) emlekJelzo = friss;
  const jelzo = friss ?? emlekJelzo;

  const agentek = [...savok.values()].map((b) => b.sav).filter((s) => s.kezdet !== null);
  // A futás kezdete: kézi `--since` > futásjelző > a legelső agent indulása ebben a sessionben.
  let kezdet = SINCE_FIX ? Date.parse(SINCE_FIX) : jelzo?.kezdet ?? null;
  if (!kezdet && agentek.length) kezdet = Math.min(...agentek.map((s) => s.kezdet));

  // A lezárás jele: a jelző eltűnt, vagy a fő session kiadta a törlő `rm`-et. Ami a lezárás
  // UTÁN történik a sessionben (a fejlesztő következő kérése), az már nem ennek a futásnak a része.
  const foOsszes = (foSav?.eszkozok ?? []).filter((e) => !kezdet || e.t >= kezdet);
  const zaroParancs = friss
    ? null
    : foOsszes.find((e) => /\brm\b.*aktiv-futas\.json/.test(e.parancs)) ?? null;
  const lezarva = !friss && (!!emlekJelzo || !!zaroParancs);
  const lathato = agentek
    .filter((s) => !kezdet || s.kezdet >= kezdet - 60_000)
    .filter((s) => !zaroParancs || s.kezdet <= zaroParancs.t)
    .sort((a, b) => a.kezdet - b.kezdet);
  const savLista = lathato.map((s) => savJson(s, most));
  const fut = savLista.some((s) => s.fut);
  const vege =
    lezarva && !fut
      ? Math.max(zaroParancs?.t ?? 0, ...savLista.map((s) => s.vege), kezdet ?? 0)
      : most;
  const foEszkozok = foOsszes.filter((e) => !lezarva || e.t <= vege);

  const fo = foSav ? savJson(foSav, most, kezdet) : null;
  if (fo && kezdet) {
    fo.pottyok = fo.pottyok.filter((p) => p.t >= kezdet && p.t <= vege);
    fo.eszkozSzam = fo.pottyok.length;
    fo.kezdet = kezdet;
    fo.fut = !lezarva;
    fo.vege = vege;
    if (lezarva) fo.most = "a futás lezárult";
  }

  const falMs = kezdet ? Math.max(1, vege - kezdet) : 0;
  const agentMs = savLista.reduce((a, s) => a + Math.max(0, s.vege - s.kezdet), 0);

  const ossz = { ki: 0, be: 0, olv: 0, ir: 0, usd: 0, usdHianyos: false };
  for (const s of fo ? [fo, ...savLista] : savLista) {
    ossz.ki += s.tokenek.ki;
    ossz.be += s.tokenek.be;
    ossz.olv += s.tokenek.olv;
    ossz.ir += s.tokenek.ir5 + s.tokenek.ir1;
    ossz.usd += s.tokenek.usd;
    ossz.usdHianyos ||= s.tokenek.usdHianyos;
  }

  // Eseményfolyam: az utolsó 18 eszközhívás az összes sávból.
  const folyam = [];
  const forrasok = foSav ? [{ s: foSav, j: fo }] : [];
  lathato.forEach((x, i) => forrasok.push({ s: x, j: savLista[i] }));
  for (const { s, j } of forrasok) {
    for (const e of s.eszkozok) {
      if ((kezdet && e.t < kezdet) || (lezarva && e.t > vege)) continue;
      folyam.push({
        t: e.t,
        tipus: j.tipus,
        cimke: e.cimke,
        f: e.tiltva ? "tiltva" : e.ok === false ? "hiba" : e.fajta,
        megj: e.megj ?? null,
      });
    }
  }
  folyam.sort((a, b) => b.t - a.t);

  return {
    most,
    session,
    futas: jelzo?.nev ?? null,
    lezarva,
    kezdet,
    vege,
    celPerc: CEL_PERC,
    stack,
    fazisok: fazisok({ kezdet, agentek: savLista, foEszkozok, lezarva, most: vege }),
    osszesen: {
      ...ossz,
      agentek: savLista.length,
      futnak: savLista.filter((s) => s.fut).length,
      falMs,
      agentMs,
      szorzo: falMs ? agentMs / falMs : 0,
      csucs: csucsEgyideju(savLista.map((s) => [s.kezdet, s.vege])),
      tiltasok: savLista.reduce((a, s) => a + s.tiltasok, 0),
    },
    fo,
    savok: savLista,
    worktreek: worktreeAllapot,
    folyam: folyam.slice(0, 18),
  };
}

// --- HTTP ------------------------------------------------------------------

const AZONOSITO = "futas-merleg/elo-nezet";

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/allapot") {
      frissit();
      await Promise.all([worktreekFrissit(), stackFrissit()]);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-elo-nezet": AZONOSITO,
      });
      res.end(JSON.stringify(allapot()));
      return;
    }
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(OLDAL);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("nincs ilyen");
  } catch (e) {
    // Egy elkapatlan hiba a node:http visszahívásában az egész folyamatot leállítaná.
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(String(e?.stack ?? e));
  }
});

const CIM = `http://127.0.0.1:${PORT}`;

server.on("error", async (e) => {
  if (e.code !== "EADDRINUSE") {
    console.error(`Az élő nézet nem indult: ${e.message}`);
    process.exit(2);
  }
  // Idempotens indulás: ha a porton már EZ a nézet fut, az jó — a lánc minden futáskor
  // meghívja, és egy session alatt több futás is lehet.
  try {
    const r = await fetch(`${CIM}/api/allapot`, { signal: AbortSignal.timeout(1500) });
    if (r.headers.get("x-elo-nezet") === AZONOSITO) {
      console.log(`Az élő nézet már fut: ${CIM}`);
      process.exit(0);
    }
  } catch {
    /* a porton más szolgáltatás ül */
  }
  console.error(`A ${PORT}-es portot más használja; adj meg másikat: --port <szám>`);
  process.exit(2);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Élő nézet: ${CIM}`);
  console.log(`Projekt-átiratok: ${PROJEKT}`);
  console.log(
    SESSION_FIX
      ? `Session (rögzítve): ${SESSION_FIX}`
      : "Session: a legutóbb írt átirat, automatikusan követve",
  );
});

// --- A kliensoldal ----------------------------------------------------------

const OLDAL = /* html */ `<!doctype html>
<html lang="hu"><head><meta charset="utf-8">
<title>Hol tartunk — élő nézet</title>
<style>
  :root { --bg:#0d1117; --panel:#161b22; --line:#30363d; --txt:#e6edf3; --dim:#8b949e;
          --olvas:#58a6ff; --ir:#3fb950; --parancs:#d29922; --delegal:#bc8cff; --egyeb:#6e7681;
          --hiba:#f85149; --tiltva:#ff2d55; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--txt); font:14px/1.4 "Segoe UI",system-ui,sans-serif; }
  header { display:flex; align-items:center; gap:28px; padding:14px 22px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
  h1 { font-size:20px; margin:0; font-weight:600; }
  h1 small { color:var(--dim); font-weight:400; margin-left:8px; font-size:13px; }
  .ora { font:600 42px/1 ui-monospace,Consolas,monospace; letter-spacing:1px; }
  .ora.tul { color:var(--hiba); } .ora.kesz { color:var(--ir); }
  .kpi { display:flex; flex-direction:column; }
  .kpi b { font-size:24px; font-variant-numeric:tabular-nums; }
  .kpi span { color:var(--dim); font-size:12px; text-transform:uppercase; letter-spacing:.5px; }
  .lampa { display:inline-block; width:11px; height:11px; border-radius:50%; margin-right:6px; background:var(--egyeb); }
  .lampa.ok { background:var(--ir); box-shadow:0 0 8px var(--ir); } .lampa.nem { background:var(--hiba); }
  main { padding:16px 22px; }
  .fazisok { display:flex; gap:6px; margin:0 0 14px; flex-wrap:wrap; }
  .fazis { flex:1 1 0; min-width:120px; padding:9px 11px; border-radius:7px; background:var(--panel); border:1px solid var(--line); color:var(--dim); position:relative; }
  .fazis b { display:block; font-size:13.5px; color:inherit; }
  .fazis small { font-size:11.5px; font-variant-numeric:tabular-nums; }
  .fazis.kesz { color:var(--txt); border-color:rgba(63,185,80,.5); background:rgba(63,185,80,.08); }
  .fazis.kesz b::before { content:"✓ "; color:var(--ir); }
  .fazis.fut { color:var(--txt); border-color:var(--olvas); background:rgba(88,166,255,.14); animation:lux 1.6s ease-in-out infinite; }
  .fazis.fut b::before { content:"● "; color:var(--olvas); }
  .fazis.var b::before { content:"○ "; }
  .fazis.kihagyva { opacity:.45; } .fazis.kihagyva b::before { content:"– "; }
  .gantt { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .sor { display:grid; grid-template-columns:260px 1fr 320px; gap:12px; align-items:center; padding:7px 0; border-bottom:1px dashed #21262d; }
  .sor:last-child { border-bottom:0; }
  .nev b { display:block; font-size:14px; } .nev span { color:var(--dim); font-size:12px; }
  .badge { display:inline-block; font-size:11px; padding:1px 7px; border-radius:10px; background:#21262d; color:var(--dim); margin-right:4px; }
  .sav { position:relative; height:34px; background:#0b0f14; border-radius:5px; overflow:hidden; }
  .rud { position:absolute; top:4px; bottom:4px; border-radius:4px; background:rgba(88,166,255,.18); border:1px solid rgba(88,166,255,.45); }
  .rud.fut { animation:lux 1.6s ease-in-out infinite; }
  .rud.kesz { background:rgba(63,185,80,.14); border-color:rgba(63,185,80,.45); }
  @keyframes lux { 50% { background:rgba(88,166,255,.32); } }
  .potty { position:absolute; top:13px; width:4px; height:8px; border-radius:1px; }
  .potty.tiltva { top:6px; height:22px; width:5px; box-shadow:0 0 10px var(--tiltva); }
  .celvonal { position:absolute; top:0; bottom:0; width:2px; background:var(--hiba); opacity:.6; }
  .mostvonal { position:absolute; top:0; bottom:0; width:1px; background:#fff; opacity:.35; }
  .info { font-size:12px; color:var(--dim); overflow:hidden; }
  .info .akt { color:var(--txt); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; font-family:ui-monospace,Consolas,monospace; }
  .tengely { display:grid; grid-template-columns:260px 1fr 320px; gap:12px; color:var(--dim); font-size:11px; }
  .tengely div { position:relative; height:16px; } .tengely i { position:absolute; font-style:normal; transform:translateX(-50%); }
  .also { display:grid; grid-template-columns:1.3fr 1fr; gap:16px; margin-top:16px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .panel h2 { font-size:13px; margin:0 0 8px; color:var(--dim); text-transform:uppercase; letter-spacing:.6px; }
  .esem { display:grid; grid-template-columns:64px 150px 1fr; gap:8px; font-size:12.5px; padding:2px 0; font-family:ui-monospace,Consolas,monospace; }
  .esem .ido { color:var(--dim); } .esem.tiltva { color:var(--tiltva); font-weight:600; }
  .esem.uj { animation:villan 1.2s ease-out; } @keyframes villan { from { background:rgba(255,255,255,.12); } }
  .wt { display:grid; grid-template-columns:1fr auto; padding:4px 0; border-bottom:1px dashed #21262d; font-size:12.5px; }
  .wt small { color:var(--dim); display:block; font-family:ui-monospace,Consolas,monospace; }
  .plusz { color:var(--ir); } .minusz { color:var(--hiba); }
  .jelmagyarazat { display:flex; gap:14px; font-size:12px; color:var(--dim); margin:0 0 8px 272px; }
  .jelmagyarazat i { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:4px; vertical-align:-1px; }
  .ures { color:var(--dim); padding:20px; text-align:center; }
  .tiltasjel { color:var(--tiltva); font-weight:700; }
</style></head>
<body>
<header>
  <h1 id="cim">Hol tartunk<small id="sess"></small></h1>
  <div class="ora" id="ora">00:00</div>
  <div class="kpi"><b id="agentek">0</b><span>agent · fut most</span></div>
  <div class="kpi"><b id="szorzo">×0,0</b><span>párhuzamosság</span></div>
  <div class="kpi"><b id="csucs">0</b><span>csúcs egyszerre</span></div>
  <div class="kpi"><b id="tok">0</b><span>kimenő token</span></div>
  <div class="kpi"><b id="usd">$0</b><span>becsült költség</span></div>
  <div class="kpi"><b id="tilt">0</b><span>guard-tiltás</span></div>
  <div class="kpi"><span><i class="lampa" id="be"></i>backend :3001</span><span><i class="lampa" id="fe"></i>kliens :5173</span></div>
</header>
<main>
  <div class="fazisok" id="fazisok"></div>
  <div class="jelmagyarazat">
    <span><i style="background:var(--olvas)"></i>olvas</span><span><i style="background:var(--ir)"></i>ír</span>
    <span><i style="background:var(--parancs)"></i>parancs</span><span><i style="background:var(--delegal)"></i>delegál</span>
    <span><i style="background:var(--hiba)"></i>hiba</span><span><i style="background:var(--tiltva)"></i>guard tiltott</span>
  </div>
  <div class="gantt" id="gantt"><div class="ures">Várakozás a futás indulására…</div></div>
  <div class="tengely" id="tengely"></div>
  <div class="also">
    <div class="panel"><h2>Élő eseményfolyam</h2><div id="folyam"></div></div>
    <div class="panel"><h2>Worktree-k</h2><div id="wt"></div></div>
  </div>
</main>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
const ezres = (n) => Math.round(n).toLocaleString("hu-HU");
const szin = { olvas:"var(--olvas)", ir:"var(--ir)", parancs:"var(--parancs)", delegal:"var(--delegal)", egyeb:"var(--egyeb)", hiba:"var(--hiba)", tiltva:"var(--tiltva)" };
const latott = new Set();

function sor(s, t0, t1, fo) {
  const x = (t) => ((t - t0) / (t1 - t0)) * 100;
  const bal = x(s.kezdet), jobb = x(s.vege);
  const pottyok = s.pottyok.map((p) => '<i class="potty ' + p.f + '" style="left:' + x(p.t).toFixed(2) + '%;background:' + szin[p.f] + '"></i>').join("");
  const tok = s.tokenek;
  const usd = tok.usd ? "$" + tok.usd.toFixed(2) + (tok.usdHianyos ? "+" : "") : "";
  const tilt = s.tiltasok ? ' · <span class="tiltasjel">⛔ ' + s.tiltasok + ' tiltás</span>' : "";
  const wt = s.worktreek.length ? '<span class="badge">' + esc(s.worktreek.join(", ")) + '</span>' : "";
  return '<div class="sor"><div class="nev"><b>' + esc(s.leiras || s.id) + '</b><span><span class="badge">' + esc(s.tipus) + '</span>' + (fo ? "" : wt) + (s.modell ? esc(s.modell.replace("claude-", "")) : "") + '</span></div>'
    + '<div class="sav"><div class="rud ' + (s.fut ? "fut" : "kesz") + '" style="left:' + bal.toFixed(2) + '%;width:' + Math.max(0.4, jobb - bal).toFixed(2) + '%"></div>' + pottyok + '</div>'
    + '<div class="info"><span class="akt">' + (s.fut ? "▶ " : "✓ ") + esc(s.most) + '</span>'
    + mmss(s.vege - s.kezdet) + " · " + s.korok + " kör · " + s.eszkozSzam + " eszköz · " + ezres(tok.ki) + " ki-token " + usd + tilt + '</div></div>';
}

function fazisCimke(f, t0) {
  if (f.allapot === "var") return "vár";
  if (f.allapot === "kihagyva") return "kihagyva";
  const tol = f.kezd && t0 ? mmss(f.kezd - t0) : "";
  const hossz = f.kezd && f.vege ? " · " + mmss(f.vege - f.kezd) : "";
  const db = f.db > 1 ? " · " + f.db + "×" : "";
  return tol + hossz + db;
}

async function kor() {
  let a;
  try { a = await (await fetch("/api/allapot", { cache: "no-store" })).json(); } catch { return; }
  const o = a.osszesen;
  $("cim").firstChild.textContent = a.futas ? a.futas : "Hol tartunk";
  $("sess").textContent = (a.lezarva ? " · lezárult" : "") + (a.session ? " · session " + a.session.slice(0, 8) : " · nincs session");
  $("ora").textContent = mmss(a.kezdet ? o.falMs : 0);
  $("ora").classList.toggle("tul", a.celPerc > 0 && o.falMs > a.celPerc * 60000);
  $("ora").classList.toggle("kesz", a.lezarva);
  $("agentek").textContent = o.agentek + " · " + o.futnak;
  $("szorzo").textContent = "×" + o.szorzo.toFixed(1).replace(".", ",");
  $("csucs").textContent = o.csucs;
  $("tok").textContent = ezres(o.ki);
  $("usd").textContent = "$" + o.usd.toFixed(2) + (o.usdHianyos ? "+" : "");
  $("tilt").textContent = o.tiltasok;
  $("be").className = "lampa " + (a.stack.be ? "ok" : "nem");
  $("fe").className = "lampa " + (a.stack.fe ? "ok" : "nem");

  $("fazisok").innerHTML = a.fazisok.map((f) => '<div class="fazis ' + f.allapot + '"><b>' + esc(f.nev) + "</b><small>" + esc(fazisCimke(f, a.kezdet)) + "</small></div>").join("");

  if (!a.kezdet) return;
  const t0 = a.kezdet;
  const t1 = Math.max(a.vege, a.celPerc > 0 ? t0 + a.celPerc * 60000 : 0, t0 + 60000) + 15000;
  const x = (t) => ((t - t0) / (t1 - t0)) * 100;
  const sorok = (a.fo ? [sor(a.fo, t0, t1, true)] : []).concat(a.savok.map((s) => sor(s, t0, t1, false)));
  $("gantt").innerHTML = sorok.length ? sorok.join("") : '<div class="ures">Várakozás az első delegálásra…</div>';
  document.querySelectorAll(".sav").forEach((el) => {
    let vonal = '<i class="mostvonal" style="left:' + x(a.vege) + '%"></i>';
    if (a.celPerc > 0) vonal += '<i class="celvonal" style="left:' + x(t0 + a.celPerc * 60000) + '%"></i>';
    el.insertAdjacentHTML("beforeend", vonal);
  });
  let tick = "";
  const perc = (t1 - t0) / 60000, lepes = perc > 60 ? 10 : perc > 25 ? 5 : perc > 8 ? 2 : 1;
  for (let m = 0; t0 + m * 60000 <= t1; m += lepes) tick += '<i style="left:' + x(t0 + m * 60000) + '%">' + m + "′</i>";
  $("tengely").innerHTML = "<div></div><div>" + tick + "</div><div></div>";

  $("folyam").innerHTML = a.folyam.map((e) => {
    const kulcs = e.t + e.tipus + e.cimke, uj = !latott.has(kulcs); latott.add(kulcs);
    return '<div class="esem ' + e.f + (uj ? " uj" : "") + '"><span class="ido">' + new Date(e.t).toLocaleTimeString("hu-HU") + '</span><span style="color:' + szin[e.f] + '">' + esc(e.tipus) + '</span><span>' + (e.f === "tiltva" ? "⛔ " : "") + esc(e.cimke) + (e.megj ? " — " + esc(e.megj) : "") + "</span></div>";
  }).join("");

  $("wt").innerHTML = a.worktreek.length ? a.worktreek.map((w) => '<div class="wt"><div><b>' + esc(w.nev) + "</b><small>" + esc(w.ag) + "</small>"
    + (w.fajlok && w.fajlok.length ? "<small>" + w.fajlok.map(esc).join("<br>") + "</small>" : "") + "</div><div>"
    + (w.valtozott === null ? "?" : w.valtozott + " fájl" + (w.uj ? " (" + w.uj + " új)" : "") + ' <span class="plusz">+' + w.plusz + '</span> <span class="minusz">−' + w.minusz + "</span>") + "</div></div>").join("")
    : '<div class="ures">Nincs worktree.</div>';
}
kor(); setInterval(kor, 1000);
</script>
</body></html>`;
