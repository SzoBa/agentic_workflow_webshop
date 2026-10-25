#!/usr/bin/env node
// PreToolUse guard a spec-* agentekhez.
//
// A három agent legfontosabb szabályai ("a spec/ mappát nem módosítjuk",
// "ne kommitolj", "nincs új függőség", "a validátor csak olvas") korábban csak a
// prompt szövegében éltek. Egy Bash-t kapó agent viszont átirányítással bármit
// felül tud írni — a próza ott nem véd. Ez a hook ugyanezekre a szabályokra ad
// gépi fogást.
//
// MIT NYÚJT, ÉS MIT NEM. Ez a hook a szabályok nyilvánvaló megsértését fogja el —
// azt az esetet, ami a gyakorlatban előfordul: az agent véletlenül kommitolna vagy
// telepítene. NEM sandbox, és nem is az akar lenni. A parancssor tiltólistás
// vizsgálata elvi okból hiányos: egy tiltólista véges felsorolás egy végtelen
// halmazról. Aki kifejezetten meg akarja kerülni, meg tudja (más nevű wrapper,
// saját szkript, in-process fájlírás egy engedélyezett értelmezőből).
//
// Ezért aszimmetrikus a két üzemmód, és ez SZÁNDÉKOS: a validátor `READONLY_ALLOW`
// engedélylistával dolgozik, és ami nincs rajta, az `ask`. Az engedélyezettek
// felsorolása véges, a tiltottaké soha nem az — a readonly mód emiatt érdemben
// szigorúbb, mint az impl mód. Ha az impl mód git- és függőség-tilalmának is
// tartania kell, oda is engedélylista kell (és `defer` helyett `ask` az illeszkedés
// nélküli esetre) — az viszont külön döntés, mert érdemi súrlódást visz a munkába.
//
// Használat a subagent frontmatterjében:
//   hooks:
//     PreToolUse:
//       - matcher: "Edit|Write|NotebookEdit"
//         hooks:
//           - type: command
//             command: node
//             args: ["${CLAUDE_PROJECT_DIR}/.claude/hooks/spec-guard.mjs", "impl-write"]
//
// Módok:
//   impl-write      — az implementáló írásai: spec/ és a Flyway-migrációk tiltva
//   impl-bash       — az implementáló parancsai: git-mutáció és függőségtelepítés tiltva
//   readonly-bash   — a validátor parancsai: csak olvasó parancsok mehetnek át
//   e2e-write       — az e2e-teszt-író írásai: CSAK az e2e/ (és a .scratch/) írható
//   unit-test-write — a Java unit-teszt-író írásai: CSAK a szerver teszt-forrásfája
//                     (és a .scratch/) írható; a produkciós kód és a pom.xml tiltva
//   docs-write      — a dokumentáció-író írásai: CSAK a gyökér README.md és a gyökér
//                     OpenAPI-leíró (és a .scratch/); a leírt rendszer forrása tiltva
//
// Kimenet: exit 0 + JSON a stdout-ra, permissionDecision = deny | ask | defer.
// A "defer" a normál engedélyezési folyamatra bízza a döntést — a hook sosem ad
// "allow"-t, hogy a felhasználó beállításait ne írja felül.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const MODE = process.argv[2] ?? "";

/** Egységes hook-válasz. A hiba is "defer", hogy egy hibás guard ne bénítsa le az agentet. */
function decide(permissionDecision, permissionDecisionReason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        ...(permissionDecisionReason ? { permissionDecisionReason } : {}),
      },
    }),
  );
  process.exit(0);
}

function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// --- Útvonal-ellenőrzés -----------------------------------------------------

/** Windows/POSIX elválasztók egységesítése, hogy egy mintával vizsgálhassunk. */
function toPosix(p) {
  return String(p ?? "").replace(/\\/g, "/");
}

/** Ha `p` a `root` alatt van, a hozzá képesti útvonal; egyébként `null`. */
function under(p, root) {
  const rootLower = toPosix(root).toLowerCase().replace(/\/+$/, "");
  if (!rootLower) return null;
  return p.toLowerCase().startsWith(rootLower + "/") ? p.slice(rootLower.length + 1) : null;
}

