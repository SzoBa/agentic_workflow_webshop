#!/usr/bin/env node
// A futásmérleg riportja: mennyit fogyasztott a lánc, konvergált-e, és ha
// megállt, miért.
//
// ALAPBÓL a hook által MÁR egyeztetett naplóból (`futasok.jsonl`) jelent, és csak
// olvas. `--atirat` mellett előbb EGYEZTET (ugyanazzal a modullal, amit a hook
// használ), csak utána jelent — így a lánc utolsó delegálása is bekerül, amit a
// PreToolUse hook természeténél fogva nem tudott lezárni.
//
// A `--atirat` CSAK A FEJLESZTŐ KIFEJEZETT JÓVÁHAGYÁSÁVAL használható: a session-átirat
// a munkaterületen KÍVÜL van (`C:\Users\…\.claude\projects\…`), és a fejlesztő globális
// szabálya szerint azt natív eszközzel olvasni csak előzetes, kifejezett engedéllyel
// szabad. Engedély nélkül a riport a hook által már egyeztetett adatból készül; a lánc
// utolsó delegálása ilyenkor a következő hook-hívásig hiányzik — ezt a riportban ki
// kell mondani, nem az átiratot elolvasni.
//
// Használat:
//   node .claude/skills/futas-merleg/scripts/futas-merleg.mjs
//   node .claude/skills/futas-merleg/scripts/futas-merleg.mjs --futas admin-orders
//   node .claude/skills/futas-merleg/scripts/futas-merleg.mjs --utolso
//   node .claude/skills/futas-merleg/scripts/futas-merleg.mjs --atirat <path.jsonl>   (csak jóváhagyással!)
//   node .claude/skills/futas-merleg/scripts/futas-merleg.mjs --help
//
// `--utolso`: a napló LEGUTÓBBI futás-azonosítójára szűr (a közös `utolsoFutas()`:
// a legkésőbbi `ts`-ű sor futása), és kiírja, melyik az. Csak olvas.
//
// FUTÁS-AZONOSÍTÓ a `--atirat`-nál: ugyanaz a feloldás, mint a hookban
// (`futasFeloldas`, `futas-kozos.mjs`). Egy delegálás sora ELSŐSORBAN a hook által a
// delegálás IDEJÉN jegyzett kötést kapja (`.scratch/futas-merleg/delegalasok.jsonl`);
// kötés híján a `--futas` értékét, ha megadtad, különben env > friss jelző > session.
// A `--futas` tehát nem írja felül a kötést — egy lánc delegálása a lánc futása marad.
//
// MELLÉKHATÁS: a `--atirat` a verziózott `docs/orchestration/_kontextus/futasok.jsonl`-be
// ÍR (az egyeztetett új sorokat hozzáfűzi). Ha ezt nem akarod, futtasd ideiglenes
// `CLAUDE_PROJECT_DIR` alatt. A többi kapcsoló csak olvas.
//
// Kilépési kód 0, ha a jelentés elkészült: ez jelentés, nem kapu (a kapu a hook).
// 2, ha a hívás hibás: érték nélküli kapcsoló, nem létező futás vagy átirat —
// egy elgépelt futásnév ne adjon üres, „minden rendben"-nek látszó riportot.

import { existsSync } from "node:fs";
import {
  ALAP_KERETEK,
  FUTASOK,
  KERETEK,
  egyediSorok,
  egyeztet,
  itelet,
  olvasJsonl,
  osszesites,
  readJson,
  usdSzoveg,
  utolsoFutas,
} from "../../../hooks/futas-kozos.mjs";

const argv = process.argv.slice(2);
const hibasHivas = (uzenet) => {
  console.error(`Hibás hívás: ${uzenet}`);
  process.exit(2);
};

