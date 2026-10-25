// Regressziós tesztek a két mérő hookhoz (`kontextus-mero.mjs`, `futas-mero.mjs`)
// és a közös modulhoz (`futas-kozos.mjs`).
//
// Futtatás a repo gyökeréből:  node --test test/hooks/merok.test.mjs
//
// A hookok naplót írnak a `CLAUDE_PROJECT_DIR` alá, ezért MINDEN futás egy ideiglenes
// projektmappába mutat — a valódi `docs/orchestration/_kontextus/` ledgerbe a teszt
// soha nem ír. Az ideiglenes gyökér a repón BELÜL, a gitignore-olt `.scratch/tmp/` alatt
// van (3. audit 37. sor: a fejlesztő szabálya a natív eszközöket a munkaterületen
// tartja, a `%TEMP%` azon kívül esik), egyedi `mkdtemp` névvel, mert más tesztcsomagok
// is ide írnak. A végén csak a SAJÁT mappánkat töröljük, a közös `.scratch/tmp/`-t nem.
//
// Repón belül egy hiányzó `CLAUDE_PROJECT_DIR` már a valódi ledgerbe írna (a hookok a
// saját helyükből számolt repóra esnek vissza), ezért minden hookhívás kifejezetten az
// ideiglenes projektet kapja, és a közös modult is csak azután importáljuk, hogy a
// környezeti változó már az ideiglenes mappára áll (a modul a betöltéskor rögzíti az
// útvonalait). A hívó segédek (`futtat`, `szkript`) a hívás ELŐTT ellenőrzik, hogy a
// projektgyökér az ideiglenes gyökér alatt van (`tesztProjekt`).

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOKS = join(REPO, ".claude", "hooks");
const TMP_GYOKER = join(REPO, ".scratch", "tmp");
mkdirSync(TMP_GYOKER, { recursive: true });
const GYOKER = mkdtempSync(join(TMP_GYOKER, "merok-teszt-"));

// A közös modul útvonalai a betöltéskor rögzülnek: előbb a környezet, aztán az import.
const MODUL_PROJ = join(GYOKER, "modul");
process.env.CLAUDE_PROJECT_DIR = MODUL_PROJ;
const kozos = await import(pathToFileURL(join(HOOKS, "futas-kozos.mjs")).href);

after(() => rmSync(GYOKER, { recursive: true, force: true }));

/**
 * Minden gyerekfolyamat projektgyökere a teszt saját ideiglenes gyökere alatt kell legyen.
 * Ez determinisztikus védelem a valódi ledger ellen: egy hiányzó vagy rossz
 * `CLAUDE_PROJECT_DIR` itt, a hívás ELŐTT bukik el — nem utólag, egy (párhuzamos
 * sessionök miatt amúgy is mozgó) fájlméretből kikövetkeztetve.
 */
function tesztProjekt(proj) {
  const p = resolve(String(proj ?? ""));
  assert.ok(p.startsWith(GYOKER), `a hook nem az ideiglenes gyökérben futna: ${p}`);
  return p;
}

// --- Segédek ------------------------------------------------------------------

let sorszam = 0;
function ujProjekt({ receptek, keretek, arak } = {}) {
  const p = join(GYOKER, `p${++sorszam}`);
  const tar = join(p, "docs", "orchestration", "_kontextus");
  mkdirSync(tar, { recursive: true });
  if (receptek) writeFileSync(join(tar, "receptek.json"), JSON.stringify(receptek));
  if (keretek) writeFileSync(join(tar, "keretek.json"), JSON.stringify(keretek));
  if (arak) writeFileSync(join(tar, "arak.json"), JSON.stringify(arak));
  return p;
}

function futtat(hook, mod, bemenet, proj, env = {}) {
  // A hívó környezetének kapcsolói ne szivárogjanak be (üres értékkel sem: a
  // `FUTAS_AZONOSITO=""` is felülírná a session-t).
  const tiszta = { ...process.env };
  for (const k of ["COST_REDUCER", "FUTAS_KERET", "FUTAS_AZONOSITO"]) delete tiszta[k];
  const r = spawnSync(process.execPath, [join(HOOKS, hook), mod], {
    input: JSON.stringify(bemenet),
    env: { ...tiszta, CLAUDE_PROJECT_DIR: tesztProjekt(proj), ...env },
    encoding: "utf8",
    timeout: 15000,
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

function jsonlOlvas(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter((s) => s.trim()).map((s) => JSON.parse(s));
}

const meresek = (proj) => jsonlOlvas(join(proj, "docs", "orchestration", "_kontextus", "meresek.jsonl"));
const futasok = (proj) => jsonlOlvas(join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl"));

/** Ugyanaz a blokk-hash, mint a hookban. */
const h = (s) => createHash("sha256").update(s.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 12);

const A = "Első blokk: a feladat leírása, elég hosszan ahhoz, hogy az arány-küszöb ne bukjon.";
const B = "Második blokk: egy beillesztett kutatói jelentés, amit egy recept kiválthat.";
const C = "Harmadik blokk: a zárás.";
const PROMPT = [A, B, C].join("\n\n");

// Egy értelmezhető, delegálás nélküli átirat-sor (az üres átirat mérési hiba, M2-10).
const NYITO = JSON.stringify({ type: "user", message: { content: "nyitó" } }) + "\n";

const agentBe = (prompt, extra = {}) => ({
  session_id: "S",
  tool_name: "Agent",
  tool_input: { description: "d", prompt, subagent_type: "spec-implementer", ...extra },
});

const recept = (muveletek, extra = {}) => ({
  verzio: 1,
  minimum_arany: 0.25,
  vedett: [],
  receptek: [
    { id: "r1", agent: "spec-implementer", jovahagyva: "2026-01-01", indok: "teszt", amikor: { blokkok: [h(A)] }, muveletek, ...extra },
  ],
});

// --- kontextus-mero.mjs -----------------------------------------------------------

describe("kontextus-mero.mjs", () => {
  test("érvényes csere: allow + updatedInput, a mérési sor `atirva`", () => {
    const proj = ujProjekt({ receptek: recept([{ tipus: "csere", blokk: h(B), helyette: "Lásd: .scratch/kutato.md" }]) });
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj);
    assert.equal(r.exit, 0);
    const ki = JSON.parse(r.stdout);
    assert.equal(ki.hookSpecificOutput.permissionDecision, "allow");
    assert.ok(ki.hookSpecificOutput.updatedInput.prompt.includes("Lásd: .scratch/kutato.md"));
    assert.equal(meresek(proj).at(-1).allapot, "atirva");
  });

  test("M-1: egyetlen művelete sem talál blokkot → nincs kimenet, `mert` sor", () => {
    const proj = ujProjekt({ receptek: recept([{ tipus: "elhagy", blokk: "0123456789ab" }]) });
    // Szándékosan nem kanonikus tördelés: egy no-op `join` ezt is átírná.
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe(`${A}\n\n\n${B}  \n\n${C}`), proj);
    assert.equal(r.exit, 0);
    assert.equal(r.stdout, "");
    const sor = meresek(proj).at(-1);
    assert.equal(sor.allapot, "mert");
    assert.equal(sor.recept, "r1");
  });

  test("M-1: a már elöl álló blokk előre-tétele sem ad allow-t", () => {
    const proj = ujProjekt({ receptek: recept([{ tipus: "elore", blokk: h(A) }]) });
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj);
    assert.equal(r.stdout, "");
    assert.equal(meresek(proj).at(-1).allapot, "mert");
  });

  test("M-2: a recept saját 0-s aránya nem viszi lejjebb a globális küszöböt", () => {
    const hosszu = "x".repeat(2000);
    const proj = ujProjekt({ receptek: recept([{ tipus: "elhagy", blokk: h(hosszu) }], { minimum_arany: 0 }) });
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe([A, hosszu].join("\n\n")), proj);
    assert.equal(r.stdout, "");
    const sor = meresek(proj).at(-1);
    assert.equal(sor.allapot, "elutasitva");
    assert.match(sor.ok, /küszöb 25%/);
  });

  test("M-3: a duplikált védett mondat egyik példánya sem tűnhet el", () => {
    const v1 = "Ez A munkagyökered: D:/x — itt dolgozz, és elég hosszú ez a blokk.";
    const v2 = "Ismétlés: A munkagyökered ugyanaz.";
    const proj = ujProjekt({ receptek: recept([{ tipus: "elhagy", blokk: h(v2) }]) });
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe([A, v1, v2, C].join("\n\n")), proj);
    assert.equal(r.stdout, "");
    const sor = meresek(proj).at(-1);
    assert.equal(sor.allapot, "elutasitva");
    assert.match(sor.ok, /A munkagyökered/);
  });

  test("M-3: a `helyette` szövegbe csempészett védett mondat nem számít", () => {
    const v = "A munkagyökered: D:/x — ide írj, máshova soha.";
    const proj = ujProjekt({
      receptek: recept([{ tipus: "csere", blokk: h(v), helyette: "Rövidítve. A munkagyökered: lásd fent." }]),
    });
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe([A, v, C].join("\n\n")), proj);
    assert.equal(r.stdout, "");
    assert.equal(meresek(proj).at(-1).allapot, "elutasitva");
  });

  for (const [nev, ertek] of [
    ["szöveg („nem\")", "nem"],
    ["logikai true", true],
    ["jövőbeli dátum", "2099-01-01"],
    ["nem létező nap", "2026-02-31"],
    ["idővel", "2026-01-01T10:00:00Z"],
  ]) {
    test(`M-4: jovahagyva = ${nev} → nem illeszkedik`, () => {
      const proj = ujProjekt({
        receptek: recept([{ tipus: "csere", blokk: h(B), helyette: "rövid" }], { jovahagyva: ertek }),
      });
      const r = futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj);
      assert.equal(r.stdout, "");
      const sor = meresek(proj).at(-1);
      assert.equal(sor.allapot, "mert");
      assert.equal(sor.recept, undefined);
    });
  }

  test("M-5: `csere` `helyette` nélkül → exit 0, nincs kimenet, `hiba` sor", () => {
    const proj = ujProjekt({ receptek: recept([{ tipus: "csere", blokk: h(B) }]) });
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj);
    assert.equal(r.exit, 0);
    assert.equal(r.stdout, "");
    const sor = meresek(proj).at(-1);
    assert.equal(sor.allapot, "hiba");
    assert.match(sor.ok, /helyette/);
  });

  test("M-5: sérült receptfájl-alak (a `receptek` nem lista) → exit 0, `mert` sor", () => {
    const proj = ujProjekt({ receptek: { verzio: 1, receptek: { nem: "lista" }, vedett: "nem lista" } });
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj);
    assert.equal(r.exit, 0);
    assert.equal(r.stdout, "");
    assert.equal(meresek(proj).at(-1).allapot, "mert");
  });

  test("M-12: ismeretlen mód → csak `systemMessage`, permissionDecision nélkül", () => {
    const proj = ujProjekt();
    const r = futtat("kontextus-mero.mjs", "delegalaz", agentBe(PROMPT), proj);
    assert.equal(r.exit, 0);
    const ki = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(ki), ["systemMessage"]);
    assert.match(ki.systemMessage, /delegalaz/);
    assert.equal(meresek(proj).length, 0);
  });

  test("M-16: COST_REDUCER=0 a mérést is leállítja", () => {
    const proj = ujProjekt();
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj, { COST_REDUCER: "0" });
    assert.equal(r.stdout, "");
    assert.equal(meresek(proj).length, 0);
  });

  test("hibás JSON a stdin-en → exit 0, nincs kimenet", () => {
    const proj = ujProjekt();
    const r = spawnSync(process.execPath, [join(HOOKS, "kontextus-mero.mjs"), "delegalas"], {
      input: "{nem json",
      env: { ...process.env, CLAUDE_PROJECT_DIR: tesztProjekt(proj) },
      encoding: "utf8",
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  });
});

