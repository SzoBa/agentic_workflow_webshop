#!/usr/bin/env node
// A `.claude/` skill- és agent-készlet validátora — a `skill-iro` 5. fázisának eszköze.
//
// Hat ellenőrzés, mind olyan hibaosztályra, ami ma NÉMA: a fájl érvényesnek látszik,
// a futás zöld, és csak később derül ki, hogy a leírás és a valóság szétcsúszott.
//
//   1. frontmatter        — hiányzó/rossz `name`, `description`
//   2. holt hivatkozás    — a SKILL.md `references/…`-re mutat, ami nincs (és fordítva: árva fájl)
//   3. skills:-bekötés    — az agent nem létező skillt tölt be
//   4. hook-bekötés       — nem létező hookfájl, vagy a hook által NEM ismert mód-string
//   5. ténykiszivárgás    — projekttény olyan agentben, aminek van konvenció-skillje
//   6. méret              — a SKILL.md/agent túlnőtt azon, amit érdemes egyben tartani
//
// A 4. a legfontosabb: a `spec-guard.mjs` ismeretlen módra `defer`-t ad (lásd a fájl
// végi `switch (MODE)` `default` ágát), tehát egy elgépelt mód-string NÉMÁN kikapcsolja
// az őrt — a futás zöld, a védelem nulla.
//
// Használat:
//   node .claude/skills/skill-iro/scripts/ellenoriz.mjs --mind
//   node .claude/skills/skill-iro/scripts/ellenoriz.mjs skill-iro
//
// Kilépési kód: 1, ha bármi HIBA. A FIGYELEM nem bukik — mérlegelést kér, nem javítást.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO, readAll } from "./kozos.mjs";

const argv = process.argv.slice(2);
const mind = argv.includes("--mind");
const target = argv.find((a) => !a.startsWith("--"));

if (!mind && !target) {
  console.error("Használat: ellenoriz.mjs <skill-vagy-agent-nev> | --mind");
  process.exit(2);
}

const findings = [];
const hiba = (e, line, msg) => findings.push({ level: "HIBA", entry: e, line, msg });
const figyelem = (e, line, msg) => findings.push({ level: "FIGYELEM", entry: e, line, msg });

const all = readAll();
const skillNames = new Set(all.filter((e) => e.kind === "skill").map((e) => e.name));
const entries = mind ? all : all.filter((e) => e.name === target);

if (entries.length === 0) {
  console.error(`Nincs ilyen nevű skill vagy agent: ${target}`);
  process.exit(2);
}

// --- 4. ellenőrzés segédje: milyen módokat ismer egy hookfájl --------------------
//
// A módlistát a hook forrásából olvassuk ki, nem drótozzuk be: ha a hook új módot kap,
// a validátornak nem szabad hazudnia róla. Ha nem sikerül kiolvasni, azt megmondjuk.
const modeCache = new Map();
function hookModes(file) {
  if (modeCache.has(file)) return modeCache.get(file);
  let modes = null;
  try {
    const src = readFileSync(file, "utf8");
    const at = src.indexOf("switch (MODE)");
    if (at !== -1) {
      const found = [...src.slice(at).matchAll(/case\s+"([^"]+)"\s*:/g)].map((m) => m[1]);
      if (found.length) modes = found;
    }
  } catch {
    modes = null;
  }
  modeCache.set(file, modes);
  return modes;
}

/** A frontmatterben megadott sor sorszáma a fájlban (1-alapú), ha megtalálható. */
function lineOf(entry, needle, from = 0) {
  for (let i = from; i < entry.lines.length; i += 1) {
    if (entry.lines[i].includes(needle)) return i + 1;
  }
  return null;
}

const NEV_MINTA = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Projekttény-minták az 5. ellenőrzéshez. Mindegyik olyasmi, aminek a konvenció-skillben
// a helye: ha az agentben él, két helyen él, és előbb-utóbb szétcsúszik.
const TENY_MINTAK = [
  [/\b(server-java|client|e2e)\//, "útvonal"],
  [/\bspec\/[a-z]/, "útvonal"],
  [/\bnpm\s+(run|ci|install|test|start)\b/, "parancs"],
  [/\bmvn\s+[\w:@-]/, "parancs"],
  [/\bnpx\s+\w/, "parancs"],
  [/\b(3001|5173|5432)\b/, "portszám"],
  [/@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping|Transactional|Entity|SpringBootTest)\b/, "Spring-annotáció"],
  [/\b(docker\s+compose|pg_isready|Flyway|Testcontainers|JaCoCo)\b/i, "eszköznév"],
];

