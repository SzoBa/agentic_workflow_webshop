#!/usr/bin/env node
// PreToolUse guard a lánc agentjeihez (spec-*, e2e-, unit-teszt- és dokumentáció-író,
// reviewer, debugger stb.).
//
// Az agentek legfontosabb szabályai ("a spec/ mappát nem módosítjuk", "ne kommitolj",
// "nincs új függőség", "ez az agent csak olvas") korábban csak a prompt szövegében
// éltek. Egy Bash-t kapó agent viszont átirányítással bármit felül tud írni — a próza
// ott nem véd. Ez a hook ugyanezekre a szabályokra ad gépi fogást.
//
// MIT NYÚJT, ÉS MIT NEM. Ez a hook a szabályok nyilvánvaló megsértését fogja el —
// azt az esetet, ami a gyakorlatban előfordul: az agent véletlenül kommitolna,
// telepítene, vagy egy Bash-átirányítással a saját munkaterületén kívülre írna.
// NEM sandbox, és nem is az akar lenni. A parancssor tiltólistás vizsgálata elvi
// okból hiányos: egy tiltólista véges felsorolás egy végtelen halmazról. Aki
// kifejezetten meg akarja kerülni, meg tudja (más nevű wrapper, saját szkript,
// git-alias a konfigurációban, in-process fájlírás egy engedélyezett értelmezőből).
//
// Ezért aszimmetrikus a két üzemmód-család, és ez SZÁNDÉKOS: a csak olvasó agentek
// (validátor, reviewer, docs-api-writer) `readonly-bash` módja ENGEDÉLYLISTÁVAL
// dolgozik, és ami nincs rajta, az `ask`. Az engedélyezettek felsorolása véges, a
// tiltottaké soha nem az — a readonly mód emiatt érdemben szigorúbb, mint az író
// módok. Az író módokban (impl-/e2e-/unit-test-bash) SZÁNDÉKOSAN nincs git- vagy
// parancs-engedélylista (fejlesztői döntés, 2026-11): csak a tiltólista bővül, mert
// egy engedélylista ott minden második build- vagy teszthívásnál súrlódást okozna.
//
// A PARANCSSOR ELEMZÉSE. A parancsot egy idézőjel-tudatos tokenizáló bontja
// egyszerű parancsokra (`'…'` literál, `"…"` és `\` a shell szabályai szerint,
// sh-nál a `$'…'` ANSI-C idézés a C-escape-ekkel és a `$"…"` is; PowerShell-nél
// a backtick az escape). Csak idézőjelen KÍVÜL darabol, így a
// `grep -E "a|b"` vagy a `node -e "console.log('x && git commit')"` egyetlen
// parancs marad. A `$(…)`, a backtick és a `<(…)` törzse — dupla idézőjelen belül
// is — külön szegmens; a `bash -c '…'`, `cmd /c …`, `powershell -Command …`,
// `eval`, `iex`/`Invoke-Expression`, `watch '…'`, `flock f -c '…'` és a
// `find -exec … ;` törzse szintén. A parancsfejet normalizáljuk (`"C:/…/git.exe"`,
// `\git`, `npm.cmd`, `./mvnw` → `git`/`npm`/`mvn`), a burkolókat (`sudo`, `env`,
// `xargs`, `command -p`, `nice`, `nohup`, `timeout`, `stdbuf`, `ionice`, `setsid`,
// `winpty`, `noglob`, `nocorrect`, `chronic`, `unbuffer`, `flock`, `watch`, `then`,
// `!` …) lehántjuk. A szabályok a tokenizált argv-n futnak, nem a nyers szövegen.
// A feldolgozott parancstörzsek száma korlátos (64, a fő sorral együtt); ha
// elfogy, az `ask`, nem csendes átengedés.
//
// BASH-ÍRÁSVÉDELEM (2026-11). Minden Bash-módban kigyűjtjük a parancs írási
// célpontjait: `>`/`>>`/`&>` (idézőjelen kívül), `tee`, `sed -i`, `perl -i`,
// `awk -i inplace`, `cp`/`mv`/`ln`/`install` (létező vagy `/`-re végződő
// célkönyvtárnál a `cél/<forrás alapneve>`, `-t <dir>`-rel is; a `ln` a link célját
// is, mert azon át írható), `mkdir`, `chmod`/`chown`/`chgrp`, `touch`/`rm`/
// `truncate`/`dd of=`, `rsync` célja, `tar -x` (`-C` vagy a munkakönyvtár) és
// `tar -c -f`, `unzip -d`, `patch` (`-o`, a célfájl, vagy ha a diff adja, a
// könyvtár egésze), `flock` zárfájlja, és a PowerShell `Out-File`, `Set-Content`,
// `Add-Content`, `New-Item` (linknél a cél is), `Copy-Item`/`Move-Item`,
// `Expand-Archive` stb. Ezekre ugyanaz a védelem fut, mint a megfelelő Write-módnál
// (önvédelem és `spec/` tiltva, meglévő migráció tiltva, függőségleíró → `ask`;
// e2e-/unit-test-bash-ben a saját engedélylista). A TÖRLŐ (`rm`, `mv` forrása) és
// az ismeretlen tartalmat író (`tar -x`, `rsync`, `cp -r`, `unzip`) célpont akkor is
// tiltott, ha egy védett útvonal SZÜLŐKÖNYVTÁRA (`rm -rf docs`, `tar -x -C .`).
// A relatív célpontot a hívás `cwd`-jéhez és a parancssoron belüli `cd`-khez
// kötjük. KORLÁTAI: amit egy értelmező a saját folyamatán belül ír
// (`node -e "fs.writeFileSync(…)"`, `python -c …`, `[IO.File]::WriteAllText`, egy
// npm-script vagy egy Maven-plugin), az NEM látszik; a heredoc törzsét nem
// elemezzük parancsként (csak a benne lévő `$(…)`-t), a változóból összerakott
// útvonalat szó szerint vesszük, és a MÁR LÉTEZŐ szimbolikus linken át írt fájlt
// a link helyén ítéljük meg (csak az újonnan létrehozott link célját látjuk).
//
// ÖNVÉDELEM (2026-11). MINDEN módban — a Write-módokban és a Bash-írási célokra
// egyaránt, a readonly-ban is a saját indokkal — tiltott a munkafa gyökeréhez
// képest a `.claude/hooks/`, `.claude/agents/`, `.claude/skills/`,
// `.claude/settings{,.local}.json` és a `docs/orchestration/_kontextus/
// {keretek,receptek,arak}.json` írása (a `.claude/worktrees/<név>/` munkafában a
// munkafa saját `.claude/`-ja számít). A guard, az engedélylista és a költségkapu
// küszöbe a fejlesztő döntése; egy agent, amely ezeket írhatja, a saját korlátait
// kapcsolhatja ki. A `.scratch/` írása szabad marad.
//
// GIT-KÓDFUTTATÁS (2026-11). MINDEN Bash-módban (a readonly-ban is) deny a
// parancsot futtató git-konfiguráció a parancssorban (`-c`/`--config-env`
// `core.pager`, `core.fsmonitor`, `core.sshCommand`, `diff.external`, `*.textconv`,
// `filter.*`, `credential.helper`, `pager.*` stb.), a `git difftool|mergetool -x`,
// és a `GIT_PAGER`/`GIT_EXTERNAL_DIFF`/`GIT_SSH_COMMAND`/`GIT_EDITOR` (és rokonaik)
// beállítása — ezekkel egy olvasó `git log` is tetszőleges parancsot futtat.
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
//   impl-write      — az implementáló írásai: spec/ és a MEGLÉVŐ Flyway-migrációk tiltva
//                     (új V<n>__ fájl mehet), függőségleíró → ask
//   impl-bash       — az író agentek parancsai: git-mutáció és függőségtelepítés tiltva,
//                     a Bash-írási célokra az impl-write védelme fut
//   e2e-bash        — az impl-bash minden tiltása, PLUSZ a Bash-írási célokra az
//                     e2e-write engedélylistája (csak e2e/ és .scratch/)
//   unit-test-bash  — az impl-bash minden tiltása, PLUSZ a Bash-írási célokra a
//                     unit-test-write engedélylistája (csak server-java/src/test/,
//                     docs/test-plans/*.md és .scratch/)
//   readonly-bash   — a csak olvasó agentek parancsai: csak az engedélylistás, olvasó
//                     parancsok mennek át (ami nincs rajta: ask); minden Bash-írás
//                     tiltva. A listán: olvasó shell-eszközök (cat, grep, stat, du,
//                     cut, tr, printf, file, realpath …; az awk NEM), `node <repó-
//                     beli szkript>` és `node --test` (a `-e`/`-p`/stdin nem), `java
//                     -version`, a mérő `mvn`/`npm`/`npx tsc --noEmit`/`npx vitest
//                     run`/`npx eslint` alakok (az író és a soha ki nem lépő alakok
//                     — `--fix`, `-u`, `--outDir`, `npm run dev`, `*:watch` — nem),
//                     olvasó git-, docker- és curl-hívások (a `curl -X POST/DELETE`
//                     szándékosan igen: a validátor jogosultsági eseteket mér vele)
//   e2e-write       — az e2e-teszt-író írásai: CSAK az e2e/ (és a .scratch/) írható
//   unit-test-write — a Java unit-teszt-író írásai: CSAK a szerver teszt-forrásfája,
//                     a verziókövetett teszttervek (docs/test-plans/<Osztály>.md,
//                     alkönyvtár nélkül, a README.md kivételével) és a .scratch/
//                     írható; a produkciós kód, a pom.xml és a docs/ többi része tiltva
//   docs-write      — a dokumentáció-író írásai: CSAK a gyökér README.md és a gyökér
//                     OpenAPI-leíró (és a .scratch/); a leírt rendszer forrása tiltva
//   Mind a nyolc módban tiltott az önvédett útvonalak írása (lásd ÖNVÉDELEM).
//
// A MUNKATERÜLETEN KÍVÜLI ÍRÁS (`/tmp`, `%TEMP%`, `C:\Users\…\AppData\Local\Temp`) az
// engedélylistás módokban (e2e-/unit-test-write és -bash, docs-write) TILTOTT, és ez
// szándékos, nem mellékhatás: a fejlesztő globális szabálya szerint a munkamappákon
// kívülre natív eszköz nem nyúlhat (csak a filesystem MCP-n át, külön engedéllyel).
// Egy `mvn test > /tmp/x.log` ezért deny, és a szöveg a gitignore-olt `.scratch/`-et
// ajánlja helyette. Az `impl-*` módoknak nincs engedélylistájuk, ott ez nem él.
//
// Worktree-k: a lánc párhuzamos ágai a repón BELÜL, a `.claude/worktrees/<név>/`
// alatt futnak. Az útvonalat ezért ELŐSZÖR a legközelebbi git-gyökérhez
// relativizáljuk — de egy `.git` FÁJLOS mappát csak akkor fogadunk el munkafának,
// ha a `gitdir:` sora a projekt saját `.git/worktrees/` mappájába mutat.
//
// Kimenet: exit 0, és deny | ask esetén JSON a stdout-ra. A belső "defer" ítélet
// ("nem ítélek") KIMENET NÉLKÜL zár: így a normál engedélyezési folyamat dönt —
// a hook sosem ad "allow"-t, hogy a felhasználó beállításait ne írja felül (a
// háttér-agentek engedélyeit a projekt settings.json szűk `permissions.allow`
// listája kezeli, nem ez a hook). Belső hiba esetén is kimenet nélkül zárunk.
//
// Miért nem a "defer" szót adjuk ki: a Claude Code 2.1.310-ben (mérve
// 2026-10-25-én) a `permissionDecision: "defer"` már nem a normál folyamatra
// bízást jelenti, hanem a tool-hívás ELHALASZTÁSÁT — a háttérben futó subagent
// az első Bash-hívásánál hibaüzenet nélkül megáll (`hook_deferred_tool` az
// átiratban). A 2.1.220-ban még átengedett.

import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const MODE = process.argv[2] ?? "";
const WIN = process.platform === "win32";

