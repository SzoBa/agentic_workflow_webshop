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
// Kilépési kód: 1, ha bármelyik oszlopban hiány vagy fölösleg van, vagy a kódban van
// ki nem olvasható leképezés-annotáció (lásd `kodVegpontok` fölött); 0, ha mind fedett.
//
// Használat:
//   node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs
//   node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs --json
//   node .claude/skills/dokumentacio-iro/scripts/dok-leltar.mjs --csak-kod [--json]
//
// A `--csak-kod` a leltárt adja vissza dokumentum-összevetés nélkül (1. fázis:
// akkor is működik, amikor még egyáltalán nincs leíró). Ilyenkor mindig 0-val lép ki,
// a `--json` alakban is — ott az összevetési mezők hiányoznak, nem üres listák (egy üres
// `hianyOpenapi` „nincs hiány"-nak olvasódna, holott nem is néztük).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const jsonMod = argv.includes("--json");
const csakKod = argv.includes("--csak-kod");

// --- Repógyökér ---------------------------------------------------------------
// A `CLAUDE_PROJECT_DIR` az elsődleges, de nem elég: a lánc párhuzamos ága külön
// git-worktree-ben fut, ahol a szkript a saját munkafáját kell hogy mérje.
// MEGTÖRTÉNT csapda: a worktree-ben futó agent `CLAUDE_PROJECT_DIR`-je a FŐ fára mutat, és
// a régi sorrend (előbb a `CLAUDE_PROJECT_DIR`) a fő fát mérte — a munkafa új végpontja
// „hiányzó"-nak, vagy a fő fa állapota zöldnek látszott. Ezért ELŐBB megnézzük, hogy a cwd
// (vagy a legközelebbi git-gyökere) a projekt egy worktree-je-e: ott a `.git` FÁJL, és a
// `gitdir:` sora a projekt `.git/worktrees/` mappája alá mutat.
function gitGyoker(kezdo) {
  let dir = resolve(kezdo);
  for (let i = 0; i < 60; i += 1) {
    if (existsSync(join(dir, ".git"))) return dir;
    const szulo = dirname(dir);
    if (szulo === dir) return null;
    dir = szulo;
  }
  return null;
}

function projektWorktree(projekt) {
  const gyoker = gitGyoker(process.cwd());
  if (!gyoker) return null;
  const git = join(gyoker, ".git");
  let tartalom;
  try {
    if (!statSync(git).isFile()) return null; // a fő fa (könyvtár), nem worktree
    tartalom = readFileSync(git, "utf8");
  } catch {
    return null;
  }
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(tartalom);
  if (!m) return null;
  const norm = (p) => resolve(p).replace(/\\/g, "/").toLowerCase();
  const gitdir = norm(resolve(gyoker, m[1]));
  // Ha ismert a projekt, a worktree-nek az ő `.git/worktrees/` mappája alá kell mutatnia —
  // egy idegen repó worktree-je (pl. a cwd egészen máshol van) nem a mi munkafánk.
  const alap = projekt ? `${norm(join(projekt, ".git", "worktrees"))}/` : null;
  if (alap ? !gitdir.startsWith(alap) : !/\/\.git\/worktrees\/[^/]+$/.test(gitdir)) return null;
  return gyoker;
}