// --- futas-kozos.mjs: konvergencia ---------------------------------------------------

describe("futas-kozos.mjs — konvergencia", () => {
  test("M-6: soronként csak az ítélet előtti első azonosító számít", () => {
    const k = kozos.konvergencia(
      ["FA-01 [teljesül] UTF-8 kódolás rendben", "FA-02 [nem teljesül] — lásd FA-03", "HTTP-2 nélkül: FA-05 [kétséges]"].join("\n"),
    );
    assert.deepEqual(k.teljesult_idk, ["FA-01"]);
    assert.deepEqual(k.bukott_idk, ["FA-02"]);
    assert.equal(k.nem_teljesul, 1);
    assert.equal(k.teljesul, 1);
    assert.equal(k.ketseges, 1);
  });

  test("M-6: a validátor mintája (`1. [teljesül] AR-17 …`) — a jelölő utáni első azonosító", () => {
    const k = kozos.konvergencia("1. [teljesül] AR-17 a hibaüzenet (vö. AR-03)\n2. [nem teljesül] AR-18: UTF-8 BOM");
    assert.deepEqual(k.teljesult_idk, ["AR-17"]);
    assert.deepEqual(k.bukott_idk, ["AR-18"]);
  });

  test("M-7: ékezetes azonosító nem csonkul", () => {
    const k = kozos.konvergencia("ÁR-01 [nem teljesül]\nŐK-2 [teljesül]");
    assert.deepEqual(k.bukott_idk, ["ÁR-01"]);
    assert.deepEqual(k.teljesult_idk, ["ŐK-2"]);
  });

  test("marker nélküli jelentés → null (mérési hiány, nem „0 hiba\")", () => {
    assert.equal(kozos.konvergencia("minden rendben"), null);
  });
});

// --- futas-kozos.mjs: ítélet ---------------------------------------------------------

const KERET = {
  keret: { koltseg_egyseg: 1_000_000, koltseg_usd: 120 },
  konvergencia: true,
  oszcillacio: true,
  validator_agentek: ["spec-validator"],
  javito_agentek: ["spec-implementer", "e2e-test-writer"],
};

const korSor = (szoveg) => ({ futas: "F", agent: "spec-validator", allapot: "egyeztetve", koltseg_egyseg: 1, konvergencia: kozos.konvergencia(szoveg) });

describe("futas-kozos.mjs — ítélet", () => {
  test("M-6: hivatkozott vagy nem-kritérium azonosító nem ad hamis oszcillációt", () => {
    const sorok = [
      korSor(["FA-01 [teljesül] UTF-8 kódolás rendben", "FA-02 [nem teljesül]", "FA-03 [nem teljesül]"].join("\n")),
      korSor(["FA-02 [teljesül]", "FA-03 [nem teljesül] — UTF-8 BOM, ugyanaz, mint FA-01-nél"].join("\n")),
    ];
    assert.equal(kozos.itelet({ sorok, keretek: KERET, futas: "F", agent: "spec-implementer" }), null);
  });

  test("M-8: a két körrel korábban teljesült kritérium visszaesése is oszcilláció", () => {
    const sorok = [
      korSor(["AR-1 [teljesül]", "AR-2 [nem teljesül]", "AR-3 [nem teljesül]", "AR-4 [nem teljesül]", "AR-5 [nem teljesül]"].join("\n")),
      korSor(["AR-1 [kétséges]", "AR-2 [teljesül]", "AR-3 [nem teljesül]", "AR-4 [nem teljesül]", "AR-5 [nem teljesül]"].join("\n")),
      korSor(["AR-1 [nem teljesül]", "AR-3 [nem teljesül]"].join("\n")),
    ];
    const ok = kozos.itelet({ sorok, keretek: KERET, futas: "F", agent: "spec-implementer" });
    assert.equal(ok?.szabaly, "oszcillacio");
    assert.match(ok.uzenet, /AR-1 \(1\. kör\)/);
  });

  // (B) döntés, 2026-11-06: a 0 → N esetet az OSZCILLÁCIÓ fogja, a konvergencia-
  // szabály szándékosan nem (az `elozo.nem_teljesul > 0` feltétel marad).
  test("0 → N: tiszta kör után újra bukó kritérium → oszcilláció (a konvergencia nem lép)", () => {
    const sorok = [
      korSor(["AR-1 [teljesül]", "AR-2 [teljesül]", "AR-3 [teljesül]"].join("\n")),
      korSor(["AR-1 [teljesül]", "AR-2 [nem teljesül]", "AR-3 [teljesül]"].join("\n")),
    ];
    assert.equal(sorok[0].konvergencia.nem_teljesul, 0);
    const ok = kozos.itelet({ sorok, keretek: KERET, futas: "F", agent: "spec-implementer" });
    assert.equal(ok?.szabaly, "oszcillacio");
    assert.match(ok.uzenet, /AR-2 \(1\. kör\)/);
    // Oszcilláció nélkül a 0 → N eset semmit nem tilt: a konvergencia-szabály
    // szándékosan nem fogja (ez a döntés másik fele).
    assert.equal(kozos.itelet({ sorok, keretek: { ...KERET, oszcillacio: false }, futas: "F", agent: "spec-implementer" }), null);
  });

  test("0 → N, korábbi bukó előzménnyel: N → 0 → N is oszcilláció", () => {
    const sorok = [
      korSor(["AR-1 [nem teljesül]", "AR-2 [teljesül]"].join("\n")),
      korSor(["AR-1 [teljesül]", "AR-2 [teljesül]"].join("\n")),
      korSor(["AR-1 [nem teljesül]", "AR-2 [teljesül]"].join("\n")),
    ];
    assert.equal(kozos.itelet({ sorok, keretek: KERET, futas: "F", agent: "spec-implementer" })?.szabaly, "oszcillacio");
  });

  test("ismert rés: tiszta kör után egy addig SOHA nem mért azonosító bukása egyik szabályt sem váltja ki", () => {
    // Az oszcilláció azonosító-alapú: amit egyik korábbi kör sem jelölt
    // `[teljesül]`-nek, az nem „visszaesés". Ezt a kapu-szabalyok.md is kimondja.
    const sorok = [
      korSor(["AR-1 [teljesül]", "AR-2 [teljesül]"].join("\n")),
      korSor(["AR-9 [nem teljesül]"].join("\n")),
    ];
    assert.equal(kozos.itelet({ sorok, keretek: KERET, futas: "F", agent: "spec-implementer" }), null);
  });

  test("validátor-delegálást sosem tilt, túllépett keretnél sem", () => {
    const sorok = [{ futas: "F", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 9_999_999 }];
    assert.equal(kozos.itelet({ sorok, keretek: KERET, futas: "F", agent: "spec-validator" }), null);
    assert.equal(kozos.itelet({ sorok, keretek: KERET, futas: "F", agent: "spec-implementer" })?.szabaly, "keret");
  });

  test("M-9: a részleges USD önmagában nem tilt, a teljes igen", () => {
    const sor = { futas: "F", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 10, koltseg_usd: 500 };
    assert.equal(
      kozos.itelet({ sorok: [{ ...sor, koltseg_usd_reszleges: true }], keretek: KERET, futas: "F", agent: "spec-implementer" }),
      null,
    );
    assert.equal(kozos.itelet({ sorok: [sor], keretek: KERET, futas: "F", agent: "spec-implementer" })?.szabaly, "keret");
  });
});

// --- futas-kozos.mjs: pénz, összesítés, utolsó futás -----------------------------------

describe("futas-kozos.mjs — pénz és riport-segédek", () => {
  const arak = { ervenyes: "2026-10-25", modellek: { "claude-haiku-4-5": { be_millio: 1, ki_millio: 5 } } };
  const t = { be: 1_000_000, ki: 0, cache_ir_5m: 0, cache_ir_1h: 0, cache_olv: 0 };

  test("M-9: a dátum-utótag levágva árazódik; az áratlan modell részlegessé teszi az összeget", () => {
    const r = kozos.koltsegUsdReszletes({ "claude-haiku-4-5-20251001": t, "claude-ismeretlen-9": t }, arak);
    assert.equal(r.usd, 1);
    assert.equal(r.reszleges, true);
    assert.deepEqual(r.araznatlan, ["claude-ismeretlen-9"]);
    assert.equal(kozos.koltsegUsd({ "claude-haiku-4-5-20251001": t }, arak), 1);
    assert.equal(kozos.koltsegUsd({ "claude-ismeretlen-9": t }, arak), null);
  });

  test("M-15: hiányzó `ervenyes` → `arak_ervenyes: null` figyelmeztetés a riport-összesítésben", () => {
    assert.equal(kozos.arakFigyelmeztetes(arak), null);
    assert.match(kozos.arakFigyelmeztetes({ modellek: {} }), /arak_ervenyes: null/);
    const [f] = kozos.osszesites([{ futas: "F", agent: "x", allapot: "egyeztetve", koltseg_egyseg: 1, koltseg_usd: 0.5, arak_ervenyes: null }]);
    assert.equal(f.arak_ervenyes, null);
    assert.ok(f.figyelmeztetesek.some((s) => s.includes("arak_ervenyes: null")));
    const [g] = kozos.osszesites([{ futas: "G", agent: "x", allapot: "egyeztetve", koltseg_usd: 0.5, arak_ervenyes: "2026-10-25" }]);
    assert.equal(g.arak_ervenyes, "2026-10-25");
    assert.deepEqual(g.figyelmeztetesek, []);
  });

  test("utolsoFutas: a legkésőbbi `ts` futása; üres naplóra null", () => {
    assert.equal(kozos.utolsoFutas([]), null);
    assert.equal(
      kozos.utolsoFutas([
        { futas: "A", ts: "2026-11-01T10:00:00Z" },
        { futas: "B", ts: "2026-11-03T10:00:00Z" },
        { futas: "C", ts: "2026-11-02T10:00:00Z" },
        { ts: "2026-11-09T10:00:00Z" },
      ]),
      "B",
    );
  });
});

// --- futas-kozos.mjs: egyeztetés (háttér-delegálás) ------------------------------------