/** Egységes hook-válasz. A "defer" (nincs ítélet) kimenet nélkül zár. */
function decide(permissionDecision, permissionDecisionReason) {
  if (permissionDecision === "defer") {
    // Nincs ítélet: kimenet nélkül zárunk (lásd a fejléc utolsó bekezdését).
    if (permissionDecisionReason) process.stderr.write(`${permissionDecisionReason}\n`);
    process.exit(0);
  }
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

/**
 * Git-Bash alakú meghajtó-útvonal (`/d/Programozas/…`) Windows-alakra (`D:/…`).
 * Enélkül a `resolve` az aktuális meghajtó gyökeréhez fűzné: `D:/d/Programozas/…`,
 * ami semmilyen gyökér alá nem esik — és így semmilyen tiltásba sem.
 */
function fromGitBash(p) {
  const s = toPosix(p);
  if (!WIN) return s;
  return s.replace(/^\/([a-zA-Z])(?=\/|$)/, (_, d) => `${d.toUpperCase()}:`);
}

function projectDir() {
  return fromGitBash(process.env.CLAUDE_PROJECT_DIR || process.cwd());
}

/** Ha `p` a `root` alatt van, a hozzá képesti útvonal; egyébként `null`. */
function under(p, root) {
  const rootLower = toPosix(root).toLowerCase().replace(/\/+$/, "");
  if (!rootLower) return null;
  return p.toLowerCase().startsWith(rootLower + "/") ? p.slice(rootLower.length + 1) : null;
}

/** Két abszolút útvonal ugyanaz-e (Windows-on kis-/nagybetű-érzéketlenül). */
function samePath(a, b) {
  const na = toPosix(a).replace(/\/+$/, "");
  const nb = toPosix(b).replace(/\/+$/, "");
  return WIN ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/**
 * A legközelebbi git-gyökér fölfelé: az első könyvtár, amelyben van `.git`.
 * Worktree-ben a `.git` FÁJL (`gitdir:` mutató), nem könyvtár — a `kind` ezt adja.
 */
// Egy hook-híváson belül a fájlrendszer nem változik (a parancs még nem futott le),
// ezért a fájlrendszer-lekérdezések eredménye gyorsítótárazható. Enélkül egy több
// ezer szegmensből álló parancssor szegmensenként újra végigstatolná a szülőláncot.
const MEMO = new Map();
function memo(kind, key, fn) {
  const k = `${kind}\0${key}`;
  if (MEMO.has(k)) return MEMO.get(k);
  const v = fn();
  MEMO.set(k, v);
  return v;
}

function nearestGitRoot(absPath) {
  return gitRootAt(dirname(absPath));
}

/**
 * A `dir`-ben vagy fölötte lévő első `.git`: `{ dir, kind }` vagy `null`. Minden
 * bejárt szint eredményét eltesszük, így egy szülőkönyvtárat egy híváson belül
 * csak egyszer statolunk, akárhány célpont esik alá.
 */
function gitRootAt(dir) {
  const chain = [];
  let d = dir;
  let found = null;
  for (let i = 0; i < 60; i += 1) {
    const k = `gitat\0${d}`;
    if (MEMO.has(k)) { found = MEMO.get(k); break; }
    chain.push(d);
    // `throwIfNoEntry: false`: a hiányzó bejegyzés `undefined`, nem kivétel — a
    // kivétel felépítése a stat költségének többszöröse, és itt a hiány a gyakori eset.
    let st;
    try {
      st = statSync(d + "/.git", { throwIfNoEntry: false });
    } catch {
      st = undefined; // pl. jogosultsági hiba — megyünk feljebb
    }
    if (st) { found = { dir: toPosix(d), kind: st.isDirectory() ? "dir" : "file" }; break; }
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  for (const c of chain) MEMO.set(`gitat\0${c}`, found);
  return found;
}

/**
 * Ez a `.git` fájlos mappa a PROJEKT saját worktree-je-e. Csak akkor, ha a
 * `gitdir:` sora a `<CLAUDE_PROJECT_DIR>/.git/worktrees/` alá mutat. Egy
 * tetszőleges `.git` fájl (más repo worktree-je, submodule, vagy egy kézzel
 * odaírt fájl) nem teszi a mappát munkafagyökérré — különben bárki
 * „munkafát” csinálhatna egy `e2e/` nevű almappa fölé.
 */
function isProjectWorktree(dir) {
  return memo("wt", dir, () => isProjectWorktreeUncached(dir));
}

function isProjectWorktreeUncached(dir) {
  try {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dir + "/.git", "utf8"));
    if (!m) return false;
    const target = toPosix(resolve(dir, fromGitBash(m[1])));
    const expected = toPosix(resolve(projectDir(), ".git", "worktrees")).replace(/\/+$/, "") + "/";
    return WIN
      ? target.toLowerCase().startsWith(expected.toLowerCase())
      : target.startsWith(expected);
  } catch {
    return false;
  }
}

/**
 * A bemeneti útvonal kanonikus, abszolút alakja.
 *
 * ELŐBB kanonizálunk, CSAK AZUTÁN döntünk — enélkül az engedélylista nem
 * engedélylista, hanem szövegelőtag-vizsgálat, amivel a fájlrendszer nem ért
 * egyet. A `server-java/src/test/../main/java/…/AccountService.java` illeszkedik
 * a `^server-java\/src\/test\//` mintára, miközben a tényleges célpont produkciós
 * kód — pontosan az, amit ez a hook megakadályozni hivatott. A `resolve` a `..` és
 * `.` szakaszokat összevonja, és a relatív bemenetet a bázishoz (alapból a
 * projektgyökérhez, Bash-nél a parancs munkakönyvtárához) köti.
 *
 * (Szimbolikus linket nem old fel: a nem létező fájl `realpath`-ja hibára fut,
 * márpedig egy írás célpontja tipikusan még nem létezik.)
 */
function canonical(filePath, base = projectDir()) {
  return memo("canon", `${base}\0${filePath}`, () => toPosix(resolve(fromGitBash(base), fromGitBash(filePath))));
}

/**
 * A munkafa gyökeréhez képesti útvonal — abszolút bemenetnél is.
 *
 * A lánc párhuzamos ága KÜLÖN GIT-WORKTREE-ben fut, a repón BELÜL
 * (`.claude/worktrees/<név>/`). Ha a projektgyökérhez relativizálnánk, az e2e-író
 * saját `e2e/` mappája `.claude/worktrees/wt1/e2e/…` lenne — és mivel az
 * engedélylisták `^`-hoz kötöttek, MINDEN írása megtagadásra kerülne. Ezért
 * ELŐSZÖR a legközelebbi git-gyökérhez viszonyítunk (ha az a projekt maga, vagy a
 * projekt valódi worktree-je), és csak ennek hiányában a projektgyökérhez.
 */
function relativeToProject(filePath, base) {
  const p = canonical(filePath, base);
  return memo("rel", p, () => relativeToProjectUncached(p));
}

function relativeToProjectUncached(p) {
  // Maga a gyökér (`rm -rf .`, `tar -x -C .`): üres relatív útvonal. Enélkül a
  // gyökér a „munkaterületen kívül” esne, és egyetlen védelem sem illeszkedne rá.
  if (samePath(p, projectDir())) return "";
  const own = gitRootAt(p);
  if (own && own.kind === "file" && samePath(own.dir, p) && isProjectWorktree(p)) return "";

  const root = nearestGitRoot(p);
  if (root) {
    const accepted =
      root.kind === "file" ? isProjectWorktree(root.dir) : samePath(root.dir, projectDir());
    if (accepted) {
      const fromRoot = under(p, root.dir);
      if (fromRoot !== null) return fromRoot;
    }
  }

  const fromProject = under(p, projectDir());
  if (fromProject !== null) return fromProject;

  // Sem a projektgyökér, sem egy elfogadott munkafa alá nem esik: marad a kanonikus
  // abszolút alak. Az `^`-hoz kötött engedélylistákra ez nem illeszkedik — ami
  // helyes: ami a munkaterületen kívül van, arra nincs engedély.
  return p;
}

// A spec/ a norma, nem munkaterület: az implementáló nem pipálhat ki tasks.md
// checkboxot és nem igazíthatja a specet a kódhoz. A minta a munkafa gyökeréhez
// kötött (`^spec`): a `client/src/spec/x.ts` nem a norma. A `spec` maga (mappa)
// is illeszkedik, hogy egy `rm -rf spec` vagy `mv spec x` se csússzon át.
//
// A MÁR KIADOTT Flyway-migrációt sem szabad átírni: a Flyway checksumot tárol
// róla, tehát egy meglévő fájl módosítása minden olyan adatbázison hibára fut,
// amelyiken már lefutott. Sémaváltozáshoz ÚJ migrációs fájl kell — ezért a
// migrációs szabály `csakLetezo`: a MÁR LÉTEZŐ `V*` fájl írása tilos, egy új
// `V<n>__…` fájl létrehozása átmegy.
//
// ÖNVÉDELEM (2026-11). A guard maga (`.claude/hooks/`), az agentek definíciója a
// `hooks:` blokkal (`.claude/agents/`), a skillek (`.claude/skills/`), az
// engedélylista (`.claude/settings{,.local}.json`) és a költségkapu küszöbei
// (`docs/orchestration/_kontextus/{keretek,receptek,arak}.json`) a fejlesztő
// döntései. Ha egy agent ezeket írhatná, egyetlen írással kikapcsolhatná a saját
// korlátait — a guardot, a módot, az engedélylistát vagy a keretet. A minta a
// MUNKAFA gyökeréhez kötött, tehát a `.claude/worktrees/<név>/.claude/…` is védett
// (a munkafa saját `.claude/`-ja a merge-dzsel a fő ágba kerülne). A `.claude`
// mappa maga is illeszkedik (`rm -rf .claude`, `rsync … .claude/`).
//
// `anchors`: a szabály által védett konkrét útvonalak. Egy TÖRLŐ vagy ismeretlen
// tartalmat író célpont (`rm -rf docs`, `mv .claude x`, `tar -x -C .`, `rsync … ./`)
// akkor is tiltott, ha maga nem illeszkedik a mintára, de egy horgony fölötti
// könyvtár — különben a védett fájl a szülője törlésével vagy felülírásával
// kerülné meg a szabályt.
const SELF_WHY =
  "a guard (`.claude/hooks/`), az agentdefiníciók (`.claude/agents/`), a skillek " +
  "(`.claude/skills/`), az engedélylista (`.claude/settings.json`, `settings.local.json`) " +
  "és a költségkapu küszöbei (`docs/orchestration/_kontextus/keretek|receptek|arak.json`) " +
  "a fejlesztő döntései — agent nem írhatja őket, a munkafa saját `.claude/`-ját sem. " +
  "Ha egy szabály akadályoz, azt JELENTSD, ne kerüld meg.";

// A `.git/` (és egy munkafa `.git` FÁJLJA) a repó belső állapota. A `config`-ba írt
// `core.fsmonitor`/`core.pager`, egy `hooks/` alá tett szkript vagy egy átírt ref a
// következő — bármelyik agent vagy a fejlesztő által indított — git-hívással kódot futtat,
// illetve a történetet írja át. A git-parancsok parancssori alakját a GIT-KÓDFUTTATÁS
// szabályai fogják; ez a bejegyzés azt az utat zárja, amikor ugyanez fájlírással történne
// (`echo … >> .git/config`). A git maga nem a guardon át ír ide, tehát a `git status`
// és társai érintetlenek.
const GIT_DIR_WHY =
  "a `.git/` (egy munkafában a `.git` fájl) a repó belső állapota — a `config`-ba írt " +
  "`core.fsmonitor`/`core.pager`, egy hook-szkript vagy egy átírt ref a következő git-hívással " +
  "kódot futtat vagy a történetet írja át. Agent nem írhatja; git-műveletet az orchestrátor végez.";

const PROTECTED_PATHS = [
  {
    re: /^\.git(\/|$)/i,
    anchors: [".git"],
    self: true,
    why: GIT_DIR_WHY,
  },
  {
    re: /^\.claude(\/(hooks|agents|skills)(\/|$)|\/settings(\.local)?\.json$|\/?$)/i,
    anchors: [".claude/hooks", ".claude/agents", ".claude/skills", ".claude/settings.json", ".claude/settings.local.json"],
    self: true,
    why: SELF_WHY,
  },
  {
    re: /^docs\/orchestration\/_kontextus\/(keretek|receptek|arak)\.json$/i,
    anchors: ["docs/orchestration/_kontextus/keretek.json", "docs/orchestration/_kontextus/receptek.json", "docs/orchestration/_kontextus/arak.json"],
    self: true,
    why: SELF_WHY,
  },
  {
    re: /^spec(\/|$)/i,
    anchors: ["spec"],
    why: "a `spec/` mappa a norma — az agentek nem módosítják (a `tasks.md` checkboxait sem). Ha a spec hibás vagy ellentmondásos, azt jelentsd, ne írd át.",
  },
  {
    re: /(^|\/)db\/migration\/V\d/i,
    csakLetezo: true,
    why: "a már kiadott Flyway-migrációt nem írjuk át — a Flyway checksumot tárol róla, így a módosítás minden meglévő adatbázison hibára fut. Sémaváltozáshoz hozz létre ÚJ migrációs fájlt.",
  },
];

const ANCESTOR_WHY =
  "a célpont egy védett útvonalat tartalmazó könyvtár, és a parancs törli, áthelyezi, " +
  "vagy a parancssorból nem látható tartalommal írja felül.";

/**
 * A `rel` könyvtár (a munkafa gyökeréhez képest; `""` a gyökér) tartalmazza-e a
 * horgonyt. Munkaterületen kívüli célpontnál (`kivulAbs`) akkor igaz, ha a projekt
 * maga van alatta (`rm -rf D:/Programozas`).
 */
function containsAnchor(rel, kivulAbs, anchor) {
  if (kivulAbs) return under(projectDir(), kivulAbs) !== null;
  const r = rel.toLowerCase().replace(/\/+$/, "");
  const a = anchor.toLowerCase();
  return r === "" || a === r || a.startsWith(r + "/");
}

// A függőségek leírói. A „nincs új függőség" szabályt eddig csak a telepítő
// PARANCSOK tartották — a fájl szerkesztése szabad volt, és egy `pom.xml`-be írt
// új függőséget a következő `mvn test` csendben letöltött. Ezek írása ezért
// `ask`: a döntés a fejlesztőé, mert van jogos ok is (egy script, egy plugin
// konfigurációja), de egy függőség felvétele sosem lehet mellékhatás.
const DEPENDENCY_FILES = [
  /(^|\/)package\.json$/i,
  /(^|\/)(package-lock|npm-shrinkwrap)\.json$/i,
  /(^|\/)(yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/i,
  /(^|\/)pom\.xml$/i,
];

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
const E2E_DENY_WHY =
  "ez az agent kizárólag az `e2e/` mappát írja. " +
  "A mért rendszer (client/, server-java/) forrását nem módosítja, és a vázat sem " +
  "szabja a teszthez (`data-testid`, `retry`). Ha egy elem szerep vagy címke alapján " +
  "elérhetetlen, azt akadálymentességi hiányként JELENTSD. Munkafájlnak a `.scratch/` való.";

// A Java unit-teszt-írónak a szerver TESZT-forrásfája a munkaterülete, plusz a
// tesztterv verziókövetett helye, `docs/test-plans/<Osztály>.md` (döntés,
// 2026-11-06), és a gitignore-olt `.scratch/` a munkajegyzeteknek. A `docs/`-ból
// SZÁNDÉKOSAN csak ez az egy szint és csak `.md` írható: a `docs/test-plans/x/y.md`,
// a `docs/test-plans/A.java` és a `docs/` többi része (ADR-ek, futásnaplók, a
// mérők verziózott tárja) tiltva marad.
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
//
// A `docs/test-plans/README.md` a mappa leírása, nem egy osztály tesztterve — az
// SZÁNDÉKOSAN kívül esik a mintán (kis-/nagybetűtől függetlenül), így egy
// `cp README.md docs/test-plans/` sem csúszik át.
const UNIT_TEST_WRITE_ROOTS = [/^server-java\/src\/test\//i, /^docs\/test-plans\/(?!readme\.md$)[^/]+\.md$/i, /^\.scratch\//i];
const UNIT_TEST_DENY_WHY =
  "ez az agent kizárólag a `server-java/src/test/` " +
  "fát és a `docs/test-plans/<Osztály>.md` tesztterveket írja. A tesztelt produkciós " +
  "kódhoz nem nyúl: ha egy osztály varrat (seam) " +
  "híján nem tesztelhető, azt JELENTSD javaslatként, ne refaktoráld. A `pom.xml` " +
  "sem a tiéd — a JaCoCo-küszöb és az ellenőrzött osztályok listája az " +
  "orchestrátor döntése, mért lefedettség alapján. Munkafájlnak, naplónak a `.scratch/` való.";

// Kiegészítő indok, ha egy engedélylistás mód célpontja a munkaterületen KÍVÜL esik
// (lásd a fejlécet): ilyenkor nem az a kérdés, melyik projektmappa az agenté, hanem
// hogy a projekten kívülre egyáltalán nem írunk.
const KIVUL_WHY =
  "A célpont a munkaterületen KÍVÜL van (pl. `/tmp`, `%TEMP%`): a fejlesztő szabálya " +
  "szerint natív eszköz a munkamappákon kívülre nem ír. Naplónak, ideiglenes fájlnak a " +
  "projekt gitignore-olt `.scratch/` mappája való (pl. `> .scratch/mvn-test.log`).";

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
const DOCS_DENY_WHY =
  "ez az agent kizárólag a munkafa gyökerében lévő " +
  "`README.md`-t és OpenAPI-leírót írja. A leírt rendszer forrásához (client/, " +
  "server-java/) nem nyúl, és az almappák README-ihez sem. Ha a dokumentáció és a " +
  "kód eltér, a KÓD az igazság: az eltérést JELENTSD, ne igazítsd hozzá egyiket sem.";

/**
 * Egy írási célpont megítélése — a Write-módok és a Bash-írásvédelem közös magja.
 * Visszaad: `null` (nincs kifogás) | `{ decision: "deny"|"ask", why }`.
 *   roots      — engedélylista (ha van): ami nem illeszkedik rá, az deny
 *   checkDeps  — a függőségleírók írása ask
 * A célpont jellege (a Bash-írásvédelem adja; a Write-eszköznél mind hamis):
 *   dir         — a célpont könyvtár (`mkdir`): az engedélylistát `rel/`-re nézzük
 *   tree        — a könyvtárba ismeretlen tartalom kerül (`tar -x -C`, `rsync`, `cp -r`)
 *   destructive — a célpontot törli vagy áthelyezi (`rm`, `mv` forrása)
 * A `tree` és a `destructive` célpontnál a védett horgonyok SZÜLŐJE is tiltott.
 */
function writeVerdict(filePath, base, profile = {}, kinds = {}) {
  const own = writeVerdictDirect(filePath, base, profile, kinds);
  if (own) return own;
  // Létező szimlinken vagy junctionön át írt célpont: a valódi helye szerint is
  // megítéljük. Különben egy `ln -s spec/backend docs/x` (vagy egy Windows-junction)
  // után a `echo … > docs/x/konformancia.md` a link helyén ítéltetne meg.
  // Törlő célpontnál (`rm link`) maga a link törlődik, nem a célja — ott nem.
  if (kinds.destructive) return null;
  const real = linkTarget(canonical(filePath, base));
  if (!real) return null;
  const v = writeVerdictDirect(real, base, profile, kinds);
  return v ? { ...v, why: `${v.why} (A célpont szimlinken/junctionön át ide mutat: \`${v.rel}\`.)` } : null;
}

/**
 * Ha az útvonal egy LÉTEZŐ részén szimlink vagy junction van, a valódi célja
 * (abszolút, posix alakban); egyébként `null`. Csak akkor old fel, ha tényleg van
 * link az úton — így egy 8.3-as rövid név vagy kis-/nagybetű-eltérés nem csúsztatja a
 * célpontot a projekten „kívülre”. A projekten belüli valódi célt a projektgyökérhez
 * fordítja vissza, ha a projekt maga is link mögött van.
 */
function linkTarget(abs) {
  return memo("link", abs, () => {
    let cur = abs;
    const rest = [];
    let link = false;
    for (let i = 0; i < 256; i += 1) {
      let st = null;
      try {
        st = lstatSync(cur, { throwIfNoEntry: false });
      } catch {
        st = null;
      }
      if (st) {
        if (st.isSymbolicLink()) link = true;
        // A létező ősök között is lehet link: azokat is nézzük, a gyökérig.
        let up = cur;
        while (!link) {
          const parent = dirname(up);
          if (parent === up) break;
          up = parent;
          try {
            if (lstatSync(up, { throwIfNoEntry: false })?.isSymbolicLink()) link = true;
          } catch {
            break;
          }
        }
        if (!link) return null;
        let real;
        try {
          real = toPosix(realpathSync.native(cur));
        } catch {
          return null;
        }
        const full = [real, ...rest].join("/");
        let projReal = null;
        try {
          projReal = toPosix(realpathSync.native(projectDir()));
        } catch {
          projReal = null;
        }
        const inProj = projReal ? under(full, projReal) : null;
        const mapped = inProj !== null ? `${toPosix(projectDir()).replace(/\/+$/, "")}/${inProj}` : full;
        return samePath(mapped, abs) ? null : mapped;
      }
      const parent = dirname(cur);
      if (parent === cur) return null;
      rest.unshift(basename(cur));
      cur = parent;
    }
    return null;
  });
}

function writeVerdictDirect(filePath, base, { roots = null, rootsWhy = "", checkDeps = true } = {}, { dir = false, tree = false, destructive = false } = {}) {
  const abs = canonical(filePath, base);
  const rel = relativeToProject(filePath, base);
  // A `relativeToProject` a munkaterületen kívüli célpontra a kanonikus abszolút
  // alakot adja vissza — erről ismerjük fel.
  const kivul = rel === abs;
  for (const { re, why, csakLetezo, anchors, self } of PROTECTED_PATHS) {
    if (re.test(rel)) {
      if (csakLetezo && !existsSync(abs)) continue;
      return { decision: "deny", rel, why, self };
    }
    if ((tree || destructive) && anchors?.some((a) => containsAnchor(rel, kivul ? abs : null, a))) {
      return { decision: "deny", rel, why: `${ANCESTOR_WHY} ${why}`, self };
    }
  }
  const relRoots = (dir || tree) && !rel.endsWith("/") ? `${rel}/` : rel;
  if (roots && !roots.some((re) => re.test(relRoots))) {
    return { decision: "deny", rel, why: kivul ? `${rootsWhy} ${KIVUL_WHY}` : rootsWhy };
  }
  if (checkDeps && DEPENDENCY_FILES.some((re) => re.test(rel))) {
    return {
      decision: "ask",
      rel,
      why:
        "függőségleíró — új vagy frissített függőség csak a fejlesztő jóváhagyásával " +
        "kerülhet be. Ha nem függőséget módosítasz (pl. scriptet), írd le, mit és miért.",
    };
  }
  return null;
}

/** A Write-módok profiljai: melyik engedélylista és kell-e függőség-ask. */
const WRITE_PROFILES = {
  impl: {},
  e2e: { roots: E2E_WRITE_ROOTS, rootsWhy: E2E_DENY_WHY },
  unit: { roots: UNIT_TEST_WRITE_ROOTS, rootsWhy: UNIT_TEST_DENY_WHY, checkDeps: false },
  docs: { roots: DOCS_WRITE_ROOTS, rootsWhy: DOCS_DENY_WHY, checkDeps: false },
};

function guardWriteTool(input, profile) {
  const filePath =
    input?.tool_input?.file_path ??
    input?.tool_input?.notebook_path ??
    input?.tool_input?.path;
  if (!filePath) return decide("defer");

  const v = writeVerdict(filePath, undefined, WRITE_PROFILES[profile]);
  if (!v) return decide("defer");
  if (v.decision === "deny") return decide("deny", `Írás megtagadva: \`${v.rel}\` — ${v.why}`);
  return decide("ask", `Függőségleíró írása: \`${v.rel}\` — ${v.why}`);
}

// --- Parancssor-tokenizáló --------------------------------------------------
//
// Egy állapotgép, három nyelvjárással. Csak idézőjelen KÍVÜL darabol (`;`, `&&`,
// `||`, `|`, `&`, `(`, `)`, újsor), az átirányításokat külön gyűjti (`2>&1` és
// `&>/dev/null` így nem „&” és nem „>” többé), és a parancsbehelyettesítések
// törzsét külön vizsgálandó forrásként adja vissza.

const SH = { name: "sh", bsEscape: true, tick: "subst", squote: true, dollarParen: true, heredoc: true, braceBlock: false, caret: false };
const PS = { name: "ps", bsEscape: false, tick: "escape", squote: true, dollarParen: true, heredoc: false, braceBlock: true, caret: false };
const CMD = { name: "cmd", bsEscape: false, tick: "literal", squote: false, dollarParen: false, heredoc: false, braceBlock: false, caret: true };

// Idézőjelen kívül ezek előtt a `\` escape; minden más előtt literál marad, hogy a
// Windows-útvonal (`C:\Users\x`) ne essen szét.
const SH_SPECIAL = " \t'\"\\$`;&|<>(){}*?[]#~!";
const WORD_END = /[\s;&|<>()]/;

/** Dupla idézőjeles szakasz átugrása; a záró `"` utáni indexet adja. */
function skipDq(src, i, d) {
  while (i < src.length) {
    const c = src[i];
    if (d.bsEscape && c === "\\") { i += 2; continue; }
    if (d.tick === "escape" && c === "`") { i += 2; continue; }
    if (c === '"') return i + 1;
    if (d.dollarParen && c === "$" && src[i + 1] === "(") { i = scanBalanced(src, i + 2, "(", ")", d) + 1; continue; }
    i += 1;
  }
  return src.length;
}

const ANSI_C_SIMPLE = { a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\", "'": "'", '"': '"', "?": "?" };

/**
 * Bash ANSI-C idézés (`$'…'`) a nyitó `$'` UTÁNI indextől: a dekódolt szöveg és a
 * záró `'` utáni index. Escape-ek: `\'`, `\\`, `\n` és társai, `\xHH`, `\NNN`
 * (oktális), `\uHHHH`, `\UHHHHHHHH`, `\cX`; az ismeretlen escape szó szerint marad.
 * Enélkül a `git $'commit'` fej- vagy alparancs-szava `$commit` lenne.
 */
function readAnsiC(src, j) {
  let s = "";
  while (j < src.length) {
    const c = src[j];
    if (c === "'") return { s, j: j + 1 };
    if (c !== "\\" || j + 1 >= src.length) { s += c; j += 1; continue; }
    const nx = src[j + 1];
    if (Object.hasOwn(ANSI_C_SIMPLE, nx)) { s += ANSI_C_SIMPLE[nx]; j += 2; continue; }
    let m = /^[0-7]{1,3}/.exec(src.slice(j + 1, j + 4));
    if (m) { s += String.fromCharCode(parseInt(m[0], 8) & 0xff); j += 1 + m[0].length; continue; }
    if (nx === "x" || nx === "u" || nx === "U") {
      const max = nx === "x" ? 2 : nx === "u" ? 4 : 8;
      m = new RegExp(`^[0-9a-fA-F]{1,${max}}`).exec(src.slice(j + 2, j + 2 + max));
      if (m) {
        const cp = parseInt(m[0], 16);
        s += cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
        j += 2 + m[0].length;
        continue;
      }
    }
    if (nx === "c" && j + 2 < src.length) { s += String.fromCharCode(src.charCodeAt(j + 2) & 0x1f); j += 3; continue; }
    s += c + nx;
    j += 2;
  }
  return { s, j: src.length };
}

/** A nyitó jel UTÁNI indextől a párja indexe (idézőjel-tudatosan), vagy a vég. */
function scanBalanced(src, i, open, close, d) {
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (d.bsEscape && c === "\\") { i += 2; continue; }
    if (d.name === "sh" && c === "$" && src[i + 1] === "'") { i = readAnsiC(src, i + 2).j; continue; }
    if (d.tick === "escape" && c === "`") { i += 2; continue; }
    if (d.squote && c === "'") { const j = src.indexOf("'", i + 1); i = j < 0 ? src.length : j + 1; continue; }
    if (c === '"') { i = skipDq(src, i + 1, d); continue; }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return src.length;
}

/** A következő nem escape-elt backtick indexe, vagy a vég. */
function findTick(src, i) {
  while (i < src.length) {
    if (src[i] === "\\") { i += 2; continue; }
    if (src[i] === "`") return i;
    i += 1;
  }
  return src.length;
}

/** A heredoc-törzsben lévő `$(…)` és backtick (idézetlen határolónál ezek lefutnak). */
function substitutionsIn(body) {
  const out = [];
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "\\") { i += 1; continue; }
    if (body[i] === "$" && body[i + 1] === "(") {
      const j = scanBalanced(body, i + 2, "(", ")", SH);
      out.push(body.slice(i + 2, j));
      i = j;
    } else if (body[i] === "`") {
      const j = findTick(body, i + 1);
      out.push(body.slice(i + 1, j));
      i = j;
    }
  }
  return out;
}

/**
 * Egy parancssor egyszerű parancsokra bontása.
 * Visszaad: { commands: [{ words, redirs, raw, call }], nested: [{ src, d }] }
 *   words  — a szavak idézőjel nélküli szövege
 *   redirs — [{ op, write, target }] — a célpont idézőjel nélkül
 *   call   — PowerShell-nél: a parancsot közvetlenül `(` zárta (metódushívás)
 */
function parseLine(src, d) {
  const commands = [];
  const nested = [];
  const n = src.length;
  let words = [];
  let redirs = [];
  let cur = null;
  let pending = null;
  let heredocs = [];
  let cmdStart = 0;
  let i = 0;

  const add = (s, quoted = false) => {
    if (!cur) cur = { text: "", quoted: false };
    cur.text += s;
    if (quoted) cur.quoted = true;
  };
  const endWord = () => {
    if (!cur) return;
    if (pending) {
      pending.target = cur.text;
      redirs.push(pending);
      pending = null;
    } else {
      words.push(cur.text);
    }
    cur = null;
  };
  const endCommand = (at, call = false) => {
    endWord();
    if (pending) {
      redirs.push(pending); // célpont nélküli átirányítás
      pending = null;
    }
    const raw = src.slice(cmdStart, at).trim();
    if (words.length || redirs.length) commands.push({ words, redirs, raw, call });
    words = [];
    redirs = [];
  };
  const substitution = (from, to, body) => {
    nested.push({ src: body, d });
    add(src.slice(from, to));
  };

  const readDq = (j) => {
    let s = "";
    while (j < n) {
      const c = src[j];
      if (c === '"') {
        if (d.name === "ps" && src[j + 1] === '"') { s += '"'; j += 2; continue; }
        j += 1;
        break;
      }
      if (d.bsEscape && c === "\\" && j + 1 < n && '$`"\\\n'.includes(src[j + 1])) {
        if (src[j + 1] !== "\n") s += src[j + 1];
        j += 2;
        continue;
      }
      if (d.tick === "escape" && c === "`" && j + 1 < n) { s += src[j + 1]; j += 2; continue; }
      if (d.tick === "subst" && c === "`") {
        const k = findTick(src, j + 1);
        nested.push({ src: src.slice(j + 1, k).replace(/\\([`\\$])/g, "$1"), d });
        s += src.slice(j, k + 1);
        j = k + 1;
        continue;
      }
      if (d.dollarParen && c === "$" && src[j + 1] === "(") {
        const k = scanBalanced(src, j + 2, "(", ")", d);
        if (!(d.name === "sh" && src[j + 2] === "(")) nested.push({ src: src.slice(j + 2, k), d });
        s += src.slice(j, k + 1);
        j = k + 1;
        continue;
      }
      s += c;
      j += 1;
    }
    add(s, true);
    return j;
  };

  const skipHeredocs = (j) => {
    for (const h of heredocs) {
      const body = [];
      while (j < n) {
        const e = src.indexOf("\n", j);
        const line = src.slice(j, e < 0 ? n : e);
        j = e < 0 ? n : e + 1;
        if ((h.strip ? line.replace(/^\t+/, "") : line).replace(/\r$/, "") === h.delim) break;
        body.push(line);
      }
      if (!h.quoted) for (const s of substitutionsIn(body.join("\n"))) nested.push({ src: s, d });
    }
    heredocs = [];
    return j;
  };

  const readRedirect = (j) => {
    let fd = null;
    if (cur && !cur.quoted && /^(\d+|\*)$/.test(cur.text)) {
      fd = cur.text;
      cur = null;
    } else {
      endWord();
    }
    const c = src[j];
    if (c === "<") {
      if (d.heredoc && src[j + 1] === "<") {
        if (src[j + 2] === "<") { pending = { op: "<<<", write: false, fd }; return j + 3; }
        let k = j + 2;
        let strip = false;
        if (src[k] === "-") { strip = true; k += 1; }
        while (src[k] === " " || src[k] === "\t") k += 1;
        let delim = "";
        let quoted = false;
        while (k < n && !WORD_END.test(src[k])) {
          if (src[k] === "'" || src[k] === '"') {
            quoted = true;
            const q = src[k];
            const e = src.indexOf(q, k + 1);
            delim += src.slice(k + 1, e < 0 ? n : e);
            k = e < 0 ? n : e + 1;
            continue;
          }
          if (src[k] === "\\") { quoted = true; k += 1; continue; }
          delim += src[k];
          k += 1;
        }
        heredocs.push({ delim, strip, quoted });
        return k;
      }
      if (d.name === "sh" && src[j + 1] === "(") {
        const k = scanBalanced(src, j + 2, "(", ")", d);
        substitution(j, k + 1, src.slice(j + 2, k));
        return k + 1;
      }
      if (src[j + 1] === "&") {
        let k = j + 2;
        while (k < n && /[0-9-]/.test(src[k])) k += 1;
        return k;
      }
      if (src[j + 1] === ">") { pending = { op: "<>", write: true, fd }; return j + 2; }
      pending = { op: "<", write: false, fd };
      return j + 1;
    }
    // '>'
    if (d.name === "sh" && src[j + 1] === "(") {
      const k = scanBalanced(src, j + 2, "(", ")", d);
      substitution(j, k + 1, src.slice(j + 2, k));
      return k + 1;
    }
    let k = j + 1;
    let op = ">";
    if (src[k] === ">") { op = ">>"; k += 1; }
    else if (src[k] === "|") { op = ">|"; k += 1; }
    if (src[k] === "&") {
      // `>&N`, `>&-`: fd-duplikálás / lezárás — nem fájlírás.
      const m = /^(\d+|-)(?=$|[\s;&|()<>])/.exec(src.slice(k + 1));
      if (m) return k + 1 + m[0].length;
      // `>&fájl`: mindkét kimenet a fájlba.
      pending = { op: op + "&", write: true, fd };
      return k + 1;
    }
    pending = { op, write: true, fd };
    return k;
  };

  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r") { endWord(); i += 1; continue; }
    if (c === "\n") {
      endCommand(i);
      i += 1;
      if (heredocs.length) i = skipHeredocs(i);
      cmdStart = i;
      continue;
    }
    if (d.name === "ps" && c === "<" && src[i + 1] === "#") {
      const e = src.indexOf("#>", i + 2);
      endWord();
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === "#" && !cur && d.name !== "cmd") {
      const e = src.indexOf("\n", i);
      i = e < 0 ? n : e;
      continue;
    }
    // Bash: `$'…'` ANSI-C idézés, `$"…"` lokalizált szöveg (mint a `"…"`).
    if (d.name === "sh" && c === "$" && src[i + 1] === "'") {
      const r = readAnsiC(src, i + 2);
      add(r.s, true);
      i = r.j;
      continue;
    }
    if (d.name === "sh" && c === "$" && src[i + 1] === '"') { i = readDq(i + 2); continue; }
    if (d.squote && c === "'") {
      let j = i + 1;
      let s = "";
      while (j < n) {
        if (src[j] === "'") {
          if (d.name === "ps" && src[j + 1] === "'") { s += "'"; j += 2; continue; }
          break;
        }
        s += src[j];
        j += 1;
      }
      add(s, true);
      i = j + 1;
      continue;
    }
    if (c === '"') { i = readDq(i + 1); continue; }
    if (d.bsEscape && c === "\\") {
      const nx = src[i + 1];
      if (nx === "\n") { i += 2; continue; }
      if (nx !== undefined && SH_SPECIAL.includes(nx)) { add(nx, true); i += 2; continue; }
      add("\\");
      i += 1;
      continue;
    }
    if (d.tick === "escape" && c === "`") {
      if (src[i + 1] === "\n") { i += 2; continue; }
      if (src[i + 1] !== undefined) add(src[i + 1], true);
      i += 2;
      continue;
    }
    if (d.caret && c === "^") {
      if (src[i + 1] !== undefined) add(src[i + 1], true);
      i += 2;
      continue;
    }
    if (d.tick === "subst" && c === "`") {
      const j = findTick(src, i + 1);
      nested.push({ src: src.slice(i + 1, j).replace(/\\([`\\$])/g, "$1"), d });
      add(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (c === "$" && src[i + 1] === "{") {
      const e = src.indexOf("}", i);
      const end = e < 0 ? n : e + 1;
      add(src.slice(i, end));
      i = end;
      continue;
    }
    if (d.dollarParen && (c === "$" || (d.name === "ps" && c === "@")) && src[i + 1] === "(") {
      const j = scanBalanced(src, i + 2, "(", ")", d);
      if (d.name === "sh" && src[i + 2] === "(") add(src.slice(i, j + 1)); // $(( aritmetika ))
      else substitution(i, j + 1, src.slice(i + 2, j));
      i = j + 1;
      continue;
    }
    if (d.braceBlock && c === "{") {
      // PowerShell szkriptblokk: a törzse kód, külön vizsgálandó.
      const j = scanBalanced(src, i + 1, "{", "}", d);
      substitution(i, j + 1, src.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    if (c === ";") { endCommand(i); i += 1; cmdStart = i; continue; }
    if (c === "|") {
      endCommand(i);
      i += src[i + 1] === "|" || src[i + 1] === "&" ? 2 : 1;
      cmdStart = i;
      continue;
    }
    if (c === "&") {
      if (src[i + 1] === "&") { endCommand(i); i += 2; cmdStart = i; continue; }
      if (src[i + 1] === ">" && d.name !== "cmd") {
        endWord();
        const app = src[i + 2] === ">";
        pending = { op: app ? "&>>" : "&>", write: true, fd: null };
        i += app ? 3 : 2;
        continue;
      }
      endCommand(i); // háttérbe küldés, ill. a PowerShell `&` hívóoperátora
      i += 1;
      cmdStart = i;
      continue;
    }
    if (c === "(") {
      const call = cur !== null;
      endCommand(i, call);
      i += 1;
      cmdStart = i;
      continue;
    }
    if (c === ")") { endCommand(i); i += 1; cmdStart = i; continue; }
    if (c === ">" || c === "<") { i = readRedirect(i); continue; }
    add(c);
    i += 1;
  }
  endCommand(n);
  return { commands, nested };
}

// --- Parancsfej és burkolók -------------------------------------------------

/**
 * A parancsfej kanonikus neve: idézőjel (már a tokenizáló levette), vezető `\`,
 * könyvtárrész, `.exe|.cmd|.bat|.ps1|.com` kiterjesztés le; kisbetű; `mvnw` → `mvn`.
 */
function normHead(t) {
  let s = String(t ?? "").replace(/^\\+/, "");
  s = s.replace(/^.*[\\/]/, "").toLowerCase();
  s = s.replace(/\.(exe|cmd|bat|ps1|com)$/, "");
  if (s === "mvnw") s = "mvn";
  if (/^python\d+(\.\d+)*$/.test(s)) s = "python";
  if (/^pip\d+(\.\d+)*$/.test(s)) s = "pip";
  return s;
}

/** Szavak újra-összefűzése egy újraelemzendő törzshöz (a szóközös szót idézve). */
function joinArgs(args) {
  return args.map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
}

/** Az első nem-kapcsoló indexe; `valueOpts` kapcsolói a következő tokent is elnyelik. */
function skipOptions(args, from, valueOpts = new Set()) {
  let i = from;
  while (i < args.length) {
    const t = args[i];
    if (t === "--") return i + 1;
    if (!t.startsWith("-") || t === "-") return i;
    i += valueOpts.has(t) ? 2 : 1;
  }
  return i;
}

// A parancs elé írható, önmagában ártalmatlan előtagok. Ezek nélkül egy `then`,
// `!`, `sudo` vagy `FOO=1` előtag kisétáltatná a tiltott parancsot.
const KEYWORD_PREFIX = new Set(["!", "{", "then", "do", "else", "elif", "if", "while", "until", "elseif", "try", "finally", "catch", "switch"]);
// Szerkezeti sorok, amelyek önmagukban nem futtatnak semmit.
const STRUCTURAL_WHOLE = new Set(["for", "foreach", "case", "select", "function", "in"]);
const STRUCTURAL_END = new Set(["fi", "done", "esac", "}", ";;"]);

const WRAPPERS = {
  sudo: new Set(["-u", "-g", "-p", "-C", "-D", "-h", "-r", "-t", "-U", "-T", "--user", "--group", "--prompt", "--chdir", "--host", "--role", "--type", "--other-user"]),
  doas: new Set(["-u", "-C"]),
  nice: new Set(["-n", "--adjustment"]),
  nohup: new Set(),
  builtin: new Set(),
  exec: new Set(["-a"]),
  time: new Set(),
  corepack: null, // csak maga a szó: utána a csomagkezelő jön
  xargs: new Set(["-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s", "--arg-file", "--delimiter", "--eof", "--replace", "--max-lines", "--max-args", "--max-procs", "--max-chars"]),
  stdbuf: new Set(["-i", "-o", "-e", "--input", "--output", "--error"]),
  winpty: new Set(),
  noglob: new Set(),
  nocorrect: new Set(),
  setsid: new Set(),
  ionice: new Set(["-c", "-n", "-p", "-P", "-u", "--class", "--classdata", "--pid", "--pgid", "--uid"]),
  chronic: new Set(),
  unbuffer: new Set(),
  // `flock` és `watch`: külön ágon (zárfájl, ill. shell-törzs), lásd `unwrap`.
};
const FLOCK_ARG = new Set(["-w", "--timeout", "-E", "--conflict-exit-code"]);
const WATCH_ARG = new Set(["-n", "--interval", "-q", "--equexit"]);

const BASH_LIKE = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "mksh"]);
const POWERSHELL = new Set(["powershell", "pwsh"]);
const PS_ARG_OPTS = /^-(executionpolicy|ep|ex|windowstyle|w|inputformat|if|outputformat|of|configurationname|workingdirectory|wd|settingsfile|custompipename)$/i;

/**
 * Egy egyszerű parancs burkolóinak lehántása és a beágyazott törzsek sorba állítása.
 * Visszaad: szegmens `{ argv, redirs, raw, d, call, ask? }` vagy `null`.
 */
function unwrap(cmd, d, queue) {
  let argv = [...cmd.words];
  // env: a parancs elé írt környezeti értékadások nevei (`FOO=1 x`, `env FOO=1 x`,
  // PowerShell `$env:FOO = 1`); extraTargets: a burkoló saját írási célja (`flock`).
  const seg = { argv: [], redirs: cmd.redirs, raw: cmd.raw, d, call: cmd.call, env: [], extraTargets: [] };
  const ASSIGN = /^([A-Za-z_][A-Za-z0-9_]*)\+?=/;

  for (let guard = 0; guard < 30 && argv.length > 0; guard += 1) {
    const h = normHead(argv[0]);

    if (KEYWORD_PREFIX.has(h)) { argv.shift(); continue; }
    if (STRUCTURAL_WHOLE.has(h)) { argv = []; break; }
    if (ASSIGN.test(argv[0]) && d.name !== "ps") { seg.env.push(ASSIGN.exec(argv[0])[1]); argv.shift(); continue; }
    if (d.name === "ps") {
      // `$env:X = 1` (három token) és `$env:X='1'` (egy token).
      const spaced = /^\$env:([A-Za-z_]\w*)$/i.exec(argv[0]);
      if (spaced && /^[-+*/]?=$/.test(argv[1] ?? "")) seg.env.push(spaced[1]);
      const glued = /^\$env:([A-Za-z_]\w*)[-+*/]?=/i.exec(argv[0]);
      if (glued) { seg.env.push(glued[1]); argv = argv.slice(1); continue; }
    }
    if (d.name === "ps" && /^\$/.test(argv[0]) && /^[-+*/]?=$/.test(argv[1] ?? "")) { argv = argv.slice(2); continue; }

    if (h === "env") {
      let k = 1;
      while (k < argv.length) {
        const t = argv[k];
        if (t === "-u" || t === "-C" || t === "--unset" || t === "--chdir") { k += 2; continue; }
        if (t === "-S" || t === "--split-string") { if (argv[k + 1]) queue.push({ src: argv[k + 1], d: SH }); k += 2; continue; }
        if (t.startsWith("--split-string=")) { queue.push({ src: t.slice(15), d: SH }); k += 1; continue; }
        if (ASSIGN.test(t)) { seg.env.push(ASSIGN.exec(t)[1]); k += 1; continue; }
        if (t.startsWith("-")) { k += 1; continue; }
        break;
      }
      argv = argv.slice(k);
      continue;
    }
    if (h === "flock") {
      // `flock [opciók] <fájl|fd> parancs …` vagy `flock <fájl> -c '<törzs>'`.
      const k = skipOptions(argv, 1, FLOCK_ARG);
      const lock = argv[k];
      if (lock === undefined) { argv = ["flock"]; break; }
      if (!/^\d+$/.test(lock)) seg.extraTargets.push({ path: lock, how: "`flock` (zárfájl)" });
      const rest = argv.slice(k + 1);
      if (rest[0] === "-c" || rest[0] === "--command") {
        if (rest[1]) queue.push({ src: rest[1], d: SH });
        argv = [];
        break;
      }
      argv = rest;
      continue;
    }
    if (h === "watch") {
      // A `watch` SOHA nem lép ki magától — a readonly mód ezért kérdez rá. `-x`
      // nélkül a maradékot `sh -c`-vel futtatja: az egy shell-törzs.
      seg.neverExits = "`watch` — soha ki nem lépő ismétlés";
      const k = skipOptions(argv, 1, WATCH_ARG);
      const exec = argv.slice(1, k).some((t) => t === "--exec" || (/^-[A-Za-z]*x/.test(t) && !t.startsWith("--")));
      if (exec) { argv = argv.slice(k); continue; }
      if (argv.length > k) queue.push({ src: argv.slice(k).join(" "), d: SH });
      argv = [];
      break;
    }
    if (h === "command") {
      const k = skipOptions(argv, 1);
      if (argv.slice(1, k).some((t) => /^-[a-z]*[vV]/.test(t))) {
        argv = ["which", ...argv.slice(k)]; // `command -v x`: csak keresés
        break;
      }
      argv = argv.slice(k);
      continue;
    }
    if (h === "timeout") {
      const k = skipOptions(argv, 1, new Set(["-s", "-k", "--signal", "--kill-after"]));
      if (/^\d+(\.\d+)?[smhd]?$/.test(argv[k] ?? "")) { argv = argv.slice(k + 1); continue; }
      break;
    }
    if (Object.hasOwn(WRAPPERS, h)) {
      const opts = WRAPPERS[h];
      argv = opts === null ? argv.slice(1) : argv.slice(skipOptions(argv, 1, opts));
      continue;
    }
    if (h === "eval") {
      if (argv.length > 1) queue.push({ src: argv.slice(1).join(" "), d: SH });
      argv = [];
      break;
    }
    if (h === "iex" || h === "invoke-expression") {
      const rest = argv.slice(1).filter((t) => !/^-c(o(m(m(a(n(d)?)?)?)?)?)?:?$/i.test(t));
      if (rest.length) queue.push({ src: rest.join(" "), d: PS });
      argv = [];
      break;
    }
    break;
  }

  if (argv.length === 1 && STRUCTURAL_END.has(argv[0].toLowerCase())) argv = [];
  if (argv.length === 0) return seg.redirs.length || seg.env.length || seg.extraTargets.length || seg.neverExits ? seg : null;

  const h = normHead(argv[0]);
  seg.argv = [h, ...argv.slice(1)];
  seg.rawHead = argv[0];
  const args = argv.slice(1);

  // Értelmezők: a futtatott törzs ÖNÁLLÓ szegmens, különben a burkolat neve alapján
  // ítélnénk meg a benne futó parancsot. A külső szegmens is marad.
  if (BASH_LIKE.has(h)) {
    const ci = args.findIndex((t) => /^-[A-Za-z]*c[A-Za-z]*$/.test(t));
    if (ci >= 0) {
      const body = args.slice(ci + 1).find((t) => !/^[-+]/.test(t));
      if (body) queue.push({ src: body, d: SH });
    }
  } else if (h === "cmd") {
    const ci = args.findIndex((t) => /^\/[ck]$/i.test(t));
    if (ci >= 0 && args.length > ci + 1) queue.push({ src: args.slice(ci + 1).join(" "), d: CMD });
  } else if (POWERSHELL.has(h)) {
    for (let k = 0; k < args.length; k += 1) {
      const t = args[k];
      if (/^-c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(t)) {
        if (args.length > k + 1) queue.push({ src: args.slice(k + 1).join(" "), d: PS });
        break;
      }
      if (/^-(e|ec|en|enc|encodedcommand)$/i.test(t)) {
        try {
          queue.push({ src: Buffer.from(args[k + 1] ?? "", "base64").toString("utf16le"), d: PS });
        } catch {
          seg.ask = "kódolt PowerShell-parancs";
        }
        break;
      }
      if (/^-f(i(l(e)?)?)?$/i.test(t)) break; // szkriptfájl: nem látunk bele
      if (t.startsWith("-")) { if (PS_ARG_OPTS.test(t)) k += 1; continue; }
      // A Windows PowerShell (5.1) alapból -Command-ként veszi a pozicionális részt.
      if (h === "powershell") queue.push({ src: args.slice(k).join(" "), d: PS });
      break;
    }
  } else if (h === "find") {
    for (let k = 0; k < args.length; k += 1) {
      if (!/^-(exec|execdir|ok|okdir)$/.test(args[k])) continue;
      const body = [];
      let e = k + 1;
      while (e < args.length && args[e] !== ";" && args[e] !== "+") body.push(args[e++]);
      if (body.length) queue.push({ src: joinArgs(body), d: SH });
      k = e;
    }
  }

  if (h === "start-process" || h === "saps" || h === "start") {
    seg.ask = "folyamatindítás (`Start-Process`) — a futtatott parancs és argumentumai nem vizsgálhatók";
  }
  return seg;
}

/** `cd`/`Set-Location` célja (a parancssoron belüli munkakönyvtár követéséhez). */
function cdTarget(argv) {
  const [h, ...a] = argv;
  if (h === "cd" || h === "pushd" || h === "chdir") {
    const pos = a.filter((t) => !/^-[LPe@]*$/.test(t));
    return pos.length === 1 && pos[0] !== "-" ? pos[0] : null;
  }
  if (h === "set-location" || h === "sl" || h === "push-location") {
    for (let k = 0; k < a.length; k += 1) {
      if (/^-(path|literalpath|lp|pspath)$/i.test(a[k])) return a[k + 1] ?? null;
      if (!a[k].startsWith("-")) return a[k];
    }
  }
  return null;
}

/**
 * A parancssor összes vizsgálandó szegmense, sorrendben, a mindenkori
 * munkakönyvtárral. A beágyazott törzseket (behelyettesítés, `bash -c`, `eval`…)
 * egy sor dolgozza fel. A korlát a feldolgozott parancsTÖRZSEK száma (a fő sorral
 * együtt), nem a beágyazás mélysége: 64 egymás melletti `$(…)` ugyanúgy kimeríti,
 * mint 64 egymásba ágyazott. Ha elfogy, azt jelezzük (`bodies` = az összes ismert
 * törzs, a fel nem dolgozottakkal együtt).
 */
const MAX_BODIES = 64;

function analyze(command, dialect, base) {
  const out = [];
  const queue = [{ src: String(command ?? ""), d: dialect, cwd: base }];
  let rounds = 0;
  while (queue.length > 0 && rounds < MAX_BODIES) {
    rounds += 1;
    const item = queue.shift();
    let cwd = item.cwd ?? base;
    const { commands, nested } = parseLine(item.src, item.d);
    for (const nd of nested) queue.push({ ...nd, cwd });
    for (const cmd of commands) {
      const inner = [];
      const seg = unwrap(cmd, item.d, inner);
      for (const q of inner) queue.push({ ...q, cwd });
      if (!seg) continue;
      seg.cwd = cwd;
      out.push(seg);
      const to = cdTarget(seg.argv);
      if (to) cwd = canonical(to, cwd);
    }
  }
  return { segs: out, truncated: queue.length > 0, bodies: rounds + queue.length };
}

// --- Bármelyik Bash-módban tiltott -------------------------------------------
//
// A lánc nem kommitol és nem telepít függőséget. A szabályok a tokenizált argv-n
// futnak: az opció-argumentum (`git -C "D:/AI related" commit`) egyetlen token,
// így nem tud egy szót „lenyelni” a vizsgálat elől.

/**
 * Az alparancs-jelöltek: az első pozicionális token. Ismeretlen kapcsoló után a
 * következő token értékként és alparancsként is jelölt — a régi minta
 * (`(?:-…(?:\s+érték)?\s+)*`) szemantikája, hogy egy beszúrt `--foo bar` ne
 * sétáltassa ki a tiltott alparancsot.
 */
function subcommandCandidates(args, argOpts) {
  const cands = [];
  for (let i = 0; i < args.length; i += 1) {
    const t = args[i];
    if (t === "--") {
      if (args[i + 1] !== undefined) cands.push(args[i + 1]);
      break;
    }
    if (t.startsWith("-") && t !== "-") {
      if (t.includes("=")) continue;
      if (argOpts.has(t)) { i += 1; continue; }
      const nx = args[i + 1];
      if (nx !== undefined && !nx.startsWith("-")) { cands.push(nx); i += 1; }
      continue;
    }
    cands.push(t);
    break;
  }
  return cands.map((c) => c.toLowerCase());
}

const GIT_GLOBAL_ARG = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix", "--attr-source", "--list-cmds"]);

/** A git saját (alparancs előtti) kapcsolói, az alparancs és a maradék. */
function parseGit(args) {
  const globals = [];
  const configs = [];
  let i = 0;
  while (i < args.length) {
    const t = args[i];
    if (!t.startsWith("-") || t === "-") break;
    const eq = t.indexOf("=");
    if (eq < 0 && GIT_GLOBAL_ARG.has(t)) {
      globals.push({ name: t, value: args[i + 1] });
      if (t === "-c" || t === "--config-env") configs.push(args[i + 1] ?? "");
      i += 2;
      continue;
    }
    const name = eq > 0 ? t.slice(0, eq) : t;
    globals.push({ name, value: eq > 0 ? t.slice(eq + 1) : null });
    if (name === "--config-env") configs.push(t.slice(eq + 1));
    i += 1;
  }
  return { globals, configs, sub: args[i]?.toLowerCase() ?? null, rest: args.slice(i + 1) };
}

const GIT_DENY = new Set([
  "commit", "push", "add", "reset", "checkout", "restore", "switch", "rebase", "merge", "clean", "rm",
  "mv", "tag", "cherry-pick", "pull", "revert", "apply", "am", "init", "notes", "update-index",
]);
const GIT_REF_DENY = new Set(["update-ref", "gc", "prune", "filter-branch", "replace"]);
const GIT_BRANCH_MODIFY = /^(-d|-D|--delete|-m|-M|--move|-c|-C|--copy|-f|--force|--set-upstream-to(=.*)?|-u|--unset-upstream|--edit-description|-t|--track(=.*)?|--no-track|--create-reflog|--recurse-submodules)$/;
const GIT_BRANCH_ARG = new Set(["--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "--format", "--sort"]);
const GIT_CONFIG_READ = new Set(["--get", "--get-all", "--get-regexp", "--list", "-l", "--get-urlmatch"]);

/** `git branch` argumentumai új ágat hoznak-e létre / módosítanak-e. */
function gitBranchModifies(rest) {
  const listing = rest.some((t) => t === "--list" || t === "-l" || t === "--show-current");
  for (let k = 0; k < rest.length; k += 1) {
    const t = rest[k];
    if (GIT_BRANCH_MODIFY.test(t)) return true;
    if (GIT_BRANCH_ARG.has(t)) {
      if (rest[k + 1] !== undefined && !rest[k + 1].startsWith("-")) k += 1;
      continue;
    }
    if (!t.startsWith("-") && !listing) return true; // `git branch <új-név>`
  }
  return false;
}

const WHY_GIT = "a spec-lánc nem módosítja a git-állapotot — a kommitolás a fejlesztő döntése";
const WHY_GIT_REF = "branch-létrehozás, -törlés, -átnevezés, worktree-kezelés és ref-átírás az orchestrátor (vagy a fejlesztő) dolga, nem az agenté";

// Parancsot futtató git-konfigurációs kulcsok. Egy `-c` / `--config-env` velük
// bármelyik — olvasó — git-parancsból kódfuttatást csinál (`git -c core.pager=… log`,
// `git -c core.fsmonitor=… status`), ezért MINDEN módban deny, a readonly-ban is.
// A git a szekció- és kulcsnevet kis-/nagybetű-érzéketlenül kezeli. A felsorolt
// osztályon túl ugyanide tartozik az `include.path` (egy tetszőleges konfigfájlt
// húz be), a `diff.<driver>.command`, a `merge.<driver>.driver`, a `core.gitProxy`,
// a `remote.<n>.uploadpack|receivepack` és a `protocol.*.allow` (az `ext::` transzport).
const GIT_EXEC_CONFIG = /^(core\.(fsmonitor|pager|sshcommand|editor|hookspath|askpass|gitproxy|alternaterefscommand)|diff\.external|.+\.textconv|diff\..+\.command|merge\..+\.driver|filter\..+|credential\.(.+\.)?helper|sequence\.editor|gpg\.(.+\.)?program|pager\..+|include\.path|includeif\..+\.path|remote\..+\.(uploadpack|receivepack)|uploadpack\.packobjectshook|protocol\.(.+\.)?allow)$/i;
const WHY_GIT_EXEC_CONFIG =
  "parancsot futtató git-konfiguráció a parancssorban — a kulcs értéke egy tetszőleges " +
  "parancs, amit a git (olvasó alparancsnál is) lefuttat. Lapozó nélküli kimenethez a " +
  "`git --no-pager …` való";

function gitDeny(args) {
  const { configs, sub, rest } = parseGit(args);
  if (configs.some((c) => /^alias\./i.test(c))) {
    return "git-alias definiálása a parancssorban (`-c alias.…`) — egy alias bármilyen git- vagy shell-parancsot futtathat";
  }
  const bad = configs.find((c) => GIT_EXEC_CONFIG.test(c.split("=")[0].trim()));
  if (bad !== undefined) return `${WHY_GIT_EXEC_CONFIG} (\`${bad.split("=")[0]}\`)`;
  if (!sub) return null;
  if ((sub === "difftool" || sub === "mergetool") && rest.some((t) => /^(-x.*|--extcmd(=.*)?|--tool-cmd(=.*)?)$/.test(t))) {
    return `a \`git ${sub}\` külső parancsot futtatna (\`-x\` / \`--extcmd\`) — tetszőleges kódfuttatás`;
  }
  if (GIT_DENY.has(sub)) return WHY_GIT;
  if (sub === "stash") return rest[0] === "list" || rest[0] === "show" ? null : WHY_GIT;
  if (sub === "config") {
    const reads = rest.some((t) => GIT_CONFIG_READ.has(t)) || rest[0] === "get" || rest[0] === "list";
    return reads ? null : "a git-konfiguráció írása — a lánc nem módosítja a git-állapotot";
  }
  if (sub === "branch") return gitBranchModifies(rest) ? WHY_GIT_REF : null;
  // A `git worktree list` olvasás; minden más alparancsa munkafát hoz létre vagy töröl.
  if (sub === "worktree") return rest[0] && rest[0] !== "list" ? WHY_GIT_REF : null;
  if (GIT_REF_DENY.has(sub)) return WHY_GIT_REF;
  if (sub === "symbolic-ref" && rest.filter((t) => !t.startsWith("-")).length >= 2) return WHY_GIT_REF;
  if (sub === "reflog" && (rest[0] === "expire" || rest[0] === "delete")) return WHY_GIT_REF;
  return null;
}

// Az `npm ci` SZÁNDÉKOSAN nincs a listán. A párhuzamos ág friss worktree-ben
// indul, ahol nincs `node_modules` — enélkül az implementáló nem tudná
// lefuttatni a buildet és a teszteket, azaz nem tudná teljesíteni a saját
// „csak zöld build után jelents készet" szabályát. És a `ci` a lockfile-hoz
// ragaszkodik: nem vesz fel és nem frissít függőséget, tehát nem sérti azt,
// amit ez a szabály véd. Az `npm install` továbbra is tiltott — az igen.
const PM = new Set(["npm", "pnpm", "yarn", "bun"]);
const PM_INSTALL = new Set([
  "i", "in", "ins", "inst", "insta", "instal", "install", "isnt", "isnta", "isntal", "isntall",
  "add", "a", "remove", "rm", "r", "un", "uninstall", "unlink", "update", "up", "upgrade", "udpate",
  "link", "ln", "install-test", "it", "dedupe", "ddp", "import",
]);
const PM_ARG_OPTS = new Set(["--prefix", "-w", "--workspace", "--registry", "--cache", "--userconfig", "--globalconfig", "--loglevel", "--tag", "--scope", "--cwd", "-C", "--dir", "--filter", "-F"]);
const WHY_PM = "nincs új vagy frissített függőség — a `package.json` verziói pinelve vannak (friss worktree-ben `npm ci` a megoldás)";
const WHY_DLX = "csomag letöltése a függőségleíró megkerülésével — csak a lockfájlban szereplő, telepített eszköz futtatható";

function pmDeny(h, args) {
  const cands = subcommandCandidates(args, PM_ARG_OPTS);
  if (cands.some((c) => PM_INSTALL.has(c))) return WHY_PM;
  if (h === "npm" && cands[0] === "pkg" && /^(set|delete)$/i.test(args[args.findIndex((t) => t.toLowerCase() === "pkg") + 1] ?? "")) return WHY_PM;
  // A paraméter nélküli `yarn` (csak kapcsolókkal is) a `yarn install`.
  if (h === "yarn" && cands.length === 0 && !args.some((t) => /^(-v|--version|-h|--help)$/.test(t))) return WHY_PM;
  if ((h === "npm" && (cands[0] === "exec" || cands[0] === "x")) || ((h === "pnpm" || h === "yarn") && cands[0] === "dlx") || (h === "bun" && cands[0] === "x")) return WHY_DLX;
  return null;
}

// A sima `npx tsc`, `npx vitest`, `npx playwright install chromium` a már
// telepített helyi binárist futtatja, ezért marad; a `-y`/`--yes`/`-p`/`--package`
// viszont kifejezetten egy nem telepített csomag letöltését kéri. Csak az `npx`
// SAJÁT, a parancsnév előtti kapcsolóit nézzük: a `npx tsc -p client/tsconfig.json`
// `-p`-je a `tsc`-é, nem csomag-letöltés.
function npxDeny(args) {
  for (let k = 0; k < args.length; k += 1) {
    const t = args[k];
    if (!t.startsWith("-")) return null;
    if (/^(-y|--yes|-p|--package)(=|$)/.test(t)) return WHY_DLX;
  }
  return null;
}

// Maven: a `dependency:tree`/`analyze` olvasó, marad; ezek a célok a helyi repóba
// töltenek le, onnan törölnek, vagy a pom.xml verzióit írják át. Minden
// pozicionális tokent nézünk, mert az opció-argumentum (`-f x`) bárhol állhat.
const MVN_DEP_GOAL = /(^|:)(maven-)?dependency(-plugin)?(:[^:]+)?:(get|copy|copy-dependencies|unpack|unpack-dependencies|purge-local-repository|resolve-plugins|go-offline)$/i;
const MVN_VERSIONS_GOAL = /(^|:)versions(-maven-plugin)?(:[^:]+)?:(?!display-)[\w-]+$/i;

function mvnDeny(args) {
  for (const t of args) {
    if (t.startsWith("-")) continue;
    if (MVN_DEP_GOAL.test(t)) return "Maven-függőség letöltése vagy a helyi repó módosítása — új függőség csak a fejlesztő döntésével kerülhet be";
    if (MVN_VERSIONS_GOAL.test(t)) return "a `versions:*` cél a pom.xml függőségverzióit írja át — csak a `versions:display-*` olvasó";
  }
  return null;
}

const WHY_PIP = "Python-csomag telepítése — a projektnek nincs Python-függősége, és új függőség csak a fejlesztő döntésével kerülhet be";

function pipDeny(h, args) {
  if (h === "pip" || h === "pipx") return subcommandCandidates(args, new Set()).includes("install") ? WHY_PIP : null;
  if (h === "uv") {
    const c = subcommandCandidates(args, new Set());
    if (c[0] === "add") return WHY_PIP;
    if (c[0] === "pip" || c[0] === "tool") {
      const k = args.findIndex((t) => t.toLowerCase() === c[0]);
      return subcommandCandidates(args.slice(k + 1), new Set())[0] === "install" ? WHY_PIP : null;
    }
    return null;
  }
  if (h === "python" || h === "py") {
    for (let k = 0; k < args.length; k += 1) {
      const t = args[k];
      let mod = null;
      if (t === "-m") mod = args[k + 1];
      else if (/^-m./.test(t)) mod = t.slice(2);
      else continue;
      if (!/^pip\d*$/i.test(mod ?? "")) return null;
      const after = args.slice(k + (t === "-m" ? 2 : 1));
      return subcommandCandidates(after, new Set())[0] === "install" ? WHY_PIP : null;
    }
  }
  return null;
}

// Parancsot futtató git-környezeti változók: ugyanaz az osztály, mint a
// `GIT_EXEC_CONFIG` (`GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` és `GIT_CONFIG_PARAMETERS`
// maga a `-c`, környezeti alakban; a `PAGER` a `GIT_PAGER` tartaléka). Az
// értékadást BÁRHOL tiltjuk — parancs előtt (`GIT_PAGER=x git log`, `env …`),
// `export`/`declare -x`/`typeset` alakban, PowerShellben (`$env:GIT_PAGER = …`,
// `Set-Item env:…`) és cmd-ben (`set`, `setx`) —, mert egy exportált változó a
// parancssor későbbi git-hívásait is eléri.
const GIT_EXEC_ENV = /^(GIT_(EXTERNAL_DIFF|PAGER|SSH_COMMAND|SSH|EDITOR|SEQUENCE_EDITOR|ASKPASS|PROXY_COMMAND|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+|CONFIG_GLOBAL|CONFIG_SYSTEM|CONFIG|EXEC_PATH)|PAGER)$/i;
const ENV_EXPORT_HEADS = new Set(["export", "declare", "typeset", "local", "readonly", "set", "setx"]);

/** Parancsot futtató git-környezeti változó beállítása: az indok, vagy `null`. */
function envDeny(seg) {
  const names = [...seg.env];
  const [h, ...a] = seg.argv;
  if (ENV_EXPORT_HEADS.has(h)) {
    for (const t of a) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\+?=/.exec(t);
      if (m) names.push(m[1]);
    }
    if (h === "setx" && a[0] && !a[0].startsWith("/")) names.push(a[0]);
  }
  if (h === "set-item" || h === "si" || h === "new-item" || h === "ni") {
    const { named, pos } = psParams(a, ["path", "literalpath", "value", "name", "itemtype"]);
    const p = named.get("path") ?? named.get("literalpath") ?? pos[0] ?? "";
    const m = /^env:\\?([A-Za-z_]\w*)$/i.exec(p);
    if (m) names.push(m[1]);
  }
  const bad = names.find((nm) => GIT_EXEC_ENV.test(nm));
  return bad
    ? `parancsot futtató git-környezeti változó beállítása (\`${bad}\`) — a git a változó értékét parancsként futtatja. Lapozó nélküli kimenethez a \`git --no-pager …\` való`
    : null;
}

/** Bármelyik Bash-módban tiltott parancs: az indok, vagy `null`. */
function alwaysDeny(argv) {
  const [h, ...args] = argv;
  if (!h) return null;
  if (h === "git") return gitDeny(args);
  if (PM.has(h)) return pmDeny(h, args);
  if (h === "npx") return npxDeny(args);
  if (h === "bunx") return WHY_DLX;
  if (h === "mvn") return mvnDeny(args);
  return pipDeny(h, args);
}

// --- Bash-írási célpontok ----------------------------------------------------

const HARMLESS_TARGETS = new Set(["/dev/null", "$null", "nul", "nul:", "/dev/stdout", "/dev/stderr", "/dev/tty"]);

/** Pozicionális argumentumok; `valueOpts` kapcsolói a következő tokent elnyelik. */
function positionals(args, valueOpts = new Set()) {
  const pos = [];
  const vals = new Map();
  let endOpts = false;
  for (let k = 0; k < args.length; k += 1) {
    const t = args[k];
    if (!endOpts && t === "--") { endOpts = true; continue; }
    if (!endOpts && t.startsWith("-") && t.length > 1) {
      const eq = t.indexOf("=");
      if (eq > 0) {
        vals.set(t.slice(0, eq), t.slice(eq + 1));
      } else if (valueOpts.has(t)) {
        vals.set(t, args[k + 1]);
        k += 1;
      }
      continue;
    }
    pos.push(t);
  }
  return { pos, vals };
}

const PS_SWITCHES = ["force", "append", "nonewline", "noclobber", "recurse", "confirm", "whatif", "passthru", "asbytestream", "verbose", "debug", "container"];

/**
 * PowerShell-paraméterek: nevesített (`-Path x`, `-Path:x`, rövidítve is) és
 * pozicionális. Az ismeretlen nevű paramétert ÉRTÉKET VÁRÓNAK vesszük — így egy
 * `-Value "x"` értéke nem csúszik át célpontnak.
 */
function psParams(args, known) {
  const named = new Map();
  const pos = [];
  for (let k = 0; k < args.length; k += 1) {
    const t = args[k];
    const m = /^-([A-Za-z][\w]*)(?::(.*))?$/.exec(t);
    if (!m) { pos.push(t); continue; }
    const name = m[1].toLowerCase();
    const full = known.find((p) => p.startsWith(name)) ?? name;
    if (m[2] !== undefined) { named.set(full, m[2]); continue; }
    if (!known.includes(full) && PS_SWITCHES.some((s) => s.startsWith(name))) continue;
    named.set(full, args[k + 1]);
    k += 1;
  }
  return { named, pos };
}

function isInPlaceSed(args) {
  return args.some((t) => t === "--in-place" || t.startsWith("--in-place=") || /^-[A-Za-z]*i/.test(t) && !t.startsWith("--"));
}

/**
 * POSIX-stílusú kapcsolók: rövid csoportok (`-rf`, `-tdir`, `-t dir`) és hosszúak
 * (`--x=v`, `--x v`, ha `longValue`-ban van). `valueLetters` betűi értéket várnak.
 * Visszaad: `{ pos, flags, vals }` — a rövid kapcsoló kulcsa a betű, a hosszúé `--név`.
 */
function parseOpts(args, valueLetters = "", longValue = new Set()) {
  const pos = [];
  const flags = new Set();
  const vals = new Map();
  let end = false;
  for (let k = 0; k < args.length; k += 1) {
    const t = args[k];
    if (end || t === "-" || !t.startsWith("-")) { pos.push(t); continue; }
    if (t === "--") { end = true; continue; }
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      const name = eq > 0 ? t.slice(0, eq) : t;
      if (eq > 0) vals.set(name, t.slice(eq + 1));
      else if (longValue.has(name)) { vals.set(name, args[k + 1]); k += 1; }
      else flags.add(name);
      continue;
    }
    const cl = shortCluster(t, valueLetters);
    if (cl.length === 0) { pos.push(t); continue; }
    for (const x of cl) {
      if (x.value === undefined) flags.add(x.letter);
      else if (x.value === null) { vals.set(x.letter, args[k + 1]); k += 1; }
      else vals.set(x.letter, x.value);
    }
  }
  return { pos, flags, vals };
}

/** Egy útvonal utolsó tagja, a záró elválasztók nélkül. */
function baseName(p) {
  const s = toPosix(p).replace(/\/+$/, "");
  return s.slice(s.lastIndexOf("/") + 1);
}

function isDir(p, cwd) {
  const abs = canonical(p, cwd);
  return memo("dir", abs, () => {
    try {
      return statSync(abs, { throwIfNoEntry: false })?.isDirectory() ?? false;
    } catch {
      return false;
    }
  });
}

/** A cél könyvtárként értendő-e: `/`-re vagy `\`-re végződik, `.`/`..`, vagy létező könyvtár. */
function dirLike(dest, cwd) {
  if (/[\\/]$/.test(dest)) return true;
  const b = baseName(dest);
  return b === "." || b === ".." || isDir(dest, cwd);
}

/** `dest/<forrás alapneve>`; a `.`/`..` forrás (`cp -r x/. dest`) a célba magába kerül. */
function intoDir(dest, src) {
  const b = baseName(src);
  if (b === "" || b === "." || b === "..") return dest;
  return `${toPosix(dest).replace(/\/+$/, "")}/${b}`;
}

const COPY_LIKE = {
  cp: { letters: "St", long: new Set(["--target-directory", "--suffix"]) },
  mv: { letters: "St", long: new Set(["--target-directory", "--suffix"]) },
  ln: { letters: "St", long: new Set(["--target-directory", "--suffix"]) },
  install: { letters: "gmoSt", long: new Set(["--target-directory", "--suffix", "--group", "--mode", "--owner", "--strip-program"]) },
};

/**
 * `cp`, `mv`, `ln`, `install`: a cél a MEGLÉVŐ könyvtárba másolt forrás teljes
 * útvonala (`cp a.mjs e2e/` → `e2e/a.mjs`), nem maga a könyvtár — különben az
 * engedélylistás módok minden könyvtárba célzott másolást megtagadnának, a
 * gyökérmintás védelem (`.claude/hooks/x`) pedig nem illeszkedne.
 */
function copyLikeTargets(h, a, cwd) {
  const { pos, flags, vals } = parseOpts(a, COPY_LIKE[h].letters, COPY_LIKE[h].long);
  const how = `\`${h}\``;
  if (h === "install" && (flags.has("d") || flags.has("--directory"))) return pos.map((p) => ({ path: p, how, dir: true }));
  const tdir = vals.get("t") ?? vals.get("--target-directory");
  const noTarget = flags.has("T") || flags.has("--no-target-directory");
  let srcs = [];
  let dest = null;
  let into = false;
  if (tdir) {
    srcs = pos;
    dest = tdir;
    into = true;
  } else if (pos.length >= 2) {
    srcs = pos.slice(0, -1);
    dest = pos[pos.length - 1];
    into = !noTarget && (srcs.length > 1 || dirLike(dest, cwd));
  } else if (h === "ln" && pos.length === 1) {
    srcs = pos; // `ln -s cél`: a link a munkakönyvtárba kerül, a cél alapnevén
    dest = ".";
    into = true;
  } else if (h === "mv") {
    srcs = pos;
  }

  const recursive = h === "mv" || (h === "cp" && ["r", "R", "a", "--recursive", "--archive"].some((f) => flags.has(f)));
  const isTree = (s) => recursive && (/[\\/]\.?$/.test(s) || baseName(s) === "." || baseName(s) === ".." || isDir(s, cwd));
  const out = [];
  if (h === "mv") for (const s of srcs) out.push({ path: s, how, destructive: true });
  if (dest != null) {
    if (into) for (const s of srcs) out.push({ path: intoDir(dest, s), how, tree: isTree(s) });
    else out.push({ path: dest, how, tree: srcs.some(isTree) });
  }
  if (h === "ln") {
    // A link célja a linken ÁT írható (hard linknél ugyanaz a fájl), tehát az is
    // írási célpont. Szimbolikus linknél a link könyvtárához képest értendő.
    const symbolic = flags.has("s") || flags.has("--symbolic");
    for (const s of srcs) {
      const link = canonical(into ? intoDir(dest, s) : dest, cwd);
      const target = canonical(s, symbolic ? dirname(link) : cwd);
      out.push({ path: target, how: "`ln` (a link célja — a linken át írható)", dir: isDir(target, cwd) });
    }
  }
  return out;
}

/** `chmod`/`chown`/`chgrp`: a mód (tulajdonos) utáni összes pozicionális. */
function chmodTargets(h, a) {
  const pos = [];
  let reference = false;
  let end = false;
  const flagRe = h === "chmod" ? /^-[cfvR]+$/ : /^-[cfvRhHLP]+$/;
  for (const t of a) {
    if (!end && t === "--") { end = true; continue; }
    if (!end && t.startsWith("--")) { if (t.startsWith("--reference")) reference = true; continue; }
    if (!end && flagRe.test(t)) continue;
    pos.push(t); // chmod-nál a `-x`, `+w`, `755`, `u=rw` a mód
  }
  return reference ? pos : pos.slice(1);
}

/** `perl -i…` / `-pi`: a szkript utáni fájl-argumentumok, ha helyben szerkeszt. */
function perlInPlaceFiles(a) {
  let inplace = false;
  let script = false;
  let k = 0;
  while (k < a.length) {
    const t = a[k];
    if (t === "--") { k += 1; break; }
    if (!t.startsWith("-") || t === "-") break;
    k += 1;
    if (t.startsWith("--")) continue;
    for (let j = 1; j < t.length; j += 1) {
      const l = t[j];
      if (l === "e" || l === "E") { script = true; if (j + 1 >= t.length) k += 1; break; }
      if (l === "i") { inplace = true; break; } // a csoport maradéka a mentés kiterjesztése
      if ("IMmxdDCV".includes(l)) break; // a csoport maradéka az érték
      if (l === "l" || l === "0") {
        if (l === "0" && t[j + 1] === "x") { j += 1; while (/[0-9a-fA-F]/.test(t[j + 1] ?? "")) j += 1; continue; }
        while (/[0-7]/.test(t[j + 1] ?? "")) j += 1;
      }
    }
  }
  if (!inplace) return [];
  const rest = a.slice(k);
  return script ? rest : rest.slice(1);
}

/** `awk -i inplace` (gawk): a program utáni fájl-argumentumok. */
function awkInPlaceFiles(a) {
  let inplace = false;
  let program = false;
  let k = 0;
  const isInplace = (v) => /^inplace(\.awk)?$/.test(v ?? "");
  while (k < a.length) {
    const t = a[k];
    if (t === "--") { k += 1; break; }
    if (!t.startsWith("-") || t === "-") break;
    k += 1;
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      const name = eq > 0 ? t.slice(0, eq) : t;
      let v = eq > 0 ? t.slice(eq + 1) : undefined;
      if (v === undefined && /^--(include|file|source|assign|field-separator|load|exec)$/.test(name)) { v = a[k]; k += 1; }
      if (name === "--include" && isInplace(v)) inplace = true;
      if (/^--(file|source|exec)$/.test(name)) program = true;
      if (name === "--exec") break;
      continue;
    }
    const l = t[1];
    if (!"fvFieElW".includes(l)) continue;
    let v = t.slice(2);
    if (!v) { v = a[k]; k += 1; }
    if (l === "i" && isInplace(v)) inplace = true;
    if (l === "f" || l === "e" || l === "E") program = true;
    if (l === "E") break;
  }
  if (!inplace) return [];
  const rest = a.slice(k);
  return (program ? rest : rest.slice(1)).filter((t) => !/^[A-Za-z_]\w*=/.test(t));
}

const RSYNC_LONG = new Set([
  "--rsh", "--filter", "--exclude", "--include", "--exclude-from", "--include-from", "--files-from",
  "--temp-dir", "--partial-dir", "--backup-dir", "--log-file", "--compare-dest", "--copy-dest", "--link-dest",
  "--chmod", "--chown", "--rsync-path", "--password-file", "--out-format", "--suffix", "--timeout",
  "--max-size", "--min-size", "--bwlimit", "--port", "--remote-option", "--write-batch", "--read-batch", "--only-write-batch",
]);
/** `host:út`, `user@host:út`, `rsync://…` — nem helyi írás (a `C:/…` meghajtó igen). */
const isRemotePath = (p) => /^rsync:\/\//i.test(p) || (/^[^/\\]+:/.test(p) && !/^[A-Za-z]:([\\/]|$)/.test(p));

function rsyncTargets(a) {
  const { pos, flags, vals } = parseOpts(a, "efTBM", RSYNC_LONG);
  const how = "`rsync`";
  const out = [];
  for (const k of ["--log-file", "--write-batch", "--only-write-batch"]) {
    if (vals.get(k)) out.push({ path: vals.get(k), how });
  }
  if (flags.has("n") || flags.has("--dry-run") || flags.has("--list-only")) return out;
  const dest = pos.length >= 2 ? pos[pos.length - 1] : null;
  if (dest && !isRemotePath(dest)) out.push({ path: dest, how, tree: true });
  return out;
}

const TAR_VALUE = "fCTXbKNgLVHF";
const TAR_LONG = new Set(["--file", "--directory", "--files-from", "--exclude-from", "--exclude", "--newer", "--after-date", "--label", "--format", "--owner", "--group", "--mode", "--mtime", "--suffix", "--transform", "--xform", "--use-compress-program", "--blocking-factor", "--record-size", "--to-command", "--info-script", "--new-volume-script", "--index-file"]);

/** `tar`: kibontásnál a `-C` könyvtár (vagy a munkakönyvtár); archiválásnál a `-f` fájl. */
function tarTargets(a) {
  let mode = null;
  let file = null;
  let dir = null;
  let toStdout = false;
  const letter = (l, v) => {
    if ("xcrutA".includes(l)) mode = l;
    else if (l === "O") toStdout = true;
    else if (l === "f") file = v;
    else if (l === "C") dir = v;
  };
  let k = 0;
  // Régi stílus: `tar xzf a.tar -C dir` — az érték-váró betűk sorban veszik a következő tokeneket.
  if (a[0] && /^[A-Za-z]+$/.test(a[0])) {
    const pending = [];
    for (const l of a[0]) {
      if (TAR_VALUE.includes(l)) pending.push(l);
      else letter(l);
    }
    k = 1;
    for (const l of pending) { letter(l, a[k]); k += 1; }
  }
  for (; k < a.length; k += 1) {
    const t = a[k];
    if (t === "--") break;
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      const name = eq > 0 ? t.slice(0, eq) : t;
      let v = eq > 0 ? t.slice(eq + 1) : undefined;
      if (v === undefined && TAR_LONG.has(name)) { v = a[k + 1]; k += 1; }
      const map = { "--extract": "x", "--get": "x", "--create": "c", "--append": "r", "--update": "u", "--list": "t", "--concatenate": "A", "--catenate": "A", "--to-stdout": "O", "--file": "f", "--directory": "C" };
      if (map[name]) letter(map[name], v);
      continue;
    }
    if (!t.startsWith("-") || t === "-") continue;
    for (const x of shortCluster(t, TAR_VALUE)) {
      if (x.value === undefined) { letter(x.letter); continue; }
      const v = x.value ?? a[k + 1];
      if (x.value === null) k += 1;
      letter(x.letter, v);
    }
  }
  if (mode === "x") return toStdout ? [] : [{ path: dir ?? ".", how: "`tar -x`", tree: true }];
  if (mode && "cruA".includes(mode) && file && file !== "-") return [{ path: file, how: "`tar` (archívum)" }];
  return [];
}

/** `unzip`: a `-d` könyvtár, vagy a munkakönyvtár; listázó/tesztelő alaknál semmi. */
function unzipTargets(a) {
  let dir = null;
  for (let k = 0; k < a.length; k += 1) {
    const t = a[k];
    if (/^-[A-Za-z]*d$/.test(t)) { dir = a[k + 1] ?? null; k += 1; continue; }
    if (/^-[A-Za-z]+$/.test(t) && /[ltpzZ]/.test(t.slice(1))) return [];
    if (t === "-v") return [];
  }
  return [{ path: dir ?? ".", how: "`unzip`", tree: true }];
}

const PATCH_LONG = new Set(["--directory", "--input", "--output", "--strip", "--reject-file", "--prefix", "--basename-prefix", "--suffix", "--fuzz", "--ifdef", "--version-control", "--quoting-style"]);

/**
 * `patch`: a `-o` kimenet, a megnevezett célfájl, és a `-r` reject-fájl. Ha nincs
 * megnevezett célfájl, a módosított fájlokat a diff fejléce adja (a stdin-en) — azt
 * nem látjuk, ezért a `-d` könyvtár (vagy a munkakönyvtár) egésze a célpont.
 */
function patchTargets(a) {
  const { pos, flags, vals } = parseOpts(a, "BdDFioprVYzg", PATCH_LONG);
  if (flags.has("--dry-run")) return [];
  const how = "`patch`";
  const d = vals.get("d") ?? vals.get("--directory");
  const at = (p) => (d ? `${toPosix(d).replace(/\/+$/, "")}/${p}` : p);
  const out = [];
  const rej = vals.get("r") ?? vals.get("--reject-file");
  if (rej && rej !== "-") out.push({ path: at(rej), how });
  const o = vals.get("o") ?? vals.get("--output");
  if (o) {
    if (o !== "-") out.push({ path: at(o), how });
  } else if (pos[0]) {
    out.push({ path: at(pos[0]), how });
  } else {
    out.push({ path: d ?? ".", how: "`patch` (a célfájlokat a diff adja — a parancssorból nem látszanak)", tree: true });
  }
  return out;
}

/** A szegmens írási célpontjai: `[{ path, how, dir?, tree?, destructive? }]`. */
function writeTargets(seg) {
  const out = [...(seg.extraTargets ?? [])];
  for (const r of seg.redirs) {
    if (!r.write || r.target == null) continue;
    if (HARMLESS_TARGETS.has(r.target.toLowerCase())) continue;
    out.push({ path: r.target, how: `átirányítás (\`${r.op}\`)` });
  }
  const [h, ...a] = seg.argv;
  if (!h) return out;
  const cwd = seg.cwd;
  const push = (paths, how, extra = {}) => {
    for (const p of paths) if (p) out.push({ path: p, how, ...extra });
  };

  if (h === "tee") push(positionals(a).pos, "`tee`");
  else if (h === "sed" && isInPlaceSed(a)) {
    const { pos, vals } = positionals(a, new Set(["-e", "-f", "-l", "--expression", "--file", "--line-length"]));
    const scripted = vals.has("-e") || vals.has("-f") || vals.has("--expression") || vals.has("--file");
    push(scripted ? pos : pos.slice(1), "`sed -i`");
  } else if (Object.hasOwn(COPY_LIKE, h)) {
    out.push(...copyLikeTargets(h, a, cwd));
  } else if (h === "mkdir") {
    push(parseOpts(a, "m", new Set(["--mode"])).pos, "`mkdir`", { dir: true });
  } else if (h === "chmod" || h === "chown" || h === "chgrp") {
    push(chmodTargets(h, a), `\`${h}\``);
  } else if (h === "perl") {
    push(perlInPlaceFiles(a), "`perl -i`");
  } else if (h === "awk" || h === "gawk") {
    push(awkInPlaceFiles(a), "`awk -i inplace`");
  } else if (h === "rsync") {
    out.push(...rsyncTargets(a));
  } else if (h === "tar" || h === "bsdtar") {
    out.push(...tarTargets(a));
  } else if (h === "unzip") {
    out.push(...unzipTargets(a));
  } else if (h === "patch") {
    out.push(...patchTargets(a));
  } else if (h === "expand-archive") {
    const { named, pos } = psParams(a, ["path", "literalpath", "destinationpath"]);
    const src = named.get("path") ?? named.get("literalpath");
    push([named.get("destinationpath") ?? (src ? pos[0] : pos[1]) ?? "."], "`Expand-Archive`", { tree: true });
  } else if (h === "touch") {
    push(positionals(a, new Set(["-r", "-d", "-t", "--reference", "--date"])).pos, "`touch`");
  } else if (h === "truncate") {
    push(positionals(a, new Set(["-s", "-r", "--size", "--reference"])).pos, "`truncate`");
  } else if (h === "rm" || h === "rmdir" || h === "unlink") {
    push(positionals(a).pos, `\`${h}\``, { destructive: true });
  } else if (h === "dd") {
    push(a.filter((t) => t.startsWith("of=")).map((t) => t.slice(3)), "`dd of=`");
  } else if (h === "out-file" || h === "tee-object") {
    const { named, pos } = psParams(a, ["filepath", "literalpath", "path", "encoding", "inputobject", "width", "variable"]);
    push([named.get("filepath") ?? named.get("literalpath") ?? named.get("path") ?? pos[0]], `\`${h}\``);
  } else if (["set-content", "add-content", "clear-content", "sc", "ac", "clc"].includes(h)) {
    const { named, pos } = psParams(a, ["path", "literalpath", "value", "encoding", "filter", "include", "exclude", "stream"]);
    push([named.get("path") ?? named.get("literalpath") ?? pos[0]], `\`${h}\``);
  } else if (h === "new-item" || h === "ni") {
    const { named, pos } = psParams(a, ["path", "name", "itemtype", "value", "target"]);
    const p = named.get("path") ?? pos[0];
    const name = named.get("name");
    const link = name ? `${p ?? "."}/${name}` : p;
    if (!/^(env|variable|function|alias):/i.test(link ?? "")) push([link], "`New-Item`");
    // Link (`-ItemType SymbolicLink|Junction|HardLink`): a link célja a linken át írható.
    if (/^(symboliclink|junction|hardlink)$/i.test(named.get("itemtype") ?? "")) {
      push([named.get("target") ?? named.get("value")], "`New-Item` (a link célja — a linken át írható)");
    }
  } else if (["remove-item", "ri", "del", "erase", "rd"].includes(h)) {
    const { named, pos } = psParams(a, ["path", "literalpath", "filter", "include", "exclude"]);
    push([named.get("path") ?? named.get("literalpath"), ...pos], "`Remove-Item`", { destructive: true });
  } else if (["copy-item", "cpi", "copy", "move-item", "mi", "move", "rename-item", "rni", "ren"].includes(h)) {
    const { named, pos } = psParams(a, ["path", "literalpath", "destination", "newname", "filter", "include", "exclude"]);
    const src = named.get("path") ?? named.get("literalpath") ?? pos[0];
    const moves = !/^(copy-item|cpi|copy)$/.test(h);
    if (/^(rename-item|rni|ren)$/.test(h)) {
      const nn = named.get("newname") ?? pos[1];
      push([src], `\`${h}\``, { destructive: true });
      push([nn && src ? `${dirname(toPosix(src))}/${nn}` : null], `\`${h}\``);
    } else {
      const dest = named.get("destination") ?? (named.has("path") || named.has("literalpath") ? pos[0] : pos[1]);
      if (moves) push([src], `\`${h}\``, { destructive: true });
      // Létező könyvtárba célzott másolás/áthelyezés: a cél a forrás alapnevén belül.
      push([dest && src && dirLike(dest, cwd) ? intoDir(dest, src) : dest], `\`${h}\``);
    }
  }
  return out;
}

// --- Csak olvasó mód ---------------------------------------------------------

// Csak a readonly módban tiltott: bármi, ami fájlt módosít.
const READONLY_DENY_HEADS = new Map([
  ...["rm", "rmdir", "mv", "cp", "mkdir", "touch", "chmod", "chown", "chgrp", "ln", "unlink", "install"].map((h) => [h, "fájlrendszer-módosítás"]),
  ...["tee", "dd", "truncate"].map((h) => [h, "fájlba írás"]),
  ...["set-content", "add-content", "out-file", "new-item", "remove-item", "move-item", "copy-item", "clear-content", "rename-item", "tee-object"].map((h) => [h, "PowerShell fájlművelet"]),
]);

function readonlyDeny(argv) {
  const [h, ...a] = argv;
  if (!h) return null;
  if (READONLY_DENY_HEADS.has(h)) return READONLY_DENY_HEADS.get(h);
  if (h === "sed" && isInPlaceSed(a)) return "helyben szerkesztő `sed -i`";
  return null;
}

/**
 * Egy rövid kapcsoló-csoport (`-sSLo`) betűi. Az első érték-váró betűnél megáll:
 * az értéke a csoport maradéka, vagy (ha az üres) a következő token.
 */
function shortCluster(tok, valueLetters) {
  if (!/^-[A-Za-z0-9]/.test(tok)) return [];
  const out = [];
  for (let k = 1; k < tok.length; k += 1) {
    const c = tok[k];
    if (valueLetters.includes(c)) {
      out.push({ letter: c, value: tok.slice(k + 1) || null });
      return out;
    }
    out.push({ letter: c });
  }
  return out;
}

const HARMLESS_VALUE = (v) => v === "-" || HARMLESS_TARGETS.has(String(v ?? "").toLowerCase());

// A curl író kapcsolói. A `-X POST/DELETE` SZÁNDÉKOSAN megengedett: a validátor
// jogosultsági eseteket mér vele a futó API-n, ami nem a munkafa módosítása.
const CURL_VALUE_LETTERS = "AbcCdDeEFHKmoPQrtTuUwxXyYz";
const CURL_WRITE_SHORT = { o: true, D: true, c: true };
const CURL_WRITE_LONG = new Set(["--output", "--output-dir", "--dump-header", "--cookie-jar", "--trace", "--trace-ascii", "--stderr", "--libcurl", "--etag-save", "--hsts", "--alt-svc"]);

function curlReadonly(args) {
  for (let k = 0; k < args.length; k += 1) {
    const t = args[k];
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      const name = eq > 0 ? t.slice(0, eq) : t;
      if (name === "--remote-name" || name === "--remote-name-all") return false;
      if (CURL_WRITE_LONG.has(name)) {
        const v = eq > 0 ? t.slice(eq + 1) : args[k + 1];
        if (!HARMLESS_VALUE(v)) return false;
      }
      continue;
    }
    if (!t.startsWith("-") || t === "-") continue;
    const letters = shortCluster(t, CURL_VALUE_LETTERS);
    for (const { letter, value } of letters) {
      if (letter === "O") return false;
      if (value === undefined) continue;
      const v = value ?? args[k + 1];
      if (CURL_WRITE_SHORT[letter] && !HARMLESS_VALUE(v)) return false;
    }
    const last = letters[letters.length - 1];
    if (last && last.value === null) k += 1; // a következő token az érték
  }
  return true;
}

const MVN_ARG_OPTS = new Set(["-f", "--file", "-pl", "--projects", "-T", "--threads", "-P", "--activate-profiles", "-D", "--define", "-rf", "--resume-from"]);
const MVN_FLAG_OPTS = new Set(["-q", "--quiet", "-B", "--batch-mode", "-o", "--offline", "-e", "--errors", "-X", "--debug", "-ntp", "--no-transfer-progress", "-am", "--also-make", "-amd", "--also-make-dependents", "-fae", "--fail-at-end", "-ff", "--fail-fast", "-N", "--non-recursive", "-V", "--show-version"]);
const MVN_INFO = new Set(["-v", "-version", "--version", "-h", "--help"]);
// A MÉRŐ célok: a `package`, az `install`, a `deploy` és a `spring-boot:run` fájlt ír,
// a helyi repóba telepít vagy szervert indít. A `clean` a `target/`-et törli (build-kimenet).
const MVN_GOAL = /^(clean|test|verify|jacoco:[\w@.-]+|help:[\w.-]+)$/i;

// Rendszertulajdonságok, amelyekkel egy mérő cél is fájlt ír vagy máshová telepít:
// `-Doutput=`/`-DoutputFile=` (pl. a `help:*` és `dependency:tree` kimenete), a
// `-Dmaven.repo.local=` (a helyi repó áthelyezése — letöltés oda), és az
// `-DaltDeploymentRepository`.
const MVN_WRITING_DEFINE = /^(output|outputfile|maven\.repo\.local|altdeploymentrepository|altreleasedeploymentrepository|altsnapshotdeploymentrepository)$/i;

function mvnReadonly(args) {
  const goals = [];
  let info = false;
  for (let k = 0; k < args.length; k += 1) {
    const t = args[k];
    if (MVN_INFO.has(t)) { info = true; continue; }
    let def = null;
    if (/^-D./.test(t)) def = t.slice(2);
    else if (/^--define=/.test(t)) def = t.slice(9);
    else if (t === "-D" || t === "--define") { def = args[k + 1] ?? ""; k += 1; }
    if (def !== null) {
      if (MVN_WRITING_DEFINE.test(def.split("=")[0])) return false;
      continue;
    }
    if (MVN_ARG_OPTS.has(t)) { k += 1; continue; }
    if (/^--(file|projects|threads|activate-profiles|resume-from)=/.test(t)) continue;
    if (MVN_FLAG_OPTS.has(t)) continue;
    if (t.startsWith("-")) return false;
    goals.push(t);
  }
  return (goals.length > 0 || info) && goals.every((g) => MVN_GOAL.test(g));
}

const NPM_RO_ARG = new Set(["--prefix", "-w", "--workspace"]);
const NPM_RO_FLAG = new Set(["--silent", "-s", "--if-present", "--workspaces", "-ws", "--include-workspace-root", "-q", "--quiet"]);
// A script vagy a tesztfuttató argumentumai közül ezek írnak (snapshot, autofix,
// riport- és cache-fájl), ill. soha nem lépnek ki (`--watch`).
const WRITING_PASSTHROUGH = /^(-u|--update(=.*)?|--fix.*|--write|-o|--output-file(=.*)?|--outputFile(\.[\w-]+)?(=.*)?|--cache-location(=.*)?|--cache|--coverage\.reportsDirectory(=.*)?|-w|--watch(=.*)?)$/;
// Soha ki nem lépő scriptek: fejlesztői szerver és figyelő mód.
const NEVER_EXITING_SCRIPT = /^(dev|watch|serve)$|:(dev|watch|serve)$/i;

function npmReadonly(args) {
  const pos = [];
  let passthrough = [];
  for (let k = 0; k < args.length; k += 1) {
    const t = args[k];
    if (t === "--") { passthrough = args.slice(k + 1); break; }
    if (t === "-v" || t === "--version") return args.length === 1;
    if (NPM_RO_ARG.has(t)) { k += 1; continue; }
    if (/^--(prefix|workspace)=/.test(t) || NPM_RO_FLAG.has(t)) continue;
    if (t.startsWith("-")) return false;
    pos.push(t);
  }
  const sub = pos[0]?.toLowerCase();
  let script;
  if (sub === "test" || sub === "t" || sub === "tst") script = "test";
  else if (sub === "start" || sub === "build") script = sub;
  else if (sub === "run" || sub === "run-script" || sub === "rum" || sub === "urn") {
    if (!pos[1]) return true; // `npm run`: a scriptek listája
    script = pos[1];
  } else return false;
  // A `lint:fix` és minden más `*fix*` script a forrást írja át.
  if (/fix/i.test(script)) return false;
  if (NEVER_EXITING_SCRIPT.test(script)) return false;
  return !passthrough.some((t) => WRITING_PASSTHROUGH.test(t));
}

// `tsc`: csak a `--noEmit` típusellenőrzés mér; ezek mellett mégis ír (kimenet,
// `.tsbuildinfo`, trace, új tsconfig) vagy soha nem lép ki (`--watch`). A tsc
// kapcsolói kis-/nagybetű-érzéketlenek.
const TSC_WRITING = /^(--init|-b|--build|--outdir|--outfile|--declarationdir|--generatetrace|-w|--watch|-i|--incremental|--tsbuildinfofile)$/;

function tscReadonly(rest) {
  const low = rest.map((t) => t.toLowerCase());
  const ne = low.indexOf("--noemit");
  if (ne < 0 || low[ne + 1] === "false") return false;
  return !low.some((t) => TSC_WRITING.test(t.split("=")[0]));
}

const VITEST_WRITING = /^(-u|--update(=.*)?|--outputFile(\.[\w-]+)?(=.*)?|--coverage\.reportsDirectory(=.*)?|-w|--watch(=.*)?|--ui|--open)$/;

/** `vitest`: csak az egyszer lefutó alak (`run` / `--run`) — enélkül figyelő módban marad. */
function vitestReadonly(rest) {
  if (rest.some((t) => VITEST_WRITING.test(t))) return false;
  return rest.includes("run") || rest.includes("--run");
}

const ESLINT_WRITING = /^(--fix.*|-o|--output-file(=.*)?|--cache-location(=.*)?|--cache|--init)$/;

function npxReadonly(args) {
  let k = 0;
  while (k < args.length && /^(--no-install|--no|--offline)$/.test(args[k])) k += 1;
  const tool = normHead(args[k] ?? "");
  const rest = args.slice(k + 1);
  if (tool === "tsc") return tscReadonly(rest);
  if (tool === "vitest") return vitestReadonly(rest);
  if (tool === "eslint") return !rest.some((t) => ESLINT_WRITING.test(t));
  return false;
}

// `node`: a repóban lévő szkript (`.mjs`/`.js`/`.cjs`) és a `node --test` szabad;
// a parancssorban átadott kód (`-e`, `-p`, `--eval`, `--print`, `-` = stdin, és a
// puszta `node` REPL-je) nem — az egy tetszőleges, nem vizsgált program. A szkript
// előtt csak ártalmatlan kapcsoló állhat: a `--require`/`--import` (előtöltött kód,
// akár `data:` URL) és a `--test-reporter-destination` (fájlba ír) nincs köztük.
const NODE_SAFE_FLAG = /^(--test|--test-only|--experimental-test-coverage|--no-warnings|--no-deprecation|--trace-warnings|--trace-uncaught|--enable-source-maps|--experimental-vm-modules|--stack-trace-limit=\d+|--test-(reporter|name-pattern|skip-pattern|concurrency|timeout)=.*)$/;
const NODE_SAFE_ARG = /^--test-(reporter|name-pattern|skip-pattern|concurrency|timeout)$/;

function nodeReadonly(a, cwd) {
  if (a.length === 1 && /^(-v|--version|-h|--help)$/.test(a[0])) return true;
  const inRepo = (p) => {
    const rel = relativeToProject(p, cwd);
    return rel !== "" && rel !== canonical(p, cwd);
  };
  let k = 0;
  let test = false;
  while (k < a.length && a[k].startsWith("-") && a[k] !== "-") {
    const t = a[k];
    k += 1;
    if (t === "--") break;
    if (NODE_SAFE_ARG.test(t)) { k += 1; continue; }
    if (!NODE_SAFE_FLAG.test(t)) return false;
    if (t === "--test") test = true;
  }
  const rest = a.slice(k);
  if (test) return rest.every((p) => !p.startsWith("-") && inRepo(p));
  return rest.length > 0 && /\.(mjs|cjs|js)$/i.test(rest[0]) && inRepo(rest[0]);
}

// Readonly módban a parancs elé írt környezeti változók közül ezek kódot töltenek be
// vagy futtatnak az engedélyezett parancsban (`NODE_OPTIONS=--import=… node x.mjs`,
// `JAVA_TOOL_OPTIONS=-javaagent:… mvn test`).
const EXEC_ENV = /^(NODE_OPTIONS|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS|MAVEN_OPTS|MAVEN_ARGS|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|BASH_ENV|ENV|PROMPT_COMMAND|NPM_CONFIG_.*|npm_config_.*)$/i;

const GIT_RO_GLOBAL = new Set(["-C", "--no-pager", "-P", "-p", "--paginate", "--git-dir", "--work-tree", "--no-optional-locks"]);
const GIT_RO_SUB = new Set(["status", "diff", "log", "show", "branch", "ls-files", "rev-parse", "remote", "blame", "ls-tree", "cat-file", "rev-list", "merge-base", "describe", "shortlog", "worktree", "stash", "config"]);

function gitReadonly(args) {
  const { globals, sub, rest } = parseGit(args);
  if (!globals.every((g) => GIT_RO_GLOBAL.has(g.name))) return false; // pl. `-c core.pager=…`
  if (!sub || !GIT_RO_SUB.has(sub)) return false;
  if ((sub === "diff" || sub === "show" || sub === "log") && rest.some((t) => t === "--output" || t.startsWith("--output="))) return false;
  if (sub === "remote") return rest.length === 0 || /^(-v|--verbose|show|get-url)$/.test(rest[0]);
  if (sub === "worktree") return rest[0] === "list";
  if (sub === "stash") return rest[0] === "list" || rest[0] === "show";
  if (sub === "config") return gitDeny(["config", ...rest]) === null;
  if (sub === "branch") return !gitBranchModifies(rest);
  return true;
}

function dockerReadonly(args, compose) {
  let k = 0;
  if (!compose) {
    if (/^(ps|logs|inspect)$/.test(args[0] ?? "")) return true;
    if (args[0] !== "compose") return false;
    k = 1;
  }
  while (k < args.length && args[k].startsWith("-")) {
    k += /^(-f|--file|-p|--project-name|--project-directory|--env-file|--profile)$/.test(args[k]) ? 2 : 1;
  }
  return /^(ps|logs)$/.test(args[k] ?? "");
}

const FIND_WRITING = new Set(["-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls"]);

// Az `awk` SZÁNDÉKOSAN nincs itt (fejlesztői döntés, 2026-11): a `system()`, a
// `print > "f"` és a `|` csőhívás a programszövegen belül ír és futtat, és azt a
// guard nem elemzi.
const READONLY_PLAIN = new Set([
  "cat", "head", "tail", "ls", "dir", "grep", "rg", "wc", "echo", "pwd", "which", "where", "type",
  "jq", "uniq", "diff", "date", "sleep", "test", "true", "[", "[[", "popd", "pop-location",
  "stat", "du", "cut", "tr", "basename", "dirname", "realpath", "printf",
  "get-content", "get-childitem", "select-string", "test-path", "measure-object",
  "select-object", "sort-object", "where-object", "convertto-json", "convertfrom-json",
  "get-item", "get-location", "resolve-path",
]);

/** A csak olvasó agentek engedélylistája. */
function readonlyAllowed(seg) {
  const [h, ...a] = seg.argv;
  if (!h) return true; // csak átirányítás vagy szerkezeti sor
  // PowerShell-kifejezés (`$_.Length -gt 1`, `(…).Count`) — de a metódushívás nem.
  if (seg.d.name === "ps" && /^(\$|\.[A-Za-z_])/.test(seg.rawHead ?? "") && !seg.call) return true;
  if (READONLY_PLAIN.has(h)) return true;
  if (/^format-\w+$/.test(h)) return true;
  // `file -C` a magic-adatbázist fordítja le fájlba.
  if (h === "file") return !a.some((t) => t === "--compile" || (/^-[A-Za-z]+$/.test(t) && t.includes("C")));
  if (h === "java") return a.length === 1 && (a[0] === "-version" || a[0] === "--version");
  if (h === "node") return nodeReadonly(a, seg.cwd);
  if (h === "cd" || h === "pushd" || h === "chdir") return a.filter((t) => !/^-[LPe@]*$/.test(t)).length <= 1;
  if (h === "set-location" || h === "sl" || h === "push-location") {
    const { named, pos } = psParams(a, ["path", "literalpath", "stackname"]);
    return pos.length <= 1 && [...named.keys()].every((k) => /^(path|literalpath|lp|pspath|stackname)$/.test(k));
  }
  if (h === "mvn") return mvnReadonly(a);
  if (h === "npm") return npmReadonly(a);
  if (h === "npx") return npxReadonly(a);
  if (h === "git") return gitReadonly(a);
  if (h === "curl") return curlReadonly(a);
  if (h === "find") return !a.some((t) => FIND_WRITING.has(t));
  if (h === "sed") return !isInPlaceSed(a);
  if (h === "sort") {
    return !a.some((t) => t === "--output" || t.startsWith("--output=") || (!t.startsWith("--") && shortCluster(t, "ktoST").some((x) => x.letter === "o")));
  }
  if (h === "docker") return dockerReadonly(a, false);
  if (h === "docker-compose") return dockerReadonly(a, true);
  if (h === "invoke-webrequest" || h === "invoke-restmethod" || h === "iwr" || h === "irm") {
    return !a.some((t) => /^-o(u(t(f(i(l(e)?)?)?)?)?)?(:.*)?$/i.test(t));
  }
  return false;
}

// --- Bash-ellenőrzés ----------------------------------------------------------

const BASH_PROFILES = {
  "impl-bash": WRITE_PROFILES.impl,
  "e2e-bash": WRITE_PROFILES.e2e,
  "unit-test-bash": WRITE_PROFILES.unit,
};

function guardBash(input, mode) {
  const command = input?.tool_input?.command;
  if (!command) return decide("defer");
  const readonly = mode === "readonly-bash";
  const dialect = /powershell/i.test(String(input?.tool_name ?? "")) ? PS : SH;
  const base = input?.cwd ? fromGitBash(input.cwd) : projectDir();

  const { segs, truncated, bodies } = analyze(command, dialect, base);
  if (segs.length === 0 && !truncated) return decide("defer");

  const asks = [];
  for (const seg of segs) {
    const deny = alwaysDeny(seg.argv) ?? envDeny(seg);
    if (deny) return decide("deny", `Parancs megtagadva (\`${seg.raw}\`): ${deny}.`);
    if (seg.ask) asks.push({ raw: seg.raw, why: seg.ask });

    if (readonly) {
      const targets = writeTargets(seg);
      // Az önvédelem indoka a readonly módban is látsszon (nem csak a „csak olvas”).
      for (const t of targets) {
        const v = writeVerdict(t.path, seg.cwd, {}, t);
        if (v?.self) return decide("deny", `Parancs megtagadva (\`${seg.raw}\`): ${t.how} → \`${v.rel}\` — ${v.why}`);
      }
      const rd = readonlyDeny(seg.argv);
      if (rd) return decide("deny", `Parancs megtagadva (\`${seg.raw}\`): ${rd} — ez az agent csak olvas és jelent, nem javít.`);
      const t = targets[0];
      if (t) return decide("deny", `Parancs megtagadva (\`${seg.raw}\`): fájlba írás — ${t.how} → \`${t.path}\`. Ez az agent csak olvas és jelent, nem javít.`);
      const env = seg.env.find((nm) => EXEC_ENV.test(nm));
      if (env) asks.push({ raw: seg.raw, why: `a \`${env}\` környezeti változó kódot tölthet be az engedélyezett parancsba` });
      else if (seg.neverExits) asks.push({ raw: seg.raw, why: seg.neverExits });
      else if (!readonlyAllowed(seg)) asks.push({ raw: seg.raw, why: null });
      continue;
    }

    const verdicts = writeTargets(seg)
      .map((t) => ({ t, v: memo("verdict", `${seg.cwd}\0${t.path}\0${t.dir ? 1 : 0}${t.tree ? 1 : 0}${t.destructive ? 1 : 0}`, () => writeVerdict(t.path, seg.cwd, BASH_PROFILES[mode], t)) }))
      .filter((x) => x.v);
    // Az önvédelmi tiltás indoka elsőbbséget kap (`mv x .claude/skills/…`-nál ne a
    // forrás engedélylista-szövege jöjjön).
    const denied = verdicts.find((x) => x.v.decision === "deny" && x.v.self) ?? verdicts.find((x) => x.v.decision === "deny");
    if (denied) return decide("deny", `Parancs megtagadva (\`${seg.raw}\`): ${denied.t.how} → \`${denied.v.rel}\` — ${denied.v.why}`);
    for (const { t, v } of verdicts) asks.push({ raw: seg.raw, why: `${t.how} → \`${v.rel}\`: ${v.why}` });
  }
  if (truncated) asks.push({ raw: "…", why: `túl sok beágyazott parancstörzs (${bodies} > ${MAX_BODIES}) — a parancssor nem vizsgálható végig` });

  if (asks.length === 0) return decide("defer");
  const unlisted = asks.filter((x) => x.why === null).map((x) => `\`${x.raw}\``);
  const other = asks.filter((x) => x.why !== null).map((x) => `\`${x.raw}\` (${x.why})`);
  const parts = [];
  if (unlisted.length) {
    parts.push(`Nincs a csak olvasó parancsok listáján: ${unlisted.join(", ")} — ez az agent csak olvas, nem módosíthat semmit.`);
  }
  if (other.length) parts.push(`Jóváhagyás kell: ${other.join("; ")}.`);
  return decide("ask", parts.join(" "));
}

// --- Belépési pont ----------------------------------------------------------

try {
  const input = readInput();

  switch (MODE) {
    case "impl-write":
      guardWriteTool(input, "impl");
      break;
    case "e2e-write":
      guardWriteTool(input, "e2e");
      break;
    case "unit-test-write":
      guardWriteTool(input, "unit");
      break;
    case "docs-write":
      guardWriteTool(input, "docs");
      break;
    case "impl-bash":
      guardBash(input, "impl-bash");
      break;
    case "e2e-bash":
      guardBash(input, "e2e-bash");
      break;
    case "unit-test-bash":
      guardBash(input, "unit-test-bash");
      break;
    case "readonly-bash":
      guardBash(input, "readonly-bash");
      break;
    default:
      // Ismeretlen mód: inkább ne akadályozzuk a munkát, csak jelezzük.
      decide("defer", `Ismeretlen spec-guard mód: "${MODE}".`);
  }
} catch (err) {
  // Egy hibás guard ne bénítsa le az agentet: kimenet nélkül zárunk.
  decide("defer", `spec-guard belső hiba: ${err?.stack ?? err}`);
}