function repoRoot() {
  const wt = projektWorktree(process.env.CLAUDE_PROJECT_DIR);
  if (wt) return wt;
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

// Az annotáció-olvasó is SZŰK, nem Java-parser. Amit ismer:
//   @GetMapping                          — útvonal nélkül (= az osztály alapútvonala)
//   @GetMapping("/x")  @GetMapping(value = "/x")  @GetMapping(path = "/x")
//   @GetMapping({"/a", "/b"})  @GetMapping(path = {"/a", "/b"})   — tömb: mindegyik végpont
//   több soron átnyúló zárójel, és mellette más attribútum (produces, consumes, …)
//   @RequestMapping(path = "/x", method = RequestMethod.GET)  — metódusszinten is, ha van `method`
// Amit NEM: konstans vagy összefűzés az útvonalban (`API + "/x"`), `method` nélküli
// metódusszintű `@RequestMapping` (minden HTTP-metódusra illeszkedik). Ezeket NEM hagyja
// ki szó nélkül: a `felismeretlen` listába kerülnek, és a kapu tőlük is piros — egy
// alulszámoló kapu hazudva zöld.

/** A `@Név` utáni, kiegyensúlyozott zárójelpár tartalma, akár több soron át. */
function annotacioArgumentum(sorok, i, kezd) {
  let j = i;
  let pos = kezd;
  // A nyitó zárójel jöhet ugyanazon a soron, vagy (ritkán) a következő nem üres sor elején.
  while (j < sorok.length) {
    const maradek = sorok[j].slice(pos);
    if (maradek.trim() === "" && j === i) {
      j += 1;
      pos = 0;
      continue;
    }
    if (!maradek.trimStart().startsWith("(")) return { arg: null, vege: i };
    pos += maradek.indexOf("(");
    break;
  }
  if (j >= sorok.length) return { arg: null, vege: i };

  let melyseg = 0;
  let idezet = false;
  let ki = "";
  for (let n = 0; j < sorok.length && n < 40; j += 1, n += 1, pos = 0) {
    const sor = sorok[j];
    for (let k = pos; k < sor.length; k += 1) {
      const c = sor[k];
      if (idezet) {
        if (c === "\\") {
          ki += c + (sor[k + 1] ?? "");
          k += 1;
          continue;
        }
        if (c === '"') idezet = false;
      } else if (c === '"') {
        idezet = true;
      } else if (c === "(") {
        melyseg += 1;
        if (melyseg === 1) continue;
      } else if (c === ")") {
        melyseg -= 1;
        if (melyseg === 0) return { arg: ki, vege: j };
      }
      ki += c;
    }
    ki += " ";
  }
  return { arg: undefined, vege: i }; // nem zárult: nem értelmezhető
}

/** Felső szintű vesszők mentén bont (idézőjelen és `{}`-n belül nem). */
function bont(szoveg) {
  const reszek = [];
  let melyseg = 0;
  let idezet = false;
  let akt = "";
  for (let k = 0; k < szoveg.length; k += 1) {
    const c = szoveg[k];
    if (idezet) {
      if (c === "\\") {
        akt += c + (szoveg[k + 1] ?? "");
        k += 1;
        continue;
      }
      if (c === '"') idezet = false;
    } else if (c === '"') idezet = true;
    else if (c === "{") melyseg += 1;
    else if (c === "}") melyseg -= 1;
    else if (c === "," && melyseg === 0) {
      reszek.push(akt.trim());
      akt = "";
      continue;
    }
    akt += c;
  }
  if (akt.trim()) reszek.push(akt.trim());
  return reszek;
}

/** `"x"` vagy `{"a", "b"}` → sztringlista; minden más (konstans, összefűzés) → `null`. */
function literalLista(kif) {
  const t = kif.trim();
  const egy = /^"((?:[^"\\]|\\.)*)"$/.exec(t);
  if (egy) return [egy[1]];
  const tomb = /^\{([\s\S]*)\}$/.exec(t);
  if (!tomb) return null;
  if (!tomb[1].trim()) return [""];
  const elemek = bont(tomb[1]).map((e) => /^"((?:[^"\\]|\\.)*)"$/.exec(e)?.[1]);
  return elemek.every((e) => e !== undefined) ? elemek : null;
}

/** `RequestMethod.GET`, `GET` vagy ezek tömbje → metóduslista; különben `null`. */
function metodusLista(kif) {
  const t = kif.trim().replace(/^\{([\s\S]*)\}$/, "$1");
  const elemek = bont(t).map((e) => /^(?:RequestMethod\.)?(GET|POST|PUT|PATCH|DELETE)$/.exec(e.trim())?.[1]);
  return elemek.length && elemek.every(Boolean) ? elemek : null;
}

/**
 * Egy leképezés-annotáció argumentumának értelmezése.
 * @returns {{utak: string[]|null, metodusok: string[]|null, ok: string|null}}
 *          `ok` nem null, ha valamit nem sikerült biztosan kiolvasni.
 */
