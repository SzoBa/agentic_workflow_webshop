#!/usr/bin/env node
// Egy frissen megírt `spec/{feature}/` mappa validátora — a `feature-spec-writer`
// 5. fázisának eszköze.
//
// Kilenc ellenőrzés, mind olyan hibaosztályra, ami NÉMA: a spec olvasva rendben van,
// az implementáló elindul rajta, és csak a validátornál — vagy egy review-ban —
// derül ki, hogy egy kritériumot nem lehet megítélni, vagy senki nem csinálta meg.
//
//   1. a három fájl megvan
//   2. kész-kritérium azonosító nélkül / duplikált azonosító
//   3. kész-kritérium `*Bizonyíték:*` sor nélkül
//   4. kritérium, amire egyetlen munkaegység sem hivatkozik (és fordítva: nem létező
//      azonosítóra hivatkozó munkaegység)
//   5. munkaegység `*Kész, ha:*` sor nélkül
//   6. kipipált checkbox — a `spec/` norma, nem munkanapló
//   7. megengedő megfogalmazás a kritériumban („elrejtheti", „célszerű", …)
//   8. holt belső hivatkozás (`.md` link a mappán belülről)
//   9. ütköző fájlnevek — csak kis/nagybetűben eltérő, vagy ugyanarra a kiterjesztés
//      nélküli importra feloldódó útvonalak a tervben (egymással és a meglévőkkel)
//
// A 4. a legfontosabb: egy kritérium, amihez nem vezet feladat, csöndben kimarad az
// implementációból, és a lánc végén a validátor jelenti be — a legdrágább helyen.
//
// Használat:
//   node .claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs admin-orders
//   node .claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs spec/admin-orders
//
// Kilépési kód: 1, ha bármi HIBA. A FIGYELEM nem bukik — mérlegelést kér, nem javítást.
//
// Zéró függőség, szándékosan: a `.claude/` mappa egyik build rendszernek sem tagja,
// és a projekt szabálya szerint új csomag csak kérdezés után kerülhet be.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = process.env.CLAUDE_PROJECT_DIR
  ? resolve(process.env.CLAUDE_PROJECT_DIR)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!arg) {
  console.error("Használat: spec-ellenoriz.mjs <feature-nev>");
  process.exit(2);
}

const feature = arg.replace(/\\/g, "/").replace(/^spec\//, "").replace(/\/+$/, "");
const dir = join(REPO, "spec", feature);

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`Nincs ilyen spec-mappa: spec/${feature}`);
  process.exit(2);
}

const findings = [];
const hiba = (file, line, msg) => findings.push({ level: "HIBA", file, line, msg });
const figyelem = (file, line, msg) => findings.push({ level: "FIGYELEM", file, line, msg });

/** Egy fájl sorai, vagy `null`, ha nincs meg. */
function sorok(nev) {
  const f = join(dir, nev);
  return existsSync(f) ? readFileSync(f, "utf8").split(/\r?\n/) : null;
}

// --- 1. a három fájl megvan ---------------------------------------------------

const SZEREPEK = [
  ["requirements.md", "a viselkedés normája és a kész-kritériumok"],
  ["plan.md", "az interfész szerződése"],
  ["tasks.md", "a végrehajtási sorrend"],
];

const fajlok = new Map();
for (const [nev, szerep] of SZEREPEK) {
  const l = sorok(nev);
  if (l === null) hiba(nev, null, `Hiányzik — ez a fájl adja: ${szerep}.`);
  else fajlok.set(nev, l);
}

const req = fajlok.get("requirements.md");
const tasks = fajlok.get("tasks.md");

// --- Checkbox-sorok kigyűjtése ------------------------------------------------

const CHECKBOX = /^\s*-\s*\[([ xX])\]\s*(.*)$/;
const AZONOSITO = /^\*\*([A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ0-9]{0,3}-\d{1,3})\*\*/;

