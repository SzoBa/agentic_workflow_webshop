#!/usr/bin/env node
// A konformancia-katalógus futtatója (spec/backend/tasks.md A1.2, A7.1).
//
// Futtatás:
//   node spec/backend/conformance/run.mjs --base-url http://localhost:3001
//
// Kizárólag HTTP-t használ, tehát UGYANÍGY futtatható a spec B fázisában
// készülő Java/Spring backend ellen is — ez a katalógus egész értelme.
import { ConformanceError, createBootstrap, createClient, SEED_ADMIN } from "./harness.mjs";
import { cases as katalogus } from "./cases/katalogus.mjs";
import { cases as rendeles } from "./cases/rendeles.mjs";
import { cases as felhasznalok } from "./cases/felhasznalok.mjs";
import { cases as ertekeles } from "./cases/ertekeles.mjs";
import { cases as jogosultsag } from "./cases/jogosultsag.mjs";
import { cases as uzemeltetes } from "./cases/uzemeltetes.mjs";
import { kornyezetfuggoEsetek } from "./cases/kornyezetfuggo.mjs";

const OSSZES_ESET = 70; // a konformancia.md lefedettségi térképe szerint

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.CONFORMANCE_BASE_URL ?? "http://localhost:3001",
    cleanStore: false,
    skipRateLimit: false,
    only: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") args.baseUrl = argv[++i];
    else if (arg === "--clean-store") args.cleanStore = true;
    else if (arg === "--skip-rate-limit") args.skipRateLimit = true;
    else if (arg === "--only") args.only = argv[++i].split(",").map((s) => s.trim());
    else if (arg === "--help" || arg === "-h") {
      console.log(HASZNALAT);
      process.exit(0);
    } else {
      console.error(`Ismeretlen kapcsoló: ${arg}\n\n${HASZNALAT}`);
      process.exit(2);
    }
  }
  return args;
}

const HASZNALAT = `Konformancia-futtató — spec/backend/konformancia.md

  node spec/backend/conformance/run.mjs [kapcsolók]

  --base-url <url>     A vizsgált backend gyökere (alap: http://localhost:3001,
                       vagy a CONFORMANCE_BASE_URL környezeti változó)
  --clean-store        A backend FRISS, üres adattárolóval indult. Enélkül a
                       darabszám-érzékeny esetek (K-05, K-48, K-49, K-77)
                       kimaradnak, mert korábbi futások adatai elrontanák őket.
  --skip-rate-limit    Kihagyja a K-50 / K-51 eseteket. A K-51 15 percre
                       kizárja ezt az IP-címet a bejelentkezésből — közvetlen
                       újrafuttatás előtt érdemes.
  --only K-01,K-20     Csak a felsorolt esetek futtatása (hibakereséshez).
`;

/**
 * Az esetek futási sorrendje az `order` mező szerint (alap: 0).
 *
 * Negatív érték = előre. A darabszám-érzékeny esetek (K-77, K-05) csak addig
 * értelmesek, amíg más eset nem vett fel termékeket, ezért ők mennek elöl.
 * Pozitív érték = hátra: a bejelentkezési rate limitet fogyasztó K-50 / K-51
 * a futás végén fut, különben minden későbbi bejelentkezés 429-be futna.
 */