for (const e of entries) {
  const rel = relative(REPO, e.file).replace(/\\/g, "/");

  // --- 1. frontmatter ---------------------------------------------------------
  if (!e.fm) {
    hiba(e, 1, "Nincs `---` … `---` frontmatter. Enélkül a fájl nem töltődik be.");
    continue;
  }

  const name = e.fm.scalars.name;
  const desc = e.fm.scalars.description;

  if (!name) {
    hiba(e, 2, "Hiányzik a `name` mező.");
  } else {
    if (name !== e.name) {
      hiba(
        e,
        e.fm.keyLines.name,
        `A \`name\` (\`${name}\`) nem egyezik a ${e.kind === "skill" ? "mappa" : "fájl"}névvel (\`${e.name}\`). A betöltő a ${e.kind === "skill" ? "mappa" : "fájl"}nevet használja.`,
      );
    }
    if (!NEV_MINTA.test(name)) {
      hiba(e, e.fm.keyLines.name, `A \`name\` nem ékezet nélküli kebab-case: \`${name}\`.`);
    }
  }

  if (!desc || !desc.trim()) {
    hiba(e, 2, "Hiányzik vagy üres a `description` mező — enélkül a routing sosem találja meg.");
  } else if (desc.length > 1024) {
    hiba(e, e.fm.keyLines.description, `A \`description\` ${desc.length} karakter, a korlát 1024.`);
  }

  // --- 3. skills:-bekötés -----------------------------------------------------
  for (const s of e.fm.lists.skills ?? []) {
    if (!skillNames.has(s)) {
      hiba(
        e,
        lineOf(e, `- ${s}`) ?? e.fm.keyLines.skills,
        `A \`skills:\` nem létező skillre hivatkozik: \`${s}\`. A betöltés némán elmarad, az agent a konvenciók nélkül fut.`,
      );
    }
  }

  // --- 4. hook-bekötés --------------------------------------------------------
  for (const m of e.fm.raw.matchAll(/args:\s*(\[[^\]]*\])/g)) {
    let args;
    try {
      args = JSON.parse(m[1]);
    } catch {
      hiba(e, lineOf(e, m[0].slice(0, 40)), `A hook \`args\` tömbje nem értelmezhető: ${m[1]}`);
      continue;
    }
    if (!args.length) continue;

    const hookPath = join(REPO, String(args[0]).replace(/\$\{CLAUDE_PROJECT_DIR\}[\\/]?/, "").replace(/\\/g, "/"));
    const argLine = lineOf(e, String(args[0]).slice(-30));

    if (!existsSync(hookPath)) {
      hiba(e, argLine, `A hook fájlja nem létezik: ${args[0]}`);
      continue;
    }

    const modes = hookModes(hookPath);
    if (!modes) {
      figyelem(e, argLine, `A hook módlistája nem olvasható ki (${relative(REPO, hookPath).replace(/\\/g, "/")}), a mód-string nincs ellenőrizve.`);
      continue;
    }
    for (const mode of args.slice(1)) {
      if (!modes.includes(mode)) {
        hiba(
          e,
          argLine,
          `A hook nem ismeri ezt a módot: "${mode}". Ismertek: ${modes.join(", ")}. Ismeretlen módra a hook átengedi a hívást — az őr NÉMÁN kikapcsol.`,
        );
      }
    }
  }

  // --- 2. holt hivatkozás és árva fájl ----------------------------------------
  if (e.kind === "skill") {
    const hivatkozott = new Set();
    for (const m of e.body.matchAll(/(?:^|[\s(`"'])((?:references|scripts|assets)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)/g)) {
      const p = m[1];
      hivatkozott.add(p);
      if (!existsSync(join(e.dir, p))) {
        hiba(e, lineOf(e, p, e.bodyStart - 1), `Holt hivatkozás: \`${p}\` nem létezik.`);
      }
    }
    for (const sub of ["references", "scripts", "assets"]) {
      const dir = join(e.dir, sub);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (!statSync(join(dir, f)).isFile()) continue;
        if (!hivatkozott.has(`${sub}/${f}`)) {
          figyelem(e, null, `Árva fájl: \`${sub}/${f}\` — a SKILL.md nem hivatkozik rá, tehát sosem töltődik be.`);
        }
      }
    }
  }

  // --- 5. ténykiszivárgás -----------------------------------------------------
  // Csak arra az agentre, amelyiknek VAN konvenció-skillje: ott a tények helye a skill.
  // Aminek nincs, ott a tény az egyetlen helyen van, és nem tud szétcsúszni.
  if (e.kind === "agent" && (e.fm.lists.skills ?? []).length > 0) {
    const bodyLines = e.body.split(/\r?\n/);
    for (let i = 0; i < bodyLines.length; i += 1) {
      for (const [re, mit] of TENY_MINTAK) {
        const hit = re.exec(bodyLines[i]);
        if (hit) {
          figyelem(
            e,
            e.bodyStart + i,
            `Projekttény (${mit}) az agentben: \`${hit[0]}\`. A helye a \`${e.fm.lists.skills.join("`/`")}\` skillben van — itt előbb-utóbb elavul.`,
          );
          break; // soronként egy találat elég
        }
      }
    }
  }

  // --- 6. méret ---------------------------------------------------------------
  const sorok = e.lines.length;
  if (sorok > 300) {
    figyelem(
      e,
      null,
      `${sorok} sor. 300 fölött a tartalom egy része `
        + (e.kind === "skill"
          ? "`references/`-be való: ami nem kell MINDEN futáshoz, az igény szerint töltődjön be."
          : "a hozzá tartozó konvenció-skillbe való."),
    );
  }

  void rel;
}

// --- Jelentés -----------------------------------------------------------------

const byFile = new Map();
for (const f of findings) {
  const rel = relative(REPO, f.entry.file).replace(/\\/g, "/");
  if (!byFile.has(rel)) byFile.set(rel, []);
  byFile.get(rel).push(f);
}

const hibak = findings.filter((f) => f.level === "HIBA").length;
const figyelmek = findings.length - hibak;

console.log(`Ellenőrzés — ${entries.length} bejegyzés (${entries.filter((e) => e.kind === "skill").length} skill, ${entries.filter((e) => e.kind === "agent").length} agent)\n`);

if (findings.length === 0) {
  console.log("Nincs találat.");
} else {
  for (const [file, list] of [...byFile.entries()].sort()) {
    console.log(file);
    for (const f of list.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))) {
      const hol = f.line ? `${file}:${f.line}` : file;
      console.log(`  ${f.level.padEnd(8)} ${hol}\n           ${f.msg}`);
    }
    console.log("");
  }
}

console.log(`Összesen: ${hibak} HIBA, ${figyelmek} FIGYELEM.`);
if (figyelmek && !hibak) {
  console.log("A FIGYELEM nem bukik: mérlegelést kér. Ha tudatos döntés, írd le a fájlban, miért az.");
}
process.exit(hibak ? 1 : 0);
