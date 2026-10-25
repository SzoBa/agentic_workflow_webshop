#!/usr/bin/env node
// A meglévő skillek és agentek leltára — a `skill-iro` 0. fázisának eszköze.
//
// Miért kell: egy új skill akkor is megszülethet, ha a képességet egy meglévő már fedi,
// és a duplikátumot később senki nem veszi észre — két, egymásnak ellentmondó leírás
// pedig rosszabb, mint egy hiányzó.
//
// Használat:
//   node .claude/skills/skill-iro/scripts/leltar.mjs
//   node .claude/skills/skill-iro/scripts/leltar.mjs --keres "java unit teszt jacoco"
//
// A `--keres` szóátfedést számol a leírásokkal, és a három legerősebb találatot emeli ki.
// Ez a fedésvizsgálat BELÉPŐJE, nem az ítélete: a pontszám csak azt mondja meg, melyik
// két-három fájlt kell elolvasni, mielőtt új mappa nyílik.

import { oneLine, readAll } from "./kozos.mjs";

const argv = process.argv.slice(2);
const keresIdx = argv.indexOf("--keres");
const query = keresIdx !== -1 ? (argv[keresIdx + 1] ?? "") : null;

// Kötőszavak és általános igék: minden leírásban ott vannak, ezért nem különböztetnek meg.
const STOP = new Set([
  "a", "az", "egy", "és", "es", "vagy", "hogy", "ami", "amit", "amikor", "aki", "ha", "is",
  "nem", "de", "már", "meg", "mit", "ezt", "azt", "csak", "kell", "lehet", "való", "után",
  "előtt", "használd", "használja", "when", "the", "and", "for", "with", "use", "used",
  "that", "this", "from", "into", "its", "are", "you", "your",
]);

function tokens(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[`*_~()[\]{}<>„”"'.,;:!?/\\|+—–-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

// A magyar toldalékolás miatt a pontos egyezés túl szigorú ("teszt" vs "tesztek"),
// a részsztring-keresés viszont túl bőkezű. Előtag-egyezés, 4 karakteres alsó korláttal.
function matches(a, b) {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}

function score(queryTokens, entry) {
  const desc = tokens(entry.fm?.scalars?.description);
  const name = tokens(entry.name);
  let s = 0;
  for (const q of queryTokens) {
    if (desc.some((d) => matches(q, d))) s += 1;
    if (name.some((n) => matches(q, n))) s += 0.5; // a névtalálat megerősítés, nem önálló bizonyíték
  }
  return s;
}

const entries = readAll();
if (entries.length === 0) {
  console.log("Nincs se skill, se agent a .claude/ alatt.");
  process.exit(0);
}

// A skill → őt betöltő agentek térkép: ez mutatja meg, melyik konvenció-skillnek van gazdája.
const betolti = new Map();
for (const e of entries) {
  for (const s of e.fm?.lists?.skills ?? []) {
    if (!betolti.has(s)) betolti.set(s, []);
    betolti.get(s).push(e.name);
  }
}

const nameW = Math.max(12, ...entries.map((e) => e.name.length));

console.log(`Leltár — ${entries.filter((e) => e.kind === "skill").length} skill, ${entries.filter((e) => e.kind === "agent").length} agent\n`);
console.log(`${"típus".padEnd(6)}${"név".padEnd(nameW + 2)}${"bekötés".padEnd(26)}leírás`);
console.log("-".repeat(6 + nameW + 2 + 26 + 40));

for (const e of entries.slice().sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))) {
  const wiring =
    e.kind === "skill"
      ? (betolti.get(e.name)?.length ? `betölti: ${betolti.get(e.name).join(", ")}` : "önálló (/névvel hívható)")
      : (e.fm?.lists?.skills?.length ? `skills: ${e.fm.lists.skills.join(", ")}` : "nincs skill-bekötés");
  console.log(
    `${e.kind.padEnd(6)}${e.name.padEnd(nameW + 2)}${oneLine(wiring, 24).padEnd(26)}${oneLine(e.fm?.scalars?.description, 70)}`,
  );
}

if (query !== null) {
  const qt = tokens(query);
  console.log(`\nFedésvizsgálat — keresés: "${query}"`);
  if (qt.length === 0) {
    console.log("  A keresőkifejezésből nem maradt értékelhető szó (túl rövid vagy csak kötőszó).");
    process.exit(0);
  }
  console.log(`  értékelt szavak: ${qt.join(", ")}\n`);

  const ranked = entries
    .map((e) => ({ e, s: score(qt, e) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  if (ranked.length === 0) {
    console.log("  Nincs átfedő leírás. Ez a fedés HIÁNYÁRA utal, de nem bizonyítja:");
    console.log("  ha a szándék más szavakkal is leírható, keress újra azokkal.");
  } else {
    for (const { e, s } of ranked) {
      console.log(`  ${String(s).padStart(4)} pont  ${e.kind}/${e.name}  →  ${e.file}`);
    }
    console.log("\n  Olvasd el a listázott fájlokat, mielőtt új mappát nyitsz. Ha a képességet");
    console.log("  valamelyik már fedi, azt BŐVÍTSD — a duplikátum két, széttartó igazságot csinál.");
  }
}
