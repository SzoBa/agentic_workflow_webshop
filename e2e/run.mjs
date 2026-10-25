#!/usr/bin/env node
// A teszt-váz belépési pontja.
//
// Három dolgot csinál, aztán átadja a vezérlést a cucumber-js-nek:
//   1. kapcsolókat fogad (a konformancia-futtatóéval azonos stílusban),
//   2. ELLENŐRZI, hogy fut-e a stack — és ha nem, EGYETLEN beszédes üzenettel
//      áll le, mielőtt bármi elindulna,
//   3. elindítja a cucumber-js-t, a fel nem ismert kapcsolókat változatlanul
//      továbbadva (--tags, --profile, --name, --dry-run, ...).
//
// A 2. pont miatt van egyáltalán ez a fájl. A környezet-ellenőrzést egy Cucumber
// BeforeAll horogban is el lehetne végezni, de akkor a hiba szcenárió-bukásnak
// látszana, riporttal, veremmel — miközben a probléma az, hogy a fejlesztő
// elfelejtette elindítani a backendet. Ez a hiba nem teszthiba, és nem is szabad
// annak látszania.
//
// Kilépési kód:  0 = minden szcenárió zöld · 1 = van bukott szcenárió ·
//                2 = a váz el sem tudott indulni (nem fut a stack, rossz kapcsoló)

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  hitelesitoAdatHibaja,
  konfiguracio,
  kornyezetHibaja,
} from "./support/kornyezet.mjs";

const HASZNALAT = `A webshop e2e teszt-váza — Gherkin + Cucumber + Playwright

  npm run e2e [-- kapcsolók]

  --base-url <url>   A vizsgált alkalmazás gyökere.
                     Alap: http://localhost:5173 (Vite dev, /api proxyzva),
                     vagy az E2E_BASE_URL környezeti változó.
                     Produkciós módban: http://localhost:3001 (a Spring
                     szolgálja ki a client/dist-et és az API-t egy origin-en).
  --headed           Látható böngészőablak (alap: headless).
  --slowmo <ms>      Lassítás művelet-lépésenként, hibakereséshez.
  --timeout <ms>     Egy lépés időkerete (alap: 30000).
  --skip-check       Kihagyja az induló környezet-ellenőrzést.
  -h, --help         Ez a súgó.

  Az admin-előfeltételek a seed admin hitelesítő adatával épülnek; ez fejlesztői
  adat, ezért CSAK helyi base URL ellen használható. Nem helyi kiszolgálóhoz:
  E2E_ADMIN_USER / E2E_ADMIN_PASSWORD.

  Minden más kapcsoló változatlanul a cucumber-js-hez megy, például:
  --tags "@onteszt"  ·  --profile ci  ·  --dry-run  ·  --name "..."

  A váz NEM indítja a stacket. Előbb:  .\\start.cmd   vagy   ./start.sh
`;

/**
 * A valódi, kanonikus alakja egy útvonalnak — Windowson a HELYES kis/nagybetűkkel.
 *
 * MIÉRT KELL. Windowson a `cd /d d:\...` megőrzi a begépelt kisbetűs
 * meghajtóbetűt, így ez a fájl `file:///d:/...` URL-ként töltődik be, és a belőle
 * számolt `cucumberBin` is kisbetűs lesz. A gyermekfolyamat tehát a
 * `d:\...\node_modules\@cucumber\cucumber` példányt tölti be — a Cucumber viszont
 * a támogató fájlokat a `process.cwd()`-ból oldja fel, amit a Windows MINDIG
 * kanonikusan, nagybetűs meghajtóval ad vissza. A `steps/*.mjs` így
 * `file:///D:/...` alatt töltődik, és az ő `import "@cucumber/cucumber"`-jük egy
 * MÁSODIK példányt hoz be. Az eredmény a Cucumber „you're calling functions on an
 * instance of Cucumber that isn't running" hibája — miközben a telepítés hibátlan.
 *
 * A `realpathSync.native` a fájlrendszertől kérdezi meg a valódi alakot, ezért a
 * szülő és a gyermek ugyanarra a példányra mutat. Nem-létező útvonalra (elvben
 * nem fordulhat elő) az eredeti értéket adja vissza: a futást ez a segédfüggvény
 * nem buktathatja el.
 */
function kanonikus(utvonal) {
  try {
    return fs.realpathSync.native(utvonal);
  } catch {
    return utvonal;
  }
}

function feldolgoz(argv) {
  const tovabb = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base-url") process.env.E2E_BASE_URL = argv[++i];
    else if (a === "--headed") process.env.E2E_HEADED = "1";
    else if (a === "--slowmo") process.env.E2E_SLOWMO = argv[++i];
    else if (a === "--timeout") process.env.E2E_TIMEOUT = argv[++i];
    else if (a === "--skip-check") process.env.E2E_SKIP_CHECK = "1";
    else if (a === "-h" || a === "--help") {
      console.log(HASZNALAT);
      process.exit(0);
    } else tovabb.push(a);
  }
  return tovabb;
}

async function main() {
  const cucumberArgs = feldolgoz(process.argv.slice(2));
  const config = konfiguracio();

  // A hitelesítő adat ellenőrzése a `--skip-check` alá NEM tartozik bele: az a
  // kapcsoló a "fut-e a stack" kényelmi mérést hagyja ki, nem ezt az őrt.
  const hitelesitesHiba = hitelesitoAdatHibaja(config.baseUrl);
  if (hitelesitesHiba) {
    console.error(`\nA teszt-váz nem tud elindulni.\n\n${hitelesitesHiba}\n`);
    process.exit(2);
  }

  if (process.env.E2E_SKIP_CHECK !== "1") {
    const hiba = await kornyezetHibaja(config.baseUrl);
    if (hiba) {
      console.error(`\nA teszt-váz nem tud elindulni.\n\n${hiba}\n`);
      process.exit(2);
    }
  }

  console.log(`E2E: ${config.baseUrl} ellen, ${config.headed ? "látható" : "headless"} böngészővel.`);

  // A cucumber-js-t a saját belépési fájlján át indítjuk, nem a .bin shimen:
  // Windowson a shim egy .cmd, aminek a spawnolása külön shell-kezelést kívánna.
  const require = createRequire(import.meta.url);
  // Mindkét útvonal kanonizálva — lásd a `kanonikus()` magyarázatát: kisbetűs
  // meghajtóbetűvel indítva a gyermek KÉT Cucumber-példányt töltene be.
  const cucumberBin = kanonikus(
    path.join(
      path.dirname(require.resolve("@cucumber/cucumber/package.json")),
      "bin",
      "cucumber.js",
    ),
  );

  const gyermek = spawn(process.execPath, [cucumberBin, ...cucumberArgs], {
    stdio: "inherit",
    cwd: kanonikus(path.dirname(fileURLToPath(import.meta.url))),
  });
  gyermek.on("close", (kod) => process.exit(kod ?? 1));
}

main().catch((hiba) => {
  console.error(`\nA teszt-váz futtatója hibára futott:\n${hiba.stack ?? hiba}\n`);
  process.exit(2);
});