/**
 * A fájlt tartalmazó git-munkafa gyökere: az első könyvtár fölfelé, amelyben van
 * `.git`. Worktree-ben a `.git` FÁJL (`gitdir:` mutató), nem könyvtár — ezért
 * `existsSync`, nem `statSync().isDirectory()`.
 */
function gitRootOf(filePath) {
  let dir = dirname(filePath);
  for (let i = 0; i < 40; i += 1) {
    if (existsSync(dir + "/.git")) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * A bemeneti útvonal kanonikus, abszolút alakja.
 *
 * ELŐBB kanonizálunk, CSAK AZUTÁN döntünk — enélkül az engedélylista nem
 * engedélylista, hanem szövegelőtag-vizsgálat, amivel a fájlrendszer nem ért
 * egyet. A `server-java/src/test/../main/java/…/AccountService.java` illeszkedik
 * a `^server-java\/src\/test\//` mintára, miközben a tényleges célpont produkciós
 * kód — pontosan az, amit ez a hook megakadályozni hivatott. A `resolve` a `..` és
 * `.` szakaszokat összevonja, és a relatív bemenetet a projektgyökérhez köti, így
 * a minták a VALÓDI célponton futnak.
 *
 * (Szimbolikus linket nem old fel: a nem létező fájl `realpath`-ja hibára fut,
 * márpedig egy írás célpontja tipikusan még nem létezik.)
 */
function canonical(filePath) {
  const base = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return toPosix(resolve(base, toPosix(filePath)));
}

/**
 * A munkafa gyökeréhez képesti útvonal — abszolút bemenetnél is.
 *
 * A `CLAUDE_PROJECT_DIR` az elsődleges gyökér, de nem elég: a lánc párhuzamos
 * ága KÜLÖN GIT-WORKTREE-ben fut (`feature-implement` skill, „Párhuzamos
 * delegálás"). Ha a harness nem a worktree-re állítja a projektgyökeret, az
 * abszolút útvonal a régi ágon relativizálatlanul maradna — és mivel az
 * `E2E_WRITE_ROOTS` mintái `^`-hoz kötöttek, az e2e-teszt-író MINDEN írása
 * megtagadásra kerülne, a saját `e2e/` mappájáé is. Ezért ha a fájl nem esik a
 * projektgyökér alá, a saját munkafája gyökeréhez viszonyítunk.
 */
function relativeToProject(filePath) {
  const p = canonical(filePath);

  const fromProject = under(p, process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  if (fromProject !== null) return fromProject;

  const gitRoot = gitRootOf(p);
  if (gitRoot) {
    const fromGit = under(p, gitRoot);
    if (fromGit !== null) return fromGit;
  }

  // Sem a projektgyökér, sem egy munkafa alá nem esik: marad a kanonikus abszolút
  // alak. Az `^`-hoz kötött engedélylistákra ez nem illeszkedik — ami helyes: ami
  // a munkaterületen kívül van, arra nincs engedély.
  return p;
}

// A spec/ a norma, nem munkaterület: az implementáló nem pipálhat ki tasks.md
// checkboxot és nem igazíthatja a specet a kódhoz.
//
// A MÁR KIADOTT Flyway-migrációt sem szabad átírni: a Flyway checksumot tárol
// róla, tehát egy meglévő fájl módosítása minden olyan adatbázison hibára fut,
// amelyiken már lefutott. Sémaváltozáshoz ÚJ migrációs fájl kell.
const PROTECTED_PATHS = [
  {
    re: /(^|\/)spec\//i,
    why: "a `spec/` mappa a norma — az agentek nem módosítják (a `tasks.md` checkboxait sem). Ha a spec hibás vagy ellentmondásos, azt jelentsd, ne írd át.",
  },
  {
    re: /(^|\/)db\/migration\/V\d/i,
    why: "a már kiadott Flyway-migrációt nem írjuk át — a Flyway checksumot tárol róla, így a módosítás minden meglévő adatbázison hibára fut. Sémaváltozáshoz hozz létre ÚJ migrációs fájlt.",
  },
];

function guardWrite(input) {
  const filePath =
    input?.tool_input?.file_path ??
    input?.tool_input?.notebook_path ??
    input?.tool_input?.path;
  if (!filePath) return decide("defer");

  const rel = relativeToProject(filePath);
  for (const { re, why } of PROTECTED_PATHS) {
    if (re.test(rel)) {
      return decide("deny", `Írás megtagadva: \`${rel}\` — ${why}`);
    }
  }
  return decide("defer");
}

// Az e2e-teszt-írónak EGYETLEN munkaterülete van: az `e2e/` mappa (plusz a
// gitignore-olt `.scratch/` a jegyzeteinek). A kliens és a szerver forrása nem az
// övé — ha egy elem szerep vagy címke alapján elérhetetlen, az akadálymentességi
// hiány a komponensben, amit JELENTENI kell, nem `data-testid`-vel megkerülni
// (e2e/README.md, „Kiválasztás szerep és címke szerint").
//
// Itt engedélylista van, nem tiltólista: a mért rendszer minden forrásfájlja
// tiltott, és pontosan két mappa a kivétel. Ugyanaz az aszimmetria, mint a
// readonly módnál — a kivételek felsorolása véges, a tiltandóké nem.
const E2E_WRITE_ROOTS = [/^e2e\//i, /^\.scratch\//i];

function guardE2eWrite(input) {
  const filePath =
    input?.tool_input?.file_path ??
    input?.tool_input?.notebook_path ??
    input?.tool_input?.path;
  if (!filePath) return decide("defer");

  const rel = relativeToProject(filePath);
  for (const { re, why } of PROTECTED_PATHS) {
    if (re.test(rel)) {
      return decide("deny", `Írás megtagadva: \`${rel}\` — ${why}`);
    }
  }
  if (!E2E_WRITE_ROOTS.some((re) => re.test(rel))) {
    return decide(
      "deny",
      `Írás megtagadva: \`${rel}\` — ez az agent kizárólag az \`e2e/\` mappát írja. ` +
        "A mért rendszer (client/, server-java/) forrását nem módosítja, és a vázat sem " +
        "szabja a teszthez (`data-testid`, `retry`). Ha egy elem szerep vagy címke alapján " +
        "elérhetetlen, azt akadálymentességi hiányként JELENTSD.",
    );
  }
  return decide("defer");
}

// A Java unit-teszt-írónak a szerver TESZT-forrásfája a munkaterülete (plusz a
// gitignore-olt `.scratch/`, ahova a `test-writer-java-unit` skill 1. fázisa a
// tesztterveket írja).
//
// Ez a mód a skill legelső nem-alku pontját váltja gépi kényszerré: „Never modify
// production code. If a seam is needed to make something testable, say so and stop
// at the suggestion." Próza formájában ez a szabály pont ott a leggyengébb, ahol a
// legtöbbet érne — egy nem tesztelhető osztálynál a legkisebb ellenállás iránya
// mindig a produkciós kód megnyitása, nem a jelentés.
//
// A `pom.xml` SZÁNDÉKOSAN nincs az engedélyezettek közt, pedig a skill 4. fázisa
// build-fájlt írna (JaCoCo bekötése). Ebben a repóban a JaCoCo már be van kötve,
// tehát nincs mit felvenni — ami maradna, az a `check-unit-tested-classes`
// osztálylistája, és annak a bővítése tartós CI-kötelezettség. Ezért az az
// orchestrátoré (`feature-full` skill), mért számok alapján: így a küszöb
// lejjebbvétele nem lehet egy elakadt teszt-kör legkényelmesebb kiútja.
const UNIT_TEST_WRITE_ROOTS = [/^server-java\/src\/test\//i, /^\.scratch\//i];

function guardUnitTestWrite(input) {
  const filePath =
    input?.tool_input?.file_path ??
    input?.tool_input?.notebook_path ??
    input?.tool_input?.path;
  if (!filePath) return decide("defer");

  const rel = relativeToProject(filePath);
  for (const { re, why } of PROTECTED_PATHS) {
    if (re.test(rel)) {
      return decide("deny", `Írás megtagadva: \`${rel}\` — ${why}`);
    }
  }
  if (!UNIT_TEST_WRITE_ROOTS.some((re) => re.test(rel))) {
    return decide(
      "deny",
      `Írás megtagadva: \`${rel}\` — ez az agent kizárólag a \`server-java/src/test/\` ` +
        "fát írja. A tesztelt produkciós kódhoz nem nyúl: ha egy osztály varrat (seam) " +
        "híján nem tesztelhető, azt JELENTSD javaslatként, ne refaktoráld. A `pom.xml` " +
        "sem a tiéd — a JaCoCo-küszöb és az ellenőrzött osztályok listája az " +
        "orchestrátor döntése, mért lefedettség alapján.",
    );
  }
  return decide("defer");
}

// A dokumentáció-írónak KÉT fájl a munkaterülete: a munkafa gyökerében lévő
// `README.md` és az ugyanott lévő OpenAPI-leíró (plusz a gitignore-olt `.scratch/`
// a jegyzeteinek és a leltár-kimeneteinek).
//
// A minták `^`-hoz kötöttek, és ez a lényeg: a `server-java/README.md`, az
// `e2e/README.md` és a `client/…` NEM esik bele. Az almappák README-i más
// olvasóhoz szólnak és más ütemben változnak — az a `docs-writer` agent dolga.
// Ez a mód azt a szabályt teszi géppé, ami prózában a leggyengébb: aki azt a
// feladatot kapja, hogy „a dokumentáció feleljen meg a kódnak", annak a legkisebb
// ellenállás iránya mindig a KÓD megnyitása, ha a kettő nem egyezik. A leíró
// azonban a kódot írja le, nem fordítva: az eltérés JELENTENDŐ, nem elsimítandó.
//
// A `spec/` a `PROTECTED_PATHS`-on át amúgy is tiltott, és itt külön súlya van:
// a `spec/backend/vegpontok.md` ugyanazt a végponthalmazt írja le, tehát ha a
// kettő eltér, a leíró igazítása a spechez a legkényelmesebb kiút — az viszont a
// normát hamisítaná meg, nem a dokumentációt frissítené.
const DOCS_WRITE_ROOTS = [/^README\.md$/i, /^openapi\.(ya?ml|json)$/i, /^\.scratch\//i];

function guardDocsWrite(input) {
  const filePath =
    input?.tool_input?.file_path ??
    input?.tool_input?.notebook_path ??
    input?.tool_input?.path;
  if (!filePath) return decide("defer");

  const rel = relativeToProject(filePath);
  for (const { re, why } of PROTECTED_PATHS) {
    if (re.test(rel)) {
      return decide("deny", `Írás megtagadva: \`${rel}\` — ${why}`);
    }
  }
  if (!DOCS_WRITE_ROOTS.some((re) => re.test(rel))) {
    return decide(
      "deny",
      `Írás megtagadva: \`${rel}\` — ez az agent kizárólag a munkafa gyökerében lévő ` +
        "`README.md`-t és OpenAPI-leírót írja. A leírt rendszer forrásához (client/, " +
        "server-java/) nem nyúl, és az almappák README-ihez sem. Ha a dokumentáció és a " +
        "kód eltér, a KÓD az igazság: az eltérést JELENTSD, ne igazítsd hozzá egyiket sem.",
    );
  }
  return decide("defer");
}

// --- Parancs-ellenőrzés -----------------------------------------------------

// A parancsot elemekre bontó rész. Cél, hogy a tiltólista ne csak a parancssor
// ELEJÉT lássa: `npm test && git push`, `echo $(git commit -m x)`,
// `bash -c 'git push'` és `sudo git push` mind ugyanoda fusson ki.

/** Operátorok, parancsbehelyettesítés és csoportosítás mentén darabol. */
function splitOnOperators(command) {
  return String(command ?? "")
    .split(/&&|\|\||\$\(|[;|&\n`()]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A parancs elé írható, önmagában ártalmatlan burkolatok. Ezek nélkül a
 * `^`-hoz kötött minták mellől egy `sudo` vagy egy `FOO=1` előtag kisétáltatná
 * a tiltott parancsot.
 */
const WRAPPER_PREFIX = new RegExp(
  "^(?:" +
    [
      "sudo(?:\\s+-\\S+)*",
      "command",
      "builtin",
      "exec",
      "nohup",
      "time",
      "nice(?:\\s+-\\S+)*",
      "xargs(?:\\s+-\\S+)*",
      "env(?:\\s+-\\S+)*(?:\\s+[A-Za-z_][A-Za-z0-9_]*=\\S*)*",
      "[A-Za-z_][A-Za-z0-9_]*=\\S*", // FOO=1 git push
    ].join("|") +
    ")\\s+",
  "i",
);

/** Egy értelmező `-c` kapcsolója után álló parancs, ha van. */
const INTERPRETER_C =
  /^(?:bash|sh|zsh|dash|ksh|pwsh|powershell)(?:\.exe)?\s+(?:-\S+\s+)*-c\s+(.*)$/i;

function normalize(segment) {
  let s = segment.replace(/^[\s{]+/, "").trim();
  for (let i = 0; i < 5; i += 1) {
    const next = s.replace(WRAPPER_PREFIX, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * A parancssor vizsgálandó szegmensei. A `bash -c '…'` törzse ÖNÁLLÓ szegmensként
 * is bekerül, különben a burkolat neve alapján ítélnénk meg a benne futó parancsot.
 */
function segments(command) {
  const out = [];
  const queue = [String(command ?? "")];
  let guard = 0;

  while (queue.length > 0 && guard < 50) {
    guard += 1;
    for (const part of splitOnOperators(queue.shift())) {
      const seg = normalize(part);
      if (!seg) continue;
      out.push(seg);

      const inner = INTERPRETER_C.exec(seg);
      if (inner) {
        // A darabolás a záró idézőjelet is elvihette, ezért a csonkot is tűrjük.
        const body = inner[1].trim().replace(/^['"]/, "").replace(/['"]$/, "");
        if (body) queue.push(body);
      }
    }
  }
  return out;
}

/** A zajos, ártalmatlan átirányítások eltávolítása a `>` vizsgálat előtt. */
function stripHarmlessRedirects(segment) {
  return segment
    .replace(/2>&1/g, " ")
    .replace(/[12]?>>?\s*(\/dev\/null|\$null|NUL)\b/gi, " ");
}

// Bármelyik agentnél tiltott: a lánc nem kommitol és nem telepít függőséget.
// A `(?:-…\s+)*` rész a parancs saját kapcsolóit engedi át az alparancs előtt
// (`git -C . commit`, `git -c user.name=x commit`) — enélkül egyetlen beszúrt
// opció kisétáltatná a tiltás alól.
const SUBCOMMAND_OPTIONS = "(?:-{1,2}[^\\s]+(?:\\s+[^\\s-][^\\s]*)?\\s+)*";
const ALWAYS_DENY = [
  {
    re: new RegExp(
      `^git\\s+${SUBCOMMAND_OPTIONS}(commit|push|add|reset|checkout|restore|switch|rebase|merge|stash|clean|rm|mv|tag|cherry-pick)\\b`,
      "i",
    ),
    why: "a spec-lánc nem módosítja a git-állapotot — a kommitolás a fejlesztő döntése",
  },
  {
    // Az `npm ci` SZÁNDÉKOSAN nincs a listán. A párhuzamos ág friss worktree-ben
    // indul, ahol nincs `node_modules` — enélkül az implementáló nem tudná
    // lefuttatni a buildet és a teszteket, azaz nem tudná teljesíteni a saját
    // „csak zöld build után jelents készet" szabályát. És a `ci` a lockfile-hoz
    // ragaszkodik: nem vesz fel és nem frissít függőséget, tehát nem sérti azt,
    // amit ez a minta véd. Az `npm install` továbbra is tiltott — az igen.
    re: new RegExp(
      `^(npm|pnpm|yarn|bun)\\s+${SUBCOMMAND_OPTIONS}(i|in|ins|install|add|remove|uninstall|update|upgrade|link)\\b`,
      "i",
    ),
    why: "nincs új vagy frissített függőség — a `package.json` verziói pinelve vannak (friss worktree-ben `npm ci` a megoldás)",
  },
];

// Csak a validátornál tiltott: bármi, ami fájlt módosít.
const READONLY_DENY = [
  { re: /^(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|ln)\b/i, why: "fájlrendszer-módosítás" },
  { re: /^sed\b[^|]*\s-i\b/i, why: "helyben szerkesztő `sed -i`" },
  { re: /^(tee|dd|truncate)\b/i, why: "fájlba írás" },
  { re: /^(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Clear-Content)\b/i, why: "PowerShell fájlművelet" },
];

// A validátornak ennyi elég: build, teszt, futó API lekérdezése, git-olvasás.
//
// A `cd` és a MÉRŐ `mvn` alparancsok azért vannak rajta, mert a validátor előírt
// elsődleges ellenőrzése `cd server-java && mvn test` — enélkül a saját kötelező
// lépésén kapott `ask`-ot, minden egyes futásnál. A `mvn` NEM általánosan engedett:
// csak az olvasó/mérő célok (`test`, `verify`, `jacoco:*`, `-version`), mert a
// `package`, az `install` és a `deploy` fájlt ír, illetve a helyi repóba telepít.
const READONLY_ALLOW = [
  /^cd\s+\S+$/i,
  /^mvn\s+(?:-\S+\s+)*(test|verify|jacoco:[\w@-]+|help:[\w-]+|-version|--version)\b/i,
  /^npm\s+(run\s+)?(build|test|start|run\s+build|run\s+test)\b/i,
  /^npm\s+run\s+[\w:-]+\s*$/i,
  /^npx\s+(tsc|vitest)\b/i,
  /^git\s+(status|diff|log|show|branch|ls-files|rev-parse|remote)\b/i,
  /^(curl|wget)\b/i,
  /^(node|cat|head|tail|ls|dir|find|grep|rg|wc|echo|pwd|which|where|type|jq|sort|uniq|diff)\b/i,
  /^(Get-Content|Get-ChildItem|Select-String|Test-Path|Measure-Object|Invoke-WebRequest|Invoke-RestMethod)\b/i,
];

function guardBash(input, { readonly }) {
  const command = input?.tool_input?.command;
  if (!command) return decide("defer");

  const parts = segments(command);
  if (parts.length === 0) return decide("defer");

  for (const raw of parts) {
    for (const { re, why } of ALWAYS_DENY) {
      if (re.test(raw)) {
        return decide("deny", `Parancs megtagadva (\`${raw}\`): ${why}.`);
      }
    }
    if (!readonly) continue;

    for (const { re, why } of READONLY_DENY) {
      if (re.test(raw)) {
        return decide("deny", `Parancs megtagadva (\`${raw}\`): ${why} — ez az agent csak olvas és jelent, nem javít.`);
      }
    }
    if (/>/.test(stripHarmlessRedirects(raw))) {
      return decide("deny", `Parancs megtagadva (\`${raw}\`): fájlba átirányítás — ez az agent csak olvas és jelent, nem javít.`);
    }
  }

  if (!readonly) return decide("defer");

  // Az ismeretlen parancs nem automatikusan tiltott: a döntés a felhasználóé.
  // Így a validátor nem bénul le egy nem várt, de ártalmatlan parancson.
  const allAllowed = parts.every((raw) => READONLY_ALLOW.some((re) => re.test(raw)));
  return allAllowed
    ? decide("defer")
    : decide("ask", "Ez a parancs nincs a csak olvasó parancsok listáján — a validátornak nem szabad módosítania semmit.");
}

// --- Belépési pont ----------------------------------------------------------

const input = readInput();

switch (MODE) {
  case "impl-write":
    guardWrite(input);
    break;
  case "e2e-write":
    guardE2eWrite(input);
    break;
  case "unit-test-write":
    guardUnitTestWrite(input);
    break;
  case "docs-write":
    guardDocsWrite(input);
    break;
  case "impl-bash":
    guardBash(input, { readonly: false });
    break;
  case "readonly-bash":
    guardBash(input, { readonly: true });
    break;
  default:
    // Ismeretlen mód: inkább ne akadályozzuk a munkát, csak jelezzük.
    decide("defer", `Ismeretlen spec-guard mód: "${MODE}".`);
}
