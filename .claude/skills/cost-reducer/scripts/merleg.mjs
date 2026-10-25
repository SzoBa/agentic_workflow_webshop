#!/usr/bin/env node
// A delegálás-mérések mérlege — a `cost-reducer` 0. és 5. fázisának eszköze.
//
// Bemenet: `docs/orchestration/_kontextus/meresek.jsonl` (a hook írja) és
// `receptek.json`. Az előnézeteket a gitignore-olt `.scratch/cost-reducer/blokkok.jsonl`
// adja, ha megvan — enélkül a hashek mellett nem látszik, MIT ismételünk.
//
// Amit kiír:
//   1. delegálás-típusonként a darabszám és a méretek
//   2. ISMÉTLŐDŐ blokkok — ezek a `csere` jelöltjei
//   3. az aktív receptek MÉRT hatása
//   4. az elutasított átírások (a gépi visszafogás jelzései)
//
// Amit NEM ír ki, mert nem tudja: tokenszámot (csak becslést), cache-találati
// arányt, pénzt. A harness ezeket nem adja ki a hooknak. Aki ezekre hivatkozva
// állít megtakarítást, nem mért — csak feltételez.
//
// Használat:
//   node .claude/skills/cost-reducer/scripts/merleg.mjs
//   node .claude/skills/cost-reducer/scripts/merleg.mjs --agent spec-implementer
//
// Zéró függőség, szándékosan (a projekt szabálya: új csomag csak kérdezés után).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = process.env.CLAUDE_PROJECT_DIR
  ? resolve(process.env.CLAUDE_PROJECT_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const TAR = join(REPO, "docs", "orchestration", "_kontextus");
const argv = process.argv.slice(2);
const szuro = argv.includes("--agent") ? argv[argv.indexOf("--agent") + 1] : null;

function sorok(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((s) => s.trim())
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const meresek = sorok(join(TAR, "meresek.jsonl")).filter((m) => !szuro || m.agent === szuro);
const tar = existsSync(join(TAR, "receptek.json"))
  ? JSON.parse(readFileSync(join(TAR, "receptek.json"), "utf8"))
  : { receptek: [] };

const elonezetek = new Map();
for (const b of sorok(join(REPO, ".scratch", "cost-reducer", "blokkok.jsonl"))) {
  elonezetek.set(b.h, b.elonezet);
}

if (meresek.length === 0) {
  console.log("Nincs mérés.\n");
  console.log("A hook minden `Agent` delegálásnál ír egy sort ide:");
  console.log(`  ${join("docs", "orchestration", "_kontextus", "meresek.jsonl")}`);
  console.log("\nHa üres, még nem futott delegálás ebben a repóban a hook bekötése óta.");
  console.log("Ellenőrizd a bekötést: `.claude/settings.json` → hooks.PreToolUse, matcher \"Agent|Task\".");
  process.exit(0);
}

const szam = (n) => n.toLocaleString("hu-HU");

// --- 1. Delegálás-típusonként ---------------------------------------------------

console.log(`Delegálás-mérleg — ${meresek.length} delegálás${szuro ? ` (szűrve: ${szuro})` : ""}\n`);

const agentek = new Map();
for (const m of meresek) {
  const k = m.agent ?? "(nincs megadva)";
  if (!agentek.has(k)) agentek.set(k, []);
  agentek.get(k).push(m);
}

console.log("agent                      db    összes kar.   átlag    legnagyobb");
console.log("-".repeat(72));
for (const [agent, lista] of [...agentek.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const ossz = lista.reduce((s, m) => s + m.karakter, 0);
  const max = Math.max(...lista.map((m) => m.karakter));
  console.log(
    `${agent.padEnd(24)} ${String(lista.length).padStart(4)} ${szam(ossz).padStart(13)} ${szam(Math.round(ossz / lista.length)).padStart(8)} ${szam(max).padStart(12)}`,
  );
}

const osszKar = meresek.reduce((s, m) => s + m.karakter, 0);
console.log("-".repeat(72));
console.log(`${"összesen".padEnd(24)} ${String(meresek.length).padStart(4)} ${szam(osszKar).padStart(13)}`);
console.log(`\n≈ ${szam(Math.round(osszKar / 4))} token — BECSLÉS (4 karakter/token), nem mért érték.`);

// --- 2. Ismétlődő blokkok ---------------------------------------------------------
//
// A `csere` jelöltjei. A "felesleg" az, amit az ismétlés visz: ha egy blokk N
// delegáláson megy át, akkor N-1 példánya lenne kiváltható hivatkozással.

const blokkok = new Map();
for (const m of meresek) {
  for (const b of m.blokkok ?? []) {
    if (!blokkok.has(b.h)) blokkok.set(b.h, { h: b.h, n: b.n, db: 0, agentek: new Set() });
    const e = blokkok.get(b.h);
    e.db += 1;
    e.agentek.add(m.agent ?? "?");
  }
}

const ismetlodo = [...blokkok.values()]
  .filter((b) => b.db > 1)
  .map((b) => ({ ...b, felesleg: b.n * (b.db - 1) }))
  .sort((a, b) => b.felesleg - a.felesleg);

console.log(`\n\nIsmétlődő blokkok — a \`csere\` jelöltjei (${ismetlodo.length} db)\n`);

if (ismetlodo.length === 0) {
  console.log("Nincs blokk, ami egynél több delegáláson átment volna.");
  console.log("Kevés adatnál ez normális — a mintázatot a 3-4. futás mutatja meg.");
} else {
  for (const b of ismetlodo.slice(0, 12)) {
    const hol = [...b.agentek].join(", ");
    console.log(`  ${b.h}  ${String(b.db).padStart(2)}×  ${szam(b.n).padStart(7)} kar.  → felesleg ${szam(b.felesleg)} kar.`);
    console.log(`              ${hol}`);
    console.log(`              ${elonezetek.get(b.h) ?? "(nincs előnézet — a .scratch/ index hiányzik)"}`);
  }
  const teljes = ismetlodo.reduce((s, b) => s + b.felesleg, 0);
  console.log(`\n  Az ismétlés összesen ${szam(teljes)} karakter (${(teljes / osszKar * 100).toFixed(1)}% az átadott anyagból).`);
  console.log("  Ez FELSŐ korlát: csak az váltható ki, amit a címzett tényleg elő tud venni magának.");
}

// --- 3. Receptek ---------------------------------------------------------------------

const aktiv = (tar.receptek ?? []).filter((r) => r.jovahagyva);
const inaktiv = (tar.receptek ?? []).filter((r) => !r.jovahagyva);

console.log(`\n\nReceptek — ${aktiv.length} aktív, ${inaktiv.length} visszavont\n`);

if (aktiv.length === 0 && inaktiv.length === 0) {
  console.log("Nincs recept. A hook mér, de nem ír át semmit.");
} else {
  for (const r of aktiv) {
    const hasznalat = meresek.filter((m) => m.allapot === "atirva" && m.recept === r.id);
    const megtak = hasznalat.reduce((s, m) => s + (m.megtakaritas ?? 0), 0);
    console.log(`  ${r.id}  (${r.agent ?? "*"}, jóváhagyva ${r.jovahagyva})`);
    console.log(`      ${hasznalat.length}× alkalmazva, MÉRT megtakarítás ${szam(megtak)} karakter`);
    console.log(`      indok: ${r.indok ?? "(nincs megadva — ez hiányosság)"}`);
  }
  for (const r of inaktiv) {
    console.log(`  ${r.id}  — VISSZAVONVA (nincs \`jovahagyva\` dátum, a hook nem alkalmazza)`);
  }
}

// --- 4. Elutasított átírások ------------------------------------------------------------

const elutasitva = meresek.filter((m) => m.allapot === "elutasitva");
if (elutasitva.length) {
  console.log(`\n\nElutasított átírások — ${elutasitva.length} db\n`);
  console.log("A gépi visszafogás megakadályozta az átírást. Ez NEM a hook hibája:");
  console.log("a recept vitt volna el védett szöveget, vagy túl sokat vágott.");
  console.log("A helyes válasz a recept javítása vagy visszavonása — nem a küszöb lejjebb vétele.\n");
  for (const m of elutasitva.slice(-10)) {
    console.log(`  ${m.ts}  ${m.recept}  (${m.agent})`);
    console.log(`      ${m.ok}`);
  }
}

// --- Záró figyelmeztetés ------------------------------------------------------------------

console.log("\n\nAmit ez a mérleg NEM mond meg");
console.log("-".repeat(72));
console.log("  · tokenszámot — a fenti szám karakterből BECSÜLT (≈4 kar./token)");
console.log("  · cache-találati arányt — a harness nem adja ki a hooknak");
console.log("  · pénzt — ebből következően megtakarítást forintban állítani nem lehet");
console.log("\nAmit igazolni tudsz: karaktert, ismétlést, és hogy egy recept hányszor futott.");
console.log("Minden ezen túli állítás hipotézis, és a jelentésben is annak nevezendő.");
