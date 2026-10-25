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
// állít megtakarítást, nem mért — csak feltételez. A valódi token-, cache- és
// pénzadat egy szinttel lejjebb, a subagent-átiratokban megvan: azt a
// `futas-merleg` skill (`futas-merleg.mjs`) olvassa ki.
//
// Használat:
//   node .claude/skills/cost-reducer/scripts/merleg.mjs
//   node .claude/skills/cost-reducer/scripts/merleg.mjs --agent spec-implementer
//   node .claude/skills/cost-reducer/scripts/merleg.mjs --futas kupon-20261106-1000
//
// `--futas <név>`: egy lánc méréseire szűr — a sorok `futas` mezője ugyanazzal a
// feloldással készül, mint a futásmérleg naplójáé (env > friss jelző > session), így az
// „ismétlődő blokk" itt valóban ugyanabban a láncban ismétlődik. A mező előtti, régi
// soroknak nincs `futas`-a: ezek csak a szűretlen mérlegben látszanak. Ismeretlen név → 2.
//
// A recept aktív-voltáról UGYANAZ a függvény dönt, mint a hookban (`jovahagyott()`, a
// `kontextus-mero.mjs`-ből importálva, nem másolva). Három kategória: aktív ·
// érvénytelen jóváhagyás (van `jovahagyva`, de nem valódi, nem jövőbeli dátum — a hook
// NEM alkalmazza) · visszavont (nincs `jovahagyva`).
//
// A futásmérleg kapuja által TILTOTT delegálások mérése kimarad (a `futasok.jsonl`
// `allapot: "tiltva"` sorai alapján): az a delegálás sosem futott le. Sérült
// `receptek.json` mellett a mérleg nem dől el, hanem kimondja, hogy egy recept sem él.
//
// Zéró függőség, szándékosan (a projekt szabálya: új csomag csak kérdezés után).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A hook-modul importja ELŐTT jelezzük, hogy modulként töltjük be: így a hook-ág
// (stdin-olvasás, kilépés) nem fut le (lásd a `kontextus-mero.mjs` fejlécét).
globalThis.KONTEXTUS_MERO_MODULKENT = true;
const { jovahagyott, receptHiba } = await import("../../../hooks/kontextus-mero.mjs");

const REPO = process.env.CLAUDE_PROJECT_DIR
  ? resolve(process.env.CLAUDE_PROJECT_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const TAR = join(REPO, "docs", "orchestration", "_kontextus");
const argv = process.argv.slice(2);
const hibasHivas = (uzenet) => {
  console.error(`Hibás hívás: ${uzenet}`);
  process.exit(2);
};
// Érték nélkül a szűrő `undefined` lett, és csendben a teljes, szűretlen mérleg futott le.
// Egy elgépelt hívás ne adjon szó nélkül más választ, mint amit kérdeztek.
const flag = (nev, pelda) => {
  const i = argv.indexOf(nev);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) hibasHivas(`a ${nev} kapcsolóhoz érték kell (pl. ${nev} ${pelda}).`);
  return v;
};
const szuro = flag("--agent", "spec-implementer");
const futasSzuro = flag("--futas", "kupon-20261106-1000");

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

// A kapu által TILTOTT delegálások (3. audit 27. sor): a `kontextus-mero` minden
// delegálást a kapu döntése ELŐTT mér (a két hook ugyanarra a matcherre fut), így egy
// `deny`-jal megállított, soha le nem futott delegálás is kapott mérési sort. A
// `futas-mero` a tiltás után `allapot: "tiltva"` sort ír a futásnaplóba; az ilyen
// `tool_use_id`-jú mérés itt nem számít delegálásnak. (A régi, e sor előtti tiltásoknak
// nincs nyoma — azok a mérlegben továbbra is benne vannak.)
const tiltottIdk = new Set(
  sorok(join(TAR, "futasok.jsonl"))
    .filter((s) => s?.allapot === "tiltva" && typeof s.tool_use_id === "string" && s.tool_use_id)
    .map((s) => s.tool_use_id),
);
const nyersMeres = sorok(join(TAR, "meresek.jsonl"));
const osszesMeres = nyersMeres.filter((m) => !(m.tool_use_id && tiltottIdk.has(m.tool_use_id)));
const tiltottMeres = nyersMeres.length - osszesMeres.length;
if (futasSzuro && !osszesMeres.some((m) => m.futas === futasSzuro)) {
  const ismert = [...new Set(osszesMeres.map((m) => m.futas).filter(Boolean))];
  hibasHivas(
    `nincs mérés ezzel a futással: "${futasSzuro}". Ismertek (${ismert.length}): ` +
      (ismert.length ? `${ismert.slice(-10).join(", ")}${ismert.length > 10 ? ", …" : ""}` : "egy sem (a régi soroknak nincs `futas` mezője)"),
  );
}
const futasMeresei = osszesMeres.filter((m) => !futasSzuro || m.futas === futasSzuro);
const meresek = futasMeresei.filter((m) => !szuro || m.agent === szuro);
if (szuro && futasMeresei.length > 0 && meresek.length === 0) {
  const ismert = [...new Set(futasMeresei.map((m) => m.agent ?? "(nincs megadva)"))].sort();
  console.error(`Hibás hívás: nincs mérés ezzel az agenttel: "${szuro}". Ismertek: ${ismert.join(", ")}.`);
  process.exit(2);
}
// Sérült `receptek.json` (3. audit 27. sor): korábban kezeletlen kivétellel dőlt el a
// mérleg. A hook ilyenkor recept nélkül mér (`receptAg`: nem objektum → üres tár) — a
// mérleg ugyanígy jár el, de KIMONDJA, mert egy elrontott fájl minden receptet kikapcsol.
let receptHibaUzenet = null;
let tar = { receptek: [] };
if (existsSync(join(TAR, "receptek.json"))) {
  try {
    const nyers = JSON.parse(readFileSync(join(TAR, "receptek.json"), "utf8"));
    if (nyers && typeof nyers === "object" && !Array.isArray(nyers)) tar = nyers;
    else receptHibaUzenet = "a gyökér nem JSON-objektum";
  } catch (e) {
    receptHibaUzenet = `nem értelmezhető JSON (${e?.message ?? String(e)})`;
  }
}