const SUGO = `Futásmérleg — mennyit fogyasztott a lánc, konvergált-e, és ha megállt, miért.

Használat:
  futas-merleg.mjs                  minden futás, a hook által már egyeztetett naplóból
  futas-merleg.mjs --futas <név>    egy futás
  futas-merleg.mjs --utolso         a napló legutóbbi futása
  futas-merleg.mjs --atirat <session>.jsonl
      előbb egyeztet az átiratból, csak utána jelent; a verziózott naplóba ÍR.
      CSAK A FEJLESZTŐ KIFEJEZETT JÓVÁHAGYÁSÁVAL: a session-átirat a munkaterületen
      kívül van (C:\\Users\\…\\.claude\\projects\\…). Alapból a riport a hook által már
      egyeztetett adatból készül.

Kilépési kód: 0 = a jelentés elkészült · 2 = hibás hívás.`;

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(SUGO);
  process.exit(0);
}
const ISMERT = new Set(["--futas", "--atirat", "--utolso", "--help"]);
for (const a of argv) {
  if (a.startsWith("--") && !ISMERT.has(a)) hibasHivas(`ismeretlen kapcsoló: ${a}. Ismertek: ${[...ISMERT].join(", ")}.`);
}
const flag = (nev) => {
  const i = argv.indexOf(nev);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) hibasHivas(`a ${nev} kapcsolóhoz érték kell.`);
  return v;
};

let csakFutas = flag("--futas");
const atirat = flag("--atirat");
const utolso = argv.includes("--utolso");
if (utolso && csakFutas) hibasHivas("a --utolso és a --futas együtt nem adható meg — mindkettő egy futást választ.");

const szam = (n) => (n ?? 0).toLocaleString("hu-HU");
const perc = (ms) => (ms ? `${Math.round(ms / 60000)} perc` : "—");

// --- Egyeztetés a jelentés előtt ---------------------------------------------

if (atirat) {
  if (!existsSync(atirat)) hibasHivas(`nincs ilyen átirat: ${atirat}`);
  const r = egyeztet({ transcriptPath: atirat, futas: csakFutas ?? undefined });
  console.log(`Egyeztetve: ${r.ujak.length} új delegálás → ${FUTASOK} (verziózott napló, hozzáfűzve).`);
  if (r.hibak.length) console.log(`Nem volt mérhető: ${r.hibak.length}.`);
  console.log("");
}

// Deduplikálva (M2-2): két egyszerre futó hook kettős sora se itt, se a kapu-állásnál
// ne számítson kétszer.
const mind = egyediSorok(olvasJsonl(FUTASOK));
if (mind.length === 0) {
  if (csakFutas || utolso) hibasHivas(`a futásnapló üres (${FUTASOK}) — nincs mire szűrni.`);
  console.log("A futásnapló üres — még egyetlen delegálás sem lett egyeztetve.");
  console.log("");
  console.log("Ellenőrizd:");
  console.log("  - `.claude/settings.json` → hooks.PreToolUse, matcher `Agent|Task|SendMessage`,");
  console.log("    a `futas-mero.mjs kapu` bejegyzéssel;");
  console.log("  - hogy a `FUTAS_KERET` nem `0`;");
  console.log("  - vagy — CSAK a fejlesztő kifejezett jóváhagyásával, mert a session-átirat a");
  console.log("    munkaterületen kívül van — egyeztess egy átiratból: `--atirat <session>.jsonl`.");
  process.exit(0);
}

// A legutóbbi futás: a közös `utolsoFutas()` (futas-kozos.mjs) — ugyanaz a szabály, amit
// a tesztek rögzítenek, nem egy második, eltérő másolat. A fájlsorrend nem elég — a
// háttér-delegálások egyeztetése később, de korábbi futásra is írhat sort.
if (utolso) {
  csakFutas = utolsoFutas(mind);
  if (!csakFutas) hibasHivas("a naplóban nincs futás-azonosítós sor.");
  const tsek = mind.filter((s) => s.futas === csakFutas).map((s) => s.ts).filter((t) => !Number.isNaN(Date.parse(t ?? "")));
  const legkesobbi = tsek.sort((a, b) => Date.parse(a) - Date.parse(b)).pop();
  console.log(`Legutóbbi futás: ${csakFutas} (utolsó sor: ${legkesobbi ?? "időbélyeg nélkül"}).`);
  console.log("");
}