describe("futas-kozos.mjs — egyeztetés", () => {
  let sess;
  let atirat;
  before(() => {
    sess = join(MODUL_PROJ, "_sess");
    mkdirSync(join(sess, "S", "subagents"), { recursive: true });
    atirat = join(sess, "S.jsonl");
    writeFileSync(
      atirat,
      JSON.stringify({
        type: "user",
        timestamp: "2026-11-05T10:00:00Z",
        message: { content: [{ type: "tool_result", tool_use_id: "toolu_H" }] },
        toolUseResult: { isAsync: true, status: "async_launched", agentId: "h1" },
      }) + "\n",
    );
  });

  test("M-10: még futó háttéragent (meta van, átirat nincs) → nincs hamis `hiba` sor", () => {
    writeFileSync(join(sess, "S", "subagents", "agent-h1.meta.json"), JSON.stringify({ agentType: "spec-implementer", finished: false }));
    const r = kozos.egyeztet({ transcriptPath: atirat, futas: "F" });
    assert.deepEqual(r.ujak, []);
    assert.deepEqual(r.hibak, []);
    assert.equal(futasok(MODUL_PROJ).length, 0);
  });

  test("lezárt háttéragent → egyeztetett sor a részleges-ár mezőkkel", () => {
    writeFileSync(join(sess, "S", "subagents", "agent-h1.meta.json"), JSON.stringify({ agentType: "spec-implementer", finished: true }));
    const usage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    writeFileSync(
      join(sess, "S", "subagents", "agent-h1.jsonl"),
      [
        { type: "assistant", timestamp: "2026-11-05T10:00:01Z", message: { id: "m1", model: "claude-ismeretlen-9", usage, content: [] } },
      ].map((s) => JSON.stringify(s)).join("\n") + "\n",
    );
    const r = kozos.egyeztet({ transcriptPath: atirat, futas: "F" });
    assert.equal(r.ujak.length, 1);
    const sor = r.ujak[0];
    assert.equal(sor.allapot, "egyeztetve");
    assert.equal(sor.koltseg_usd, null);
    assert.equal(sor.koltseg_usd_reszleges, false);
    assert.deepEqual(sor.araznatlan_modellek, ["claude-ismeretlen-9"]);
    // Második egyeztetés: nincs új kör, nincs dupla sor.
    assert.equal(kozos.egyeztet({ transcriptPath: atirat, futas: "F" }).ujak.length, 0);
  });
});

// --- futas-kozos.mjs: futás-azonosító (env > jelző > session) ---------------------------

const ORA = 60 * 60 * 1000;
const MOST = Date.parse("2026-11-06T12:00:00Z");

function jelzoIr(proj, tartalom) {
  const dir = join(proj, ".scratch", "futas-merleg");
  mkdirSync(dir, { recursive: true });
  const f = join(dir, "aktiv-futas.json");
  writeFileSync(f, typeof tartalom === "string" ? tartalom : JSON.stringify(tartalom));
  return f;
}

describe("futas-kozos.mjs — futás-azonosító feloldása", () => {
  const friss = { futas: "kupon", kezdet: new Date(MOST - ORA).toISOString() };
  const felold = (jelzo, env = {}) => kozos.futasFeloldas({ session: "S", env, jelzo, most: MOST });

  test("elsőbbség: env > friss jelző > session", () => {
    const f = jelzoIr(ujProjekt(), friss);
    assert.equal(felold(f, { FUTAS_AZONOSITO: "kezi" }), "kezi");
    assert.equal(felold(f), "kupon");
    assert.equal(felold(join(GYOKER, "nincs", "aktiv-futas.json")), "S");
  });

  test("üres vagy csupa szóköz `FUTAS_AZONOSITO` nem számít megadottnak", () => {
    const f = jelzoIr(ujProjekt(), friss);
    assert.equal(felold(f, { FUTAS_AZONOSITO: "" }), "kupon");
    assert.equal(felold(f, { FUTAS_AZONOSITO: "  " }), "kupon");
  });

  test("lejárt jelző (6 óránál régebbi) → session; a 6 órás határ még friss", () => {
    assert.equal(felold(jelzoIr(ujProjekt(), { futas: "kupon", kezdet: new Date(MOST - 6 * ORA - 1000).toISOString() })), "S");
    assert.equal(felold(jelzoIr(ujProjekt(), { futas: "kupon", kezdet: new Date(MOST - 6 * ORA).toISOString() })), "kupon");
  });

  test("jövőbeli `kezdet` → session", () => {
    assert.equal(felold(jelzoIr(ujProjekt(), { futas: "kupon", kezdet: new Date(MOST + 60_000).toISOString() })), "S");
  });

  for (const [nev, tartalom] of [
    ["hibás JSON", "{nem json"],
    ["JSON-tömb", "[]"],
    ["hiányzó `futas`", { kezdet: friss.kezdet }],
    ["üres `futas`", { futas: "  ", kezdet: friss.kezdet }],
    ["nem szöveg `futas`", { futas: 7, kezdet: friss.kezdet }],
    ["hiányzó `kezdet`", { futas: "kupon" }],
    ["értelmezhetetlen `kezdet`", { futas: "kupon", kezdet: "tegnap délben" }],
    ["időzóna nélküli `kezdet`", { futas: "kupon", kezdet: "2026-11-06T11:00:00" }],
    ["csak dátum", { futas: "kupon", kezdet: "2026-11-06" }],
    ["nem létező időpont", { futas: "kupon", kezdet: "2026-13-45T99:00:00Z" }],
  ]) {
    test(`hibás jelző (${nev}) → session`, () => {
      assert.equal(felold(jelzoIr(ujProjekt(), tartalom)), "S");
    });
  }

  test("PowerShell `Get-Date -Format o` alakú `kezdet` (7 tizedes, eltolás) friss", () => {
    const f = jelzoIr(ujProjekt(), { futas: "kupon", kezdet: "2026-11-06T12:30:00.0000000+01:00" });
    assert.equal(felold(f), "kupon");
  });
});

// --- futas-mero.mjs ----------------------------------------------------------------------

describe("futas-mero.mjs", () => {
  const keretek = { ...KERET, keret: { koltseg_egyseg: 100, koltseg_usd: null } };

  function kapuProjekt() {
    const proj = ujProjekt({ keretek });
    const tp = join(proj, "S.jsonl");
    // Egy értelmezhető, delegálás nélküli sor: az üres átirat (M2-10) mérési hiba.
    writeFileSync(tp, NYITO);
    writeFileSync(
      join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl"),
      JSON.stringify({ futas: "S", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 500 }) + "\n",
    );
    return { proj, tp };
  }

  const be = (tp, agent) => ({ session_id: "S", transcript_path: tp, tool_name: "Agent", tool_input: { prompt: "p", subagent_type: agent } });

  test("túllépett keret LÁNCBAN: javító delegálás → deny, validátor → nincs kimenet; allow soha", () => {
    const { proj, tp } = kapuProjekt();
    const lanc = { FUTAS_AZONOSITO: "S" };
    const tilt = futtat("futas-mero.mjs", "kapu", be(tp, "spec-implementer"), proj, lanc);
    assert.equal(tilt.exit, 0);
    assert.equal(JSON.parse(tilt.stdout).hookSpecificOutput.permissionDecision, "deny");
    const val = futtat("futas-mero.mjs", "kapu", be(tp, "spec-validator"), proj, lanc);
    assert.equal(val.stdout, "");
  });

  test("3. audit 1. sor: túllépett keret SESSION-futásban (se env, se jelző) → csak `systemMessage`", () => {
    const { proj, tp } = kapuProjekt();
    const r = futtat("futas-mero.mjs", "kapu", be(tp, "spec-implementer"), proj);
    assert.equal(r.exit, 0);
    const ki = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(ki), ["systemMessage"]);
    assert.match(ki.systemMessage, /figyelmeztetés/);
    assert.match(ki.systemMessage, /"keret"/);
  });

  test("3. audit 1. sor: friss jelzővel a lánc saját túllépett kerete → deny", () => {
    const { proj, tp } = kapuProjekt();
    writeFileSync(
      join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl"),
      JSON.stringify({ futas: "lanc", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 500 }) + "\n",
    );
    jelzoIr(proj, { futas: "lanc", kezdet: new Date(Date.now() - 60_000).toISOString() });
    const r = futtat("futas-mero.mjs", "kapu", be(tp, "spec-implementer"), proj);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
  });

  test("M-16: FUTAS_KERET=0 → nincs ítélet és nincs egyeztetés", () => {
    const { proj, tp } = kapuProjekt();
    const r = futtat("futas-mero.mjs", "kapu", be(tp, "spec-implementer"), proj, { FUTAS_KERET: "0" });
    assert.equal(r.stdout, "");
    assert.equal(futasok(proj).length, 1);
  });

  test("M-12: ismeretlen mód → csak `systemMessage`", () => {
    const { proj, tp } = kapuProjekt();
    const r = futtat("futas-mero.mjs", "kapuu", be(tp, "spec-implementer"), proj);
    assert.equal(r.exit, 0);
    const ki = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(ki), ["systemMessage"]);
  });

  test("hiányzó átirat → fail-open: nincs ítélet, csak `systemMessage` (M2-5)", () => {
    const { proj } = kapuProjekt();
    const r = futtat("futas-mero.mjs", "kapu", be(join(proj, "nincs.jsonl"), "spec-implementer"), proj);
    assert.equal(r.exit, 0);
    const ki = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(ki), ["systemMessage"]);
    assert.match(ki.systemMessage, /nincs olvasható átirat/);
  });

  // (A) A napló sora `futas: "S"` (a session) és túllépi a keretet: a tiltás tehát
  // pontosan akkor jön, ha a hook az "S" futásról ítél.
  const frissJelzo = (futas = "lanc") => ({ futas, kezdet: new Date(Date.now() - 60_000).toISOString() });
  const dontes = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : "nincs");

  test("(A) friss jelző: a kapu a jelző futásáról ítél, nem a sessionéről", () => {
    const { proj, tp } = kapuProjekt();
    jelzoIr(proj, frissJelzo());
    assert.equal(dontes(futtat("futas-mero.mjs", "kapu", be(tp, "spec-implementer"), proj)), "nincs");
  });

  test("(A) az env a jelzőt is felülírja", () => {
    const { proj, tp } = kapuProjekt();
    jelzoIr(proj, frissJelzo());
    const r = futtat("futas-mero.mjs", "kapu", be(tp, "spec-implementer"), proj, { FUTAS_AZONOSITO: "S" });
    assert.equal(dontes(r), "deny");
  });

  for (const [nev, jelzo] of [
    ["lejárt", { futas: "lanc", kezdet: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() }],
    ["jövőbeli", { futas: "lanc", kezdet: new Date(Date.now() + 60 * 60 * 1000).toISOString() }],
    ["hibás", "{nem json"],
  ]) {
    test(`(A) ${nev} jelző → a session futása (fail-open, kivétel nélkül)`, () => {
      const { proj, tp } = kapuProjekt();
      jelzoIr(proj, jelzo);
      const r = futtat("futas-mero.mjs", "kapu", be(tp, "spec-implementer"), proj);
      assert.equal(r.exit, 0);
      // A session ("S") futásáról ítél: a keret túllépett, de session-futásnál csak
      // figyelmeztet (3. audit 1. sor).
      assert.match(JSON.parse(r.stdout).systemMessage ?? "", /session futásáról/);
    });
  }

  test("(A) egyeztetéskor a sor a delegálás IDEJÉN érvényes futást kapja, nem a mostanit", () => {
    const proj = ujProjekt({ keretek: KERET });
    const tp = join(proj, "S.jsonl");
    writeFileSync(tp, "");
    const sub = join(proj, "S", "subagents");
    mkdirSync(sub, { recursive: true });

    // 1. A delegálás a "lanc-A" futásban indul (a hook ekkor jegyzi a kötést).
    jelzoIr(proj, frissJelzo("lanc-A"));
    const bem1 = { ...be(tp, "spec-implementer"), tool_use_id: "toolu_1" };
    assert.equal(futtat("futas-mero.mjs", "kapu", bem1, proj).exit, 0);
    const kotes = jsonlOlvas(join(proj, ".scratch", "futas-merleg", "delegalasok.jsonl"));
    assert.deepEqual(kotes.map((k) => [k.tool_use_id, k.futas]), [["toolu_1", "lanc-A"]]);

    // 2. A delegálás lefut (előtér), a lánc véget ér, a jelzőt törlik.
    const usage = { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    writeFileSync(join(sub, "agent-a1.jsonl"), JSON.stringify({ type: "assistant", timestamp: "2026-11-06T10:00:01Z", message: { id: "m1", model: "claude-x", usage, content: [] } }) + "\n");
    writeFileSync(
      tp,
      JSON.stringify({
        type: "user",
        timestamp: "2026-11-06T10:00:02Z",
        message: { content: [{ type: "tool_result", tool_use_id: "toolu_1" }] },
        toolUseResult: { agentId: "a1", agentType: "spec-implementer", status: "completed", content: [{ type: "text", text: "kész" }] },
      }) + "\n",
    );
    rmSync(join(proj, ".scratch", "futas-merleg", "aktiv-futas.json"));

    // 3. A következő delegálás (már a session futásában) egyezteti az előzőt.
    futtat("futas-mero.mjs", "kapu", { ...be(tp, "spec-researcher"), tool_use_id: "toolu_2" }, proj);
    const sor = futasok(proj).find((s) => s.tool_use_id === "toolu_1");
    assert.equal(sor?.futas, "lanc-A");
  });

  test("(A) SendMessage-folytatás: a folytatás sora a folytatás IDEJÉN érvényes futást kapja", () => {
    const proj = ujProjekt({ keretek: KERET });
    const tp = join(proj, "S.jsonl");
    writeFileSync(tp, "");
    const sub = join(proj, "S", "subagents");
    mkdirSync(sub, { recursive: true });
    const usage = { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const kor = (id) => JSON.stringify({ type: "assistant", timestamp: "2026-11-06T10:00:01Z", message: { id, model: "claude-x", usage, content: [] } }) + "\n";

    // Háttér-delegálás a "lanc-A" futásban.
    jelzoIr(proj, frissJelzo("lanc-A"));
    futtat("futas-mero.mjs", "kapu", { ...be(tp, "spec-implementer"), tool_use_id: "toolu_H" }, proj);
    writeFileSync(
      tp,
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "toolu_H" }] },
        toolUseResult: { isAsync: true, status: "async_launched", agentId: "h1" },
      }) + "\n",
    );
    writeFileSync(join(sub, "agent-h1.meta.json"), JSON.stringify({ agentType: "spec-implementer", finished: true }));
    writeFileSync(join(sub, "agent-h1.jsonl"), kor("m1"));

    // Egy későbbi lánc ("lanc-B") folytatja SendMessage-dzsel; közben egyeztet is.
    jelzoIr(proj, frissJelzo("lanc-B"));
    futtat("futas-mero.mjs", "kapu", { session_id: "S", transcript_path: tp, tool_name: "SendMessage", tool_input: { to: "h1", message: "tovább" } }, proj);
    writeFileSync(join(sub, "agent-h1.jsonl"), kor("m1") + kor("m2"));
    rmSync(join(proj, ".scratch", "futas-merleg", "aktiv-futas.json"));
    futtat("futas-mero.mjs", "kapu", { ...be(tp, "spec-researcher"), tool_use_id: "toolu_Z" }, proj);

    const sorok = futasok(proj).filter((s) => s.tool_use_id === "toolu_H");
    assert.deepEqual(sorok.map((s) => [s.folytatas, s.futas]), [[false, "lanc-A"], [true, "lanc-B"]]);
  });

  test("egyik hook sem ír `defer`-t a stdout-ra", () => {
    const { proj, tp } = kapuProjekt();
    for (const [hook, mod] of [["kontextus-mero.mjs", "delegalas"], ["futas-mero.mjs", "kapu"]]) {
      for (const bem of [{}, be(tp, "spec-researcher"), { tool_name: "Bash", tool_input: { command: "ls" } }]) {
        assert.doesNotMatch(futtat(hook, mod, bem, proj).stdout, /"defer"/);
      }
    }
  });
});

