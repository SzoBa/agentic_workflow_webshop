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
// A `--keres` szóátfedést számol a leírásokkal (egy kis HU ↔ EN szinonimatáblával), és a három
// legerősebb találatot emeli ki (a 3. hellyel holtversenyben állókat mind), alattuk pedig még
// legfeljebb kettőt „további találat” címkével. Egy agent és az
// egyetlen skill, amit betölt, egy párként a jobbik pontszámot kapja.
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
// a részsztring-keresés viszont túl bőkezű. EGYIRÁNYÚ előtag-egyezés: a leírás szava
// kezdődjön a keresőszóval ("teszt" → "tesztek", "tesztelt"). A fordított irány a hiba volt:
// "teszt" ↔ "tesz" (a „javaslatot tesz") egyezett, mert a rövidebb szó előtagja a hosszabbnak,
// és a cost-reducer került az élre egy unit-teszt keresésnél.
// Második út: legalább 5 karakteres közös előtag, ha a keresőszó maga is toldalékos
// ("tesztek" ↔ "tesztet", "leírót" ↔ "leírás" nem — 4 közös karakter, az már nem bizonyíték).
const KOZOS_ELOTAG = 5;
function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}
function matches(q, d) {
  if (q === d) return true;
  if (q.length >= 4 && d.startsWith(q)) return true;
  return commonPrefix(q, d) >= KOZOS_ELOTAG;
}

// HU ↔ EN szinonimák. A leírások vegyes nyelvűek: a generikus agentek és a hordozható
// `test-writer-java-unit` angolul, a projektspecifikusak magyarul írnak. Szinonima nélkül egy
// „teszt" keresés a `test-runner`-t és a `test-writer-java-unit`-ot nem látta — épp azt a két
// jelöltet, amelyek a duplikátumot csinálnák. Egy csoport minden szava egyenrangú: a keresőszó
// bármelyikre illeszkedik (ugyanazzal az előtag-szabállyal, mint a leírásnál), és akkor a
// csoport összes szavát is keressük. Egy keresőszó a pontszámban egyszer számít, akárhány
// szinonimája talált — a tábla bővít, nem súlyoz. Kicsi szándékosan: minden új sor zajt is hoz.
const SZINONIMAK = [
  ["teszt", "test"],
  ["tesztelés", "testing"],
  ["leíró", "descriptor"],
  ["dokumentáció", "documentation", "docs"],
  ["ellenőrzés", "ellenőriz", "check", "verify", "validate"],
  ["hiba", "bug", "error"],
  ["javítás", "javít", "fix"],
  ["átnézés", "review"],
  ["költség", "cost"],
  ["specifikáció", "spec"],
];

// A keresőszó illeszkedik-e egy táblabeli szóra. Ugyanaz az egyirányú előtag-szabály, mint a
// `matches`-ben, csak a tábla szava áll az előtag helyén ("tesztek" → "teszt" csoportja).
function synonymsOf(q) {
  const out = new Set([q]);
  for (const csoport of SZINONIMAK) {
    if (csoport.some((t) => matches(t, q))) for (const t of csoport) out.add(t);
  }
  return [...out];
}

// A gyakoriság is számít: egy leírás, ami ötször beszél tesztről, erősebb jelölt, mint ami
// egyszer említi. De csökkenő hozadékkal (1 + 0,25 / további előfordulás, legfeljebb 2), hogy
// egy szó ismételgetése ne verje a több különböző keresőszó egyezését.
function score(queryTokens, entry) {
  const desc = tokens(entry.fm?.scalars?.description);
  const name = tokens(entry.name);
  let s = 0;
  for (const q of queryTokens) {
    const alts = synonymsOf(q);
    const hit = (d) => alts.some((a) => matches(a, d));
    const hits = desc.filter(hit).length;
    if (hits > 0) s += Math.min(2, 1 + 0.25 * (hits - 1));
    if (name.some(hit)) s += 0.5; // a névtalálat megerősítés, nem önálló bizonyíték
  }
  return s;
}

