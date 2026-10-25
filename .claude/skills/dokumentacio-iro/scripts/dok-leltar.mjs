#!/usr/bin/env node
// Végpont-leltár és dokumentációs kapu — a `dokumentacio-iro` skill 1. és 4. fázisának eszköze.
//
// Három forrásból veszi ugyanazt a végponthalmazt, és összeveti őket:
//
//   1. a KÓD      — a Spring controllerek leképezés-annotációi (ez az igazság),
//   2. az OpenAPI-leíró — a munkafa gyökerében lévő `openapi.yaml` / `.yml` / `.json`,
//   3. a README   — a munkafa gyökerében lévő `README.md`.
//
// MIÉRT GÉPI. „A dokumentáció naprakész" olyan állítás, amit végigolvasva mindig
// igaznak látszik: a meglévő sorok stimmelnek, és épp a HIÁNYZÓ sor az, amit nem
// lehet elolvasni. Ez a különbség pontosan az a hibaosztály, amit egy ember (és egy
// nyelvi modell) a legmegbízhatóbban elnéz — ezért nem próza ez a lépés.
//
// A kimenet minden végponthoz három pipát ad, és a hiányzókat külön felsorolja.
// Kilépési kód: 1, ha bármelyik oszlopban hiány vagy fölösleg van; 0, ha mind fedett.
//
// Használat:
//   node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs
//   node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs --json
//   node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs --csak-kod
//
// A `--csak-kod` a leltárt adja vissza dokumentum-összevetés nélkül (1. fázis:
// akkor is működik, amikor még egyáltalán nincs leíró). Ilyenkor mindig 0-val lép ki.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const jsonMod = argv.includes("--json");
const csakKod = argv.includes("--csak-kod");

// --- Repógyökér ---------------------------------------------------------------
// A `CLAUDE_PROJECT_DIR` az elsődleges, de nem elég: a lánc párhuzamos ága külön
// git-worktree-ben fut, ahol a szkript a saját munkafáját kell hogy mérje.
function repoRoot() {
  const jelolt = [process.env.CLAUDE_PROJECT_DIR, process.cwd()].filter(Boolean);
  for (const j of jelolt) {
    if (existsSync(join(j, ".git"))) return resolve(j);
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 40; i += 1) {
    if (existsSync(join(dir, ".git"))) return dir;
    const szulo = dirname(dir);
    if (szulo === dir) break;
    dir = szulo;
  }
  return resolve(jelolt[0] ?? ".");
}

const REPO = repoRoot();
const JAVA_FA = join(REPO, "server-java", "src", "main", "java");

// --- Kanonikus alak -----------------------------------------------------------
// A három forrás háromféleképp írja az útvonalparamétert: a Spring `{id}`-t, a
// README és a spec `:id`-t, az OpenAPI `{id}`-t. Az összevetés csak akkor mond
// igazat, ha előbb közös alakra hozzuk — enélkül minden paraméteres végpont
// hamis hiányként jelenne meg.
function kanonikus(utvonal) {
  return String(utvonal)
    .replace(/\{[^}]*\}/g, "{}")
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "{}")
    .replace(/\/+$/, "")
    .toLowerCase();
}

const kulcs = (metodus, utvonal) => `${metodus.toUpperCase()} ${kanonikus(utvonal)}`;

// --- 1. A kód -----------------------------------------------------------------

const METODUS_ANNOTACIO = {
  GetMapping: "GET",
  PostMapping: "POST",
  PutMapping: "PUT",
  PatchMapping: "PATCH",
  DeleteMapping: "DELETE",
};

function javaFajlok(dir, gyujto = []) {
  if (!existsSync(dir)) return gyujto;
  for (const nev of readdirSync(dir)) {
    const p = join(dir, nev);
    if (statSync(p).isDirectory()) javaFajlok(p, gyujto);
    else if (nev.endsWith(".java")) gyujto.push(p);
  }
  return gyujto;
}

/** Az annotáció zárójeléből az első string-literál (`"/{id}"`), ha van. */
function elsoLiteral(sor) {
  const m = /\(\s*(?:value\s*=\s*)?"([^"]*)"/.exec(sor);
  return m ? m[1] : "";
}

function osszefuz(alap, resz) {
  const egy = `${alap || ""}/${resz || ""}`.replace(/\/{2,}/g, "/");
  return egy.length > 1 ? egy.replace(/\/$/, "") : egy;
}

