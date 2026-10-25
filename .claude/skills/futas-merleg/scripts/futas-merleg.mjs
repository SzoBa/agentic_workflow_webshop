#!/usr/bin/env node
// A futásmérleg riportja: mennyit fogyasztott a lánc, konvergált-e, és ha
// megállt, miért.
//
// Előbb EGYEZTET (ugyanazzal a modullal, amit a hook használ), csak utána
// jelent — így a lánc utolsó delegálása is bekerül, amit a PreToolUse hook
// természeténél fogva nem tudott lezárni.
//
// Használat:
//   node .claude/skills/futas-merleg/scripts/futas-merleg.mjs
//   node .claude/skills/futas-merleg/scripts/futas-merleg.mjs --futas admin-orders
//   node .claude/skills/futas-merleg/scripts/futas-merleg.mjs --atirat <path.jsonl>
//
// Kilépési kód mindig 0: ez jelentés, nem kapu. A kapu a hook.

import { existsSync } from "node:fs";
import {
  ALAP_KERETEK,
  FUTASOK,
  KERETEK,
  ARAK,
  egyeztet,
  itelet,
  olvasJsonl,
  osszesites,
  readJson,
} from "../../../hooks/futas-kozos.mjs";

const argv = process.argv.slice(2);
const flag = (nev) => {
  const i = argv.indexOf(nev);
  return i === -1 ? null : argv[i + 1] ?? null;
};

const csakFutas = flag("--futas");
const atirat = flag("--atirat");

const szam = (n) => (n ?? 0).toLocaleString("hu-HU");
const perc = (ms) => (ms ? `${Math.round(ms / 60000)} perc` : "—");

// --- Egyeztetés a jelentés előtt ---------------------------------------------

if (atirat) {
  if (!existsSync(atirat)) {
    console.log(`Nincs ilyen átirat: ${atirat}`);
    process.exit(0);
  }
  const r = egyeztet({ transcriptPath: atirat, futas: csakFutas ?? undefined });
  console.log(`Egyeztetve: ${r.ujak.length} új delegálás.`);
  if (r.hibak.length) console.log(`Nem volt mérhető: ${r.hibak.length}.`);
  console.log("");
}

const mind = olvasJsonl(FUTASOK);
if (mind.length === 0) {
  console.log("A futásnapló üres — még egyetlen delegálás sem lett egyeztetve.");
  console.log("");
  console.log("Ellenőrizd:");
  console.log("  - `.claude/settings.json` → hooks.PreToolUse, matcher `Agent|Task`,");
  console.log("    a `futas-mero.mjs kapu` bejegyzéssel;");
  console.log("  - hogy a `FUTAS_KERET` nem `0`;");
  console.log("  - vagy adj meg egy átiratot: `--atirat <session>.jsonl`.");
  process.exit(0);
}

const sorok = csakFutas ? mind.filter((s) => s.futas === csakFutas) : mind;
const keretek = { ...ALAP_KERETEK, ...(readJson(KERETEK, {}) ?? {}) };
const arak = readJson(ARAK, {});

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
  if (f.usd > 0) {
    console.log(
      `  ≈ ${f.usd.toFixed(2)} USD (arak.json, ${arak?.ervenyes ?? "dátum nélkül"})` +
        (aranyU !== null ? ` — a keret ${aranyU}%-a` : ""),
    );
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
console.log("  · A „futás\" egysége alapból a session. Egy sessionben két feature EGY futásnak");
console.log("    látszik — ilyenkor `FUTAS_AZONOSITO` bontja szét.");
