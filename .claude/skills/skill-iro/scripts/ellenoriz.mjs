#!/usr/bin/env node
// A `.claude/` skill- és agent-készlet validátora — a `skill-iro` 5. fázisának eszköze.
//
// Nyolc ellenőrzés, mind olyan hibaosztályra, ami ma NÉMA: a fájl érvényesnek látszik,
// a futás zöld, és csak később derül ki, hogy a leírás és a valóság szétcsúszott.
//
//   1. frontmatter        — hiányzó/rossz `name`, `description`
//   2. holt hivatkozás    — a SKILL.md `references/…`-re mutat, ami nincs (és fordítva: árva fájl)
//   3. skills:-bekötés    — az agent nem létező skillt tölt be
//   4. hook-bekötés       — nem létező hookfájl, vagy a hook által NEM ismert mód-string —
//                           az agent-frontmatterben, és `--mind` mellett a `.claude/settings.json`-ban
//   5. ténykiszivárgás    — projekttény olyan agentben, aminek van konvenció-skillje
//   6. méret              — a SKILL.md/agent túlnőtt azon, amit érdemes egyben tartani
//   7. hook-válasz        — egy hook `defer`-t ír a stdout-ra, vagy 0/2-n kívüli kóddal lép ki
//                           (csak `--mind`; futtatva mér, és összesítő sort ír)
//   8. engedélylista      — egy előírt parancsalakra nincs illeszkedő `permissions.allow`
//                           minta a `.claude/settings.json`-ban (csak `--mind`; FIGYELEM)
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

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
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

/**
 * Egy hook-hívás (`[hookfájl, mód, …]`) ellenőrzése: létezik-e a fájl, és ismeri-e a módot.
 * Az agent-frontmatter és a `.claude/settings.json` bekötései ugyanezen mennek át — a kettő
 * ugyanazt a csapdát hordozza: ismeretlen (vagy hiányzó) módra a hook némán átenged.
 */
const bekotottHookok = new Set(); // a 7. ellenőrzéshez: mely fájlok hookok (és nem modulok)
function checkHookArgs(e, args, line) {
  const hookPath = join(REPO, args[0].replace(/\$\{?CLAUDE_PROJECT_DIR\}?[\\/]?/, "").replace(/\\/g, "/"));
  bekotottHookok.add(hookPath);
  if (!existsSync(hookPath)) {
    hiba(e, line, `A hook fájlja nem létezik: ${args[0]}`);
    return;
  }
  const modes = hookModes(hookPath);
  if (!modes) {
    figyelem(e, line, `A hook módlistája nem olvasható ki (${relative(REPO, hookPath).replace(/\\/g, "/")}), a mód-string nincs ellenőrizve.`);
    return;
  }
  if (args.length < 2) {
    hiba(e, line, `A hook mód-string nélkül van bekötve (${args[0]}). Ismertek: ${modes.join(", ")}. Mód nélkül a hook átengedi a hívást — az őr NÉMÁN kikapcsol.`);
    return;
  }
  for (const mode of args.slice(1)) {
    if (!modes.includes(mode)) {
      hiba(
        e,
        line,
        `A hook nem ismeri ezt a módot: "${mode}". Ismertek: ${modes.join(", ")}. Ismeretlen módra a hook átengedi a hívást — az őr NÉMÁN kikapcsol.`,
      );
    }
  }
}