const elonezetek = new Map();
for (const b of sorok(join(REPO, ".scratch", "cost-reducer", "blokkok.jsonl"))) {
  elonezetek.set(b.h, b.elonezet);
}

if (meresek.length === 0) {
  console.log("Nincs mérés.\n");
  console.log("A hook minden `Agent`/`Task`/`SendMessage` delegálásnál ír egy sort ide:");
  console.log(`  ${join("docs", "orchestration", "_kontextus", "meresek.jsonl")}`);
  console.log("\nHa üres, még nem futott delegálás ebben a repóban a hook bekötése óta.");
  console.log("Ellenőrizd a bekötést: `.claude/settings.json` → hooks.PreToolUse, matcher \"Agent|Task|SendMessage\".");
  process.exit(0);
}

const szam = (n) => n.toLocaleString("hu-HU");

// --- 1. Delegálás-típusonként ---------------------------------------------------

const szurok = [futasSzuro ? `futás: ${futasSzuro}` : null, szuro ? `agent: ${szuro}` : null].filter(Boolean);
console.log(`Delegálás-mérleg — ${meresek.length} delegálás${szurok.length ? ` (szűrve: ${szurok.join(", ")})` : ""}\n`);
if (tiltottMeres > 0) {
  console.log(
    `(${tiltottMeres} mérés kihagyva: a futásmérleg kapuja tiltotta, a delegálás nem futott le — \`futasok.jsonl\`, \`allapot: "tiltva"\`.)\n`,
  );
}

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

// Ugyanaz a döntés, mint a hookban: aktív = `jovahagyott(jovahagyva)`. Ami nem az, de
// VAN `jovahagyva` értéke (`"igen"`, `true`, jövőbeli vagy nem létező dátum), az
// érvénytelen jóváhagyás — korábban ez itt „aktív"-nak látszott, a hook pedig nem
// alkalmazta. Csak a hiányzó (vagy üres) mező a visszavonás.
const receptLista = (Array.isArray(tar.receptek) ? tar.receptek : []).filter((r) => r && typeof r === "object");
const nincsJovahagyas = (r) => r.jovahagyva === undefined || r.jovahagyva === null || r.jovahagyva === "";
const aktiv = receptLista.filter((r) => jovahagyott(r.jovahagyva));
const ervenytelen = receptLista.filter((r) => !jovahagyott(r.jovahagyva) && !nincsJovahagyas(r));
const inaktiv = receptLista.filter((r) => nincsJovahagyas(r));

console.log(
  `\n\nReceptek — ${aktiv.length} aktív, ${ervenytelen.length} érvénytelen jóváhagyás, ${inaktiv.length} visszavont\n`,
);

if (receptHibaUzenet) {
  console.log(
    `⚠ A \`receptek.json\` SÉRÜLT: ${receptHibaUzenet}. A hook így EGYETLEN receptet sem alkalmaz ` +
      "(minden delegálás `mert` sor). Javítsd a fájlt; a mérleg addig recept nélkül számol.",
  );
} else if (receptLista.length === 0) {
  console.log("Nincs recept. A hook mér, de nem ír át semmit.");
} else {
  for (const r of aktiv) {
    const hasznalat = meresek.filter((m) => m.allapot === "atirva" && m.recept === r.id);
    const megtak = hasznalat.reduce((s, m) => s + (m.megtakaritas ?? 0), 0);
    console.log(`  ${r.id}  (${r.agent ?? "*"}, jóváhagyva ${r.jovahagyva})`);
    console.log(`      ${hasznalat.length}× alkalmazva, MÉRT megtakarítás ${szam(megtak)} karakter`);
    console.log(`      indok: ${r.indok ?? "(nincs megadva — ez hiányosság)"}`);
    // A hook a jóváhagyott, de sémahibás receptet sem alkalmazza (`hiba` sort ír).
    const sema = receptHiba(r);
    if (sema) console.log(`      ⚠ a hook NEM alkalmazza — érvénytelen recept: ${sema}`);
  }
  for (const r of ervenytelen) {
    console.log(
      `  ${r.id}  — ÉRVÉNYTELEN JÓVÁHAGYÁS (\`jovahagyva\`: ${JSON.stringify(r.jovahagyva)} — nem valódi, ` +
        "nem jövőbeli ÉÉÉÉ-HH-NN dátum; a hook NEM alkalmazza)",
    );
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