// --- 2. audit-kör javításai (M2-*, SB2-*) -------------------------------------------------

const TISZTA_ENV = () => {
  const e = { ...process.env };
  for (const k of ["COST_REDUCER", "FUTAS_KERET", "FUTAS_AZONOSITO"]) delete e[k];
  return e;
};

/** Egy szkript (nem hook) futtatása ideiglenes projekt alatt. */
function szkript(rel, args, proj) {
  const r = spawnSync(process.execPath, [join(REPO, rel), ...args], {
    env: { ...TISZTA_ENV(), CLAUDE_PROJECT_DIR: tesztProjekt(proj) },
    encoding: "utf8",
    timeout: 15000,
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Háttér-delegálásos szimulációs projekt (a `sim.mjs` audit-szimulátor mintájára). */
function hatterProjekt(keretek = KERET) {
  const proj = ujProjekt({ keretek });
  const tp = join(proj, "S.jsonl");
  writeFileSync(tp, NYITO);
  const sub = join(proj, "S", "subagents");
  mkdirSync(sub, { recursive: true });
  const usage = { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const kor = (id, ts = "2026-11-06T10:00:01Z") =>
    JSON.stringify({ type: "assistant", timestamp: ts, message: { id, model: "claude-x", usage, content: [] } }) + "\n";
  const hatter = (tuid, aid, ts = "2026-11-06T10:00:00Z") =>
    JSON.stringify({
      type: "user",
      timestamp: ts,
      message: { content: [{ type: "tool_result", tool_use_id: tuid }] },
      toolUseResult: { isAsync: true, status: "async_launched", agentId: aid },
    }) + "\n";
  const agent = (tuid, tipus = "spec-implementer") => ({
    session_id: "S",
    transcript_path: tp,
    tool_name: "Agent",
    tool_use_id: tuid,
    tool_input: { prompt: "p", subagent_type: tipus },
  });
  const sm = (to, session = "S") => ({
    session_id: session,
    transcript_path: tp,
    tool_name: "SendMessage",
    tool_use_id: `toolu_sm_${Math.random()}`,
    tool_input: { to, message: "tovább" },
  });
  const hook = (bem, env = {}) => futtat("futas-mero.mjs", "kapu", bem, proj, env);
  const meta = (aid, m) => writeFileSync(join(sub, `agent-${aid}.meta.json`), JSON.stringify(m));
  const korok = (aid, ...sorok) => writeFileSync(join(sub, `agent-${aid}.jsonl`), sorok.join(""));
  const jelzo = (futas) => jelzoIr(proj, { futas, kezdet: new Date(Date.now() - 60_000).toISOString() });
  const jelzoTorol = () => rmSync(join(proj, ".scratch", "futas-merleg", "aktiv-futas.json"), { force: true });
  const naplo = () => futasok(proj).map((s) => [s.tool_use_id, s.folytatas ?? false, s.futas, s.korok]);
  return { proj, tp, sub, kor, hatter, agent, sm, hook, meta, korok, jelzo, jelzoTorol, naplo };
}

describe("M2-1: a SendMessage-kötés nem írja felül a könyveletlen folytatást", () => {
  test("sm-felulir: a lanc-A-beli folytatás akkor is lanc-A, ha egy lanc-B-beli SendMessage egyezteti", () => {
    const p = hatterProjekt();
    p.jelzo("lanc-A");
    p.hook(p.agent("toolu_H"));
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", p.kor("m1"));
    p.hook(p.sm("h1")); // lanc-A: folytatás (ez egyezteti az m1-et)
    p.korok("h1", p.kor("m1"), p.kor("m2", "2026-11-06T11:00:00Z"));
    p.jelzoTorol();
    p.jelzo("lanc-B");
    p.hook(p.sm("h1")); // lanc-B: újabb folytatás — ez egyezteti az m2-t
    assert.deepEqual(p.naplo(), [
      ["toolu_H", false, "lanc-A", 1],
      ["toolu_H", true, "lanc-A", 1],
    ]);
    // A kötés a session-t és a kötéskori körszámot is hordozza.
    const kotesek = jsonlOlvas(join(p.proj, ".scratch", "futas-merleg", "delegalasok.jsonl")).filter((k) => k.cel);
    assert.deepEqual(kotesek.map((k) => [k.session, k.cel, k.agent_id, k.kor, k.futas]), [
      ["S", "h1", "h1", 1, "lanc-A"],
      ["S", "h1", "h1", 2, "lanc-B"],
    ]);
  });

  test("sm-felulir-ugyanaz-lanc: a jelző törlése utáni SendMessage sem viszi át a sessionbe", () => {
    const p = hatterProjekt();
    p.jelzo("lanc-A");
    p.hook(p.agent("toolu_H"));
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", p.kor("m1"));
    p.hook(p.sm("h1"));
    p.korok("h1", p.kor("m1"), p.kor("m2"));
    p.jelzoTorol();
    p.hook(p.sm("h1"));
    assert.deepEqual(p.naplo(), [
      ["toolu_H", false, "lanc-A", 1],
      ["toolu_H", true, "lanc-A", 1],
    ]);
  });

  test("még futó agentnek küldött második SendMessage: a körök a kötések kör-határa szerint két szakasz", () => {
    const p = hatterProjekt();
    p.jelzo("lanc-A");
    p.hook(p.agent("toolu_H"));
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", p.kor("m1"));
    p.hook(p.sm("h1")); // lanc-A, kor = 1
    p.meta("h1", { agentType: "spec-implementer", finished: false });
    p.korok("h1", p.kor("m1"), p.kor("m2"));
    p.jelzo("lanc-B");
    p.hook(p.sm("h1")); // a még futó agentnek: lanc-B, kor = 2 (közben semmit nem egyeztet)
    p.korok("h1", p.kor("m1"), p.kor("m2"), p.kor("m3"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.jelzoTorol();
    p.hook(p.agent("toolu_Z", "spec-researcher"));
    const sorok = futasok(p.proj).filter((s) => s.tool_use_id === "toolu_H");
    assert.deepEqual(sorok.map((s) => [s.folytatas, s.futas, s.kezdo_kor, s.szakasz]), [
      [false, "lanc-A", 1, "m1"],
      [true, "lanc-A", 2, "m2"],
      [true, "lanc-B", 3, "m3"],
    ]);
  });

  test("egy MÁSIK session azonos nevű címzett-kötése nem érvényes ebben a sessionben", () => {
    const p = hatterProjekt();
    p.jelzo("lanc-A");
    p.hook(p.agent("toolu_H"));
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", p.kor("m1"));
    p.hook(p.agent("toolu_X", "spec-researcher")); // egyezteti az m1-et
    // Egy másik session („T") kötése ugyanarra a névre.
    const kf = join(p.proj, ".scratch", "futas-merleg", "delegalasok.jsonl");
    writeFileSync(kf, readFileSync(kf, "utf8") + JSON.stringify({ ts: new Date().toISOString(), futas: "idegen", session: "T", cel: "h1", kor: 0 }) + "\n");
    p.korok("h1", p.kor("m1"), p.kor("m2"));
    p.hook(p.agent("toolu_Y", "spec-researcher"));
    const folyt = futasok(p.proj).find((s) => s.tool_use_id === "toolu_H" && s.folytatas);
    assert.equal(folyt?.futas, "lanc-A");
  });
});

describe("M2-2: olvasáskori deduplikálás", () => {
  const validatorSor = (szoveg, extra = {}) => ({
    futas: "F",
    tool_use_id: "toolu_V1",
    kezdo_kor: 1,
    agent: "spec-validator",
    allapot: "egyeztetve",
    koltseg_egyseg: 7,
    koltseg_usd: 0.5,
    arak_ervenyes: "2026-10-25",
    konvergencia: kozos.konvergencia(szoveg),
    ...extra,
  });

  test("két azonos sor → egy kör, egy költség (itelet és osszesites)", () => {
    const sor = validatorSor("AR-1 [nem teljesül]\nAR-2 [nem teljesül]");
    const sorok = [sor, { ...sor }];
    // Dedup nélkül ez 2 → 2: hamis konvergencia-tiltás.
    assert.equal(kozos.itelet({ sorok, keretek: KERET, futas: "F", agent: "spec-implementer" }), null);
    const [f] = kozos.osszesites(sorok);
    assert.equal(f.db, 1);
    assert.equal(f.egyseg, 7);
    assert.equal(f.usd, 0.5);
    assert.deepEqual(f.gorbe, [2]);
  });

  test("a kulcs determinisztikus: folytatásnál a szakasz, hibánál az ok; `tool_use_id` nélkül nincs szűrés", () => {
    assert.equal(kozos.sorKulcs({ tool_use_id: "t", folytatas: true, szakasz: "m2" }), "t|f|m2");
    assert.equal(kozos.sorKulcs({ tool_use_id: "t" }), "t|k|1");
    assert.equal(kozos.sorKulcs({ tool_use_id: "t", allapot: "hiba", ok: "x" }), "t|hiba|x");
    assert.equal(kozos.sorKulcs({ futas: "F" }), null);
    const a = { tool_use_id: "t", folytatas: true, szakasz: "m2", koltseg_egyseg: 1 };
    const b = { tool_use_id: "t", folytatas: true, szakasz: "m3", koltseg_egyseg: 1 };
    assert.equal(kozos.egyediSorok([a, a, b, { futas: "F" }, { futas: "F" }]).length, 4);
  });

  test("az egyeztetés a kettős naplósort nem számolja kétszer (a folytatás nem marad el)", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", p.kor("m1"));
    p.hook(p.agent("toolu_A", "spec-researcher"));
    // Egy párhuzamos hook kettős sora.
    const nf = join(p.proj, "docs", "orchestration", "_kontextus", "futasok.jsonl");
    writeFileSync(nf, readFileSync(nf, "utf8").repeat(2));
    p.korok("h1", p.kor("m1"), p.kor("m2"));
    p.hook(p.agent("toolu_B", "spec-researcher"));
    const folyt = futasok(p.proj).filter((s) => s.tool_use_id === "toolu_H" && s.folytatas);
    assert.equal(folyt.length, 1);
    assert.equal(folyt[0].szakasz, "m2");
  });
});

describe("M2-3: a jelző opcionális `session` mezője", () => {
  const kezdet = new Date(MOST - ORA).toISOString();
  const felold = (jelzo, session = "S") => kozos.futasFeloldas({ session, env: {}, jelzo, most: MOST });

  test("egyező session → a jelző futása; eltérő → a session; mező nélkül → a jelző", () => {
    assert.equal(felold(jelzoIr(ujProjekt(), { futas: "kupon", kezdet, session: "S" })), "kupon");
    assert.equal(felold(jelzoIr(ujProjekt(), { futas: "kupon", kezdet, session: "MASIK" })), "S");
    assert.equal(felold(jelzoIr(ujProjekt(), { futas: "kupon", kezdet })), "kupon");
    assert.equal(felold(jelzoIr(ujProjekt(), { futas: "kupon", kezdet, session: 7 })), "S");
  });

  test("a hook egy másik sessionre szóló jelzőt figyelmen kívül hagy (a session futásáról ítél)", () => {
    const proj = ujProjekt({ keretek: { ...KERET, keret: { koltseg_egyseg: 100, koltseg_usd: null } } });
    const tp = join(proj, "S.jsonl");
    writeFileSync(tp, NYITO);
    writeFileSync(
      join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl"),
      JSON.stringify({ futas: "S", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 500 }) + "\n",
    );
    jelzoIr(proj, { futas: "lanc", kezdet: new Date(Date.now() - 60_000).toISOString(), session: "MASIK" });
    const r = futtat("futas-mero.mjs", "kapu", { session_id: "S", transcript_path: tp, tool_name: "Agent", tool_input: { prompt: "p", subagent_type: "spec-implementer" } }, proj);
    // A session futásáról ítél (a keret túllépett) — session-futásnál figyelmeztetés.
    assert.match(JSON.parse(r.stdout).systemMessage ?? "", /session futásáról/);
  });
});

describe("M2-4: a folytatás-sor ideje", () => {
  test("a folytatás `ts`-e a szakasz utolsó körének időbélyege, nem az indításé", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1", "2026-11-01T08:00:00Z"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", p.kor("m1", "2026-11-01T08:00:05Z"));
    p.hook(p.sm("h1"));
    p.korok("h1", p.kor("m1", "2026-11-01T08:00:05Z"), p.kor("m2", "2026-11-06T17:00:00Z"), p.kor("m3", "2026-11-06T18:00:00Z"));
    p.hook(p.agent("toolu_Z", "spec-researcher"));
    const sorok = futasok(p.proj).filter((s) => s.tool_use_id === "toolu_H");
    assert.deepEqual(sorok.map((s) => [s.folytatas, s.ts]), [
      [false, "2026-11-01T08:00:00Z"],
      [true, "2026-11-06T18:00:00.000Z"],
    ]);
  });
});

describe("M2-5 / M2-10: a mérési hiány és a súlyos hiba látható, ítélet nélkül", () => {
  test("mérhetetlen delegálás → `systemMessage`, permissionDecision nélkül", () => {
    const p = hatterProjekt();
    writeFileSync(
      p.tp,
      NYITO +
        JSON.stringify({
          type: "user",
          message: { content: [{ type: "tool_result", tool_use_id: "toolu_F" }] },
          toolUseResult: { agentId: "nincs-ilyen", agentType: "spec-implementer", status: "completed", content: [] },
        }) +
        "\n",
    );
    const r = p.hook(p.agent("toolu_2", "spec-researcher"));
    assert.equal(r.exit, 0);
    const ki = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(ki), ["systemMessage"]);
    assert.match(ki.systemMessage, /1 delegálás nem volt mérhető.*agent-nincs-ilyen\.jsonl/);
  });

  test("M2-10: egyetlen értelmezhető sor nélküli átirat → súlyos: a túllépett keret sem tilt", () => {
    const proj = ujProjekt({ keretek: { ...KERET, keret: { koltseg_egyseg: 10, koltseg_usd: null } } });
    writeFileSync(
      join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl"),
      JSON.stringify({ futas: "S", agent: "x", allapot: "egyeztetve", koltseg_egyseg: 100 }) + "\n",
    );
    for (const tartalom of ["{nem json\n\u0000\u0001szemét\n", ""]) {
      const tp = join(proj, "S.jsonl");
      writeFileSync(tp, tartalom);
      const r = futtat("futas-mero.mjs", "kapu", { session_id: "S", transcript_path: tp, tool_name: "Agent", tool_input: { prompt: "p", subagent_type: "spec-implementer" } }, proj);
      assert.equal(r.exit, 0);
      const ki = JSON.parse(r.stdout);
      assert.deepEqual(Object.keys(ki), ["systemMessage"]);
      assert.match(ki.systemMessage, /egyetlen sor sem értelmezhető.*nem ítélkezik/);
    }
  });
});

describe("M2-6: hiányzó meta és hiányzó `finished`", () => {
  test("az első észlelés nem hiba; azonnali második sem; a türelmi idő után `hiba` + `elso_eszlelve`", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.hook(p.agent("toolu_1", "spec-researcher"));
    assert.equal(futasok(p.proj).length, 0);
    const jf = join(p.proj, ".scratch", "futas-merleg", "meta-hiany.jsonl");
    assert.equal(jsonlOlvas(jf).length, 1);
    p.hook(p.agent("toolu_2", "spec-researcher"));
    assert.equal(futasok(p.proj).length, 0, "a türelmi időn belüli második észlelés még nem hiba");
    // Az első észlelés két perce volt.
    const regi = new Date(Date.now() - 2 * 60_000).toISOString();
    writeFileSync(jf, JSON.stringify({ session: "S", tool_use_id: "toolu_H", ts: regi }) + "\n");
    const r = p.hook(p.agent("toolu_3", "spec-researcher"));
    const [sor] = futasok(p.proj);
    assert.equal(sor.allapot, "hiba");
    assert.match(sor.ok, /nincs meta/);
    assert.equal(sor.elso_eszlelve, regi);
    assert.match(JSON.parse(r.stdout).systemMessage, /nincs meta/);
    // Utána nem ír újabb sort.
    p.hook(p.agent("toolu_4", "spec-researcher"));
    assert.equal(futasok(p.proj).length, 1);
  });

  test("a meta később megjelenik → rendes sor, hiba nélkül (sim2 esete)", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.hook(p.agent("toolu_1", "spec-researcher"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", p.kor("m1"));
    p.hook(p.agent("toolu_2", "spec-researcher"));
    assert.deepEqual(futasok(p.proj).map((s) => s.allapot), ["egyeztetve"]);
  });

  test("a meta-ban nincs `finished` mező → `hiba` sor, nem néma kihagyás", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-implementer" });
    p.korok("h1", p.kor("m1"));
    p.hook(p.agent("toolu_1", "spec-researcher"));
    const [sor] = futasok(p.proj);
    assert.equal(sor?.allapot, "hiba");
    assert.match(sor.ok, /nincs `finished` mező/);
  });
});

describe("M2-8 / 15 / SB2-2: futas-merleg.mjs", () => {
  const SZ = ".claude/skills/futas-merleg/scripts/futas-merleg.mjs";

  test("--utolso a közös `utolsoFutas()` szabályát követi (azonos/hiányzó ts → a későbbi sor)", () => {
    const proj = ujProjekt();
    const nf = join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl");
    writeFileSync(
      nf,
      [
        { futas: "A", tool_use_id: "t1", agent: "x", allapot: "egyeztetve", ts: "2026-11-05T10:00:00Z", koltseg_egyseg: 1 },
        { futas: "B", tool_use_id: "t2", agent: "x", allapot: "egyeztetve", koltseg_egyseg: 1 },
      ].map((s) => JSON.stringify(s)).join("\n") + "\n",
    );
    const r = szkript(SZ, ["--utolso"], proj);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /Legutóbbi futás: B /);
    assert.equal(kozos.utolsoFutas(jsonlOlvas(nf)), "B");
  });

  test("--help: az `--atirat` csak a fejlesztő kifejezett jóváhagyásával", () => {
    const r = szkript(SZ, ["--help"], ujProjekt());
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /--atirat/);
    assert.match(r.stdout, /KIFEJEZETT JÓVÁHAGYÁSÁVAL/);
  });

  test("SB2-2: a USD forrása a futás saját dátuma; vegyes dátum; részleges → `≥`", () => {
    const sor = (d, extra = {}) => ({ futas: "F", agent: "x", allapot: "egyeztetve", koltseg_egyseg: 1, koltseg_usd: 1, arak_ervenyes: d, ...extra });
    assert.equal(kozos.usdSzoveg(kozos.osszesites([sor("2026-10-25")])[0]), "≈ 1.00 USD (arak.json, 2026-10-25)");
    assert.equal(
      kozos.usdSzoveg(kozos.osszesites([sor("2026-10-25"), sor("2026-08-01")])[0]),
      "≈ 2.00 USD (arak.json, vegyes: 2026-08-01, 2026-10-25)",
    );
    assert.equal(
      kozos.usdSzoveg(kozos.osszesites([sor("2026-10-25", { koltseg_usd_reszleges: true, araznatlan_modellek: ["claude-y"] })])[0]),
      "≥ 1.00 USD (részleges, áratlan: claude-y) · arak.json, 2026-10-25",
    );
    assert.equal(kozos.usdSzoveg(kozos.osszesites([sor(null, { koltseg_usd: null })])[0]), null);
    // A riport a futás SAJÁT dátumát írja, nem a mai arak.json-ét.
    const proj = ujProjekt({ arak: { ervenyes: "2027-01-01", modellek: {} } });
    writeFileSync(join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl"), JSON.stringify(sor("2026-10-25")) + "\n");
    const r = szkript(SZ, ["--futas", "F"], proj);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /≈ 1\.00 USD \(arak\.json, 2026-10-25\)/);
    assert.doesNotMatch(r.stdout, /2027-01-01/);
  });
});