/** Egysoros `command` sztring szétvágása, idézőjel-tudatosan (az `args` nélküli bekötéshez). */
function splitCommand(cmd) {
  return [...String(cmd).matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
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
    // A teljes tömb-szöveg (móddal együtt) a keresőkulcs: két bekötés ugyanarra a hookra
    // így a SAJÁT sorát kapja, nem mindkettő az elsőt.
    checkHookArgs(e, args.map(String), lineOf(e, m[1].split(/\r?\n/)[0]));
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

// --- 4/b. hook-bekötés a `.claude/settings.json`-ban (csak `--mind`) -----------
//
// A frontmatter nem az egyetlen hely, ahol mód-string él: a két mérő hook (`kontextus-mero`,
// `futas-mero`) a settings.json `hooks` blokkjában van bekötve. Egy elgépelt `"kpau"` ott
// ugyanúgy NÉMÁN kikapcsolja a költségkaput — ezért ugyanaz a vizsgálat fut rá, mint a
// frontmatterre. A `settings.local.json` is, ha van: az is bekötés, csak nem verziózott.
const settingsEntries = [];
if (mind) {
  for (const nev of ["settings.json", "settings.local.json"]) {
    const file = join(REPO, ".claude", nev);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const pseudo = { file, kind: "settings", name: nev, lines: text.split(/\r?\n/) };
    settingsEntries.push(pseudo);
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      hiba(pseudo, null, `Nem érvényes JSON: ${err.message}. Ilyenkor a fájl összes hookja és engedélye kiesik.`);
      continue;
    }
    let from = 0;
    for (const [esemeny, csoportok] of Object.entries(json.hooks ?? {})) {
      if (!Array.isArray(csoportok)) {
        hiba(pseudo, lineOf(pseudo, `"${esemeny}"`), `A \`hooks.${esemeny}\` nem tömb — a bekötés nem töltődik be.`);
        continue;
      }
      for (const csoport of csoportok) {
        for (const h of csoport?.hooks ?? []) {
          if (h?.type !== "command") continue;
          // Két alak: `command: "node"` + `args: [hookfájl, mód]`, vagy egysoros
          // `command: "node …/x.mjs mód"`. A hookfájl a `.claude/hooks/*.mjs` szó.
          let args = Array.isArray(h.args) ? h.args.map(String) : splitCommand(h.command ?? "").slice(1);
          const at = args.findIndex((a) => /\.claude[\\/]hooks[\\/][^\\/]+\.mjs$/.test(a));
          if (at === -1) continue; // nem projekt-hook: nincs módlista, amihez mérni lehetne
          args = args.slice(at);
          const line = lineOf(pseudo, args[0].slice(-30), from);
          if (line) from = line; // a következő bekötés a sorrendben UTÁNA keresendő
          checkHookArgs(pseudo, args, line);
        }
      }
    }
  }
}

// --- 8. engedélylista ↔ előírt parancsalakok (csak `--mind`) -------------------
//
// A `permissions.allow` minta és a skillekben/agentekben előírt parancs két külön helyen él,
// és a szétcsúszásuk NÉMA: a parancs nem bukik, hanem engedélykérésen akad el — a háttér-
// subagent pedig ott megáll. MEGTÖRTÉNT: `Bash(mvn -o jacoco:check:*)` sosem illeszkedett a
// `mvn -o jacoco:check@check-unit-tested-classes` alakra (a `:*` előtti `:check` után `@` jön,
// nem szóköz). Ezért az előírt alakokat itt rögzítjük, és a Claude Code DOKUMENTÁLT illesztési
// szabályával mérjük őket (code.claude.com/docs/en/permissions, „Wildcard patterns",
// „Compound commands"; ellenőrizve 2026-11-06):
//   - `*` nélkül a minta egy pontos parancs;
//   - a `*` bármit illeszt, szóközt is; a szóköz nélküli `x*` az `xyz`-t is;
//   - a záró ` *` előtti szóköz a minta része (szóhatár), és ha ez az egyetlen `*`, a puszta
//     parancsot is illeszti (`Bash(ls *)` → `ls`);
//   - a záró `:*` ugyanaz, mint a ` *` (máshol a kettőspont betű szerinti);
//   - összetett parancsnál (`&&`, `||`, `;`, `|`, `|&`, `&`, újsor) MINDEN részparancsnak
//     illeszkednie kell, kivéve a csak-olvasó részeket — itt: a projekten belüli `cd`-t és a
//     csőben álló csak-olvasó szűrőket (`tail`, `head`, `grep`, `wc`, `sort`, `cat`).
//   - az ÁTIRÁNYÍTÁS (`2>&1`, `> f`) a részparancs része marad. MÉRVE 2026-11-06, kézi
//     próbával: a pontos `Bash(mvn -o jacoco:check@check-unit-tested-classes)` minta a
//     `… 2>&1 | grep …` alakra engedélyt kért, a záró `:*`-os `node …dok-leltar.mjs` minta a
//     `… 2>&1 | tail -2` alakra nem. Ezért a `2>&1` `&`-je itt nem darabolási pont.
// A lista szándékosan kicsi: azok az alakok, amiket a lánc agentjei szó szerint futtatnak —
// a kimenetet szűrő `2>&1 | tail` változattal együtt, mert az agentek így futtatják őket.
const ELOIRT_PARANCSOK = [
  "curl -s http://localhost:3001/api/health",
  "mvn -o jacoco:check@check-unit-tested-classes",
  "mvn -o jacoco:check@check-unit-tested-classes 2>&1 | tail -20",
  "cd server-java && mvn clean test",
  "cd server-java && mvn clean test 2>&1 | tail -40",
  "npm run lint",
  "npx tsc --noEmit -p client/tsconfig.json",
  "node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --skip-rate-limit",
  "node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs",
  "rm -f .scratch/futas-merleg/aktiv-futas.json",
];

/** Csőben álló csak-olvasó szűrő, amihez nem kell engedélyminta (a Claude Code beépített halmaza). */
const CSAK_OLVASO_SZURO = /^(tail|head|grep|wc|sort|cat)(\s+(?!.*>)[^|]*)?$/;

/** Egy `Bash(…)` engedélyminta → RegExp, a fenti szabályok szerint. */
function engedelyRegex(minta) {
  let p = minta;
  if (p.endsWith(":*")) p = `${p.slice(0, -2)} *`;
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const csillagok = (p.match(/\*/g) ?? []).length;
  if (csillagok === 1 && p.endsWith(" *")) return new RegExp(`^${esc(p.slice(0, -2))}(?: .*)?$`, "s");
  return new RegExp(`^${p.split("*").map(esc).join(".*")}$`, "s");
}

/** A projekten belüli `cd` (relatív, `..`-val nem kilépő, vagy abszolút a REPO alatt). */
function projektenBeluliCd(resz) {
  const m = /^cd\s+("([^"]*)"|'([^']*)'|(\S+))\s*$/.exec(resz);
  if (!m) return false;
  const cel = (m[2] ?? m[3] ?? m[4]).replace(/\\/g, "/");
  const abs = /^([A-Za-z]:)?\//.test(cel) ? cel : join(REPO, cel).replace(/\\/g, "/");
  const r = relative(REPO, abs).replace(/\\/g, "/");
  return !r.startsWith("..") && !/^[A-Za-z]:/.test(r);
}