function ertelmez(arg) {
  if (arg === null) return { utak: [""], metodusok: null, ok: null }; // @GetMapping
  if (arg === undefined) return { utak: null, metodusok: null, ok: "a zárójel 40 soron belül nem zárult" };
  let utak = null;
  let metodusok = null;
  let utKifejezes = null;
  for (const resz of bont(arg)) {
    if (!resz) continue;
    const nevesitett = /^(\w+)\s*=\s*([\s\S]*)$/.exec(resz);
    const nev = nevesitett ? nevesitett[1] : "value";
    const ertek = nevesitett ? nevesitett[2] : resz;
    if (nev === "value" || nev === "path") {
      utKifejezes = ertek.trim();
      const l = literalLista(ertek);
      if (l === null) return { utak: null, metodusok: null, ok: `nem literál útvonal: ${utKifejezes}` };
      utak = [...new Set([...(utak ?? []), ...l])]; // a `value` és a `path` alias
    } else if (nev === "method") {
      metodusok = metodusLista(ertek);
      if (metodusok === null) return { utak: null, metodusok: null, ok: `nem értelmezett method: ${ertek.trim()}` };
    }
    // produces, consumes, params, headers, name: az útvonalat nem befolyásolják
  }
  return { utak: utak ?? [""], metodusok, ok: null };
}

function osszefuz(alap, resz) {
  const egy = `${alap || ""}/${resz || ""}`.replace(/\/{2,}/g, "/");
  return egy.length > 1 ? egy.replace(/\/$/, "") : egy;
}

const OSZTALY = /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:public\s+|final\s+|abstract\s+|sealed\s+)*class\s+\w/;
const MEGJEGYZES = /^\s*(?:\/\/|\/\*|\*)/;