describe("M2-7 / SB2-3 / SB2-4: kontextus-mero és merleg.mjs", () => {
  const ML = ".claude/skills/cost-reducer/scripts/merleg.mjs";

  test("M2-7: a mérési sor `futas`-t (a jelzőből) és `tool_use_id`-t visz; a SendMessage-sor is", () => {
    const proj = ujProjekt();
    jelzoIr(proj, { futas: "kupon-20261106-1000", kezdet: new Date(Date.now() - 60_000).toISOString() });
    futtat("kontextus-mero.mjs", "delegalas", { ...agentBe(PROMPT), tool_use_id: "toolu_K" }, proj);
    futtat("kontextus-mero.mjs", "delegalas", { session_id: "S", tool_name: "SendMessage", tool_use_id: "toolu_M", tool_input: { to: "h1", message: "tovább" } }, proj);
    assert.deepEqual(meresek(proj).map((m) => [m.futas, m.tool_use_id]), [
      ["kupon-20261106-1000", "toolu_K"],
      ["kupon-20261106-1000", "toolu_M"],
    ]);
    // Jelző nélkül a session a futás.
    const p2 = ujProjekt();
    futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), p2);
    assert.equal(meresek(p2)[0].futas, "S");
  });

  test("M2-7: merleg.mjs --futas szűr; ismeretlen név → exit 2", () => {
    const proj = ujProjekt();
    futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj, { FUTAS_AZONOSITO: "lanc-1" });
    futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj, { FUTAS_AZONOSITO: "lanc-2" });
    futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj, { FUTAS_AZONOSITO: "lanc-2" });
    const r = szkript(ML, ["--futas", "lanc-2"], proj);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /Delegálás-mérleg — 2 delegálás \(szűrve: futás: lanc-2\)/);
    const rossz = szkript(ML, ["--futas", "nincs-ilyen"], proj);
    assert.equal(rossz.exit, 2);
    assert.match(rossz.stderr, /lanc-1, lanc-2/);
    assert.equal(szkript(ML, ["--futas"], proj).exit, 2);
  });

  test("SB2-3: aktív / érvénytelen jóváhagyás / visszavont — ugyanaz a `jovahagyott()`, mint a hookban", async () => {
    const r1 = { id: "jo", jovahagyva: "2026-01-01", indok: "x", amikor: { blokkok: [h(A)] }, muveletek: [{ tipus: "elore", blokk: h(B) }] };
    const proj = ujProjekt({
      receptek: {
        receptek: [r1, { ...r1, id: "igen", jovahagyva: "igen" }, { ...r1, id: "jovo", jovahagyva: "2099-01-01" }, { ...r1, id: "vissza", jovahagyva: undefined }],
      },
    });
    futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj);
    const r = szkript(ML, [], proj);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /Receptek — 1 aktív, 2 érvénytelen jóváhagyás, 1 visszavont/);
    assert.match(r.stdout, /igen {2}— ÉRVÉNYTELEN JÓVÁHAGYÁS/);
    // Egy forrás, nem másolat: a merleg a hook exportját használja (modulként betöltve
    // a hook-ág nem fut).
    globalThis.KONTEXTUS_MERO_MODULKENT = true;
    const km = await import(pathToFileURL(join(HOOKS, "kontextus-mero.mjs")).href);
    assert.equal(km.jovahagyott("2026-02-31"), false);
    assert.equal(km.jovahagyott("2026-01-01"), true);
    assert.match(km.receptHiba({ ...r1, indok: "" }), /indok/);
  });

  test("SB2-4: `indok` nélküli recept → nincs átírás, `hiba` sor", () => {
    const tar = recept([{ tipus: "csere", blokk: h(B), helyette: "Lásd: .scratch/kutato.md" }]);
    delete tar.receptek[0].indok;
    const proj = ujProjekt({ receptek: tar });
    const r = futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj);
    assert.equal(r.exit, 0);
    assert.equal(r.stdout, "");
    const sor = meresek(proj).at(-1);
    assert.equal(sor.allapot, "hiba");
    assert.match(sor.ok, /indok/);
    // Csupa szóköz indok sem elég.
    const tar2 = recept([{ tipus: "csere", blokk: h(B), helyette: "rövid szöveg ide" }], { indok: "   " });
    const p2 = ujProjekt({ receptek: tar2 });
    assert.equal(futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), p2).stdout, "");
    assert.equal(meresek(p2).at(-1).allapot, "hiba");
  });
});