if (mind) {
  const file = join(REPO, ".claude", "settings.json");
  let allow = null;
  try {
    allow = JSON.parse(readFileSync(file, "utf8"))?.permissions?.allow ?? [];
  } catch {
    allow = null; // a JSON-hibát a 4/b már HIBA-ként jelentette
  }
  if (allow) {
    const pseudo = settingsEntries.find((p) => p.name === "settings.json") ?? { file, kind: "settings", name: "settings.json", lines: [] };
    const bashMintak = allow
      .map(String)
      .map((r) => /^Bash\((.*)\)$/s.exec(r))
      .filter(Boolean)
      .map((m) => ({ minta: m[1], re: engedelyRegex(m[1]) }));
    for (const parancs of ELOIRT_PARANCSOK) {
      // A `2>&1` / `>&2` `&`-je nem operátor: az átirányítás a részparancs része marad.
      const reszek = parancs
        .split(/\s*(?:&&|\|\||\|&|;|\||(?<![<>])&(?!>)|\n)\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const resz of reszek) {
        if (projektenBeluliCd(resz)) continue;
        if (CSAK_OLVASO_SZURO.test(resz)) continue;
        if (bashMintak.some((b) => b.re.test(resz))) continue;
        // Rokon = ugyanazzal a programmal kezdődő minták, a leghosszabb közös előtag szerint
        // a két legközelebbi — ezek közül szokott az lenni, amelyik „majdnem" illeszkedik.
        const kozos = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i += 1; return i; };
        const rokon = bashMintak
          .filter((b) => b.minta.split(/[ :*]/)[0] === resz.split(" ")[0])
          .sort((x, y) => kozos(y.minta, resz) - kozos(x.minta, resz))
          .slice(0, 2)
          .map((b) => `Bash(${b.minta})`);
        figyelem(
          pseudo,
          rokon.length ? lineOf(pseudo, rokon[0]) : lineOf(pseudo, '"allow"'),
          `Az előírt parancsalakra nincs illeszkedő \`permissions.allow\` minta: \`${parancs}\``
            + (reszek.length > 1 ? ` (a nem illeszkedő részparancs: \`${resz}\`)` : "")
            + `. ${rokon.length ? `Rokon minták, amik NEM illeszkednek: ${rokon.map((r) => `\`${r}\``).join(", ")}.` : "Nincs is rokon minta."}`
            + " A parancs engedélykérésen akad el, háttérben futva megállítja a láncot.",
        );
      }
    }
  }
}