/**
 * A checkbox-sorok és a hozzájuk tartozó blokk (a következő checkboxig vagy címsorig).
 * A `*Bizonyíték:*` / `*Kész, ha:*` sorok a blokkban vannak, nem magán a checkbox-soron.
 */
function checkboxBlokkok(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = CHECKBOX.exec(lines[i]);
    if (!m) continue;
    const blokk = [lines[i]];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (CHECKBOX.test(lines[j]) || /^#{1,6}\s/.test(lines[j])) break;
      blokk.push(lines[j]);
    }
    // Az ÁLLÍTÁS a checkbox-sor és a folytatása az első `*Címke:*` annotációig
    // (`*Bizonyíték:*`, `*Kész, ha:*`, `*Miért kritérium:*`, `*Hatóköre:*`). A
    // megengedő-szó vizsgálat csak erre nézhet: az annotáció gyakran IDÉZI a rossz
    // megfogalmazást, amit a kritérium épp kivált.
    const annotAt = blokk.findIndex((l) => /^\s*\*[^*]+:\*/.test(l));
    const allitas = (annotAt === -1 ? blokk : blokk.slice(0, annotAt)).join("\n");
    out.push({ line: i + 1, pipa: m[1] !== " ", szoveg: m[2], allitas, blokk: blokk.join("\n") });
  }
  return out;
}

// --- 2., 3., 6., 7. — a kész-kritériumok --------------------------------------

const MEGENGEDO = [
  "elrejtheti", "megjelenítheti", "célszerű", "lehetőleg", "javasolt", "ajánlott",
  "általában", "igyekezz", "ha lehet", "ha szükséges", "opcionálisan", "tetszőlegesen",
];

const kriteriumok = new Map(); // azonosító -> sorszám

if (req) {
  const blokkok = checkboxBlokkok(req);
  if (blokkok.length === 0) {
    hiba("requirements.md", null, "Egyetlen `- [ ]` kész-kritérium sincs benne. Enélkül a validátornak nincs mit mérnie.");
  }

  for (const b of blokkok) {
    if (b.pipa) {
      hiba("requirements.md", b.line, "Kipipált checkbox. A `spec/` a norma, nem munkanapló — a checkboxok üresen maradnak.");
    }

    const m = AZONOSITO.exec(b.szoveg);
    if (!m) {
      hiba("requirements.md", b.line, "Kész-kritérium azonosító nélkül (várt alak: `- [ ] **AR-01** — …`). Azonosító nélkül a feladatlista nem tud rá hivatkozni, és az ítélet sem hivatkozható.");
      continue;
    }

    const id = m[1];
    if (kriteriumok.has(id)) {
      hiba("requirements.md", b.line, `Duplikált kész-kritérium azonosító: \`${id}\` (már szerepelt a ${kriteriumok.get(id)}. sorban). Két állítás egy néven — az ítélet nem lesz egyértelmű.`);
    } else {
      kriteriumok.set(id, b.line);
    }

    if (!/\*Bizonyíték:\*/.test(b.blokk)) {
      hiba("requirements.md", b.line, `\`${id}\`: nincs \`*Bizonyíték:*\` sor. Ha nincs megnevezve, minek kell igazolnia, a pont nem ítélhető meg.`);
    }

    const alacsony = b.allitas.toLowerCase();
    for (const szo of MEGENGEDO) {
      if (alacsony.includes(szo)) {
        figyelem("requirements.md", b.line, `\`${id}\`: megengedő megfogalmazás (\`${szo}\`). Erre nem lehet \`[teljesül]\`-t mondani — ha a döntés még nincs meghozva, kérdezz rá, ne fogalmazd át magadtól.`);
        break;
      }
    }
  }
}

// --- 4., 5. — a feladatlista --------------------------------------------------

const hivatkozott = new Set();