if (csakFutas && !mind.some((s) => s.futas === csakFutas)) {
  const ismert = [...new Set(mind.map((s) => s.futas).filter(Boolean))];
  hibasHivas(
    `nincs ilyen futás a naplóban: "${csakFutas}". Ismertek (${ismert.length}): ` +
      `${ismert.slice(-10).join(", ")}${ismert.length > 10 ? ", …" : ""}`,
  );
}

const sorok = csakFutas ? mind.filter((s) => s.futas === csakFutas) : mind;
const keretek = { ...ALAP_KERETEK, ...(readJson(KERETEK, {}) ?? {}) };

// --- 1. Futásonkénti mérleg ---------------------------------------------------

console.log("═══ FUTÁSMÉRLEG ═══════════════════════════════════════════════════");
console.log("");

const futasok = osszesites(sorok);
for (const f of futasok) {
  const keretEgyseg = keretek.keret?.koltseg_egyseg;
  const keretUsd = keretek.keret?.koltseg_usd;
  const aranyE = keretEgyseg ? Math.round((f.egyseg / keretEgyseg) * 100) : null;
  const aranyU = keretUsd ? Math.round((f.usd / keretUsd) * 100) : null;

  console.log(`▸ ${f.futas}`);
  console.log(
    `  ${f.db} delegálás${f.hibak ? ` (+${f.hibak} mérhetetlen)` : ""} · ` +
      `${szam(f.egyseg)} költség-egység${aranyE !== null ? ` (a keret ${aranyE}%-a)` : ""} · ` +
      `subagent-idő ${perc(f.ido_ms)}`,
  );
  // A pénz forrása a futás SAJÁT soraiban rögzített ártábla-dátum (SB2-2), nem a mai
  // `arak.json`-é; részleges összegnél alsó korlát (`≥`).
  const usd = usdSzoveg(f);
  if (usd) {
    console.log(`  ${usd}` + (aranyU !== null ? ` — a keret ${aranyU}%-a` : ""));
  } else {
    console.log("  Pénz: nincs ártábla-sor a használt modellekhez — csak költség-egység.");
  }
  console.log(
    `  token: be ${szam(f.token.be)} · ki ${szam(f.token.ki)} · ` +
      `cache-írás ${szam(f.token.cache_ir_5m + f.token.cache_ir_1h)} · ` +
      `cache-olvasás ${szam(f.token.cache_olv)}`,
  );

  const agentek = [...f.agentek].sort((a, b) => b[1].egyseg - a[1].egyseg);
  console.log(
    `  agentenként: ${agentek.map(([a, v]) => `${a} ${v.db}× (${szam(v.egyseg)})`).join(" · ")}`,
  );

  // Konvergenciagörbe — ez az, amiért az egész mérés van.
  if (f.gorbe.length) {
    const gorbe = f.gorbe.map((n) => (n === null ? "?" : String(n))).join(" → ");
    console.log(`  konvergencia ([nem teljesül] körönként): ${gorbe}`);
    const mert = f.gorbe.filter((n) => n !== null);
    if (mert.length >= 2) {
      const [e, u] = [mert[mert.length - 2], mert[mert.length - 1]];
      if (u >= e && e > 0) console.log("  ⚠ a konvergencia MEGÁLLT — az utolsó kör nem csökkentett.");
      else if (u === 0) console.log("  ✓ az utolsó mért kör tiszta.");
    }
    if (f.gorbe.includes(null)) {
      console.log("  ⚠ `?` = a validátor jelentésében nem volt marker (mérési hiány, nem „0 hiba\").");
    }
  } else {
    console.log("  konvergencia: nem volt mérhető validátorkör.");
  }
  console.log("");
}

// --- 2. A legdrágább delegálások ---------------------------------------------

const drága = [...sorok]
  .filter((s) => s.allapot !== "hiba")
  .sort((a, b) => (b.koltseg_egyseg ?? 0) - (a.koltseg_egyseg ?? 0))
  .slice(0, 8);