function kodVegpontok() {
  const talalatok = [];
  for (const fajl of javaFajlok(JAVA_FA)) {
    const sorok = readFileSync(fajl, "utf8").split(/\r?\n/);
    let alap = "";
    let osztalyMegvolt = false;

    for (let i = 0; i < sorok.length; i += 1) {
      const sor = sorok[i];

      // Az osztálydeklaráció ELŐTTI `@RequestMapping` az alapútvonal; utána már
      // metódus-annotáció lenne, azt nem szabad alapnak venni.
      if (!osztalyMegvolt && /^\s*(?:public\s+|final\s+|abstract\s+)*class\s+\w/.test(sor)) {
        osztalyMegvolt = true;
        continue;
      }
      if (!osztalyMegvolt && /@RequestMapping\b/.test(sor)) {
        alap = elsoLiteral(sor);
        continue;
      }
      if (!osztalyMegvolt) continue;

      const m = /@(\w+Mapping)\b/.exec(sor);
      if (!m) continue;
      const metodus = METODUS_ANNOTACIO[m[1]];
      if (!metodus) continue; // @RequestMapping metóduson: metódus nélkül nem sorolható be

      const utvonal = osszefuz(alap, elsoLiteral(sor));
      if (!utvonal.startsWith("/")) continue;

      talalatok.push({
        metodus,
        utvonal,
        forras: `${relative(REPO, fajl).replace(/\\/g, "/")}:${i + 1}`,
      });
    }
  }
  talalatok.sort((a, b) => (a.utvonal === b.utvonal ? a.metodus.localeCompare(b.metodus) : a.utvonal.localeCompare(b.utvonal)));
  return talalatok;
}

// --- 2. Az OpenAPI-leíró ------------------------------------------------------