function kodVegpontok() {
  const talalatok = [];
  const felismeretlen = [];
  for (const fajl of javaFajlok(JAVA_FA)) {
    const sorok = readFileSync(fajl, "utf8").split(/\r?\n/);
    const rel = relative(REPO, fajl).replace(/\\/g, "/");
    let alapok = [""];
    let alapHiba = null;
    let osztalyMegvolt = false;

    for (let i = 0; i < sorok.length; i += 1) {
      const sor = sorok[i];
      if (MEGJEGYZES.test(sor)) continue; // Javadoc / komment: nem annotáció

      let ugras = i;
      for (const m of sor.matchAll(/@(\w*Mapping)\b/g)) {
        const nev = m[1];
        if (nev !== "RequestMapping" && !METODUS_ANNOTACIO[nev]) continue;
        const { arg, vege } = annotacioArgumentum(sorok, i, m.index + m[0].length);
        ugras = Math.max(ugras, vege);
        const e = ertelmez(arg);
        const hol = `${rel}:${i + 1}`;

        // Az osztálydeklaráció ELŐTTI `@RequestMapping` az alapútvonal; utána már
        // metódus-annotáció, azt nem szabad alapnak venni.
        if (!osztalyMegvolt) {
          if (nev !== "RequestMapping") continue;
          if (e.ok) {
            alapHiba = e.ok;
            felismeretlen.push({ forras: hol, annotacio: `@${nev}`, ok: `osztályszintű alapútvonal — ${e.ok}` });
          } else alapok = e.utak;
          continue;
        }

        const metodusok = nev === "RequestMapping" ? e.metodusok : [METODUS_ANNOTACIO[nev]];
        if (e.ok || alapHiba || !metodusok) {
          felismeretlen.push({
            forras: hol,
            annotacio: `@${nev}`,
            ok: e.ok ?? (alapHiba ? `az osztály alapútvonala nem olvasható (${alapHiba})` : "metódusszintű @RequestMapping `method` nélkül — minden HTTP-metódusra illeszkedik"),
          });
          continue;
        }
        for (const metodus of metodusok) {
          for (const alap of alapok) {
            for (const ut of e.utak) {
              const utvonal = osszefuz(alap, ut);
              if (!utvonal.startsWith("/")) continue;
              talalatok.push({ metodus, utvonal, forras: hol });
            }
          }
        }
      }
      if (!osztalyMegvolt && OSZTALY.test(sor)) osztalyMegvolt = true;
      i = ugras;
    }
  }
  talalatok.sort((a, b) => (a.utvonal === b.utvonal ? a.metodus.localeCompare(b.metodus) : a.utvonal.localeCompare(b.utvonal)));
  return { talalatok, felismeretlen };
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

const { talalatok: kod, felismeretlen } = kodVegpontok();
const readmeFajl = join(REPO, "README.md");
const leiro = leiroFajl();

// `--csak-kod`: csak a leltár — a dokumentumokat el sem olvassuk, és a kilépési kód
// mindig 0, szöveges és `--json` kimenetnél EGYARÁNT (a fejléc ígérete).
const leiroLista = !csakKod && leiro ? leiroVegpontok(leiro) : [];
const readmeLista = !csakKod && existsSync(readmeFajl) ? readmeVegpontok(readmeFajl) : [];

const leiroKulcsok = new Set(leiroLista.map((e) => kulcs(e.metodus, e.utvonal)));
const readmeKulcsok = new Set(readmeLista.map((e) => kulcs(e.metodus, e.utvonal)));
const kodKulcsok = new Set(kod.map((e) => kulcs(e.metodus, e.utvonal)));

const sorok = kod.map((e) => {
  const k = kulcs(e.metodus, e.utvonal);
  return csakKod ? { ...e } : { ...e, openapi: leiroKulcsok.has(k), readme: readmeKulcsok.has(k) };
});

// Fölösleg: a dokumentumban leírt, de a kódban nem létező végpont. Ez rosszabb a
// hiánynál — a hiányzó végpontot az olvasó megkeresi, a nem létezőt meghívja.
const leiroFolosleg = [...new Set(leiroLista.map((e) => kulcs(e.metodus, e.utvonal)))].filter((k) => !kodKulcsok.has(k));
const readmeFolosleg = [...new Set(readmeLista.map((e) => kulcs(e.metodus, e.utvonal)))].filter((k) => !kodKulcsok.has(k));

const hianyOpenapi = csakKod ? [] : sorok.filter((s) => !s.openapi);
const hianyReadme = csakKod ? [] : sorok.filter((s) => !s.readme);

// A felismeretlen annotáció is eltérés: a leltár ott ALULMÉR, és egy alulszámoló kapu
// hazudva zöld. A kódbeli leképezést kell olvashatóbbá tenni, vagy az olvasót bővíteni.
const baj = csakKod
  ? 0
  : hianyOpenapi.length + hianyReadme.length + leiroFolosleg.length + readmeFolosleg.length + felismeretlen.length;

// --- Kimenet ------------------------------------------------------------------

if (jsonMod) {
  const ki = {
    repo: REPO,
    mod: csakKod ? "csak-kod" : "kapu",
    vegpontokSzama: kod.length,
    vegpontok: sorok,
    felismeretlen,
  };
  if (!csakKod) {
    Object.assign(ki, {
      leiro: leiro ? relative(REPO, leiro).replace(/\\/g, "/") : null,
      leiroMuveletek: leiroKulcsok.size,
      hianyOpenapi: hianyOpenapi.map((s) => kulcs(s.metodus, s.utvonal)),
      hianyReadme: hianyReadme.map((s) => kulcs(s.metodus, s.utvonal)),
      leiroFolosleg,
      readmeFolosleg,
      eltereses: baj,
    });
  }
  console.log(JSON.stringify(ki, null, 2));
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

  if (felismeretlen.length) {
    console.log(`\nFELISMERETLEN leképezés-annotáció (${felismeretlen.length}) — a leltár itt ALULMÉR:`);
    for (const f of felismeretlen) console.log(`  - ${f.annotacio}  (${f.forras}) — ${f.ok}`);
  }

  if (csakKod) {
    console.log(`\nCsak a leltár készült (--csak-kod). Összesen ${kod.length} végpont${felismeretlen.length ? `, és ${felismeretlen.length} ki nem olvasott annotáció` : ""}.`);
  } else {
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

    console.log(
      baj === 0
        ? "\nA három forrás fedi egymást."
        : `\nÖsszesen ${baj} eltérés${felismeretlen.length ? ` (ebből ${felismeretlen.length} felismeretlen annotáció)` : ""}. A KÓD az igazság: a dokumentumot igazítsd hozzá, ne fordítva.`,
    );
  }
}

process.exit(baj ? 1 : 0);
