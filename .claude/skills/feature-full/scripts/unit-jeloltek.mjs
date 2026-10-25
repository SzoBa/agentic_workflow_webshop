#!/usr/bin/env node
// Unit-teszt jelöltek keresése egy implementációs kör után — a `feature-full` skill
// 4. fázisa.
//
// MIÉRT SCRIPT. A kérdés — „melyik most írt osztályt érdemes unit teszttel fedni" —
// determinisztikus: a megváltozott fájlok listája git-tény, az elágazások száma
// megszámolható, a kizáró annotációk megkereshetők. Prózában leírva minden futásnál
// újra le kellene vezetni, és minden futásnál másképp sikerülne.
//
// MIT NEM TUD. Az elágazásszám ALSÓ BECSLÉS, nem JaCoCo-ág: a `?:` operátort, a
// lambdákban rejlő elágazást és a `switch` nyíl-alakját szándékosan nem számolja
// (a false positive rosszabb, mint az alulbecslés — egy alulbecsült osztályt a
// fejlesztő még beemelhet, egy hamisan felkínált osztály viszont elveszett kör).
// A mérce mindig a mért JaCoCo-szám, nem ez a táblázat.
//
// Használat:
//   node .claude/skills/feature-full/scripts/unit-jeloltek.mjs --alap <git-ref>
//   node .claude/skills/feature-full/scripts/unit-jeloltek.mjs --fajlok a.java,b.java
//
// Kilépési kód mindig 0: ez tanácsadó eszköz, nem kapu.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

const MAIN_JAVA = "server-java/src/main/java/";
const POM = REPO + "/server-java/pom.xml";

// Az elágazásszám küszöbe. Ez alatt egy unit teszt jellemzően ugyanazt méri, amit az
// integrációs teszt már mér — csak külön fájlban.
const ELAGAZAS_KUSZOB = 3;

// Spring-kontextust, adatbázist vagy tranzakcióhatárt igénylő osztályok. Ezeket a
// projekt SZÁNDÉKOSAN integrációs teszttel fedi (`hu.webshop.support.IntegrationTest`,
// valódi HTTP + valódi Postgres) — mockolva ugyanazt mérnék, ráadásul a mai huzalozást
// betonoznák be.
const KIZARO_ANNOTACIO = [
  ["@RestController", "HTTP-végpont — integrációs teszt méri"],
  ["@Controller", "HTTP-végpont — integrációs teszt méri"],
  ["@Repository", "adatelérés — integrációs teszt méri"],
  ["@Entity", "JPA-entitás — nincs benne mérendő logika"],
  ["@Embeddable", "JPA-résztípus — nincs benne mérendő logika"],
  ["@Configuration", "huzalozás — a mockolása önmagát mérné"],
  ["@SpringBootApplication", "indítóosztály"],
  ["@ControllerAdvice", "keretrendszer-horog — integrációs teszt méri"],
];

// Tranzakcióhatár. A projekt szabálya szerint ami tranzakciót keresztez, az
// integrációs teszté — mockolva a tranzakció szemantikája épp az, ami elveszne.
const TRANZAKCIO = /@Transactional\b/;

// Együttműködők, amelyek mockolása értelmetlen: nem interfész-szerű szerződések,
// hanem a perzisztencia gépezete. Ha ezek egyike szerepel, integrációs teszt kell.
const NEM_MOCKOLHATO = /\b(?:EntityManager|JdbcTemplate|DataSource|TransactionTemplate)\b/;

// A repository-mező NEM kizáró ok: interfész, Mockitóval triviálisan mockolható.
// (A `hu.webshop.auth.UserValidator` pontosan ilyen, és mért 100% áglefedettségen
// áll — egy „van repository-mezője" szabály épp a projekt legjobb unit tesztjét
// zárná ki.) Csak megjegyzésként jelezzük, hogy mockokra lesz szükség.
const REPOSITORY_MEZO = /\b[A-Z]\w*Repository\b/;

/** Sor- és blokk-kommentek, valamint string-literálok eltávolítása. */
function tisztit(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"""[\s\S]*?"""/g, ' "" ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' "" ')
    .replace(/'(?:\\.|[^'\\])*'/g, " '' ");
}

/**
 * Elágazások alsó becslése. Csak robusztus jelölőket számol — lásd a fájl fejlécét.
 * A `&&` / `||` külön ágat jelent JaCoCo-értelemben, ezért van a listán.
 */