if (tasks) {
  const blokkok = checkboxBlokkok(tasks);
  if (blokkok.length === 0) {
    hiba("tasks.md", null, "Egyetlen `- [ ]` munkaegység sincs benne.");
  }

  for (const b of blokkok) {
    if (b.pipa) {
      hiba("tasks.md", b.line, "Kipipált checkbox. A `spec/` a norma, nem munkanapló — a `tasks.md` checkboxait senki nem pipálja ki (a `spec-guard.mjs` gépileg is tiltja).");
    }
    if (!/\*Kész, ha:?\*/.test(b.blokk)) {
      hiba("tasks.md", b.line, "Munkaegység `*Kész, ha:*` sor nélkül. Enélkül nem verifikálható önállóan, és nem tudni, melyik kritériumot viszi előre.");
    }
    for (const m of b.blokk.matchAll(/\*\*([A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ0-9]{0,3}-\d{1,3})\*\*/g)) {
      hivatkozott.add(m[1]);
    }
  }

  for (const id of hivatkozott) {
    if (kriteriumok.size && !kriteriumok.has(id)) {
      hiba("tasks.md", null, `A feladatlista nem létező kész-kritériumra hivatkozik: \`${id}\`.`);
    }
  }

  for (const [id, line] of kriteriumok) {
    if (!hivatkozott.has(id)) {
      hiba("requirements.md", line, `\`${id}\`-re egyetlen munkaegység sem hivatkozik. Amire nem vezet feladat, azt nem fogja senki megcsinálni — a validátor viszont mérni fogja.`);
    }
  }
}

// --- 8. holt belső hivatkozás -------------------------------------------------

for (const [nev, lines] of fajlok) {
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of lines[i].matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
      const cel = m[1];
      if (/^[a-z]+:\/\//i.test(cel)) continue;
      if (!existsSync(resolve(dir, cel))) {
        hiba(nev, i + 1, `Holt hivatkozás: \`${cel}\` nem létezik.`);
      }
    }
  }
}

// --- 9. ütköző fájlnevek --------------------------------------------------------
//
// MEGTÖRTÉNT (2026-10-25): egy terv `client/src/kupon.ts` és `client/src/Kupon.tsx`
// mintájú fájlpárt írt elő egy mappába. Kis/nagybetűre érzéketlen fájlrendszeren
// (Windows, macOS) a kiterjesztés nélküli `./Kupon` import a `.ts`-re oldódott fel —
// a build `TS2305`/`TS1261` hibával állt meg, és az implementáló csak egy `.jsx`
// utótagos importtal tudta megkerülni. A spec
// szövegéből ez nem látszik, csak a fájlrendszeren — ezért gépi ellenőrzés.
//
// Két eset HIBA ugyanabban a mappában:
//   - két név csak kis/nagybetűben tér el (azonos kiterjesztés) → fájlütközés;
//   - két JS/TS modul törzse kis/nagybetű nélkül azonos → az import kétértelmű.
// A spec útvonalait a már létező fájlokkal is összeveti.

const MODUL_KITERJESZTES = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"]);

function bontas(p) {
  const i = p.lastIndexOf("/");
  const mappa = i === -1 ? "" : p.slice(0, i);
  const nev = i === -1 ? p : p.slice(i + 1);
  const j = nev.lastIndexOf(".");
  return { mappa, nev, torzs: j <= 0 ? nev : nev.slice(0, j), kit: j <= 0 ? "" : nev.slice(j + 1) };
}

function utkozik(a, b) {
  if (a.nev === b.nev) return null;
  if (a.torzs.toLowerCase() !== b.torzs.toLowerCase()) return null;
  if (a.kit.toLowerCase() === b.kit.toLowerCase()) return "csak kis/nagybetűben tér el — kis/nagybetűre érzéketlen fájlrendszeren ugyanaz a fájl";
  if (MODUL_KITERJESZTES.has(a.kit.toLowerCase()) && MODUL_KITERJESZTES.has(b.kit.toLowerCase())) {
    return "a kiterjesztés nélküli import mindkettőre feloldódhat — kis/nagybetűre érzéketlen fájlrendszeren a feloldó a kiterjesztések sorrendje szerint választ";
  }
  return null;
}