// A kiemelt találatok száma. A vágási pontnál álló holtversenyt NEM a readdir-sorrend dönti
// el: aki a 3. helyezettel azonos pontú, mind bekerül.
const TOP = 3;
// A vágás alatti, még pontot érő találatokból ennyi jelenik meg „további találat” címkével.
// A vágás ÖNKÉNYES (a 3. hely egy tizedpontnyi különbségen is múlhat), a fedésvizsgálat
// viszont épp a vágás alá csúszott nyilvánvaló jelöltön bukik el — ezért a következő egy-kettő
// látszik, csak elválasztva és megjelölve, hogy ne keveredjen a kiemeltekkel.
const TOVABBI = 2;

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
  console.log(`  értékelt szavak: ${qt.join(", ")}`);
  const bovites = qt.map((q) => [q, synonymsOf(q).filter((t) => t !== q)]).filter(([, s]) => s.length > 0);
  console.log(
    bovites.length > 0
      ? `  szinonimákkal: ${bovites.map(([q, s]) => `${q} (+ ${s.join(", ")})`).join("; ")}\n`
      : "",
  );

  // Agent–skill PÁR: egy skill, amit pontosan egy agent tölt be (a `java-unit-test-writer` a
  // `test-writer-java-unit`-ot, a `docs-api-writer` a `dokumentacio-iro`-t). A pár egy képesség
  // két fájlban, és a bővítéshez mindkettőt látni kell — ezért a pár mindkét tagja a jobbik
  // pontszámot kapja. A több agent által betöltött konvenció-skill (`spec-konvenciok`) nem pár:
  // ott a felemelés minden keresést elárasztana vele.
  const own = new Map(entries.map((e) => [e, score(qt, e)]));
  const parja = new Map();
  for (const e of entries) {
    if (e.kind !== "skill" || betolti.get(e.name)?.length !== 1) continue;
    const agent = entries.find((a) => a.kind === "agent" && a.name === betolti.get(e.name)[0]);
    if (agent) { parja.set(e, agent); parja.set(agent, e); }
  }
  const all = entries
    .map((e) => {
      const p = parja.get(e);
      const s = Math.max(own.get(e), p ? own.get(p) : 0);
      return { e, s, emelt: p && own.get(p) > own.get(e) ? p : null };
    })
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.e.kind.localeCompare(b.e.kind) || a.e.name.localeCompare(b.e.name));
  const cut = all.length > TOP ? all[TOP - 1].s : 0;
  const ranked = all.filter((r, i) => i < TOP || r.s === cut);
  if (ranked.length > TOP) {
    console.log(`  (holtverseny a ${TOP}. helyen: ${ranked.length} találat kerül ki ${TOP} helyett)\n`);
  }

  if (ranked.length === 0) {
    console.log("  Nincs átfedő leírás. Ez a fedés HIÁNYÁRA utal, de nem bizonyítja:");
    console.log("  ha a szándék más szavakkal is leírható, keress újra azokkal.");
  } else {
    const sor = ({ e, s, emelt }, cimke = "") => {
      const jel = emelt ? `  (pár: ${emelt.kind}/${emelt.name}; saját: ${own.get(e)})` : "";
      console.log(`  ${String(s).padStart(4)} pont  ${cimke}${e.kind}/${e.name}${jel}  →  ${e.file}`);
    };
    for (const r of ranked) sor(r);
    // A `ranked` az `all` eleje (rendezett lista, a holtverseny a vágásnál összefüggő), tehát
    // a vágás alatti találatok közvetlenül utána következnek.
    const tovabbi = all.slice(ranked.length, ranked.length + TOVABBI);
    if (tovabbi.length > 0) {
      const maradek = all.length - ranked.length - tovabbi.length;
      console.log(`
  — a vágás alatt (${tovabbi.length} további találat${maradek > 0 ? `, még ${maradek} nincs listázva` : ""}) —`);
      for (const r of tovabbi) sor(r, "[további találat] ");
    }
    console.log("\n  Olvasd el a listázott fájlokat, mielőtt új mappát nyitsz. Ha a képességet");
    console.log("  valamelyik már fedi, azt BŐVÍTSD — a duplikátum két, széttartó igazságot csinál.");
  }
}
