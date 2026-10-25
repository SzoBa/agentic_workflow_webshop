#!/usr/bin/env node
// A `.claude/` skill- és agent-készlet validátora — a `skill-iro` 5. fázisának eszköze.
//
// Kilenc ellenőrzés, mind olyan hibaosztályra, ami ma NÉMA: a fájl érvényesnek látszik,
// a futás zöld, és csak később derül ki, hogy a leírás és a valóság szétcsúszott.
//
//   1. frontmatter        — hiányzó/rossz `name`, `description`
//   2. holt hivatkozás    — a SKILL.md `references/…`-re mutat, ami nincs (és fordítva: árva fájl)
//   3. skills:-bekötés    — az agent nem létező skillt tölt be
//   4. hook-bekötés       — nem létező hookfájl, vagy a hook által NEM ismert mód-string —
//                           az agent-frontmatterben, és `--mind` mellett a `.claude/settings.json`-ban
//   5. ténykiszivárgás    — projekttény olyan agentben, aminek van konvenció-skillje, vagy
//                           hordozhatónak jelölt skillben (szűkebb mintakészlettel)
//   6. méret              — a SKILL.md/agent túlnőtt azon, amit érdemes egyben tartani
//   7. hook-válasz        — egy hook `defer`-t ír a stdout-ra, vagy 0/2-n kívüli kóddal lép ki
//                           (csak `--mind`; futtatva mér, és összesítő sort ír)
//   8. engedélylista      — egy előírt parancsalakra nincs illeszkedő `permissions.allow`
//                           minta a `.claude/settings.json`-ban (csak `--mind`; FIGYELEM)
//   9. készletszámok      — a `.claude/README.md` és a gyökér `README.md` „N skill, M agent és
//                           K hook (plusz L közös modul)" mondata eltér a tényleges készlettől
//                           (csak `--mind`; HIBA)
//
// Tudatos döntés jelölése (az 5. és a 6. FIGYELEM-re, és az 5. hatókörére) — EGYSOROS
// HTML-komment a fájl törzsében, kötelező indoklással a ` — ` után:
//
//   <!-- ellenoriz: teny-kivetel `tok1`, `tok2` — indok -->   az 5.: csak a felsorolt tokenen
//        BELÜL álló találat mentesül, egy új, véletlen projekttény nem; amit egyik token sem
//        ment fel, az elavult kivétel (FIGYELEM)
//   <!-- ellenoriz: meret-kivetel max=360 — indok -->          a 6.: a felső korlát kötelező,
//        hogy a kivétel ne fedjen el korlátlan növekedést
//   <!-- ellenoriz: hordozhato — indok -->                     egy skill bekapcsolja magára az
//        5.-et (a repó útvonalaira és csomagneveire; eszköz- és parancsnévre nem)
//
// A felmentett találat nem tűnik el: a záró összesítő megszámolja.
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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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
// A harmadik elem (`H`) azt mondja meg, hogy a minta a hordozhatónak jelölt SKILLRE is vonatkozik-e:
// ott csak a repó saját útvonalai, csomagnevei és portjai tények — egy Java unit-teszt skillben a
// `mvn` vagy a `JaCoCo` a módszer része, nem kiszivárgott projekttény.
const H = true;
const TENY_MINTAK = [
  [/\b(server-java|client|e2e)\//, "útvonal", H],
  [/\bspec\/[a-z]/, "útvonal", H],
  [/\bdocs\/test-plans\b/, "útvonal", H],
  [/\.claude\/worktrees\b/, "útvonal", H],
  [/\bhu\.webshop\b/, "csomagnév", H],
  [/\bnpm\s+(run|ci|install|test|start)\b/, "parancs"],
  [/\bmvn\s+[\w:@-]/, "parancs"],
  [/\bnpx\s+\w/, "parancs"],
  [/\bstart\.(sh|cmd)\b/, "parancs"],
  [/--(clean-store|skip-rate-limit)\b/, "kapcsoló"],
  [/\b(3001|5173|5432)\b/, "portszám", H],
  [/@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping|Transactional|Entity|SpringBootTest)\b/, "Spring-annotáció"],
  [/\b(docker\s+compose|pg_isready|Flyway|Testcontainers|JaCoCo|Postgres(?:QL)?|Spring(?:\s+Boot)?)\b/i, "eszköznév"],
];