// --- 3. audit, P1 — mérők (4., 8., 24–27. sor) ----------------------------------------------

/** Egy subagent-kör sora tetszőleges `usage`-dzsel és opcionális `SubagentHandback` jelentéssel. */
function korSorIr(id, { ts = "2026-11-07T10:00:01Z", be = 5, ki = 5, jelentes = null } = {}) {
  const content = jelentes === null ? [] : [{ type: "tool_use", name: "SubagentHandback", input: { message: jelentes } }];
  return (
    JSON.stringify({
      type: "assistant",
      timestamp: ts,
      message: { id, model: "claude-x", usage: { input_tokens: be, output_tokens: ki, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content },
    }) + "\n"
  );
}

/** Egy előtérbeli delegálás eredménysora a fő átiratban. */
const elotterSor = (tuid, aid, tipus, jelentes = "kész") =>
  JSON.stringify({
    type: "user",
    timestamp: "2026-11-07T10:00:02Z",
    message: { content: [{ type: "tool_result", tool_use_id: tuid }] },
    toolUseResult: { agentId: aid, agentType: tipus, status: "completed", content: [{ type: "text", text: jelentes }] },
  }) + "\n";

function specIr(proj, feature, szoveg) {
  const dir = join(proj, "spec", feature);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "requirements.md"), szoveg);
}

const KUPON_SPEC = [
  "# Kupon",
  "",
  "## Kész-kritériumok",
  "",
  "- [ ] **KU-01** — A kupon beváltható.",
  "- **KU-02** — A lejárt kupon elutasítva (checkbox nélkül is definíció).",
  "",
  "Hivatkozás, nem definíció: lásd KU-09 és UTF-8.",
].join("\n");