function leiroFajl() {
  for (const nev of ["openapi.yaml", "openapi.yml", "openapi.json"]) {
    const p = join(REPO, nev);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * A `paths:` blokk kiolvasása FÜGGŐSÉG NÉLKÜL.
 *
 * Ez SZÁNDÉKOSAN szűk YAML-olvasó, nem parser: a projekt szabálya, hogy új
 * függőséget csak egyeztetés után veszünk fel, és egy teljes YAML-parser ehhez az
 * egy kérdéshez túl nagy ár. Amit ismer: a nulla behúzású `paths:` kulcsot, alatta
 * a `/`-rel kezdődő útvonalkulcsokat, azok alatt a HTTP-metódusokat. Amit NEM
 * ismer: horgony (`&`/`*`), `$ref`-fel behúzott útvonal, folyó (`{...}`) alak,
 * többsoros kulcs. Ha a leíró ilyet használ, ez a szkript ALULMÉR — ezért a
 * kimenet kimondja, hány útvonalat olvasott ki, hogy a szám szemre ellenőrizhető
 * legyen.
 */
function yamlPaths(szoveg) {
  const sorok = szoveg.split(/\r?\n/);
  const eredmeny = [];
  let benne = false;
  let utBehuzas = null;
  let aktUt = null;

  for (const sor of sorok) {
    if (!sor.trim() || /^\s*#/.test(sor)) continue;

    if (!benne) {
      if (/^paths:\s*$/.test(sor)) benne = true;
      continue;
    }
    // Nulla behúzású kulcs: vége a `paths:` blokknak.
    if (/^\S/.test(sor)) break;

    const behuzas = sor.length - sor.trimStart().length;
    const utM = /^\s*['"]?(\/[^'":\s]*)['"]?\s*:\s*$/.exec(sor);
    if (utM && (utBehuzas === null || behuzas === utBehuzas)) {
      utBehuzas = behuzas;
      aktUt = utM[1];
      continue;
    }
    if (aktUt === null) continue;

    const mM = /^\s*(get|post|put|patch|delete|options|head|trace)\s*:/i.exec(sor);
    if (mM && behuzas > utBehuzas) {
      eredmeny.push({ metodus: mM[1].toUpperCase(), utvonal: aktUt });
    }
  }
  return eredmeny;
}

function leiroVegpontok(fajl) {
  const szoveg = readFileSync(fajl, "utf8");
  if (fajl.endsWith(".json")) {
    const doc = JSON.parse(szoveg);
    const ki = [];
    for (const [ut, mezo] of Object.entries(doc?.paths ?? {})) {
      for (const m of Object.keys(mezo ?? {})) {
        if (/^(get|post|put|patch|delete|options|head|trace)$/i.test(m)) {
          ki.push({ metodus: m.toUpperCase(), utvonal: ut });
        }
      }
    }
    return ki;
  }
  return yamlPaths(szoveg);
}

// --- 3. A README --------------------------------------------------------------

/**
 * Egy végpontot akkor tekintünk a README-ben leírtnak, ha EGY SORBAN szerepel a
 * metódus és a teljes útvonal. Nem tábla-alakra illesztünk: a README szabad
 * szöveg, és a formátumhoz kötött illesztés az első átszerkesztésnél hamis
 * hiányt jelezne. Cserébe a rövidített felsorolás (`/api/auth/register` · `/login`)
 * NEM számít fedésnek — ez helyes szigor: a `/login` önmagában nem útvonal, és a
 * leltár épp azt méri, hogy az olvasó megtalálja-e a teljes alakot.
 */
function readmeVegpontok(fajl) {
  const ki = [];
  for (const sor of readFileSync(fajl, "utf8").split(/\r?\n/)) {
    const metodusok = [...sor.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
    if (!metodusok.length) continue;
    const utak = [...sor.matchAll(/(\/api\/[A-Za-z0-9_\-/{}:]*)/g)].map((m) => m[1].replace(/[.,;`]+$/, ""));
    for (const m of metodusok) for (const u of utak) ki.push({ metodus: m, utvonal: u });
  }
  return ki;
}

// --- Összevetés ---------------------------------------------------------------

const kod = kodVegpontok();
const readmeFajl = join(REPO, "README.md");
const leiro = leiroFajl();

const leiroLista = leiro ? leiroVegpontok(leiro) : [];
const readmeLista = existsSync(readmeFajl) ? readmeVegpontok(readmeFajl) : [];

const leiroKulcsok = new Set(leiroLista.map((e) => kulcs(e.metodus, e.utvonal)));
const readmeKulcsok = new Set(readmeLista.map((e) => kulcs(e.metodus, e.utvonal)));
const kodKulcsok = new Set(kod.map((e) => kulcs(e.metodus, e.utvonal)));

const sorok = kod.map((e) => {
  const k = kulcs(e.metodus, e.utvonal);
  return { ...e, openapi: leiroKulcsok.has(k), readme: readmeKulcsok.has(k) };
});

// Fölösleg: a dokumentumban leírt, de a kódban nem létező végpont. Ez rosszabb a
// hiánynál — a hiányzó végpontot az olvasó megkeresi, a nem létezőt meghívja.
const leiroFolosleg = [...new Set(leiroLista.map((e) => kulcs(e.metodus, e.utvonal)))].filter((k) => !kodKulcsok.has(k));
const readmeFolosleg = [...new Set(readmeLista.map((e) => kulcs(e.metodus, e.utvonal)))].filter((k) => !kodKulcsok.has(k));

const hianyOpenapi = sorok.filter((s) => !s.openapi);
const hianyReadme = sorok.filter((s) => !s.readme);

// --- Kimenet ------------------------------------------------------------------

if (jsonMod) {
  console.log(
    JSON.stringify(
      {
        repo: REPO,
        leiro: leiro ? relative(REPO, leiro).replace(/\\/g, "/") : null,
        vegpontokSzama: kod.length,
        vegpontok: sorok,
        hianyOpenapi: hianyOpenapi.map((s) => kulcs(s.metodus, s.utvonal)),
        hianyReadme: hianyReadme.map((s) => kulcs(s.metodus, s.utvonal)),
        leiroFolosleg,
        readmeFolosleg,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`Végpont-leltár — ${kod.length} végpont a kódban\n`);
  console.log("  openapi  readme   végpont                                      forrás");
  console.log("  -------  ------   -------------------------------------------  ------");
  for (const s of sorok) {
    const jel = (fedett) => (csakKod ? "·" : fedett ? "ok" : "HIÁNY");
    console.log(
      `  ${jel(s.openapi).padEnd(7)}  ${jel(s.readme).padEnd(6)}   ` +
        `${`${s.metodus} ${s.utvonal}`.padEnd(43)}  ${s.forras}`,
    );
  }

  if (csakKod) {
    console.log(`\nCsak a leltár készült (--csak-kod). Összesen ${kod.length} végpont.`);
    process.exit(0);
  }

  console.log("");
  console.log(
    leiro
      ? `OpenAPI-leíró: ${relative(REPO, leiro).replace(/\\/g, "/")} — ${leiroKulcsok.size} művelet olvasva`
      : "OpenAPI-leíró: NINCS a munkafa gyökerében — létre kell hozni, az EGÉSZ projektre.",
  );
  console.log(`README: ${existsSync(readmeFajl) ? `README.md — ${readmeKulcsok.size} végpont-említés` : "NINCS"}`);

  const jelentes = (cim, lista) => {
    if (!lista.length) return;
    console.log(`\n${cim}`);
    for (const x of lista) console.log(`  - ${typeof x === "string" ? x : `${x.metodus} ${x.utvonal}  (${x.forras})`}`);
  };

  jelentes("Hiányzik az OpenAPI-leíróból:", hianyOpenapi);
  jelentes("Hiányzik a README-ből:", hianyReadme);
  jelentes("A leíróban szerepel, de a kódban NINCS (fölösleg):", leiroFolosleg);
  jelentes("A README-ben szerepel, de a kódban NINCS (fölösleg):", readmeFolosleg);

  const baj = hianyOpenapi.length + hianyReadme.length + leiroFolosleg.length + readmeFolosleg.length;
  console.log(
    baj === 0
      ? "\nA három forrás fedi egymást."
      : `\nÖsszesen ${baj} eltérés. A KÓD az igazság: a dokumentumot igazítsd hozzá, ne fordítva.`,
  );
}

process.exit(hianyOpenapi.length + hianyReadme.length + leiroFolosleg.length + readmeFolosleg.length ? 1 : 0);