if (drága.length) {
  console.log("── A legdrágább delegálások ──────────────────────────────────────");
  for (const s of drága) {
    const jel = s.allapot === "megszakadt" ? " ⚠ MEGSZAKADT" : "";
    console.log(
      `  ${szam(s.koltseg_egyseg).padStart(12)} · ${(s.agent ?? "?").padEnd(18)} ` +
        `${s.leiras ?? "—"}${jel}`,
    );
  }
  console.log("");
}

// --- 3. Rendellenességek ------------------------------------------------------

const megszakadt = sorok.filter((s) => s.allapot === "megszakadt");
const markerNelkul = sorok.filter((s) => s.allapot === "marker-nelkul");
const hibas = sorok.filter((s) => s.allapot === "hiba");

if (megszakadt.length || markerNelkul.length || hibas.length) {
  console.log("── Rendellenességek ──────────────────────────────────────────────");
  for (const s of megszakadt) {
    console.log(`  MEGSZAKADT · ${s.agent} · ${s.leiras ?? "—"} — a delegálás félbeszakadt,`);
    console.log("    de a fogyasztása valós, ezért a keretbe beleszámít. Konvergenciának NEM számít.");
  }
  for (const s of markerNelkul) {
    console.log(`  MARKER NÉLKÜL · ${s.agent} · ${s.leiras ?? "—"} — a jelentésben nincs`);
    console.log("    `[teljesül]`/`[nem teljesül]` marker. Ez mérési hiány, nem „nulla hiba\".");
  }
  for (const s of hibas) console.log(`  MÉRHETETLEN · ${s.agent ?? "?"} — ${s.ok ?? "ismeretlen ok"}`);
  console.log("");
}

// --- 4. A kapu mai állása ------------------------------------------------------

console.log("── A kapu mai állása ─────────────────────────────────────────────");
const aktiv = [
  keretek.keret?.koltseg_egyseg ? `keret ${szam(keretek.keret.koltseg_egyseg)} egység` : null,
  keretek.keret?.koltseg_usd ? `keret ${keretek.keret.koltseg_usd} USD` : null,
  keretek.konvergencia ? "konvergencia-megállás" : null,
  keretek.oszcillacio ? "oszcilláció" : null,
  keretek.kor_korlat ? `körkorlát ${keretek.kor_korlat}` : null,
].filter(Boolean);
console.log(`  Éles szabályok: ${aktiv.join(" · ") || "egy sem"}`);
if (!keretek.kor_korlat) console.log("  A körkorlát kikapcsolva — azt a `feature-implement` prózája tartja.");

for (const f of futasok) {
  for (const agent of keretek.javito_agentek ?? []) {
    const ok = itelet({ sorok: mind, keretek, futas: f.futas, agent });
    if (ok) {
      console.log(`  ⛔ "${f.futas}" — a következő \`${agent}\` delegálás TILTVA: ${ok.szabaly}`);
      console.log(`     ${ok.uzenet}`);
      break;
    }
  }
}
console.log("");

// --- 5. Amit nem mértünk -------------------------------------------------------

console.log("── Amit NEM mértünk ──────────────────────────────────────────────");
console.log("  · Az orchestrátor (a fő szál) saját fogyasztását — csak a delegálásokét.");
console.log("  · A cache-találati arány OKÁT: a nyers számok megvannak, a magyarázat nem.");
console.log("  · A `zaro_kontextus` NEM fogyasztás, hanem az utolsó kör kontextusmérete —");
console.log("    a kettő összekeverése hatvanszoros alábecslés (mérve: 175 120 vs 10 281 395).");
console.log("  · A pénz LEVEZETETT adat az `arak.json`-ból, nem mérés; a súlyok feltevések.");
console.log("  · A „futás\" egysége a lánc: `FUTAS_AZONOSITO` > a lánc friss jelzője");
console.log("    (`.scratch/futas-merleg/aktiv-futas.json`, ≤ 6 óra) > a session. Jelző nélkül egy");
console.log("    sessionben két feature EGY futásnak látszik.");