describe("3. audit 4. sor: csak a spec-ben definiált kritérium-azonosító számít", () => {
  const SPEC = new Set(["AR-03", "AR-04", "AR-17", "AR-18"]);

  test("[jelölő] ID sorrend: a jelölő utáni ELSŐ definiált azonosító, nem az első azonosítószerű token", () => {
    const szoveg = "1. [teljesül] AR-17 — a hibaüzenet (vö. UTF-8)\n2. [nem teljesül] UTF-8 BOM miatt AR-18 bukik";
    const k = kozos.konvergencia(szoveg, SPEC);
    assert.deepEqual(k.teljesult_idk, ["AR-17"]);
    assert.deepEqual(k.bukott_idk, ["AR-18"]);
    assert.equal(k.azonosito_forras, "spec");
    // Spec nélkül a mai minta-szabály: a jelölő utáni első token, itt `UTF-8`.
    const minta = kozos.konvergencia(szoveg);
    assert.deepEqual(minta.bukott_idk, ["UTF-8"]);
    assert.equal(minta.azonosito_forras, "minta");
  });

  test("ID [jelölő] sorrend: a jelölő ELŐTTI első definiált azonosító; a nem definiált hivatkozás kimarad", () => {
    const szoveg = "K-58 hivatkozás: AR-03 [nem teljesül] — lásd AR-04\nAR-04 [teljesül] K-58 rendben";
    const k = kozos.konvergencia(szoveg, SPEC);
    assert.deepEqual(k.bukott_idk, ["AR-03"]);
    assert.deepEqual(k.teljesult_idk, ["AR-04"]);
    // Minta-szabállyal a `K-58` lett volna az első sor kritériuma.
    assert.deepEqual(kozos.konvergencia(szoveg).bukott_idk, ["K-58"]);
  });

  test("spec-módban a számjegyes prefix (`E2E-01`) is felismerhető; definiált azonosító híján nincs kritérium", () => {
    const k = kozos.konvergencia("1. [nem teljesül] E2E-01 — a böngészős eset\n2. [teljesül] UTF-8 rendben", new Set(["E2E-01"]));
    assert.deepEqual(k.bukott_idk, ["E2E-01"]);
    assert.deepEqual(k.teljesult_idk, []);
    // Üres halmaz = nincs használható spec → minta-szabály.
    assert.equal(kozos.konvergencia("AR-1 [teljesül]", new Set()).azonosito_forras, "minta");
  });

  test("specAzonositok: a futás-azonosító `-ÉÉÉÉHHNN-ÓÓPP` utótagja levágva adja a feature-t; csak a definíciók számítanak", () => {
    const proj = ujProjekt();
    specIr(proj, "kupon", KUPON_SPEC);
    specIr(proj, "regi", "# Történeti spec\n\n- [x] kipipálva, azonosító nélkül\n");
    const ids = (f) => [...(kozos.specAzonositok(f, { repo: proj })?.azonositok ?? [])].sort();
    assert.deepEqual(ids("kupon-20261107-1030"), ["KU-01", "KU-02"]);
    assert.deepEqual(ids("kupon"), ["KU-01", "KU-02"]);
    assert.equal(kozos.specAzonositok("kupon-20261107-1030", { repo: proj }).feature, "kupon");
    // Session-azonosító, ismeretlen feature, definíció nélküli spec, útvonal-bejárás → null.
    for (const f of ["2b7c1e0a-1111-4222-8333-944455556666", "nincs-ilyen-20261107-1030", "regi", "../kupon", "..", null]) {
      assert.equal(kozos.specAzonositok(f, { repo: proj }), null, String(f));
    }
    assert.deepEqual(kozos.futasFeature("kupon-20261107-1030"), ["kupon", "kupon-20261107-1030"]);
  });

  test("a hook a lánc jelzőjének futásából oldja fel a specet: a validátorsor `spec` forrású azonosítókat kap", () => {
    const p = hatterProjekt();
    specIr(p.proj, "kupon", KUPON_SPEC);
    p.jelzo("kupon-20261107-1030");
    p.hook(p.agent("toolu_V", "spec-validator"));
    writeFileSync(p.tp, NYITO + p.hatter("toolu_V", "v1"));
    p.meta("v1", { agentType: "spec-validator", finished: true });
    p.korok("v1", korSorIr("m1", { jelentes: "1. [teljesül] UTF-8 kódolás rendben, KU-01\n2. [nem teljesül] KU-09 miatt KU-02" }));
    p.hook(p.agent("toolu_Z", "spec-researcher"));
    const [sor] = futasok(p.proj).filter((s) => s.tool_use_id === "toolu_V");
    assert.equal(sor.futas, "kupon-20261107-1030");
    assert.equal(sor.konvergencia.azonosito_forras, "spec");
    assert.deepEqual(sor.konvergencia.teljesult_idk, ["KU-01"]);
    assert.deepEqual(sor.konvergencia.bukott_idk, ["KU-02"]);
  });
});

describe("3. audit 8. sor: a jelző `frissitve` mezője és a lejárt jelző jelzése", () => {
  const allapot = (tartalom) => kozos.jelzoAllapot({ file: jelzoIr(ujProjekt(), tartalom), most: MOST, session: "S" });
  const regi = new Date(MOST - 7 * ORA).toISOString();

  test("érvényes `frissitve` → a kor abból számol: a 7 órás `kezdet` mellett is friss", () => {
    const a = allapot({ futas: "kupon", kezdet: regi, frissitve: new Date(MOST - ORA).toISOString() });
    assert.equal(a.futas, "kupon");
    assert.equal(a.ok, null);
    assert.equal(a.kor_ms, ORA);
  });

  for (const [nev, frissitve] of [
    ["jövőbeli", new Date(MOST + ORA).toISOString()],
    ["időzóna nélküli", "2026-11-06T11:00:00"],
    ["nem szöveg", 12345],
    ["a `kezdet`-nél korábbi", new Date(MOST - 8 * ORA).toISOString()],
  ]) {
    test(`${nev} \`frissitve\` → a \`kezdet\` számít (itt: lejárt)`, () => {
      const a = allapot({ futas: "kupon", kezdet: regi, frissitve });
      assert.equal(a.futas, null);
      assert.equal(a.ok, "lejart");
      assert.equal(a.lejart_futas, "kupon");
    });
  }

  test("a `kezdet` továbbra is kötelező: érvényes `frissitve` sem menti a hibás `kezdet`-et", () => {
    assert.equal(allapot({ futas: "kupon", frissitve: new Date(MOST - ORA).toISOString() }).ok, "hibas");
    assert.equal(allapot({ futas: "kupon", kezdet: new Date(MOST + ORA).toISOString() }).ok, "jovobeli");
    assert.equal(kozos.jelzoAllapot({ file: join(GYOKER, "nincs.json"), most: MOST }).ok, "nincs");
  });

  test("hook: lejárt, de ép jelző → `systemMessage` a lejáratról, permissionDecision nélkül", () => {
    const proj = ujProjekt({ keretek: KERET });
    const tp = join(proj, "S.jsonl");
    writeFileSync(tp, NYITO);
    jelzoIr(proj, { futas: "kupon-20261107-0300", kezdet: new Date(Date.now() - 7 * ORA).toISOString() });
    const r = futtat("futas-mero.mjs", "kapu", { session_id: "S", transcript_path: tp, tool_name: "Agent", tool_input: { prompt: "p", subagent_type: "spec-researcher" } }, proj);
    assert.equal(r.exit, 0);
    const ki = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(ki), ["systemMessage"]);
    assert.match(ki.systemMessage, /LEJÁRT/);
    assert.match(ki.systemMessage, /kupon-20261107-0300/);
    assert.match(ki.systemMessage, /frissitve/);
  });

  test("hook: a `frissitve` friss → a lánc saját túllépett kerete deny, lejárati jelzés nélkül", () => {
    const proj = ujProjekt({ keretek: { ...KERET, keret: { koltseg_egyseg: 100, koltseg_usd: null } } });
    const tp = join(proj, "S.jsonl");
    writeFileSync(tp, NYITO);
    writeFileSync(
      join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl"),
      JSON.stringify({ futas: "lanc", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 500 }) + "\n",
    );
    jelzoIr(proj, { futas: "lanc", kezdet: new Date(Date.now() - 9 * ORA).toISOString(), frissitve: new Date(Date.now() - 60_000).toISOString() });
    const r = futtat("futas-mero.mjs", "kapu", { session_id: "S", transcript_path: tp, tool_name: "Agent", tool_input: { prompt: "p", subagent_type: "spec-implementer" } }, proj);
    const ki = JSON.parse(r.stdout);
    assert.equal(ki.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(ki.systemMessage, undefined);
  });
});

describe("3. audit 24. sor: a csupa `[kétséges]` kör mérési hiány, nem tiszta 0", () => {
  test("mertKor: csak `[kétséges]` → nem mért kör; legalább egy ítélet → mért", () => {
    assert.equal(kozos.mertKor(kozos.konvergencia("AR-1 [kétséges]\nAR-2 [kétséges]")), false);
    assert.equal(kozos.mertKor(kozos.konvergencia("AR-1 [kétséges]\nAR-2 [teljesül]")), true);
    assert.equal(kozos.mertKor(null), false);
  });

  test("ítélet: a közbülső csupa-`[kétséges]` kör nem ad hamis 0 előző kört — a 2 → ? → 2 konvergencia-megállás", () => {
    const sorok = [
      korSor("AR-1 [nem teljesül]\nAR-2 [nem teljesül]"),
      korSor("AR-1 [kétséges]\nAR-2 [kétséges]"),
      korSor("AR-1 [nem teljesül]\nAR-2 [nem teljesül]"),
    ];
    assert.equal(kozos.itelet({ sorok, keretek: KERET, futas: "F", agent: "spec-implementer" })?.szabaly, "konvergencia");
  });

  test("összesítés: a görbén `null` (`?`), nem 0", () => {
    const sorok = [korSor("AR-1 [nem teljesül]"), korSor("AR-1 [kétséges]")].map((s, i) => ({ ...s, tool_use_id: `t${i}` }));
    assert.deepEqual(kozos.osszesites(sorok)[0].gorbe, [1, null]);
  });

  test("egyeztetés: csupa `[kétséges]` validátor-jelentés → `marker-nelkul` állapot", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_V", "v1"));
    p.meta("v1", { agentType: "spec-validator", finished: true });
    p.korok("v1", korSorIr("m1", { jelentes: "1. [kétséges] AR-1 — nincs futó backend" }));
    p.hook(p.agent("toolu_Z", "spec-researcher"));
    const [sor] = futasok(p.proj).filter((s) => s.tool_use_id === "toolu_V");
    assert.equal(sor.allapot, "marker-nelkul");
    assert.equal(sor.konvergencia.ketseges, 1);
  });
});

describe("3. audit 25. sor: a még futó háttéragent eddigi körei a keretbe számítanak", () => {
  test("futó agent → nincs naplósor, de a lánc kerete tilt; lezárás után egyszer könyvelődik", () => {
    // Egy kör = 5 be + 5×5 ki = 30 egység; a keret 50.
    const p = hatterProjekt({ ...KERET, keret: { koltseg_egyseg: 50, koltseg_usd: null } });
    p.jelzo("lanc");
    p.hook(p.agent("toolu_H"));
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-implementer", finished: false });
    p.korok("h1", korSorIr("m1"), korSorIr("m2"));
    const r = p.hook(p.agent("toolu_2"));
    const ki = JSON.parse(r.stdout);
    assert.equal(ki.hookSpecificOutput.permissionDecision, "deny");
    assert.match(ki.hookSpecificOutput.permissionDecisionReason, /még futó háttér-agent/);
    assert.equal(futasok(p.proj).filter((s) => s.tool_use_id === "toolu_H").length, 0, "futó agent nem kerül a naplóba");
    // A validátort a futó agent sem tiltja.
    assert.equal(p.hook(p.agent("toolu_3", "spec-validator")).stdout, "");
    // Lezárás: a két kör egyszer, egy sorban.
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.hook(p.agent("toolu_4", "spec-validator"));
    p.hook(p.agent("toolu_5", "spec-validator"));
    const sorok = futasok(p.proj).filter((s) => s.tool_use_id === "toolu_H");
    assert.deepEqual(sorok.map((s) => [s.allapot, s.korok, s.agent_id]), [["egyeztetve", 2, "h1"]]);
  });

  test("egyeztet: a futó agent sora a `futok` listában van, `fut` állapottal, konvergencia nélkül", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-validator", finished: false });
    p.korok("h1", korSorIr("m1", { jelentes: "AR-1 [nem teljesül]" }));
    const modul = JSON.stringify(pathToFileURL(join(HOOKS, "futas-kozos.mjs")).href);
    const kod = `const k = await import(${modul}); console.log(JSON.stringify(k.egyeztet({ transcriptPath: ${JSON.stringify(p.tp)}, futas: "F" })));`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", kod], {
      env: { ...TISZTA_ENV(), CLAUDE_PROJECT_DIR: tesztProjekt(p.proj) },
      encoding: "utf8",
    });
    const e = JSON.parse(r.stdout);
    assert.deepEqual(e.ujak, []);
    assert.deepEqual(e.futok.map((s) => [s.allapot, s.korok, s.konvergencia]), [["fut", 1, null]]);
  });
});