// --- 7. hook-válasz: soha `defer` a stdout-on --------------------------------
//
// MEGTÖRTÉNT (2026-10-25, Claude Code 2.1.310): a kiadott
// `permissionDecision: "defer"` már nem „döntsön a normál folyamat", hanem a hívás
// ELHALASZTÁSA — a háttér-subagent az első Bash-hívásánál hibaüzenet nélkül
// megállt. A forrás szövegéből ez nem dönthető el megbízhatóan (a `defer` belső
// ítéletként jogos), ezért a hookot FUTTATJUK: minden módjával és egy ismeretlen
// móddal, néhány ártalmatlan bemenettel, ideiglenes `CLAUDE_PROJECT_DIR` alatt —
// így a mérő hookok naplói nem a repóba íródnak.
// A `defer` mellett a kilépési kódot is mérjük: csak a 0 és a 2 érvényes, minden más
// (vagy egy el sem induló, időtúllépő hívás) HIBA. A végén egy összesítő sor mondja meg,
// mennyi mérés történt — egy 0 hívásos „zöld" nem ellenőrzés.
let hookOsszesito = null;
if (mind) {
  const hookDir = join(REPO, ".claude", "hooks");
  const tmp = mkdtempSync(join(tmpdir(), "ellenoriz-hook-"));
  const bemenetek = [
    { tool_name: "Write", tool_input: { file_path: join(tmp, ".scratch", "x.txt") } },
    { tool_name: "Bash", tool_input: { command: "ls" } },
    { tool_name: "Agent", tool_input: { subagent_type: "spec-implementer", prompt: "x" }, transcript_path: join(tmp, "nincs.jsonl"), session_id: "ellenoriz" },
    { tool_name: "SendMessage", tool_input: { to: "nincs", message: "x" }, transcript_path: join(tmp, "nincs.jsonl"), session_id: "ellenoriz" },
    {},
  ];
  const stat = { hook: 0, mod: 0, hivas: 0, modul: [] };
  try {
    for (const f of existsSync(hookDir) ? readdirSync(hookDir) : []) {
      if (!f.endsWith(".mjs")) continue;
      const hookPath = join(hookDir, f);
      const modes = hookModes(hookPath);
      const pseudo = { file: hookPath };
      if (!modes) {
        // Modul (pl. futas-kozos.mjs) — vagy egy hook, aminek a módlistáját nem tudjuk
        // kiolvasni. A kettő közti különbség a bekötés: amit agent vagy settings.json hookként
        // köt be, az hook, és a kiolvasás hiánya azt jelenti, hogy a futtatott mérés kimaradt.
        if (bekotottHookok.has(hookPath)) {
          figyelem(pseudo, null, "Bekötött hook, de a módlistája nem olvasható ki (nincs `switch (MODE)` + `case \"…\":`) — a 7. ellenőrzés (futtatott mérés) ezt a hookot KIHAGYTA.");
        } else {
          stat.modul.push(f);
        }
        continue;
      }
      stat.hook += 1;
      stat.mod += modes.length;
      for (const mode of [...modes, "__ismeretlen_mod__"]) {
        for (const be of bemenetek) {
          const r = spawnSync(process.execPath, [hookPath, mode], {
            input: JSON.stringify(be),
            encoding: "utf8",
            env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
            timeout: 15000,
          });
          stat.hivas += 1;
          const mit = `\`${mode}\` módban (${be.tool_name ?? "üres bemenet"})`;
          if (r.error) {
            hiba(pseudo, null, `A hook ${mit} nem futott le: ${r.error.code ?? r.error.message}. Egy elakadó vagy el sem induló hook a valódi hívást is megakasztja.`);
            continue;
          }
          // 0 = nincs ítélet / JSON-ítélet a stdout-on; 2 = blokkoló hiba (stderr a modellnek).
          // Minden más kód a harness szemében nem-blokkoló hiba: a hook ítélete elveszik.
          if (r.status !== 0 && r.status !== 2) {
            const stderr = String(r.stderr ?? "").trim().split(/\r?\n/)[0] ?? "";
            hiba(pseudo, null, `A hook ${mit} ${r.status === null ? `jelzéssel állt le (${r.signal})` : `${r.status} kóddal lépett ki`} — csak a 0 és a 2 érvényes. ${stderr ? `stderr: ${stderr.slice(0, 160)}` : ""}`.trim());
            continue;
          }
          let dontes = null;
          try {
            dontes = JSON.parse(r.stdout || "null")?.hookSpecificOutput?.permissionDecision ?? null;
          } catch {
            dontes = /"defer"/.test(r.stdout ?? "") ? "defer" : null;
          }
          if (dontes === "defer") {
            hiba(
              pseudo,
              null,
              `A hook \`${mode}\` módban (${be.tool_name ?? "üres bemenet"}) \`permissionDecision: "defer"\`-t ír a stdout-ra. ` +
                "2.1.310 óta ez a hívás ELHALASZTÁSA, nem átengedés — a háttér-subagent némán megáll. „Nincs ítélet” = kimenet nélküli exit 0.",
            );
            break;
          }
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  hookOsszesito =
    `7. hook-válasz: ${stat.hook} hook, ${stat.mod} mód (+ hookonként 1 ismeretlen mód), ${stat.hivas} hívás`
    + (stat.modul.length ? `; modulként kihagyva (nincs bekötve): ${stat.modul.join(", ")}` : "");
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

const settingsInfo = settingsEntries.length ? ` + ${settingsEntries.map((p) => `.claude/${p.name}`).join(", ")}` : "";
console.log(`Ellenőrzés — ${entries.length} bejegyzés (${entries.filter((e) => e.kind === "skill").length} skill, ${entries.filter((e) => e.kind === "agent").length} agent)${settingsInfo}\n`);

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

if (hookOsszesito) console.log(hookOsszesito);
if (mind) console.log(`8. engedélylista: ${ELOIRT_PARANCSOK.length} előírt parancsalak mérve a .claude/settings.json ellen`);
console.log(`Összesen: ${hibak} HIBA, ${figyelmek} FIGYELEM.`);
if (figyelmek && !hibak) {
  console.log("A FIGYELEM nem bukik: mérlegelést kér. Ha tudatos döntés, írd le a fájlban, miért az.");
}
process.exit(hibak ? 1 : 0);