const tervUtak = new Map(); // útvonal → első előfordulás { fajl, line }
for (const nev of ["plan.md", "tasks.md"]) {
  const lines = fajlok.get(nev);
  if (!lines) continue;
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of lines[i].matchAll(/`([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+)(?::[\d-]+)?`/g)) {
      const p = m[1];
      if (p.includes("..") || p.startsWith("spec/")) continue;
      if (!tervUtak.has(p)) tervUtak.set(p, { fajl: nev, line: i + 1 });
    }
  }
}

const jelzett = new Set();
const utak = [...tervUtak.keys()];
for (let x = 0; x < utak.length; x += 1) {
  const a = bontas(utak[x]);
  // (a) a spec két útvonala egymással
  for (let y = x + 1; y < utak.length; y += 1) {
    const b = bontas(utak[y]);
    if (a.mappa.toLowerCase() !== b.mappa.toLowerCase()) continue;
    const ok = utkozik(a, b);
    if (!ok) continue;
    const kulcs = [utak[x], utak[y]].sort().join("|");
    if (jelzett.has(kulcs)) continue;
    jelzett.add(kulcs);
    const hol = tervUtak.get(utak[y]);
    hiba(hol.fajl, hol.line, `Ütköző fájlnevek: \`${utak[x]}\` és \`${utak[y]}\` — ${ok}. Nevezd át az egyiket.`);
  }
  // (b) a spec útvonala egy már létező fájllal
  const lemezMappa = join(REPO, a.mappa);
  if (!existsSync(lemezMappa)) continue;
  let meglevok = [];
  try {
    meglevok = readdirSync(lemezMappa);
  } catch {
    continue;
  }
  for (const f of meglevok) {
    const b = bontas(`${a.mappa}/${f}`);
    if (tervUtak.has(`${a.mappa}/${f}`)) continue; // azt az (a) ág már nézte
    const ok = utkozik(a, b);
    if (!ok) continue;
    const kulcs = [utak[x], `${a.mappa}/${f}`].sort().join("|");
    if (jelzett.has(kulcs)) continue;
    jelzett.add(kulcs);
    const hol = tervUtak.get(utak[x]);
    hiba(hol.fajl, hol.line, `Ütköző fájlnév a meglévővel: \`${utak[x]}\` és a már létező \`${a.mappa}/${f}\` — ${ok}. Nevezd át az újat.`);
  }
}

// --- Egyéb, nem kötelező fájlok ------------------------------------------------

const ismert = new Set(SZEREPEK.map(([n]) => n));
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".md") || ismert.has(f)) continue;
  figyelem(f, null, "Melléklet a spec-mappában. A lánc agentjei a mappa MINDEN `.md` fájlját normatívnak tekintik — ha ez nem norma (jegyzet, napló), nem itt a helye.");
}

// --- Jelentés ------------------------------------------------------------------

console.log(`Spec-ellenőrzés — spec/${feature} (${kriteriumok.size} kész-kritérium, ${hivatkozott.size} hivatkozva a feladatlistából)\n`);

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

if (findings.length === 0) {
  console.log("Nincs találat.");
} else {
  for (const [file, list] of [...byFile.entries()].sort()) {
    console.log(`spec/${feature}/${file}`);
    for (const f of list.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))) {
      const hol = f.line ? `spec/${feature}/${file}:${f.line}` : `spec/${feature}/${file}`;
      console.log(`  ${f.level.padEnd(8)} ${hol}\n           ${f.msg}`);
    }
    console.log("");
  }
}

const hibak = findings.filter((f) => f.level === "HIBA").length;
const figyelmek = findings.length - hibak;
console.log(`Összesen: ${hibak} HIBA, ${figyelmek} FIGYELEM.`);
if (figyelmek && !hibak) {
  console.log("A FIGYELEM nem bukik: mérlegelést kér. Ha tudatos döntés, írd le a jelentésben, miért az.");
}
process.exit(hibak ? 1 : 0);