function elagazasok(tiszta) {
  const minta = [
    /\bif\s*\(/g,
    /\belse\s+if\b/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bcase\b/g,
    /\bcatch\s*\(/g,
    /&&/g,
    /\|\|/g,
  ];
  return minta.reduce((n, re) => n + (tiszta.match(re) ?? []).length, 0);
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" });
}

function valtozottFajlok(alap) {
  const ki = git(["diff", "--name-only", "--diff-filter=AM", `${alap}...HEAD`]);
  return ki.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** A `jacoco:check` `check-unit-tested-classes` végrehajtásában felsorolt osztályok. */
function marFigyeltOsztalyok() {
  if (!existsSync(POM)) return new Set();
  const pom = readFileSync(POM, "utf8");
  return new Set(
    [...pom.matchAll(/<include>([\w.]+)<\/include>/g)].map((m) => m[1]),
  );
}

function fqn(rel) {
  return rel
    .slice(MAIN_JAVA.length)
    .replace(/\.java$/, "")
    .replace(/\//g, ".");
}

// --- Bemenet ----------------------------------------------------------------

const argv = process.argv.slice(2);
function kapcsolo(nev) {
  const i = argv.indexOf(nev);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}

const alap = kapcsolo("--alap");
const fajlokKapcsolo = kapcsolo("--fajlok");

if (!alap && !fajlokKapcsolo) {
  process.stdout.write(
    "Használat:\n" +
      "  unit-jeloltek.mjs --alap <git-ref>        a ref óta változott fájlokból\n" +
      "  unit-jeloltek.mjs --fajlok a.java,b.java  megadott fájlokból\n",
  );
  process.exit(0);
}

let jeloltek;
try {
  jeloltek = fajlokKapcsolo
    ? fajlokKapcsolo.split(",").map((s) => s.trim().replace(/\\/g, "/")).filter(Boolean)
    : valtozottFajlok(alap);
} catch (e) {
  process.stdout.write(`Nem sikerült a változott fájlokat lekérdezni: ${e.message}\n`);
  process.exit(0);
}

const javaFajlok = jeloltek.filter(
  (f) => f.startsWith(MAIN_JAVA) && f.endsWith(".java"),
);

// --- Értékelés --------------------------------------------------------------

const figyelt = marFigyeltOsztalyok();
const sorok = [];

for (const rel of javaFajlok) {
  const abs = REPO + "/" + rel;
  if (!existsSync(abs)) continue;

  const tiszta = tisztit(readFileSync(abs, "utf8"));
  const nev = fqn(rel);
  const agak = elagazasok(tiszta);

  let itelet = "JELÖLT";
  let indok = "";

  // Szóhatárral, nem `includes`-szal: a `@Entity` különben a Spring Data
  // `@EntityGraph`-jára is illeszkedne, és egy repository-interfészt
  // „JPA-entitás" indokkal zárna ki — jó ítélet, hamis indokkal.
  const annotacio = KIZARO_ANNOTACIO.find(([a]) =>
    new RegExp(a.replace("@", "@") + "\\b").test(tiszta),
  );
  if (annotacio) {
    itelet = "KIZÁRVA";
    [, indok] = annotacio;
  } else if (
    // Az ELSŐDLEGES típusra kell nézni, a fájlnévvel egyező névre: egy beágyazott
    // funkcionális interfész különben egy vaskos szolgáltatásosztályt is
    // „törzs nélküli interfésznek" minősítene.
    new RegExp(`\\binterface\\s+${nev.slice(nev.lastIndexOf(".") + 1)}\\b`).test(tiszta) &&
    !/\bdefault\s+\w/.test(tiszta)
  ) {
    itelet = "KIZÁRVA";
    indok = "törzs nélküli interfész — nincs benne mérendő logika";
  } else if (TRANZAKCIO.test(tiszta)) {
    itelet = "KIZÁRVA";
    indok = "tranzakcióhatárt keresztez (@Transactional) — integrációs teszt méri";
  } else if (NEM_MOCKOLHATO.test(tiszta)) {
    itelet = "KIZÁRVA";
    indok = "perzisztencia-gépezet együttműködője — integrációs teszt méri";
  } else if (figyelt.has(nev)) {
    // A már figyelt osztály nem új munka, de nem is kizárt: ha most bővült,
    // a tesztjét is bővíteni kell, különben a 90%-os kapu lerontja a buildet.
    itelet = "MÁR FIGYELT";
    indok = "a jacoco:check listáján van — a meglévő tesztosztályát kell bővíteni";
  } else if (agak < ELAGAZAS_KUSZOB) {
    itelet = "GYENGE";
    indok = `kevés elágazás (${agak} < ${ELAGAZAS_KUSZOB})`;
  } else if (REPOSITORY_MEZO.test(tiszta)) {
    indok = "mockolandó együttműködője van (repository)";
  }

  sorok.push({ nev, rel, agak, itelet, indok });
}

// --- Kiírás -----------------------------------------------------------------

const rang = { JELÖLT: 0, "MÁR FIGYELT": 1, GYENGE: 2, KIZÁRVA: 3 };
sorok.sort((a, b) => rang[a.itelet] - rang[b.itelet] || b.agak - a.agak);

const forras = fajlokKapcsolo ? "megadott fájllista" : `git diff ${alap}...HEAD`;
process.stdout.write(
  `Unit-teszt jelöltek — forrás: ${forras}\n` +
    `${javaFajlok.length} változott produkciós Java osztály\n\n`,
);

if (sorok.length === 0) {
  process.stdout.write(
    "Nincs értékelhető osztály. Ha az implementáció csak klienst vagy tesztet\n" +
      "érintett, ez a várt eredmény — mondd ki a jelentésben, ne keress mást.\n",
  );
  process.exit(0);
}

const szel = Math.max(...sorok.map((s) => s.nev.length), 8);
process.stdout.write(
  `${"osztály".padEnd(szel)}  ${"ág≥".padStart(4)}  ítélet       indok\n` +
    `${"-".repeat(szel + 40)}\n`,
);
for (const s of sorok) {
  process.stdout.write(
    `${s.nev.padEnd(szel)}  ${String(s.agak).padStart(4)}  ${s.itelet.padEnd(11)}  ${s.indok}\n`,
  );
}

const valodi = sorok.filter((s) => s.itelet === "JELÖLT");
process.stdout.write(
  `\n${valodi.length} valódi jelölt.\n` +
    "Az `ág≥` oszlop ALSÓ BECSLÉS, nem JaCoCo-ág — a mérce a mért lefedettség.\n" +
    "A `KIZÁRVA` sorokat ne vidd unit tesztre: azokat integrációs teszt méri.\n",
);