describe("3. audit 26. sor: címzett-név, előtér-folytatás, usage, csonkaság-minta", () => {
  test("azonos nevű címzettek: a másik agent kötése nem viszi át a köröket a saját futásába", () => {
    const p = hatterProjekt();
    p.jelzo("lanc-A");
    p.hook(p.agent("toolu_1"));
    p.hook(p.agent("toolu_2"));
    writeFileSync(p.tp, NYITO + p.hatter("toolu_1", "a1") + p.hatter("toolu_2", "a2"));
    p.meta("a1", { agentType: "spec-implementer", finished: true, name: "kutato" });
    p.meta("a2", { agentType: "spec-implementer", finished: true, name: "kutato" });
    p.korok("a1", korSorIr("m1"));
    p.korok("a2", korSorIr("n1"));
    p.hook(p.agent("toolu_X", "spec-researcher")); // mindkettőt egyezteti
    // Az a2 írt utoljára: a név szerinti SendMessage őt oldja fel.
    const regen = new Date(Date.now() - 3600_000);
    utimesSync(join(p.sub, "agent-a1.jsonl"), regen, regen);
    utimesSync(join(p.sub, "agent-a1.meta.json"), regen, regen);
    p.jelzoTorol();
    p.jelzo("lanc-B");
    p.hook(p.sm("kutato"));
    const kotes = jsonlOlvas(join(p.proj, ".scratch", "futas-merleg", "delegalasok.jsonl")).filter((k) => k.cel);
    assert.deepEqual(kotes.map((k) => [k.cel, k.agent_id, k.futas]), [["kutato", "a2", "lanc-B"]]);
    // Az a1-nek is lesz egy új köre; a kötés az a2-é, ezért az a1 köre a saját (lanc-A) futásában marad.
    p.korok("a1", korSorIr("m1"), korSorIr("m2"));
    p.jelzoTorol();
    p.hook(p.agent("toolu_Y", "spec-researcher"));
    const folyt = futasok(p.proj).find((s) => s.tool_use_id === "toolu_1" && s.folytatas);
    assert.equal(folyt?.futas, "lanc-A");
  });

  test("előtérbeli folytatás új `tool_use_id`-val: csak a még könyveletlen körök, nincs túlszámolás", () => {
    const p = hatterProjekt();
    p.korok("f1", korSorIr("m1"), korSorIr("m2"));
    writeFileSync(p.tp, NYITO + elotterSor("toolu_F1", "f1", "spec-implementer"));
    p.hook(p.agent("toolu_A", "spec-researcher"));
    // A folytatás ugyanabba az átiratba ír tovább, és egy második eredménysor érkezik.
    p.korok("f1", korSorIr("m1"), korSorIr("m2"), korSorIr("m3"));
    writeFileSync(p.tp, NYITO + elotterSor("toolu_F1", "f1", "spec-implementer") + elotterSor("toolu_F2", "f1", "spec-implementer"));
    p.hook(p.agent("toolu_B", "spec-researcher"));
    p.hook(p.agent("toolu_C", "spec-researcher"));
    const sorok = futasok(p.proj).filter((s) => s.agent_id === "f1");
    assert.deepEqual(sorok.map((s) => [s.tool_use_id, s.folytatas ?? false, s.kezdo_kor, s.korok]), [
      ["toolu_F1", false, 1, 2],
      ["toolu_F2", true, 3, 1],
    ]);
  });

  test("háttér-agent második eredménysora (új `tool_use_id`, ugyanaz az agentId) sem számol újra", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", korSorIr("m1"));
    p.hook(p.agent("toolu_A", "spec-researcher"));
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1") + p.hatter("toolu_H2", "h1"));
    p.hook(p.agent("toolu_B", "spec-researcher"));
    assert.equal(futasok(p.proj).reduce((a, s) => a + (s.korok ?? 0), 0), 1);
  });

  test("egy üzenet több sora: a `usage` mezőnkénti maximuma számít, nem az első soré", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", korSorIr("m1", { ki: 3 }), korSorIr("m1", { ki: 10 }), korSorIr("m1", { ki: 10 }));
    p.hook(p.agent("toolu_A", "spec-researcher"));
    const [sor] = futasok(p.proj);
    assert.equal(sor.korok, 1);
    assert.equal(sor.token.ki, 10);
    assert.equal(sor.token.be, 5);
  });

  test("csonkaság: a kisbetűs did-not-finish hétköznapi szöveg; a harness nagybetűs jelzése megszakadás", () => {
    const p = hatterProjekt();
    p.korok("v1", korSorIr("m1"));
    p.korok("v2", korSorIr("n1"));
    writeFileSync(
      p.tp,
      NYITO +
        elotterSor("toolu_V1", "v1", "spec-validator", "1. [teljesül] AR-1 — a build did not finish slowly, de rendben") +
        elotterSor("toolu_V2", "v2", "spec-validator", "1. [teljesül] AR-1\n[Agent did NOT finish: limit]"),
    );
    p.hook(p.agent("toolu_A", "spec-researcher"));
    const allapot = Object.fromEntries(futasok(p.proj).map((s) => [s.tool_use_id, [s.allapot, s.konvergencia?.teljesul ?? null]]));
    assert.deepEqual(allapot, { toolu_V1: ["egyeztetve", 1], toolu_V2: ["megszakadt", null] });
  });
});

describe("3. audit 27. sor: tiltott delegálás, sérült receptfájl, elavult hiba-sor", () => {
  const ML = ".claude/skills/cost-reducer/scripts/merleg.mjs";
  const FM = ".claude/skills/futas-merleg/scripts/futas-merleg.mjs";

  test("deny → `tiltva` naplósor; a cost-reducer mérlege a tiltott delegálás mérését kihagyja", () => {
    const proj = ujProjekt({ keretek: { ...KERET, keret: { koltseg_egyseg: 100, koltseg_usd: null } } });
    const tp = join(proj, "S.jsonl");
    writeFileSync(tp, NYITO);
    writeFileSync(
      join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl"),
      JSON.stringify({ futas: "lanc", tool_use_id: "toolu_0", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 500 }) + "\n",
    );
    const lanc = { FUTAS_AZONOSITO: "lanc" };
    const bem = (tuid, tipus) => ({ session_id: "S", transcript_path: tp, tool_name: "Agent", tool_use_id: tuid, tool_input: { prompt: PROMPT, subagent_type: tipus } });
    for (const [tuid, tipus] of [["toolu_T", "spec-implementer"], ["toolu_V", "spec-validator"]]) {
      futtat("kontextus-mero.mjs", "delegalas", bem(tuid, tipus), proj, lanc);
      futtat("futas-mero.mjs", "kapu", bem(tuid, tipus), proj, lanc);
    }
    const tiltva = futasok(proj).filter((s) => s.allapot === "tiltva");
    assert.deepEqual(tiltva.map((s) => [s.tool_use_id, s.futas, s.agent, s.szabaly]), [["toolu_T", "lanc", "spec-implementer", "keret"]]);
    assert.equal(meresek(proj).length, 2);
    const r = szkript(ML, [], proj);
    assert.equal(r.exit, 0);
    assert.match(r.stdout, /Delegálás-mérleg — 1 delegálás/);
    assert.match(r.stdout, /1 mérés kihagyva/);
    // A futásmérleg sem számolja delegálásnak, és nem is fogyasztás.
    const [f] = kozos.osszesites(futasok(proj));
    assert.equal(f.db, 1);
    assert.equal(f.tiltva, 1);
    assert.equal(f.egyseg, 500);
    const riport = szkript(FM, ["--futas", "lanc"], proj);
    assert.match(riport.stdout, /\+1 tiltott, le sem futott/);
    assert.match(riport.stdout, /TILTVA · spec-implementer/);
  });

  test("sérült `receptek.json` → a mérleg nem dől el, kimondja a sérülést (exit 0)", () => {
    for (const tartalom of ["{nem json", "[1, 2]"]) {
      const proj = ujProjekt();
      futtat("kontextus-mero.mjs", "delegalas", agentBe(PROMPT), proj);
      writeFileSync(join(proj, "docs", "orchestration", "_kontextus", "receptek.json"), tartalom);
      const r = szkript(ML, [], proj);
      assert.equal(r.exit, 0, r.stderr);
      assert.match(r.stdout, /receptek\.json` SÉRÜLT/);
    }
  });

  test("az elavult `hiba` sor kiesik, ha ugyanarra a `tool_use_id`-ra később mért sor jön", () => {
    const hiba = { futas: "F", tool_use_id: "t1", agent: null, allapot: "hiba", ok: "nincs meta: agent-h1.meta.json" };
    const mert = { futas: "F", tool_use_id: "t1", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 3 };
    const tartos = { futas: "F", tool_use_id: "t2", agent: "x", allapot: "hiba", ok: "nincs subagent-átirat" };
    assert.deepEqual(kozos.egyediSorok([hiba, mert, tartos]), [mert, tartos]);
    const [f] = kozos.osszesites([hiba, mert, tartos]);
    assert.equal(f.hibak, 1);
    assert.equal(f.db, 1);
  });

  test("hook-szinten: a türelmi idő utáni `nincs meta` hiba a meta megjelenése után a riportból eltűnik", () => {
    const p = hatterProjekt();
    writeFileSync(p.tp, NYITO + p.hatter("toolu_H", "h1"));
    const jf = join(p.proj, ".scratch", "futas-merleg", "meta-hiany.jsonl");
    mkdirSync(dirname(jf), { recursive: true });
    writeFileSync(jf, JSON.stringify({ session: "S", tool_use_id: "toolu_H", ts: new Date(Date.now() - 2 * 60_000).toISOString() }) + "\n");
    p.hook(p.agent("toolu_1", "spec-researcher"));
    assert.equal(futasok(p.proj)[0]?.allapot, "hiba");
    p.meta("h1", { agentType: "spec-implementer", finished: true });
    p.korok("h1", korSorIr("m1"));
    p.hook(p.agent("toolu_2", "spec-researcher"));
    const r = szkript(FM, ["--futas", "S"], p.proj);
    assert.equal(r.exit, 0);
    assert.doesNotMatch(r.stdout, /mérhetetlen|MÉRHETETLEN/);
  });

  test("riport: session-futás túllépett kerete figyelmeztetés, nem TILTVA", () => {
    const proj = ujProjekt({ keretek: { ...KERET, keret: { koltseg_egyseg: 100, koltseg_usd: null } } });
    writeFileSync(
      join(proj, "docs", "orchestration", "_kontextus", "futasok.jsonl"),
      [
        { futas: "S", session: "S", tool_use_id: "t1", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 500 },
        { futas: "lanc", session: "S", tool_use_id: "t2", agent: "spec-implementer", allapot: "egyeztetve", koltseg_egyseg: 500 },
      ].map((s) => JSON.stringify(s)).join("\n") + "\n",
    );
    const r = szkript(FM, [], proj);
    assert.match(r.stdout, /⚠ "S" \(session-futás, nincs lánc\)/);
    assert.match(r.stdout, /⛔ "lanc" — a következő `spec-implementer` delegálás TILTVA/);
  });
});