function sorrend(esetek) {
  return [...esetek].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = createClient(args.baseUrl);
  const boot = createBootstrap(client);

  const mind = sorrend([
    ...katalogus,
    ...rendeles,
    ...felhasznalok,
    ...ertekeles,
    ...jogosultsag,
    ...uzemeltetes,
  ]);

  console.log(`Konformancia-futtatás · ${args.baseUrl}`);
  console.log(
    `${mind.length} HTTP-n futtatható eset · ${kornyezetfuggoEsetek.length} környezetfüggő (⚙)\n`,
  );

  // Korai, beszédes kiszállás: enélkül mind az 54 eset ugyanazon a
  // "nem érem el a szervert" hibán bukna, egyenként kiírva.
  try {
    const health = await client.get("/api/health");
    if (health.status !== 200) {
      console.error(`A /api/health ${health.status}-t adott — fut egyáltalán a backend?`);
      process.exit(2);
    }
  } catch (err) {
    console.error(`A backend nem érhető el a(z) ${args.baseUrl} címen: ${err.message}`);
    process.exit(2);
  }

  // A B-1 (seed admin bejelentkezés) az esetek többségének előfeltétele. Ha ez
  // nem megy, minden rá épülő eset UGYANAZON a hibán bukna — egyenként kiírva,
  // negyven azonos sorban. Egyszer, itt derüljön ki.
  const belepes = await client.post("/api/auth/login", SEED_ADMIN);
  if (belepes.status === 429) {
    console.error(
      "A seed admin bejelentkezése 429-et kapott: a bejelentkezési rate limit\n" +
        "még aktív — jellemzően egy korábbi futás K-51 esete miatt (15 perces ablak).\n\n" +
        "Megoldás: várj a korlát lejártáig, indíts friss adattárolóval (a korlát\n" +
        "perzisztens), vagy futtass --skip-rate-limit kapcsolóval, hogy a következő\n" +
        "futás ne tegye ugyanezt.",
    );
    process.exit(2);
  }
  if (belepes.status !== 200) {
    console.error(
      `A seed admin bejelentkezése ${belepes.status}-t adott ` +
        `(${JSON.stringify(belepes.body)?.slice(0, 200)}).\n` +
        "Enélkül az esetek többsége nem futtatható — létezik a seed admin fiók?",
    );
    process.exit(2);
  }

  const eredmenyek = [];
  for (const eset of mind) {
    if (args.only && !args.only.includes(eset.id)) continue;
    if (eset.cleanStore && !args.cleanStore) {
      eredmenyek.push({ eset, allapot: "kihagyva", uzenet: "tiszta adattároló kell (--clean-store)" });
      console.log(`  ⊘ ${eset.id}  ${eset.title}`);
      continue;
    }
    if (eset.rateLimit && args.skipRateLimit) {
      eredmenyek.push({ eset, allapot: "kihagyva", uzenet: "--skip-rate-limit" });
      console.log(`  ⊘ ${eset.id}  ${eset.title}`);
      continue;
    }

    try {
      const megjegyzes = await eset.run({ client, boot });
      eredmenyek.push({ eset, allapot: "sikeres", uzenet: megjegyzes ?? null });
      console.log(`  ✓ ${eset.id}  ${eset.title}${megjegyzes ? `  — ${megjegyzes}` : ""}`);
    } catch (err) {
      // A ConformanceError az eset bukása; minden más a futtató vagy a
      // bootstrap hibája — a kettőt a riport is megkülönbözteti.
      const futtatoHiba = !(err instanceof ConformanceError);
      eredmenyek.push({
        eset,
        allapot: futtatoHiba ? "hibas" : "bukott",
        uzenet: err.message,
      });
      console.log(`  ✗ ${eset.id}  ${eset.title}`);
      console.log(`      ${err.message}`);
    }
  }

  const sikeres = eredmenyek.filter((r) => r.allapot === "sikeres").length;
  const bukott = eredmenyek.filter((r) => r.allapot === "bukott");
  const hibas = eredmenyek.filter((r) => r.allapot === "hibas");
  const kihagyva = eredmenyek.filter((r) => r.allapot === "kihagyva");

  console.log("\n" + "─".repeat(70));
  console.log(`Sikeres:        ${sikeres}`);
  console.log(`Bukott:         ${bukott.length}`);
  if (hibas.length > 0) console.log(`Futtatóhiba:    ${hibas.length}`);
  console.log(`Kihagyva:       ${kihagyva.length}`);
  console.log(`Környezetfüggő: ${kornyezetfuggoEsetek.length} (⚙ — nem futtatható HTTP-n)`);
  console.log(
    `\nLefedettség: ${sikeres} / ${OSSZES_ESET} eset igazolva ` +
      `(${((sikeres / OSSZES_ESET) * 100).toFixed(0)}%)`,
  );

  if (kihagyva.length > 0) {
    console.log("\nKihagyott esetek:");
    for (const { eset, uzenet } of kihagyva) console.log(`  ${eset.id} — ${uzenet}`);
  }
  if (bukott.length > 0 || hibas.length > 0) {
    console.log("\nBukott esetek:");
    for (const { eset, uzenet, allapot } of [...bukott, ...hibas]) {
      console.log(`  ${eset.id} ${allapot === "hibas" ? "(futtatóhiba) " : ""}— ${uzenet}`);
    }
  }

  process.exit(bukott.length + hibas.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`A futtató váratlan hibával állt le: ${err.stack ?? err.message}`);
  process.exit(2);
});