// --- A tudatos döntés jelölői (lásd a fejlécet) --------------------------------
//
// Egysoros HTML-komment, mert a SKILL.md és az agent törzse a modell promptja: egy komment ott
// nem zavar, és a Markdown-nézetben sem látszik. Az indoklás kötelező — indok nélküli kivétel
// nem döntés, hanem némítás.
const JELOLO = /<!--\s*ellenoriz:\s*([a-z-]+)\b(.*?)-->/;
const JELOLO_FAJTAK = new Set(["teny-kivetel", "meret-kivetel", "hordozhato"]);
const INDOK_MIN = 15;

function jelolok(e) {
  const out = { teny: [], meret: null, hordozhato: null, sorok: new Set() };
  let kodblokk = false; // a ``` kerítésen belüli jelölő példa (dokumentáció), nem döntés
  for (let i = 0; i < e.lines.length; i += 1) {
    const sor = e.lines[i];
    if (/^\s*(```|~~~)/.test(sor)) kodblokk = !kodblokk;
    if (kodblokk || !/<!--\s*ellenoriz:/.test(sor)) continue;
    out.sorok.add(i + 1);
    const m = JELOLO.exec(sor);
    if (!m) {
      figyelem(e, i + 1, "Az `ellenoriz:` jelölő nem egysoros (a `-->` nem ugyanebben a sorban áll) — a gép nem olvassa, a kivétel nem érvényes.");
      continue;
    }
    const [, fajta, maradek] = m;
    if (!JELOLO_FAJTAK.has(fajta)) {
      figyelem(e, i + 1, `Ismeretlen jelölő: \`${fajta}\`. Ismertek: ${[...JELOLO_FAJTAK].join(", ")}. Egy elgépelt jelölő semmit nem ment fel.`);
      continue;
    }
    const valaszto = /\s[—–]\s|\s--\s/.exec(maradek);
    const fej = valaszto ? maradek.slice(0, valaszto.index) : maradek;
    const indok = valaszto ? maradek.slice(valaszto.index + valaszto[0].length).trim() : "";
    if (indok.length < INDOK_MIN) {
      figyelem(e, i + 1, `A \`${fajta}\` jelölőnek nincs indoklása (a \` — \` után legalább ${INDOK_MIN} karakter). Indok nélküli kivétel nem döntés — a jelölő nem érvényes.`);
      continue;
    }
    if (fajta === "teny-kivetel") {
      const tick = [...fej.matchAll(/`([^`]+)`/g)].map((t) => t[1]);
      const tokenek = (tick.length ? tick : fej.split(",")).map((t) => t.trim()).filter(Boolean);
      if (!tokenek.length) {
        figyelem(e, i + 1, "A `teny-kivetel` jelölő nem nevez meg tokent (`` `server-java/src/test/` `` alakban) — egy token nélküli kivétel mindent felmentene, ezért nem érvényes.");
        continue;
      }
      for (const t of tokenek) out.teny.push({ token: t, sor: i + 1, hasznalt: 0 });
    } else if (fajta === "meret-kivetel") {
      const max = /\bmax=(\d+)\b/.exec(fej);
      if (!max || Number(max[1]) <= 300) {
        figyelem(e, i + 1, "A `meret-kivetel` jelölőből hiányzik a 300 fölötti `max=N` felső korlát — enélkül a kivétel korlátlan növekedést fedne el, ezért nem érvényes.");
        continue;
      }
      out.meret = { max: Number(max[1]), sor: i + 1 };
    } else {
      out.hordozhato = { sor: i + 1 };
    }
  }
  return out;
}

/** A sor `index`-en kezdődő, `hossz` hosszú találata egy kivétel-token BELSEJÉBE esik-e. */
function felmentett(sor, index, hossz, kivetelek) {
  for (const k of kivetelek) {
    let p = sor.indexOf(k.token);
    while (p !== -1) {
      if (p <= index && index + hossz <= p + k.token.length) {
        k.hasznalt += 1;
        return true;
      }
      p = sor.indexOf(k.token, p + 1);
    }
  }
  return false;
}

const kivetelOsszesito = { teny: 0, tenyFajl: new Set(), meret: [] };

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
  // Arra az agentre, amelyiknek VAN konvenció-skillje: ott a tények helye a skill. Aminek
  // nincs, ott a tény az egyetlen helyen van, és nem tud szétcsúszni. És arra a skillre, amelyik
  // `hordozhato` jelölővel vállalja, hogy idegen projekten is fut — ott a repó útvonala hazugság.
  const jel = jelolok(e);
  const agentSkillel = e.kind === "agent" && (e.fm.lists.skills ?? []).length > 0;
  const hordozhatoSkill = e.kind === "skill" && jel.hordozhato;
  if (jel.hordozhato && e.kind !== "skill") {
    figyelem(e, jel.hordozhato.sor, "A `hordozhato` jelölő csak skillre értelmes — az agent hatókörét a `skills:` mező dönti el.");
  }
  if (agentSkillel || hordozhatoSkill) {
    const mintak = hordozhatoSkill ? TENY_MINTAK.filter((m) => m[2]) : TENY_MINTAK;
    const hova = agentSkillel
      ? `A helye a \`${e.fm.lists.skills.join("`/`")}\` skillben van — itt előbb-utóbb elavul.`
      : "A skill hordozhatónak van jelölve: a repó ténye a konvenció-skillbe vagy a hívó agentbe való.";
    const bodyLines = e.body.split(/\r?\n/);
    for (let i = 0; i < bodyLines.length; i += 1) {
      const sorszam = e.bodyStart + i;
      if (jel.sorok.has(sorszam)) continue; // a jelölő maga sorolja fel a tokeneket
      let talalat = null;
      for (const [re, mit] of mintak) {
        for (const hit of bodyLines[i].matchAll(new RegExp(re.source, `${re.flags}g`))) {
          if (felmentett(bodyLines[i], hit.index, hit[0].length, jel.teny)) {
            kivetelOsszesito.teny += 1;
            kivetelOsszesito.tenyFajl.add(e);
            continue;
          }
          talalat = { hit: hit[0], mit };
          break;
        }
        if (talalat) break; // soronként egy (fel nem mentett) találat elég
      }
      if (talalat) {
        figyelem(e, sorszam, `Projekttény (${talalat.mit}) ${agentSkillel ? "az agentben" : "a skillben"}: \`${talalat.hit}\`. ${hova}`);
      }
    }
  }
  for (const k of jel.teny) {
    if (!k.hasznalt) {
      figyelem(e, k.sor, `A \`teny-kivetel\` jelölő \`${k.token}\` tokenje egyetlen találatot sem ment fel — elavult vagy fölösleges kivétel, töröld a jelölőből.`);
    }
  }

  // --- 6. méret ---------------------------------------------------------------
  const sorok = e.lines.length;
  if (sorok > 300) {
    if (jel.meret && sorok <= jel.meret.max) {
      kivetelOsszesito.meret.push(`${relative(REPO, e.file).replace(/\\/g, "/")} (${sorok}/${jel.meret.max})`);
    } else {
      figyelem(
        e,
        jel.meret ? jel.meret.sor : null,
        `${sorok} sor. `
          + (jel.meret ? `Túlnőtt a saját méret-kivételén (max=${jel.meret.max}): a döntést újra kell gondolni, nem a számot emelni. ` : "300 fölött a tartalom egy része ")
          + (jel.meret ? "" : e.kind === "skill"
            ? "`references/`-be való: ami nem kell MINDEN futáshoz, az igény szerint töltődjön be."
            : "a hozzá tartozó konvenció-skillbe való."),
      );
    }
  } else if (jel.meret) {
    figyelem(e, jel.meret.sor, `${sorok} sor — a \`meret-kivetel\` jelölő fölösleges (300 alatt nincs mit felmenteni), töröld.`);
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
// a kimenetet szűrő `2>&1 | tail` változattal együtt, mert az agentek így futtatják őket. A
// `java -version` és a `mvn -v` a stderr-re ír, ezért szinte mindig `2>&1`-gyel fut: a pontos
// minta erre az alakra NEM illeszkedik (3. audit, 15. sor).
const ELOIRT_PARANCSOK = [
  "curl -s http://localhost:3001/api/health",
  "mvn -o jacoco:check@check-unit-tested-classes",
  "mvn -o jacoco:check@check-unit-tested-classes 2>&1 | tail -20",
  "cd server-java && mvn clean test",
  "cd server-java && mvn clean test 2>&1 | tail -40",
  "npm run lint",
  "npm run lint 2>&1 | tail -20",
  "cd .claude/worktrees/pelda-impl && npm run lint",
  "npm ci",
  "npm ci 2>&1 | tail -5",
  "cd .claude/worktrees/pelda-impl && npm ci",
  "java -version 2>&1",
  "mvn -v 2>&1",
  "git status --porcelain",
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
  // Az ideiglenes projektgyökér a repó gitignore-olt `.scratch/tmp/` mappájába kerül, egyedi
  // névvel — nem a `%TEMP%`-be: a fejlesztő szabálya a natív eszközöket a munkaterületen belül
  // tartja. A mérő hookok a `CLAUDE_PROJECT_DIR`-ből számolják a tárukat, így a naplóik ide,
  // nem a valódi `docs/orchestration/_kontextus/`-ba íródnak; a mappát a `finally` törli.
  const tmpGyoker = join(REPO, ".scratch", "tmp");
  mkdirSync(tmpGyoker, { recursive: true });
  const tmp = mkdtempSync(join(tmpGyoker, "ellenoriz-hook-"));
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

// --- 9. készletszámok a README-kben (csak `--mind`) ----------------------------
//
// A `.claude/README.md` és a gyökér `README.md` egy-egy mondatban kimondja, hány skill, agent és
// hook van („10 skill, 11 agent és 3 hook (plusz egy közös modul)"). Ezt semmi nem mérte, ezért
// egy új skill után a szám csendben hazudott. A tényt ugyanabból vesszük, amiből a többi
// ellenőrzés: skill = mappa `SKILL.md`-vel, agent = `.md` az `agents/` alatt, hook = `.mjs`, aminek
// van `switch (MODE)` módlistája, modul = a többi `.mjs`. A README-t NEM ez a script javítja —
// a HIBA a helyes számot mondja meg.
let keszletOsszesito = null;
if (mind) {
  const hookDir = join(REPO, ".claude", "hooks");
  const mjs = existsSync(hookDir) ? readdirSync(hookDir).filter((f) => f.endsWith(".mjs")) : [];
  const teny = {
    skill: all.filter((e) => e.kind === "skill").length,
    agent: all.filter((e) => e.kind === "agent").length,
    hook: mjs.filter((f) => hookModes(join(hookDir, f))).length,
  };
  teny.modul = mjs.length - teny.hook;
  const SZAM = { egy: 1, két: 2, kettő: 2, három: 3, négy: 4, öt: 5, hat: 6, hét: 7, nyolc: 8, kilenc: 9, tíz: 10 };
  const szam = (s) => (/^\d+$/.test(s) ? Number(s) : SZAM[s.toLowerCase()] ?? null);
  const MONDAT = /(\d+)\s+skill\w*\s*,\s*(\d+)\s+agent\w*\s+és\s+(\d+)\s+hook\w*(?:\s*\(\s*plusz\s+(\S+)\s+közös\s+modul)?/;
  const meresek = [];
  for (const rel of [".claude/README.md", "README.md"]) {
    const file = join(REPO, rel);
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    const pseudo = { file, kind: "readme", name: rel, lines };
    // A mondat sortöréssel és félkövérrel is állhat: soronként összefűzve, `**` nélkül keresünk,
    // és a találat sorát a kezdő számjegy sorából vesszük.
    let talalt = false;
    for (let i = 0; i < lines.length && !talalt; i += 1) {
      const ablak = lines.slice(i, i + 3).join(" ").replace(/\*\*/g, "").replace(/\s+/g, " ");
      const m = MONDAT.exec(ablak);
      if (!m || !lines[i].replace(/\*\*/g, "").includes(`${m[1]} skill`)) continue;
      talalt = true;
      const mondott = { skill: Number(m[1]), agent: Number(m[2]), hook: Number(m[3]), modul: m[4] ? szam(m[4]) : null };
      const elteres = ["skill", "agent", "hook", "modul"]
        .filter((k) => mondott[k] !== null && mondott[k] !== teny[k])
        .map((k) => `${k}: ${mondott[k]} helyett ${teny[k]}`);
      if (mondott.modul === null && m[4]) elteres.push(`modul: a „${m[4]}” nem olvasható számként`);
      if (elteres.length) {
        hiba(pseudo, i + 1, `A készletszám eltér a tényleges készlettől (${elteres.join("; ")}). A helyes mondat: „${teny.skill} skill, ${teny.agent} agent és ${teny.hook} hook (plusz ${teny.modul} közös modul)”.`);
      }
      meresek.push(rel);
    }
    if (!talalt) {
      figyelem(pseudo, null, "Nincs benne „N skill, M agent és K hook” alakú készletszám-mondat — a 9. ellenőrzés ezt a fájlt NEM mérte. Ha a mondat átfogalmazódott, a mérés csendben kiesett.");
    }
  }
  keszletOsszesito = `9. készletszámok: ${meresek.length} README mérve (${meresek.join(", ") || "egy sem"}) — tény: ${teny.skill} skill, ${teny.agent} agent, ${teny.hook} hook + ${teny.modul} modul`;
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

if (kivetelOsszesito.teny) {
  const fajlok = [...kivetelOsszesito.tenyFajl].map((e) => relative(REPO, e.file).replace(/\\/g, "/"));
  console.log(`5. ténykiszivárgás: ${kivetelOsszesito.teny} találat tudatos kivétellel felmentve (${fajlok.join(", ")})`);
}
if (kivetelOsszesito.meret.length) {
  console.log(`6. méret: ${kivetelOsszesito.meret.length} fájl 300 sor fölött, tudatos kivétellel (sor/max): ${kivetelOsszesito.meret.join(", ")}`);
}
if (hookOsszesito) console.log(hookOsszesito);
if (mind) console.log(`8. engedélylista: ${ELOIRT_PARANCSOK.length} előírt parancsalak mérve a .claude/settings.json ellen`);
if (keszletOsszesito) console.log(keszletOsszesito);
console.log(`Összesen: ${hibak} HIBA, ${figyelmek} FIGYELEM.`);
if (figyelmek && !hibak) {
  console.log("A FIGYELEM nem bukik: mérlegelést kér. Ha tudatos döntés, írd le a fájlban, miért az — az 5. és a 6. ellenőrzésnél egysoros `<!-- ellenoriz: teny-kivetel|meret-kivetel … — indok -->` jelölővel (lásd a script fejlécét).");
}
process.exit(hibak ? 1 : 0);
