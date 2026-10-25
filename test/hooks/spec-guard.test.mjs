// A `.claude/hooks/spec-guard.mjs` regressziós tesztjei (node:test).
//
// Futtatás a repó gyökeréből: `node --test "test/hooks/*.test.mjs"` (Node 24-en a
// puszta mappa-argumentum nem működik)
//
// A hookot úgy hívjuk, ahogy a Claude Code: külön folyamatként, a módot argumentumként,
// a hook-bemenetet stdin-JSON-ként. A projektgyökér egy ideiglenes mappa (`.git`
// könyvtárral, egy meglévő migrációval és két „worktree”-vel), így a teszt a valódi
// repó verziókövetett részébe semmit nem ír, és a migráció-szabály `existsSync`-je
// determinisztikus.
//
// Az ideiglenes mappák a repó gitignore-olt `.scratch/tmp/` mappájába kerülnek (egyedi
// `mkdtemp` névvel, mert más tesztek is ide írnak), NEM a `%TEMP%`-be: a fejlesztő
// szabálya szerint natív eszköz a munkamappákon kívülre nem ír. A végén a saját
// mappáinkat töröljük; a közös `.scratch/tmp/` marad (egy párhuzamosan futó másik
// tesztfolyamat éppen abban dolgozhat). Mellékhatásként a tesztprojekt útvonalában most
// szóköz van („AI related”) — a parancssorba illesztett útvonalat ezért idézni kell.
// Ami a munkaterületen KÍVÜLI írást vizsgálja, az továbbra is kívülre céloz: a
// szó szerinti `/tmp/…` és `C:\Users\…\Temp\…` útvonalra, ill. a projekten kívüli
// `OTHER` repóra — a projektgyökér (`CLAUDE_PROJECT_DIR`) a `proj/` almappa.
//
// Minden esetre igaz, hogy a hook exit 0-val zár, és a stdout-ján SOHA nincs `defer`
// (a 2.1.310 óta az a hívás elhalasztása — lásd a hook fejlécét).
//
// Várt ítéletek: "pass" (nincs kimenet), "deny", "ask", "blocked" (deny VAGY ask —
// ott, ahol a lényeg csak az, hogy ne menjen át csendben).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = join(REPO, ".claude", "hooks", "spec-guard.mjs");
const WIN = process.platform === "win32";

/** Az ideiglenes mappák közös szülője: a repó gitignore-olt `.scratch/tmp/` mappája. */
const SCRATCH_TMP = join(REPO, ".scratch", "tmp");
/** Egyedi ideiglenes mappa a `.scratch/tmp/` alatt. */
function scratchTemp(prefix) {
  mkdirSync(SCRATCH_TMP, { recursive: true });
  return mkdtempSync(join(SCRATCH_TMP, prefix));
}

let ROOT; // az ideiglenes mappák szülője
let PROJ; // a teszt-projektgyökér (CLAUDE_PROJECT_DIR)
let OTHER; // egy idegen repó a projekten kívül

const posix = (p) => p.replace(/\\/g, "/");
/** Git-Bash alak: C:/x → /c/x */
const gitBash = (p) => posix(p).replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);

before(() => {
  ROOT = scratchTemp("spec-guard-test-");
  PROJ = join(ROOT, "proj");
  OTHER = join(ROOT, "other");
  mkdirSync(join(PROJ, ".git", "worktrees", "wt1"), { recursive: true });
  mkdirSync(join(PROJ, "server-java", "src", "main", "resources", "db", "migration"), { recursive: true });
  writeFileSync(join(PROJ, "server-java", "src", "main", "resources", "db", "migration", "V1__init.sql"), "-- x\n");
  // Valódi worktree a repón belül: a `gitdir:` a projekt .git/worktrees/ alá mutat.
  mkdirSync(join(PROJ, ".claude", "worktrees", "wt1", "e2e"), { recursive: true });
  writeFileSync(join(PROJ, ".claude", "worktrees", "wt1", ".git"), `gitdir: ${posix(join(PROJ, ".git", "worktrees", "wt1"))}\n`);
  // Idegen „worktree”: a .git fájl egy másik repóba mutat.
  mkdirSync(join(PROJ, ".claude", "worktrees", "foreign", "e2e"), { recursive: true });
  writeFileSync(join(PROJ, ".claude", "worktrees", "foreign", ".git"), `gitdir: ${posix(join(OTHER, ".git", "worktrees", "x"))}\n`);
  // Kézzel odaírt .git fájl, gitdir nélkül.
  mkdirSync(join(PROJ, "fake", "e2e"), { recursive: true });
  writeFileSync(join(PROJ, "fake", ".git"), "nem egy gitdir\n");
  // Idegen repó a projekten kívül, .git könyvtárral.
  mkdirSync(join(OTHER, ".git"), { recursive: true });
  mkdirSync(join(OTHER, "e2e"), { recursive: true });
  // Könyvtár-célpontos másoláshoz (G2-3): létező célkönyvtárak és forrásmappa.
  mkdirSync(join(PROJ, ".scratch"), { recursive: true });
  mkdirSync(join(PROJ, "e2e", "features"), { recursive: true });
  mkdirSync(join(PROJ, "docs", "test-plans"), { recursive: true });
  mkdirSync(join(PROJ, "docs", "orchestration", "_kontextus"), { recursive: true });
  mkdirSync(join(PROJ, ".claude", "hooks"), { recursive: true });
  mkdirSync(join(PROJ, ".claude", "worktrees", "wt1", ".claude", "hooks"), { recursive: true });
  mkdirSync(join(PROJ, "client", "src"), { recursive: true });
  writeFileSync(join(PROJ, "scripts.mjs"), "// x\n");
  // A readonly `npm run <script>` a package.json-ból olvassa a script tényleges parancsát
  // (19. sor). Saját package.json kell, különben a hook fölfelé keresve a VALÓDI repóét
  // találná meg (a tesztprojekt a `.scratch/tmp/` alatt, a repón belül van).
  writeFileSync(join(PROJ, "package.json"), JSON.stringify({
    name: "proj",
    workspaces: ["client"],
    scripts: {
      test: "vitest run",
      build: "npm run build -w client",
      lint: "eslint .",
      dev: "npm run dev -w client",
      "test:watch": "vitest",
      szerver: "vite --port 4000",
      "kliens-web": "npm run web -w client",
      "kliens-web2": "npm --prefix client run web",
      figyel: "tsc -w -p client/tsconfig.json",
      figyel2: "tsc -p client/tsconfig.json --watch",
      fut: "node scripts.mjs",
      adatbazis: "docker compose up db",
      "adatbazis-d": "docker compose up -d db",
      tesztek: "vitest",
      spring: "cd server-java && mvn spring-boot:run",
      lanc: "npm run lint && npm run szerver",
    },
  }));
  writeFileSync(join(PROJ, "client", "package.json"), JSON.stringify({
    name: "client",
    scripts: { build: "tsc && vite build", dev: "vite", preview: "vite preview", web: "vite", optimize: "vite optimize" },
  }));
});

after(() => {
  // `maxRetries`: Windows-on egy épp letapogatott (pl. víruskereső) fájl EBUSY/EPERM-et ad.
  rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function run(mode, input, extraEnv = {}) {
  const r = spawnSync(process.execPath, [HOOK, mode], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJ, ...extraEnv },
    timeout: 15000,
  });
  assert.equal(r.status, 0, `exit ${r.status}, stderr: ${r.stderr}`);
  assert.doesNotMatch(r.stdout, /"defer"/, "a hook soha nem írhat ki defer-t");
  if (!r.stdout.trim()) return { decision: "pass", reason: "", stderr: r.stderr };
  const o = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(o.hookEventName, "PreToolUse");
  return { decision: o.permissionDecision, reason: o.permissionDecisionReason ?? "" };
}

const bash = (mode, command, { tool = "Bash", cwd = PROJ } = {}) =>
  run(mode, { tool_name: tool, tool_input: { command }, cwd });
const write = (mode, filePath) => run(mode, { tool_name: "Write", tool_input: { file_path: filePath } });

function expectDecision(got, want, label) {
  if (want === "blocked") {
    assert.ok(got.decision === "deny" || got.decision === "ask", `${label}: várt deny|ask, kapott ${got.decision}`);
  } else {
    assert.equal(got.decision, want, `${label}: várt ${want}, kapott ${got.decision} — ${got.reason}`);
  }
}

/** Táblázatos esetek: [mód, parancs, várt, opciók?]. */
function bashCases(title, cases) {
  describe(title, () => {
    for (const [mode, command, want, opts] of cases) {
      const tool = opts?.tool ?? "Bash";
      test(`${mode} [${tool}] ${want}: ${command.replace(/\n/g, "⏎")}`, () => {
        const cwd = typeof opts?.cwd === "function" ? opts.cwd() : opts?.cwd;
        expectDecision(bash(mode, command, { tool, cwd }), want, command);
      });
    }
  });
}

const PSH = { tool: "PowerShell" };
const RO = "readonly-bash";
const IMPL = "impl-bash";
const E2E = "e2e-bash";
const UNIT = "unit-test-bash";

// --- G-1: idézett, szóközös cd és a PowerShell Set-Location -----------------
bashCases("G-1 cd / Set-Location", [
  [RO, 'cd "D:/Programozas/AI related/agentic_workflow/server-java" && mvn test', "pass"],
  [RO, "cd 'D:/x y/server-java' && mvn -B test", "pass"],
  [RO, "cd server-java", "pass"],
  [RO, "cd server-java && mvn test", "pass"],
  [RO, 'Set-Location -Path "D:/Programozas/AI related/x"; mvn test', "pass", PSH],
  [RO, "Set-Location -LiteralPath 'D:\\x y\\server-java'", "pass", PSH],
  [RO, "Push-Location server-java; mvn test; Pop-Location", "pass", PSH],
  [RO, "pushd server-java && mvn test && popd", "pass"],
]);

// --- G-2: fd-duplikálás és &>/dev/null -----------------------------------------
bashCases("G-2 2>&1 és &>/dev/null", [
  [RO, "mvn -B test 2>&1 | tail -50", "pass"],
  [IMPL, "mvn -B test 2>&1 | tail -50", "pass"],
  [RO, "npm test 2>&1", "pass"],
  [RO, "ls >/dev/null 2>&1", "pass"],
  [RO, "ls &>/dev/null", "pass"],
  [RO, "git status 1>&2", "pass"],
  [RO, "mvn test 2>&1 | Select-String FAIL", "pass", PSH],
  [RO, "ls &> out.txt", "deny"],
  [RO, "ls >& out.txt", "deny"],
  [RO, "ls &>> out.txt", "deny"],
]);

// --- G-3/G-4: idézőjel-tudatos darabolás ---------------------------------------
bashCases("G-3/G-4 idézőjelek", [
  [RO, 'grep -E "foo|bar" file.txt', "pass"],
  [RO, "jq '.[] | .name' f.json", "pass"],
  [RO, 'rg "x\\("', "pass"],
  [RO, "git log --format='%h|%s'", "pass"],
  [RO, 'grep -c "->" f', "pass"],
  [RO, "grep '=>' f", "pass"],
  // Az idézett `>` nem átirányítás (nincs deny); a `node -e` maga readonly-ban ask (A2-14).
  [RO, 'node -e "console.log(1>0)"', "ask"],
  [RO, "grep -n 'a;b' f && grep \"c&d\" f", "pass"],
  [IMPL, 'grep -n "x; git add y" f', "pass"],
  [IMPL, "node -e \"console.log('a && git commit')\"", "pass"],
  [IMPL, "echo '$(git push)'", "pass"],
  [IMPL, "echo 'git push | x'", "pass"],
  [IMPL, 'echo "$(git push)"', "deny"],
  [IMPL, 'echo "`git commit -m x`"', "deny"],
  [IMPL, "echo $(git commit -m x)", "deny"],
  [IMPL, "echo `git push`", "deny"],
  [IMPL, 'echo "a $(echo "b $(git push)")"', "deny"],
  [IMPL, "cat <(git push)", "deny"],
  [IMPL, "npm test && git push", "deny"],
  [IMPL, "npm test; git push", "deny"],
  [IMPL, "npm test || git push", "deny"],
  [IMPL, "npm test\ngit push", "deny"],
  [IMPL, "npm test | git push", "deny"],
  [IMPL, "npm test & git push", "deny"],
  [RO, "diff <(git show HEAD:a.txt) a.txt", "pass"],
  [IMPL, "cat <<'EOF'\ngit push\nEOF", "pass"],
  [IMPL, "cat <<EOF\n$(git push)\nEOF", "deny"],
  [IMPL, "cat <<'EOF' > spec/x.md\nhello\nEOF", "deny"],
  [RO, "echo $((1+2))", "pass"],
  [RO, "ls # git push", "pass"],
]);

// --- G-5: a readonly engedélylista bővítése ---------------------------------------
bashCases("G-5 readonly engedélylista", [
  [RO, "mvn -f server-java/pom.xml -q -B -o -Dtest=X test", "pass"],
  [RO, "mvn clean test", "pass"],
  [RO, "mvn clean verify -Djacoco.skip=false", "pass"],
  [RO, "mvn -o jacoco:check@check-unit-tested-classes", "pass"],
  [RO, "mvn help:evaluate -Dexpression=project.version -q -DforceStdout", "pass"],
  [RO, "mvn -version", "pass"],
  [RO, "./mvnw test", "pass"],
  [RO, "mvn -pl server-java -am -T 4 test", "pass"],
  [RO, "npm run lint -- --max-warnings 0", "pass"],
  [RO, "npm --prefix e2e run e2e -- --base-url http://localhost:5173", "pass"],
  [RO, "npm test", "pass"],
  [RO, "npm run build", "pass"],
  [RO, "npm run", "pass"],
  [RO, "npx eslint .", "pass"],
  [RO, "npx vitest run", "pass"],
  [RO, "npx tsc --noEmit -p client/tsconfig.json", "pass"],
  [RO, 'git -C "D:/Programozas/AI related/agentic_workflow" status', "pass"],
  [RO, "git -C /d/x log --oneline", "pass"],
  [RO, "git --no-pager diff", "pass"],
  [RO, "sed -n 1,20p f", "pass"],
  [RO, "docker ps", "pass"],
  [RO, "docker logs pg", "pass"],
  [RO, "docker inspect pg", "pass"],
  [RO, "docker compose ps", "pass"],
  [RO, "docker compose -f server-java/docker-compose.yml logs db", "pass"],
  [RO, "date", "pass"],
  [RO, "sleep 1", "pass"],
  [RO, "test -f x && echo ok", "pass"],
  [RO, "true", "pass"],
  [RO, "Get-ChildItem | Select-Object Name | Sort-Object Name", "pass", PSH],
  [RO, "Get-Content x.json | ConvertFrom-Json | ConvertTo-Json", "pass", PSH],
  [RO, "Get-ChildItem | Where-Object { $_.Length -gt 1kb } | Format-Table", "pass", PSH],
  [RO, "Get-Item x; Get-Location; Resolve-Path x", "pass", PSH],
  [RO, "(Get-Content f | Measure-Object -Line).Lines", "pass", PSH],
  [RO, "mvn test install", "blocked"],
  [RO, "mvn test deploy", "blocked"],
  [RO, "mvn test spring-boot:run", "blocked"],
  [RO, "mvn package", "blocked"],
  [RO, "mvn install", "blocked"],
  [RO, "mvn -l build.log test", "blocked"],
  [RO, "npm run lint:fix", "blocked"],
  [RO, "npm run fix", "blocked"],
  [RO, "npm test -- -u", "blocked"],
  [RO, "npm run test -- --update", "blocked"],
  [RO, "npx eslint --fix .", "blocked"],
  [RO, "npx eslint -o report.txt .", "blocked"],
  [RO, "npx vitest run -u", "blocked"],
  [RO, "npx vitest --update", "blocked"],
  [RO, "sed -i s/a/b/ f", "deny"],
  [RO, "sed --in-place s/a/b/ f", "deny"],
  [RO, "sed -Ei s/a/b/ f", "deny"],
  [RO, "awk '{print}' f", "ask"],
  [RO, "docker compose up -d", "blocked"],
  [RO, "docker rm x", "blocked"],
  [RO, "docker run x", "blocked"],
  [RO, "(Get-Item x).Delete()", "blocked", PSH],
]);

// --- G-6: az opció-argumentum nem nyel el tokent -----------------------------------
bashCases("G-6 git opció-argumentumok", [
  [IMPL, 'git -C "D:/Programozas/AI related/agentic_workflow" commit -m x', "deny"],
  [IMPL, "git -C '/d/Programozas/AI related' add -A", "deny"],
  [IMPL, "git --git-dir=.git --work-tree=. commit -m x", "deny"],
  [IMPL, "git --git-dir .git commit -m x", "deny"],
  [IMPL, "git -c user.name=x commit", "deny"],
  [IMPL, "git --namespace foo push", "deny"],
  [IMPL, "git --no-pager -C x push", "deny"],
]);

// --- G-7: parancsnév-alakok ------------------------------------------------------
bashCases("G-7 parancsfej-normalizálás", [
  [IMPL, "git.exe push", "deny"],
  [IMPL, '"git" push', "deny"],
  [IMPL, "\\git push", "deny"],
  [IMPL, "/usr/bin/git push", "deny"],
  [IMPL, '"C:/Program Files/Git/cmd/git.exe" push', "deny"],
  [IMPL, "& 'C:\\Program Files\\Git\\cmd\\git.exe' push", "deny", PSH],
  [IMPL, "& git push", "deny", PSH],
  [IMPL, "npm.cmd install lodash", "deny"],
  [IMPL, "./mvnw dependency:get -Dartifact=a:b:1", "deny"],
  [IMPL, "mvnw.cmd versions:set -DnewVersion=2", "deny"],
  [IMPL, "GIT.EXE commit -m x", "deny"],
]);

// --- G-8: burkolók és értelmezők ----------------------------------------------------
const ENCODED = Buffer.from("git push", "utf16le").toString("base64");
bashCases("G-8 burkolók", [
  [IMPL, "if git status; then git push; fi", "deny"],
  [IMPL, "if true; then echo; else git push; fi", "deny"],
  [IMPL, "! git push", "deny"],
  [IMPL, "command -p git push", "deny"],
  [IMPL, "command git push", "deny"],
  [IMPL, "bash -lc 'git push'", "deny"],
  [IMPL, 'sh -c "cd x && git commit -m y"', "deny"],
  [IMPL, "bash -o pipefail -c 'git push'", "deny"],
  [IMPL, "eval git push", "deny"],
  [IMPL, 'eval "git push"', "deny"],
  [IMPL, "cmd /c git push", "deny"],
  [IMPL, 'cmd.exe /c "git push"', "deny"],
  [IMPL, 'powershell -Command "git push"', "deny"],
  [IMPL, "pwsh -NoProfile -Command git push", "deny"],
  [IMPL, "powershell -NoProfile -ExecutionPolicy Bypass git push", "deny"],
  [IMPL, `powershell -EncodedCommand ${ENCODED}`, "deny"],
  [IMPL, 'iex "git push"', "deny", PSH],
  [IMPL, "Invoke-Expression 'git push'", "deny", PSH],
  [IMPL, "Get-ChildItem | ForEach-Object { git add $_ }", "deny", PSH],
  [IMPL, "Start-Process git -ArgumentList 'push'", "ask", PSH],
  [IMPL, "sudo git push", "deny"],
  [IMPL, "sudo -u root git push", "deny"],
  [IMPL, "env FOO=1 git push", "deny"],
  [IMPL, "FOO=1 git push", "deny"],
  [IMPL, 'FOO="a b" git push', "deny"],
  [IMPL, "xargs git add < list.txt", "deny"],
  [IMPL, "xargs -I {} git add {} < list.txt", "deny"],
  [IMPL, "while true; do git push; done", "deny"],
  [IMPL, "for f in a b; do git add $f; done", "deny"],
  [IMPL, "{ git push; }", "deny"],
  [IMPL, "(git push)", "deny"],
  [IMPL, "nohup git push &", "deny"],
  [IMPL, "time git push", "deny"],
  [IMPL, "timeout 30 git push", "deny"],
  [IMPL, "find . -name x -exec git add {} \\;", "deny"],
  [IMPL, "X=$(git push)", "deny"],
  [RO, "command -v git", "pass"],
  [RO, "bash -c 'ls'", "ask"],
]);

// --- G-9: a git-tiltólista bővítése -----------------------------------------------
bashCases("G-9 git-tiltólista", [
  [IMPL, "git pull", "deny"],
  [IMPL, "git revert HEAD", "deny"],
  [IMPL, "git apply p.diff", "deny"],
  [IMPL, "git am x.patch", "deny"],
  [IMPL, "git init", "deny"],
  [IMPL, "git notes add -m x", "deny"],
  [IMPL, "git update-index --assume-unchanged f", "deny"],
  [IMPL, "git config user.name x", "deny"],
  [IMPL, "git config --global core.editor vim", "deny"],
  [IMPL, "git config --unset user.name", "deny"],
  [IMPL, "git branch feature-x", "deny"],
  [IMPL, "git branch feature-x main", "deny"],
  [IMPL, "git branch -D x", "deny"],
  [IMPL, "git branch -m a b", "deny"],
  [IMPL, "git -c alias.x='!git push' x", "deny"],
  [IMPL, "git -c alias.st=status st", "deny"],
  [IMPL, "git --config-env=alias.x=EVIL x", "deny"],
  [IMPL, "git worktree add ../x", "deny"],
  [IMPL, "git worktree remove x", "deny"],
  [IMPL, "git update-ref refs/heads/x HEAD", "deny"],
  [IMPL, "git reflog expire --all", "deny"],
  [IMPL, "git config --get user.name", "pass"],
  [IMPL, "git config --list", "pass"],
  [IMPL, "git config -l", "pass"],
  [IMPL, "git config --get-regexp alias", "pass"],
  [IMPL, "git branch", "pass"],
  [IMPL, "git branch -a", "pass"],
  [IMPL, "git branch -vv", "pass"],
  [IMPL, "git branch --list 'feat*'", "pass"],
  [IMPL, "git branch --merged main", "pass"],
  [IMPL, "git branch --show-current", "pass"],
  [IMPL, "git branch --format='%(refname:short)'", "pass"],
  [IMPL, "git worktree list", "pass"],
  [IMPL, "git -c core.quotepath=off status", "pass"],
  [RO, "git config --get user.name", "pass"],
  [RO, "git worktree list", "pass"],
  [RO, "git -c core.pager=less log", "deny"],
]);

// --- G-10: git stash list|show --------------------------------------------------------
bashCases("G-10 git stash", [
  [IMPL, "git stash list", "pass"],
  [IMPL, "git stash show -p", "pass"],
  [RO, "git stash list", "pass"],
  [RO, "git stash show stash@{0}", "pass"],
  [IMPL, "git stash", "deny"],
  [IMPL, "git stash pop", "deny"],
  [IMPL, "git stash push -m x", "deny"],
  [IMPL, "git stash drop", "deny"],
]);

// --- G-11: további függőség-telepítő alakok -----------------------------------------
bashCases("G-11 függőség-telepítés", [
  [IMPL, "yarn", "deny"],
  [IMPL, "yarn --frozen-lockfile", "deny"],
  [IMPL, "yarn --cwd client", "deny"],
  [IMPL, "corepack pnpm install", "deny"],
  [IMPL, "corepack yarn add x", "deny"],
  [IMPL, "mvn -f server-java/pom.xml dependency:get -Dartifact=a:b:1", "deny"],
  [IMPL, "mvn -q org.apache.maven.plugins:maven-dependency-plugin:3.6.1:get -Dartifact=a:b:1", "deny"],
  [IMPL, "mvn versions:use-latest-versions", "deny"],
  [IMPL, "mvn versions:set -DnewVersion=2", "deny"],
  [IMPL, "py -m pip install requests", "deny"],
  [IMPL, "py -3 -m pip install requests", "deny"],
  [IMPL, "python.exe -m pip install requests", "deny"],
  [IMPL, "python3 -m pip install requests", "deny"],
  [IMPL, "pip install requests", "deny"],
  [IMPL, "pip3 install requests", "deny"],
  [IMPL, "uv add requests", "deny"],
  [IMPL, "uv pip install requests", "deny"],
  [IMPL, "npm --registry http://x install lodash", "deny"],
  [IMPL, "npm --foo bar install lodash", "deny"],
  [IMPL, "pnpm -C client add x", "deny"],
  [IMPL, "bun add x", "deny"],
  [IMPL, "npm pkg set dependencies.x=1", "deny"],
  [IMPL, "mvn versions:display-dependency-updates", "pass"],
  [IMPL, "mvn dependency:tree", "pass"],
  [IMPL, "yarn --version", "pass"],
  [IMPL, "yarn test", "pass"],
  [IMPL, 'python -c "print(1)"', "pass"],
  [IMPL, "python -m http.server", "pass"],
]);

// --- G-12: Bash-írásvédelem impl-, e2e- és unit-test-bash módban --------------------
bashCases("G-12 impl-bash írási célok", [
  [IMPL, "echo x > spec/a.md", "deny"],
  [IMPL, "echo x >> spec/backend/x.md", "deny"],
  [IMPL, "echo x > SPEC/a.md", "deny"],
  [IMPL, "tee spec/x.md < f", "deny"],
  [IMPL, "echo x | tee -a spec/x.md", "deny"],
  [IMPL, "sed -i 's/a/b/' spec/x.md", "deny"],
  [IMPL, "sed -i.bak -e s/a/b/ spec/x.md", "deny"],
  [IMPL, "cp a.md spec/a.md", "deny"],
  [IMPL, "cp -t spec a.md", "deny"],
  [IMPL, "mv spec/a.md b.md", "deny"],
  [IMPL, "touch spec/new.md", "deny"],
  [IMPL, "rm spec/a.md", "deny"],
  [IMPL, "rm -rf spec", "deny"],
  [IMPL, "rm -d spec", "deny"],
  [IMPL, "dd if=a of=spec/x", "deny"],
  [IMPL, "truncate -s 0 spec/x.md", "deny"],
  [IMPL, "cd spec && echo x > a.md", "deny"],
  [IMPL, "cd spec/backend; echo > ../x.md", "deny"],
  [IMPL, "echo x > server-java/src/main/resources/db/migration/V1__init.sql", "deny"],
  [IMPL, "sed -i s/a/b/ server-java/src/main/resources/db/migration/V1__init.sql", "deny"],
  [IMPL, "Out-File -FilePath spec/x.md", "deny", PSH],
  [IMPL, "'x' | Out-File spec/x.md", "deny", PSH],
  [IMPL, "Set-Content -Path spec/x.md -Value y", "deny", PSH],
  [IMPL, "Set-Content -Value y -Path:spec/x.md", "deny", PSH],
  [IMPL, "Add-Content spec/x.md y", "deny", PSH],
  [IMPL, "New-Item spec/x.md", "deny", PSH],
  [IMPL, "New-Item -Path spec -Name x.md -ItemType File", "deny", PSH],
  [IMPL, "Copy-Item a.md -Destination spec/a.md", "deny", PSH],
  [IMPL, "Move-Item spec/a.md b.md", "deny", PSH],
  [IMPL, "Remove-Item spec/a.md", "deny", PSH],
  [IMPL, "'x' > spec/a.md", "deny", PSH],
  [IMPL, "echo x > package.json", "ask"],
  [IMPL, "cat > server-java/pom.xml", "ask"],
  [IMPL, "sed -i s/a/b/ client/package.json", "ask"],
  [IMPL, "Set-Content -Path e2e/package.json -Value x", "ask", PSH],
  [IMPL, "echo x > client/src/spec/x.ts", "pass"],
  [IMPL, "echo x > .scratch/out.txt", "pass"],
  [IMPL, "echo x > server-java/src/main/resources/db/migration/V99__new.sql", "pass"],
  [IMPL, "mvn test > .scratch/log.txt 2>&1", "pass"],
  [IMPL, "cp spec/a.md .scratch/a.md", "pass"],
  [IMPL, "cat spec/a.md | grep x > .scratch/y", "pass"],
  [IMPL, 'Set-Content -Path client/x.ts -Value "spec/x.md"', "pass", PSH],
  [IMPL, "npm ci", "pass"],
  [IMPL, "npx playwright install chromium", "pass"],
]);

bashCases("G-12 e2e-bash", [
  [E2E, "echo x > e2e/features/a.feature", "pass"],
  [E2E, "mvn test > .scratch/log.txt", "pass"],
  [E2E, "cp .scratch/a e2e/b", "pass"],
  [E2E, "cd e2e && npm run e2e > ../.scratch/e2e.log 2>&1", "pass"],
  [E2E, "echo x > client/src/a.ts", "deny"],
  [E2E, "sed -i s/a/b/ client/src/App.tsx", "deny"],
  [E2E, "echo > spec/x.md", "deny"],
  [E2E, "echo > e2e/../client/x.ts", "deny"],
  [E2E, "git push", "deny"],
  [E2E, "npm install x", "deny"],
  [E2E, "echo {} > e2e/package.json", "ask"],
]);

bashCases("G-12 unit-test-bash", [
  [UNIT, "echo x > server-java/src/test/java/A.java", "pass"],
  [UNIT, "cd server-java && mvn test > ../.scratch/log.txt 2>&1", "pass"],
  [UNIT, "echo x > server-java/src/main/java/A.java", "deny"],
  [UNIT, "echo x > server-java/pom.xml", "deny"],
  [UNIT, "sed -i s/a/b/ server-java/src/main/java/A.java", "deny"],
  [UNIT, "git commit -m x", "deny"],
  [UNIT, "mvn dependency:get -Dartifact=a:b:1", "deny"],
]);

// --- (C) A teszttervek verziókövetett helye: docs/test-plans/<Osztály>.md (2026-11-06) ---
describe("(C) unit-teszt-terv: docs/test-plans/*.md, alkönyvtár nélkül", () => {
  const cases = [
    ["docs/test-plans/AdminOrderQueryService.md", "pass"],
    ["docs/test-plans/x/y.md", "deny"],
    ["docs/adr/0001-x.md", "deny"],
    ["docs/test-plans/A.java", "deny"],
    ["docs/test-plans/../adr/0001-x.md", "deny"],
    ["docs/orchestration/_kontextus/futasok.jsonl", "deny"],
  ];
  for (const [p, want] of cases) {
    test(`unit-test-write ${want}: ${p}`, () => expectDecision(write("unit-test-write", p), want, p));
    test(`unit-test-write ${want}: ${p} (abszolút)`, () => expectDecision(write("unit-test-write", join(PROJ, p)), want, p));
    test(`unit-test-bash ${want}: echo x > ${p}`, () => expectDecision(bash(UNIT, `echo x > ${p}`), want, p));
    test(`unit-test-bash [PowerShell] ${want}: Set-Content -Path ${p}`, () =>
      expectDecision(bash(UNIT, `Set-Content -Path ${p} -Value x`, PSH), want, p));
  }
  test("a többi író mód továbbra sem írhat a docs/test-plans/ alá", () => {
    expectDecision(write("e2e-write", "docs/test-plans/A.md"), "deny", "e2e-write");
    expectDecision(write("docs-write", "docs/test-plans/A.md"), "deny", "docs-write");
    expectDecision(bash(E2E, "echo x > docs/test-plans/A.md"), "deny", "e2e-bash");
  });
  test("a deny-szöveg megnevezi a tesztterv helyét", () => {
    assert.match(write("unit-test-write", "docs/adr/0001-x.md").reason, /docs\/test-plans\/<Osztály>\.md/);
  });
});

// --- (D) A munkaterületen kívüli írás (/tmp, %TEMP%) tiltva marad e2e- és unit-test-bash-ben ---
describe("(D) /tmp és %TEMP% tiltása, .scratch/-ajánlással", () => {
  const temp = String.raw`C:\Users\x\AppData\Local\Temp\a.log`;
  for (const mode of [E2E, UNIT]) {
    test(`${mode}: echo x > /tmp/a.log → deny, a .scratch/-et ajánlja`, () => {
      const r = bash(mode, "echo x > /tmp/a.log");
      expectDecision(r, "deny", "/tmp");
      assert.match(r.reason, /\.scratch\//);
      assert.match(r.reason, /munkaterületen KÍVÜL/);
    });
    test(`${mode} [PowerShell]: Out-File -FilePath ${temp} → deny, a .scratch/-et ajánlja`, () => {
      const r = bash(mode, `'x' | Out-File -FilePath ${temp}`, PSH);
      expectDecision(r, "deny", "Temp");
      assert.match(r.reason, /\.scratch\//);
      // POSIX-on a `C:\…` relatív útvonal (a projekt alá esik), ott csak az
      // engedélylista-szöveg jön; Windows-on a munkaterületen kívüli indok is.
      if (WIN) assert.match(r.reason, /munkaterületen KÍVÜL/);
    });
  }
  test("a projekten belüli, de idegen célpontnál nincs „kívül” indok", () => {
    const r = bash(UNIT, "echo x > client/src/a.ts");
    expectDecision(r, "deny", "client");
    assert.doesNotMatch(r.reason, /munkaterületen KÍVÜL/);
  });
  test("a .scratch/ alá írt napló mindkét módban átmegy", () => {
    expectDecision(bash(E2E, "mvn test > .scratch/mvn-test.log 2>&1"), "pass", "e2e .scratch");
    expectDecision(bash(UNIT, "mvn test > .scratch/mvn-test.log 2>&1"), "pass", "unit .scratch");
  });
});

bashCases("G-12 readonly-bash írások", [
  [RO, "echo x > f", "deny"],
  [RO, "echo x > .scratch/f", "deny"],
  [RO, "tee f", "deny"],
  [RO, "cp a b", "deny"],
  [RO, "Set-Content x y", "deny", PSH],
]);

describe("G-12 / G-14 Bash-írás worktree-ben", () => {
  test("e2e-bash: a projekt worktree-jében az e2e/ írható", () => {
    expectDecision(bash(E2E, "echo x > e2e/a.feature", { cwd: join(PROJ, ".claude", "worktrees", "wt1") }), "pass", "wt1");
  });
  test("e2e-bash: idegen worktree-ben deny", () => {
    expectDecision(bash(E2E, "echo x > e2e/a.feature", { cwd: join(PROJ, ".claude", "worktrees", "foreign") }), "deny", "foreign");
  });
  test("impl-bash: abszolút útvonal a spec/ alá", () => {
    expectDecision(bash(IMPL, `echo x > "${posix(join(PROJ, "spec", "x.md"))}"`), "deny", "abs");
  });
});

// --- G-13: író alakok a readonly engedélylistán ------------------------------------
bashCases("G-13 readonly író alakok", [
  [RO, "find . -delete", "blocked"],
  [RO, "find . -name '*.tmp' -exec rm {} \\;", "blocked"],
  [RO, "find . -execdir ls \\;", "blocked"],
  [RO, "find . -ok rm {} \\;", "blocked"],
  [RO, "find . -fprint out.txt", "blocked"],
  [RO, "curl -o f http://x", "blocked"],
  [RO, "curl -O http://x/f", "blocked"],
  [RO, "curl --output f http://x", "blocked"],
  [RO, "curl --remote-name http://x/f", "blocked"],
  [RO, "curl -sSLo f http://x", "blocked"],
  [RO, "curl -c cookies.txt http://x", "blocked"],
  [RO, "wget http://x", "blocked"],
  [RO, "sort -o out.txt in.txt", "blocked"],
  [RO, "sort -ro out.txt in.txt", "blocked"],
  [RO, "sort --output=o in", "blocked"],
  [RO, "git diff --output=x.patch", "blocked"],
  [RO, "git log --output x", "blocked"],
  [RO, "git show --output=f HEAD", "blocked"],
  [RO, "git branch newbranch", "deny"],
  [RO, "git remote add o http://x", "blocked"],
  [RO, "git remote set-url origin x", "blocked"],
  [RO, "git remote remove o", "blocked"],
  [RO, "git remote rename a b", "blocked"],
  [RO, "Invoke-WebRequest -Uri http://x -OutFile f", "blocked", PSH],
  [RO, "Invoke-WebRequest http://x -OutF:f", "blocked", PSH],
  [RO, "iwr http://x -o f", "blocked", PSH],
  [RO, "node-gyp rebuild", "blocked"],
  [RO, "echo x > $null.bak", "deny"],
  [RO, "echo x >NUL.ts", "deny"],
  [RO, "echo x > /dev/null.txt", "deny"],
  [RO, "'x' > $null.bak", "deny", PSH],
  [RO, "curl -X POST http://localhost:3001/api/x", "pass"],
  [RO, 'curl -s -X DELETE -H "Authorization: Bearer t" http://x', "pass"],
  [RO, "curl -sD - http://x", "pass"],
  [RO, 'curl -s -o /dev/null -w "%{http_code}" http://x', "pass"],
  [RO, "find . -name '*.java'", "pass"],
  [RO, "sort -n f", "pass"],
  [RO, "sort -t, -k2 f", "pass"],
  [RO, "git remote -v", "pass"],
  [RO, "git remote", "pass"],
  [RO, "git remote get-url origin", "pass"],
  [RO, "git branch -a", "pass"],
  [RO, "git diff --stat", "pass"],
  [RO, "echo x > /dev/null", "pass"],
  [RO, "Get-Content x 2> $null", "pass", PSH],
  [RO, "Invoke-RestMethod http://x", "pass", PSH],
  [RO, "node scripts/x.mjs", "pass"],
]);

// --- G-14 … G-17: útvonalak a Write-módokban --------------------------------------
describe("G-14/G-15 worktree a repón belül", () => {
  const wt = (...p) => join(PROJ, ".claude", "worktrees", ...p);
  test("e2e-write: a projekt worktree-jének e2e/ mappája írható", () => {
    expectDecision(write("e2e-write", wt("wt1", "e2e", "features", "a.feature")), "pass", "wt1 e2e");
  });
  test("impl-write: a worktree spec/ mappája védett", () => {
    expectDecision(write("impl-write", wt("wt1", "spec", "x.md")), "deny", "wt1 spec");
  });
  test("unit-test-write: a worktree teszt-fája írható", () => {
    expectDecision(write("unit-test-write", wt("wt1", "server-java", "src", "test", "java", "A.java")), "pass", "wt1 test");
  });
  test("unit-test-write: a worktree produkciós kódja tiltott", () => {
    expectDecision(write("unit-test-write", wt("wt1", "server-java", "src", "main", "java", "A.java")), "deny", "wt1 main");
  });
  test("docs-write: a worktree gyökér-README-je írható", () => {
    expectDecision(write("docs-write", wt("wt1", "README.md")), "pass", "wt1 readme");
  });
  test("e2e-write: idegen repóba mutató .git fájl nem munkafa", () => {
    expectDecision(write("e2e-write", wt("foreign", "e2e", "a.feature")), "deny", "foreign");
  });
  test("e2e-write: gitdir nélküli .git fájl nem munkafa", () => {
    expectDecision(write("e2e-write", join(PROJ, "fake", "e2e", "a.feature")), "deny", "fake");
  });
  test("e2e-write: a projekten kívüli idegen repó nem munkafa", () => {
    expectDecision(write("e2e-write", join(OTHER, "e2e", "a.feature")), "deny", "other");
  });
});

describe("G-16 spec/ a gyökérhez kötve", () => {
  test("impl-write: client/src/spec/x.ts átmegy", () => {
    expectDecision(write("impl-write", "client/src/spec/x.ts"), "pass", "client spec");
  });
  test("impl-write: spec/x.md deny", () => {
    expectDecision(write("impl-write", "spec/x.md"), "deny", "spec");
  });
  test("e2e-write: e2e/spec/x.ts átmegy", () => {
    expectDecision(write("e2e-write", "e2e/spec/x.ts"), "pass", "e2e spec");
  });
});

describe("G-17 Git-Bash alakú útvonal", { skip: !WIN && "csak Windows-on értelmes" }, () => {
  test("impl-write: /c/…/spec/x.md deny", () => {
    expectDecision(write("impl-write", gitBash(join(PROJ, "spec", "x.md"))), "deny", "gitbash spec");
  });
  test("e2e-write: /c/…/e2e/x.ts átmegy", () => {
    expectDecision(write("e2e-write", gitBash(join(PROJ, "e2e", "x.ts"))), "pass", "gitbash e2e");
  });
  test("impl-bash: echo > /c/…/spec/x.md deny", () => {
    // Idézve: a tesztprojekt útvonalában szóköz van (`.scratch/tmp/` a repóban).
    expectDecision(bash(IMPL, `echo x > "${gitBash(join(PROJ, "spec", "x.md"))}"`), "deny", "gitbash bash");
  });
  test("e2e-bash: Git-Bash cwd", () => {
    expectDecision(bash(E2E, "echo x > e2e/a.feature", { cwd: gitBash(PROJ) }), "pass", "gitbash cwd");
  });
});

// --- G-18: az ask-szöveg --------------------------------------------------------------
describe("G-18 ask-szöveg", () => {
  test("megnevezi a bukott szegmenseket, és nem validátort mond", () => {
    const r = bash(RO, "ls && awk '{print}' f && node-gyp rebuild");
    assert.equal(r.decision, "ask");
    assert.match(r.reason, /awk/);
    assert.match(r.reason, /node-gyp rebuild/);
    assert.doesNotMatch(r.reason, /`ls`/);
    assert.match(r.reason, /csak olvas/);
    assert.doesNotMatch(r.reason, /validátor/i);
  });
  test("a deny-szöveg megnevezi a szegmenst", () => {
    const r = bash(IMPL, "npm test && git push origin main");
    assert.equal(r.decision, "deny");
    assert.match(r.reason, /git push origin main/);
  });
});

// --- A régi viselkedés megtartása -------------------------------------------------------
bashCases("régi viselkedés — Bash", [
  [IMPL, "git push", "deny"],
  [RO, "git push", "deny"],
  [E2E, "git push", "deny"],
  [UNIT, "git push", "deny"],
  [IMPL, "git commit -m x", "deny"],
  [IMPL, "git checkout main", "deny"],
  [IMPL, "git tag v1", "deny"],
  [IMPL, "npm install x", "deny"],
  [IMPL, "npm i", "deny"],
  [IMPL, "pnpm add x", "deny"],
  [IMPL, "yarn add x", "deny"],
  [IMPL, "npx -y cowsay", "deny"],
  [IMPL, "npx --package=x foo", "deny"],
  [IMPL, "npm exec foo", "deny"],
  [IMPL, "pnpm dlx foo", "deny"],
  [IMPL, "yarn dlx foo", "deny"],
  [IMPL, "bunx foo", "deny"],
  [IMPL, "mvn dependency:go-offline", "deny"],
  [IMPL, "npm ci", "pass"],
  [IMPL, "npx tsc -p client/tsconfig.json", "pass"],
  [IMPL, "mvn test", "pass"],
  [IMPL, "git status", "pass"],
  [IMPL, "git diff HEAD~1", "pass"],
  [IMPL, "ls -la", "pass"],
  [RO, "sed -i 's/a/b/' f", "deny"],
  [RO, "echo x > f", "deny"],
  [RO, "rm -rf target", "deny"],
  [RO, "mkdir x", "deny"],
  [RO, "git status", "pass"],
  [RO, "git log --oneline -5", "pass"],
  [RO, "git show HEAD", "pass"],
  [RO, "git rev-parse HEAD", "pass"],
  [RO, "git ls-files", "pass"],
  [RO, "cat f | head -5 | wc -l", "pass"],
  [RO, "curl -s http://localhost:3001/api/health", "pass"],
  [RO, "npm run build", "pass"],
  [RO, "npm run lint", "pass"],
  [RO, "mvn verify", "pass"],
  [RO, "mvn -version", "pass"],
  [RO, "Get-ChildItem -Recurse | Select-String foo", "pass", PSH],
  [RO, "Test-Path x", "pass", PSH],
]);

describe("régi viselkedés — Write-módok", () => {
  const cases = [
    ["impl-write", "spec/backend/x.md", "deny"],
    ["impl-write", "spec/admin-orders/tasks.md", "deny"],
    ["impl-write", "server-java/src/main/resources/db/migration/V1__init.sql", "deny"],
    ["impl-write", "server-java/src/main/resources/db/migration/V2__new.sql", "pass"],
    ["impl-write", "package.json", "ask"],
    ["impl-write", "client/package.json", "ask"],
    ["impl-write", "server-java/pom.xml", "ask"],
    ["impl-write", "client/src/App.tsx", "pass"],
    ["e2e-write", "client/src/App.tsx", "deny"],
    ["e2e-write", "e2e/package.json", "ask"],
    ["e2e-write", "e2e/features/a.feature", "pass"],
    ["e2e-write", ".scratch/x.md", "pass"],
    ["e2e-write", "spec/x.md", "deny"],
    ["unit-test-write", "server-java/src/main/java/A.java", "deny"],
    ["unit-test-write", "server-java/pom.xml", "deny"],
    ["unit-test-write", "server-java/src/test/../main/java/A.java", "deny"],
    ["unit-test-write", "server-java/src/test/java/ATest.java", "pass"],
    ["docs-write", "README.md", "pass"],
    ["docs-write", "openapi.yaml", "pass"],
    ["docs-write", "server-java/README.md", "deny"],
    ["docs-write", "e2e/README.md", "deny"],
  ];
  for (const [mode, p, want] of cases) {
    test(`${mode} ${want}: ${p}`, () => expectDecision(write(mode, p), want, p));
    test(`${mode} ${want}: ${p} (abszolút)`, () => expectDecision(write(mode, join(PROJ, p)), want, p));
  }
});

describe("hibatűrés és módok", () => {
  const modes = ["impl-write", "e2e-write", "unit-test-write", "docs-write", "docs-writer-write", "impl-bash", "e2e-bash", "unit-test-bash", "readonly-bash"];  test("a switch (MODE) pontosan a várt módokat ismeri (az ellenoriz.mjs innen olvas)", () => {
    const src = readFileSync(HOOK, "utf8");
    const found = [...src.slice(src.indexOf("switch (MODE)")).matchAll(/case\s+"([^"]+)"\s*:/g)].map((m) => m[1]);
    assert.deepEqual([...found].sort(), [...modes].sort());
  });
  for (const mode of [...modes, "__ismeretlen__"]) {
    test(`${mode}: üres bemenet → nincs kimenet`, () => {
      expectDecision(run(mode, ""), "pass", "üres");
      expectDecision(run(mode, "{nem json"), "pass", "hibás json");
      expectDecision(run(mode, {}), "pass", "üres objektum");
    });
  }
  test("ismeretlen mód: még tiltott parancsra sincs ítélet", () => {
    expectDecision(bash("impl-bassh", "git push"), "pass", "elgépelt mód");
  });
  test("lezáratlan idézőjel nem dönti el a hookot", () => {
    expectDecision(bash(IMPL, "echo \"abc && git push"), "pass", "lezáratlan");
    expectDecision(bash(RO, "echo 'abc"), "pass", "lezáratlan ro");
  });
  test("mélyen egymásba ágyazott behelyettesítés: nem csendes átengedés", () => {
    let cmd = "ls";
    for (let k = 0; k < 80; k += 1) cmd = `echo $(${cmd}) $(ls)`;
    const r = bash(IMPL, cmd);
    assert.equal(r.decision, "ask");
    assert.match(r.reason, /túl sok beágyazott parancstörzs \(\d+ > 64\)/);
  });
});

// =====================================================================================
// 2026-11-06 javítókör (G2-3 … G2-13, A2-11, A2-14, SB2-10)
// =====================================================================================

// --- G2-10: readonly engedélylista — olvasó shell-eszközök, java -version --------------
bashCases("G2-10 readonly engedélylista bővítése", [
  [RO, "stat -c %s f", "pass"],
  [RO, "du -sh server-java/target", "pass"],
  [RO, "file x.png", "pass"],
  [RO, "cut -d, -f1 f.csv", "pass"],
  [RO, "tr a-z A-Z < f", "pass"],
  [RO, "basename /a/b.txt .txt", "pass"],
  [RO, "dirname /a/b", "pass"],
  [RO, "realpath x", "pass"],
  [RO, "printf '%s\\n' a b", "pass"],
  [RO, "java -version", "pass"],
  [RO, "java --version 2>&1 | head -1", "pass"],
  [RO, "awk -F, '{print $1}' f", "ask"],
  [RO, "java", "ask"],
  [RO, "java -jar x.jar", "ask"],
  [RO, "java Foo.java", "ask"],
  [RO, "java -version -jar x.jar", "ask"],
  [RO, "file -C -m magic", "ask"],
  [RO, "printf x > f", "deny"],
  [RO, "cut -f1 f > .scratch/o", "deny"],
]);

// --- A2-11 / G2-11: önvédelem — .claude/ és a költségkapu küszöbei ------------------------
const SELF_PATHS = [
  ".claude/hooks/spec-guard.mjs",
  ".claude/hooks/uj.mjs",
  ".claude/agents/spec-implementer.md",
  ".claude/skills/feature-implement/SKILL.md",
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/SETTINGS.JSON",
  "docs/orchestration/_kontextus/keretek.json",
  "docs/orchestration/_kontextus/receptek.json",
  "docs/orchestration/_kontextus/arak.json",
];
const SELF_RE = /fejlesztő döntései/;

describe("A2-11/G2-11 önvédelem — Write-módok", () => {
  for (const mode of ["impl-write", "e2e-write", "unit-test-write", "docs-write", "docs-writer-write"]) {
    for (const p of SELF_PATHS) {
      test(`${mode} deny: ${p}`, () => {
        const r = write(mode, p);
        expectDecision(r, "deny", p);
        assert.match(r.reason, SELF_RE);
      });
    }
    test(`${mode} deny: a worktree saját .claude/hooks/ mappája (abszolút)`, () => {
      const r = write(mode, join(PROJ, ".claude", "worktrees", "wt1", ".claude", "hooks", "spec-guard.mjs"));
      expectDecision(r, "deny", "wt1 hooks");
      assert.match(r.reason, SELF_RE);
    });
    test(`${mode} pass: .scratch/ marad szabad`, () => expectDecision(write(mode, ".scratch/x.md"), "pass", ".scratch"));
  }
  test("impl-write: a nem védett .claude/ és _kontextus/ fájlok írhatók", () => {
    expectDecision(write("impl-write", ".claude/README.md"), "pass", ".claude/README.md");
    expectDecision(write("impl-write", "docs/orchestration/_kontextus/futasok.jsonl"), "pass", "futasok.jsonl");
    expectDecision(write("impl-write", ".claude/worktrees/wt1/client/src/a.ts"), "pass", "wt1 client");
    expectDecision(write("impl-write", ".claude/hookshelper.mjs"), "pass", "hookshelper");
  });
});

describe("A2-11/G2-11 önvédelem — Bash-írási célok minden módban", () => {
  const cmds = [
    ["echo x > .claude/hooks/spec-guard.mjs"],
    ["sed -i s/deny/allow/ .claude/hooks/spec-guard.mjs"],
    ["echo '{}' > .claude/settings.json"],
    ["tee .claude/settings.local.json < f"],
    ["cp x.md .claude/agents/"],
    ["cp x.md .claude/agents/spec-validator.md"],
    ["mv x .claude/skills/a/SKILL.md"],
    ["rm -rf .claude"],
    ["rm -rf .claude/skills"],
    ["rm .claude/hooks/spec-guard.mjs"],
    ["mv docs/orchestration/_kontextus/keretek.json x.json"],
    ["echo '{}' > docs/orchestration/_kontextus/receptek.json"],
    ["cd docs/orchestration/_kontextus && echo '{}' > arak.json"],
    ["cd .claude && echo x > hooks/a.mjs"],
    ["tar -xf a.tar -C .claude"],
    ["rsync -a x/ docs/orchestration/_kontextus/"],
    ["ln -s /evil .claude/hooks/spec-guard.mjs"],
    ["chmod 777 .claude/settings.json"],
    ["echo x > .claude/worktrees/wt1/.claude/settings.json"],
    ["Set-Content -Path .claude/settings.local.json -Value x", PSH],
    ["Remove-Item -Recurse .claude/hooks", PSH],
    ["Copy-Item x.json -Destination docs/orchestration/_kontextus/keretek.json", PSH],
  ];
  for (const mode of [IMPL, E2E, UNIT, RO]) {
    for (const [cmd, opts] of cmds) {
      test(`${mode} deny: ${cmd}`, () => {
        const r = bash(mode, cmd, opts);
        expectDecision(r, "deny", cmd);
        assert.match(r.reason, SELF_RE, cmd);
      });
    }
    test(`${mode} deny: worktree cwd, a munkafa saját .claude/hooks/ mappája`, () => {
      const r = bash(mode, "echo x > .claude/hooks/a.mjs", { cwd: join(PROJ, ".claude", "worktrees", "wt1") });
      expectDecision(r, "deny", "wt1 cwd");
      assert.match(r.reason, SELF_RE);
    });
  }
  test("impl-bash: a projekt szülőkönyvtárának törlése is deny", () => {
    expectDecision(bash(IMPL, `rm -rf "${posix(ROOT)}"`), "deny", "ROOT");
  });
  test("readonly: a deny-szöveg az önvédelmi indokot adja, nem csak a „csak olvas”-t", () => {
    const r = bash(RO, "rm -rf .claude/hooks");
    assert.equal(r.decision, "deny");
    assert.match(r.reason, SELF_RE);
  });
});

bashCases("A2-11/G2-11 önvédelem — ami átmegy, ill. a szülőkönyvtár törlése", [
  [IMPL, "echo x > .scratch/a.txt", "pass"],
  [E2E, "echo x > .scratch/a.txt", "pass"],
  [UNIT, "echo x > .scratch/a.txt", "pass"],
  [IMPL, "echo x > .claude/worktrees/wt1/client/a.ts", "pass"],
  [IMPL, "echo x >> docs/orchestration/_kontextus/futasok.jsonl", "pass"],
  [IMPL, "cat .claude/settings.json | jq . > .scratch/s.json", "pass"],
  [IMPL, "cp .claude/settings.json .scratch/", "pass"],
  [IMPL, "mkdir -p .claude/worktrees/uj", "pass"],
  [IMPL, "mkdir -p docs/orchestration", "pass"],
  [IMPL, "rm -rf server-java/target", "pass"],
  [IMPL, "rm -rf .claude/worktrees/wt1/client", "pass"],
  [IMPL, "rm -rf docs", "deny"],
  [IMPL, "rm -rf docs/orchestration", "deny"],
  [IMPL, "rm -rf .", "deny"],
  [IMPL, "mv spec x", "deny"],
  [IMPL, "tar -xf a.tar", "deny"],
  [IMPL, "unzip a.zip -d .", "deny"],
  [IMPL, "rsync -a x/ ./", "deny"],
  [IMPL, "cd client && rm -rf ..", "deny"],
]);

// --- G2-5: writeTargets — ln, install, mkdir, perl -i, awk -i inplace, rsync, tar, unzip, patch, chmod/chown ---
bashCases("G2-5 további írási célpontok", [
  [IMPL, "ln -s ../x spec/y", "deny"],
  [IMPL, "ln -sf x spec/backend/y.md", "deny"],
  [IMPL, "ln -st spec ../x", "deny"],
  [IMPL, "ln -s -t spec ../x", "deny"],
  [IMPL, "ln -s ../spec/backend/x.md client/x.md", "deny"],
  [IMPL, "ln spec/a.md client/a.md", "deny"],
  [IMPL, "cd spec && ln -s ../client/x", "deny"],
  [IMPL, "install -m 644 a spec/a", "deny"],
  [IMPL, "install -t spec a b", "deny"],
  [IMPL, "install -d spec/x", "deny"],
  [IMPL, "mkdir spec/x", "deny"],
  [IMPL, "mkdir -p -m 755 client/a spec/b", "deny"],
  [IMPL, "mkdir -m755 spec", "deny"],
  [IMPL, "perl -pi -e 's/a/b/' spec/x.md", "deny"],
  [IMPL, "perl -i.bak -pe 's/a/b/' spec/x.md", "deny"],
  [IMPL, "perl -pie 's/a/b/' spec/x.md", "deny"],
  [IMPL, "perl -i -lane 'print' client/a spec/x.md", "deny"],
  [IMPL, "awk -i inplace '{print}' spec/x.md", "deny"],
  [IMPL, "gawk -i inplace -f p.awk spec/x.md", "deny"],
  [IMPL, "awk --include=inplace -v x=1 '{print}' spec/x.md", "deny"],
  [IMPL, "rsync -a x/ spec/", "deny"],
  [IMPL, "rsync -av --delete -e ssh x/ spec/backend", "deny"],
  [IMPL, "rsync -a --log-file=spec/x.log x/ .scratch/y", "deny"],
  [IMPL, "tar -xf a.tar -C spec", "deny"],
  [IMPL, "tar xzf a.tgz -C spec", "deny"],
  [IMPL, "tar --extract --file a.tar --directory=spec", "deny"],
  [IMPL, "tar -czf spec/a.tgz client", "deny"],
  [IMPL, "cd spec && tar -xf ../a.tar", "deny"],
  [IMPL, "unzip a.zip -d spec", "deny"],
  [IMPL, "unzip -o a.zip -d spec/backend", "deny"],
  [IMPL, "patch -o spec/x.md a.md < p.diff", "deny"],
  [IMPL, "patch spec/x.md < p.diff", "deny"],
  [IMPL, "patch -d spec -p1 < p.diff", "deny"],
  [IMPL, "chmod 644 spec/x.md", "deny"],
  [IMPL, "chmod -x spec/x.md", "deny"],
  [IMPL, "chmod -R u+w spec", "deny"],
  [IMPL, "chown -R me:me spec", "deny"],
  [IMPL, "chmod --reference=a spec/x.md", "deny"],
  [IMPL, "New-Item -ItemType SymbolicLink -Path client/x -Target spec/y", "deny", PSH],
  [IMPL, "Expand-Archive a.zip -DestinationPath spec", "deny", PSH],
  [IMPL, "perl -ne 'print' spec/x.md", "pass"],
  [IMPL, "perl -e 'print 1' > .scratch/o", "pass"],
  [IMPL, "awk '{print}' spec/x.md", "pass"],
  [IMPL, "tar -tf a.tar", "pass"],
  [IMPL, "tar -xOf a.tar x", "pass"],
  [IMPL, "tar -czf .scratch/spec.tgz spec", "pass"],
  [IMPL, "tar -xf a.tar -C .scratch/x", "pass"],
  [IMPL, "unzip -l a.zip", "pass"],
  [IMPL, "rsync -n -a x/ spec/", "pass"],
  [IMPL, "rsync -a spec/ .scratch/spec-masolat", "pass"],
  [IMPL, "rsync -a x/ user@host:spec/", "pass"],
  [IMPL, "mkdir -p client/src/x", "pass"],
  [IMPL, "chmod +x start.sh", "pass"],
  [IMPL, "ln -s ../client/src .scratch/src", "pass"],
  [IMPL, "patch --dry-run -p1 < p.diff", "pass"],
  [IMPL, "patch client/a.ts < .scratch/p.diff", "pass"],
  [E2E, "mkdir -p e2e/features/x", "pass"],
  [E2E, "mkdir .scratch", "pass"],
  [E2E, "mkdir -p .scratch/a e2e/b", "pass"],
  [E2E, "mkdir client/x", "deny"],
  [E2E, "tar -xf a.tar -C e2e", "pass"],
  [E2E, "unzip a.zip", "deny"],
  [E2E, "cd e2e && patch -p1 < ../.scratch/p.diff", "pass"],
  [E2E, "patch -p1 < .scratch/p.diff", "deny"],
  [E2E, "ln -s ../client/src e2e/src", "deny"],
  [E2E, "chmod +x e2e/run.sh", "pass"],
  [E2E, "perl -pi -e 's/a/b/' e2e/a.feature", "pass"],
  [E2E, "perl -pi -e 's/a/b/' client/src/App.tsx", "deny"],
  [UNIT, "rsync -a .scratch/x/ server-java/src/main/java/", "deny"],
  [UNIT, "mkdir -p server-java/src/test/java/hu/x", "pass"],
  [RO, "mkdir x", "deny"],
  [RO, "tar -xf a.tar", "deny"],
  [RO, "unzip a.zip -d .scratch", "deny"],
  [RO, "perl -pi -e 1 f", "deny"],
  [RO, "rsync -a x/ y", "deny"],
  [RO, "chgrp g f", "deny"],
]);

// --- G2-7: parancsot futtató git-konfiguráció és -környezet ----------------------------
const EXEC_CONFIGS = [
  "core.fsmonitor=x", "core.pager=x", "core.sshCommand=x", "core.editor=x", "core.hooksPath=x",
  "core.askPass=x", "diff.external=x", "diff.foo.textconv=x", "filter.lfs.smudge=x", "credential.helper=x",
  "credential.https://x.helper=x", "sequence.editor=x", "gpg.program=x", "gpg.ssh.program=x", "pager.log=x",
  "CORE.PAGER=x", "include.path=/tmp/x", "diff.x.command=y",
];
describe("G2-7 git -c / --config-env kódfuttató kulcsok", () => {
  for (const mode of [IMPL, E2E, UNIT, RO]) {
    for (const kv of EXEC_CONFIGS) {
      test(`${mode} deny: git -c ${kv} log`, () => expectDecision(bash(mode, `git -c ${kv} log`), "deny", kv));
    }
    test(`${mode} deny: --config-env két alakja`, () => {
      expectDecision(bash(mode, "git --config-env=core.pager=EVIL log"), "deny", "--config-env=");
      expectDecision(bash(mode, "git --config-env core.fsmonitor=EVIL status"), "deny", "--config-env ");
    });
  }
  test("a deny-szöveg a --no-pager-t ajánlja", () => {
    assert.match(bash(RO, "git -c core.pager=cat log").reason, /--no-pager/);
  });
});

bashCases("G2-7 difftool/mergetool és git-környezeti változók", [
  [IMPL, "git difftool -x evil", "deny"],
  [IMPL, "git difftool -xevil HEAD", "deny"],
  [IMPL, "git difftool --extcmd=evil", "deny"],
  [IMPL, "git difftool --extcmd evil", "deny"],
  [IMPL, "git mergetool --tool-cmd=evil", "deny"],
  [RO, "git difftool -x evil", "deny"],
  [IMPL, "GIT_EXTERNAL_DIFF=evil git diff", "deny"],
  [IMPL, "GIT_PAGER=evil git log", "deny"],
  [IMPL, "GIT_SSH_COMMAND=evil git fetch", "deny"],
  [IMPL, "GIT_EDITOR=evil git status", "deny"],
  [IMPL, "PAGER=evil git -p log", "deny"],
  [IMPL, "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.pager GIT_CONFIG_VALUE_0=evil git log", "deny"],
  [IMPL, "env GIT_PAGER=evil git log", "deny"],
  [IMPL, "export GIT_PAGER=evil; git log", "deny"],
  [IMPL, "export GIT_EXTERNAL_DIFF=evil && git diff", "deny"],
  [IMPL, "sudo GIT_PAGER=evil git log", "deny"],
  [IMPL, "bash -c 'GIT_PAGER=evil git log'", "deny"],
  [IMPL, "$env:GIT_PAGER = 'evil'; git log", "deny", PSH],
  [IMPL, "$env:GIT_EXTERNAL_DIFF='evil'; git diff", "deny", PSH],
  [IMPL, "Set-Item -Path env:GIT_SSH_COMMAND -Value evil", "deny", PSH],
  [RO, "GIT_PAGER=evil git log", "deny"],
  [RO, "GIT_EXTERNAL_DIFF=evil git diff", "deny"],
  [RO, "$env:GIT_PAGER = 'evil'", "deny", PSH],
  [IMPL, "git --no-pager log", "pass"],
  [RO, "git --no-pager log --oneline", "pass"],
  [IMPL, "git -c core.quotepath=off log", "pass"],
  [IMPL, "git -c color.ui=never diff", "pass"],
  [IMPL, "FOO=1 git log", "pass"],
  [IMPL, "GIT_DIR=.git git log", "pass"],
  [IMPL, "$env:FOO = 'x'; git log", "pass", PSH],
  [RO, "git difftool --tool-help", "ask"],
]);

// --- G2-6: $'…' és $"…" idézés ---------------------------------------------------------
bashCases("G2-6 ANSI-C és $\"…\" idézés", [
  [IMPL, "git $'commit' -m x", "deny"],
  [IMPL, "$'git' push", "deny"],
  [IMPL, "npm $'install' x", "deny"],
  [IMPL, "echo x > $'spec/x/r.md'", "deny"],
  [IMPL, "git $'\\x63ommit' -m x", "deny"],
  [IMPL, "git $'\\143ommit' -m x", "deny"],
  [IMPL, "git $'\\u0063ommit' -m x", "deny"],
  [IMPL, "git $'pu'sh", "deny"],
  [IMPL, "$\"git\" push", "deny"],
  [IMPL, "git $\"push\"", "deny"],
  [IMPL, "echo x > $\"spec/a.md\"", "deny"],
  [IMPL, "echo $'a\\'b' && git push", "deny"],
  [IMPL, "echo $(echo $'a\\')'; git push)", "deny"],
  [IMPL, "echo $'git push'", "pass"],
  [IMPL, "echo \"$'git push'\"", "pass"],
  [RO, "echo $'a\\nb'", "pass"],
  [RO, "printf $'%s\\t%s\\n' a b", "pass"],
  [RO, "echo x > $'f'", "deny"],
  [E2E, "echo x > $'e2e/a.feature'", "pass"],
  [E2E, "echo x > $'client/a.ts'", "deny"],
]);

// --- G2-8: további burkolók ----------------------------------------------------------------
bashCases("G2-8 burkolók: stdbuf, winpty, noglob, nocorrect, setsid, ionice, chronic, flock, watch, unbuffer", [
  [IMPL, "stdbuf -oL git push", "deny"],
  [IMPL, "stdbuf -o L -e 0 git push", "deny"],
  [IMPL, "winpty git push", "deny"],
  [IMPL, "noglob git push", "deny"],
  [IMPL, "nocorrect git push", "deny"],
  [IMPL, "setsid git push", "deny"],
  [IMPL, "setsid -f git push", "deny"],
  [IMPL, "ionice -c3 git push", "deny"],
  [IMPL, "ionice -c 2 -n 7 git push", "deny"],
  [IMPL, "chronic git push", "deny"],
  [IMPL, "chronic -e git push", "deny"],
  [IMPL, "flock .scratch/l git push", "deny"],
  [IMPL, "flock -w 5 .scratch/l git push", "deny"],
  [IMPL, "flock .scratch/l -c 'git push'", "deny"],
  [IMPL, "watch git push", "deny"],
  [IMPL, "watch -n 5 'git push'", "deny"],
  [IMPL, "watch -x git push", "deny"],
  [IMPL, "unbuffer git push", "deny"],
  [IMPL, "unbuffer -p git push", "deny"],
  [IMPL, "nice -n 5 stdbuf -oL timeout 60 git push", "deny"],
  [IMPL, "stdbuf -oL mvn test", "pass"],
  [IMPL, "flock .scratch/l mvn test", "pass"],
  [IMPL, "flock spec/x.lock mvn test", "deny"],
  [E2E, "flock client/x.lock ls", "deny"],
  [RO, "stdbuf -oL ls", "pass"],
  [RO, "chronic ls", "pass"],
  [RO, "watch ls", "ask"],
  [RO, "watch -n 1 'git status'", "ask"],
]);

// --- G2-9: readonly — író és soha ki nem lépő tsc/mvn/vitest/eslint/npm alakok ------------
bashCases("G2-9 readonly: tsc, mvn, vitest, eslint, soha ki nem lépő alakok", [
  [RO, "npx tsc --noEmit", "pass"],
  [RO, "npx tsc -p client/tsconfig.json --noEmit", "pass"],
  [RO, "npx tsc --noemit -p client/tsconfig.json", "pass"],
  [RO, "npx tsc", "ask"],
  [RO, "npx tsc -p client/tsconfig.json", "ask"],
  [RO, "npx tsc --noEmit --init", "ask"],
  [RO, "npx tsc --noEmit -b", "ask"],
  [RO, "npx tsc --noEmit --build", "ask"],
  [RO, "npx tsc --noEmit --outDir x", "ask"],
  [RO, "npx tsc --noEmit --outFile x.js", "ask"],
  [RO, "npx tsc --noEmit --declarationDir x", "ask"],
  [RO, "npx tsc --noEmit --generateTrace x", "ask"],
  [RO, "npx tsc --noEmit false", "ask"],
  [RO, "npx tsc --noEmit --watch", "ask"],
  [RO, "npx tsc --noEmit --incremental", "ask"],
  [RO, "mvn help:evaluate -Dexpression=project.version -Doutput=x.txt", "ask"],
  [RO, "mvn test -Dmaven.repo.local=.scratch/m2", "ask"],
  [RO, "mvn -DoutputFile=x.txt verify", "ask"],
  [RO, "mvn verify -DaltDeploymentRepository=x::file:x", "ask"],
  [RO, "mvn test -D output=x", "ask"],
  [RO, "mvn test --define=outputFile=x", "ask"],
  [RO, "mvn test -Dtest=X -DfailIfNoSpecifiedTests=false -Djacoco.skip=true", "pass"],
  [RO, "npx vitest run --coverage.reportsDirectory=x", "ask"],
  [RO, "npx vitest run --coverage.reportsDirectory x", "ask"],
  [RO, "npx vitest run --outputFile=x.json", "ask"],
  [RO, "npx vitest run --outputFile.json=x.json", "ask"],
  [RO, "npx vitest run --update", "ask"],
  [RO, "npx vitest", "ask"],
  [RO, "npx vitest watch", "ask"],
  [RO, "npx vitest run --watch", "ask"],
  [RO, "npx vitest --run", "pass"],
  [RO, "npx vitest run client/test/x.test.ts", "pass"],
  [RO, "npx eslint --cache-location x .", "ask"],
  [RO, "npx eslint --cache .", "ask"],
  [RO, "npx eslint --output-file=x .", "ask"],
  [RO, "npx eslint --fix-dry-run .", "ask"],
  [RO, "npx eslint --fix-type problem .", "ask"],
  [RO, "npx eslint --max-warnings 0 .", "pass"],
  [RO, "npm run dev", "ask"],
  [RO, "npm --prefix client run dev", "ask"],
  [RO, "npm run test:watch", "ask"],
  [RO, "npm run build:watch", "ask"],
  [RO, "npm test -- --watch", "ask"],
  [RO, "npm run lint -- --cache-location x", "ask"],
  [RO, "npm test -- --coverage.reportsDirectory=x", "ask"],
  [RO, "npx vite", "ask"],
  [RO, "vite", "ask"],
  [RO, "npx vite build", "ask"],
  [RO, "npm run build", "pass"],
  [RO, "npm test", "pass"],
]);

// --- A2-14: readonly node — repó-beli szkript és --test igen, -e/-p/stdin nem ---------------
bashCases("A2-14 readonly node", [
  [RO, "node scripts.mjs", "pass"],
  [RO, "node .claude/skills/skill-iro/scripts/ellenoriz.mjs --mind", "pass"],
  [RO, "node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store", "pass"],
  [RO, 'node --test "test/hooks/*.test.mjs"', "pass"],
  [RO, "node --test test/hooks/a.test.mjs test/hooks/b.test.mjs", "pass"],
  [RO, "node --test", "pass"],
  [RO, "node --test --test-reporter=spec test/x.test.mjs", "pass"],
  [RO, "node --test --test-reporter spec test/x.test.mjs", "pass"],
  [RO, "node --no-warnings x.cjs", "pass"],
  [RO, "node --version", "pass"],
  [RO, "cd server-java && node ../scripts.mjs", "pass"],
  [RO, 'node -e "1"', "ask"],
  [RO, "node -p 1", "ask"],
  [RO, "node --eval 1", "ask"],
  [RO, "node --print 1", "ask"],
  [RO, "node -", "ask"],
  [RO, "cat x.mjs | node -", "ask"],
  [RO, "node", "ask"],
  [RO, "node --import data:text/javascript,1 scripts.mjs", "ask"],
  [RO, "node -r ./evil.cjs scripts.mjs", "ask"],
  [RO, "node --test --test-reporter-destination=x.txt", "ask"],
  [RO, "node /tmp/x.mjs", "ask"],
  [RO, "node x.ts", "ask"],
  [RO, "NODE_OPTIONS=--import=data:x node scripts.mjs", "ask"],
  [RO, "JAVA_TOOL_OPTIONS=-javaagent:x.jar mvn test", "ask"],
  [RO, "npm_config_script_shell=evil npm test", "ask"],
  [RO, "CI=1 npm test", "pass"],
  [IMPL, 'node -e "1"', "pass"],
]);
test("A2-14: a projekten kívüli szkript (abszolút) ask", () => {
  expectDecision(bash(RO, `node "${posix(join(OTHER, "x.mjs"))}"`), "ask", "OTHER");
});

// --- G2-3: könyvtárba célzott cp/mv — cél = könyvtár + a forrás alapneve ---------------------
bashCases("G2-3 cp/mv könyvtár-célpont", [
  [E2E, "cp .scratch/x.feature e2e/", "pass"],
  [E2E, "cp .scratch/x.feature e2e", "pass"],
  [E2E, "cd e2e && cp ../.scratch/x.mjs .", "pass"],
  [E2E, "mv e2e/a.mjs .scratch/", "pass"],
  [E2E, "cp -r e2e/features .scratch", "pass"],
  [E2E, "cp -r e2e/features/. .scratch/f", "pass"],
  [E2E, "cp .scratch/a.mjs .scratch/b.mjs e2e/features", "pass"],
  [E2E, "cp -t e2e .scratch/a .scratch/b", "pass"],
  [E2E, "cp --target-directory=e2e .scratch/a", "pass"],
  [E2E, "Copy-Item .scratch/a.mjs -Destination e2e/", "pass", PSH],
  [E2E, "Move-Item e2e/a.mjs .scratch", "pass", PSH],
  [E2E, "cp .scratch/x.ts client/", "deny"],
  [E2E, "cp -r .scratch/x client", "deny"],
  [E2E, "mv e2e/a.mjs client/", "deny"],
  [E2E, "mv client/a.ts e2e/", "deny"],
  [E2E, "cp e2e/a.mjs .", "deny"],
  [E2E, "cp -T .scratch/x e2e", "deny"],
  [E2E, "cp -r e2e/features .claude/hooks", "deny"],
  [E2E, "cp x.mjs .claude/hooks/", "deny"],
  [UNIT, "cp server-java/target/site/jacoco/jacoco.csv .scratch/", "pass"],
  [UNIT, "cp .scratch/AService.md docs/test-plans/", "pass"],
  [UNIT, "cp README.md docs/test-plans/", "deny"],
  [UNIT, "cp .scratch/x.java server-java/src/main/java/", "deny"],
  [IMPL, "cp a.md spec/", "deny"],
  [IMPL, "cp a.md b.md spec", "deny"],
  [IMPL, "cp a.md client/", "pass"],
]);

// --- SB2-10: docs/test-plans/README.md nem tesztterv --------------------------------------
describe("SB2-10 docs/test-plans/README.md kizárva", () => {
  for (const p of ["docs/test-plans/README.md", "docs/test-plans/readme.md", "docs/test-plans/ReadMe.MD"]) {
    test(`unit-test-write deny: ${p}`, () => expectDecision(write("unit-test-write", p), "deny", p));
    test(`unit-test-bash deny: echo x > ${p}`, () => expectDecision(bash(UNIT, `echo x > ${p}`), "deny", p));
  }
  for (const p of ["docs/test-plans/ReadmeService.md", "docs/test-plans/READMEParser.md"]) {
    test(`unit-test-write pass: ${p}`, () => expectDecision(write("unit-test-write", p), "pass", p));
  }
});

// --- G2-12: a korlát szövege a kódot írja le — törzsek száma, nem mélység -------------------
test("G2-12: 70 EGYMÁS MELLETTI $(…) is kimeríti a korlátot, és a szöveg ezt mondja", () => {
  const r = bash(IMPL, "echo " + "$(ls) ".repeat(70));
  assert.equal(r.decision, "ask");
  assert.match(r.reason, /túl sok beágyazott parancstörzs \(71 > 64\)/);
});
test("G2-12: 63 egymás melletti $(…) még végigvizsgálható", () => {
  expectDecision(bash(IMPL, "echo " + "$(ls) ".repeat(63)), "pass", "63");
});

// --- G2-13: szóközös projektútvonal és valódi `git worktree add` ------------------------------
const GIT_OK = spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;
describe("G2-13 szóközös projektútvonal, valódi git worktree", { skip: !GIT_OK && "nincs git" }, () => {
  let ROOT2;
  let P2; // „fake proj” — szóköz az útvonalban
  let WT; // valódi `git worktree add`-dal létrehozott munkafa a repón belül
  const git = (cwd, ...args) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  };
  const run2 = (mode, input) => run(mode, input, { CLAUDE_PROJECT_DIR: P2 });
  const bash2 = (mode, command, cwd = P2) => run2(mode, { tool_name: "Bash", tool_input: { command }, cwd });
  const write2 = (mode, filePath) => run2(mode, { tool_name: "Write", tool_input: { file_path: filePath } });

  before(() => {
    ROOT2 = realpathSync.native(scratchTemp("spec-guard wt-"));
    P2 = join(ROOT2, "fake proj");
    mkdirSync(join(P2, "e2e"), { recursive: true });
    mkdirSync(join(P2, ".scratch"), { recursive: true });
    writeFileSync(join(P2, "README.md"), "x\n");
    writeFileSync(join(P2, ".gitignore"), ".claude/worktrees/\n.scratch/\n");
    git(P2, "init", "-q");
    git(P2, "add", "-A");
    git(P2, "commit", "-q", "-m", "init");
    WT = join(P2, ".claude", "worktrees", "feat-e2e");
    git(P2, "worktree", "add", "-q", "-b", "wt/feat-e2e", WT);
    mkdirSync(join(WT, ".scratch"), { recursive: true });
  });
  after(() => {
    if (ROOT2) rmSync(ROOT2, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test("a munkafa .git fájlja valóban a projekt .git/worktrees/ alá mutat", () => {
    assert.match(readFileSync(join(WT, ".git"), "utf8"), /^gitdir: .*\/\.git\/worktrees\/feat-e2e/m);
  });
  test("szóközös gyökér: e2e-bash az e2e/ alá ír, a client/ alá nem", () => {
    expectDecision(bash2(E2E, "echo x > e2e/a.feature"), "pass", "e2e");
    expectDecision(bash2(E2E, "echo x > client/a.ts"), "deny", "client");
    expectDecision(bash2(E2E, `cd "${posix(join(P2, "e2e"))}" && cp ../.scratch/x.mjs .`), "pass", "cd + cp .");
    expectDecision(bash2(E2E, `echo x > "${posix(join(P2, "e2e", "b.feature"))}"`), "pass", "idézett abszolút");
  });
  test("szóközös gyökér: önvédelem", () => {
    expectDecision(bash2(IMPL, "echo x > .claude/hooks/spec-guard.mjs"), "deny", "hooks");
    expectDecision(write2("impl-write", join(P2, ".claude", "settings.json")), "deny", "settings");
    expectDecision(bash2(IMPL, `rm -rf "${posix(P2)}"`), "deny", "gyökér törlése");
  });
  test("valódi worktree: Write-módok a munkafa gyökeréhez relativizálnak", () => {
    expectDecision(write2("e2e-write", join(WT, "e2e", "a.feature")), "pass", "wt e2e");
    expectDecision(write2("e2e-write", join(WT, "client", "a.ts")), "deny", "wt client");
    expectDecision(write2("impl-write", join(WT, "spec", "x.md")), "deny", "wt spec");
    const r = write2("impl-write", join(WT, ".claude", "hooks", "spec-guard.mjs"));
    expectDecision(r, "deny", "wt hooks");
    assert.match(r.reason, SELF_RE);
    expectDecision(write2("docs-write", join(WT, "README.md")), "pass", "wt README");
  });
  test("valódi worktree: Bash a munkafa cwd-jéből", () => {
    expectDecision(bash2(E2E, "echo x > e2e/a.feature", WT), "pass", "wt e2e");
    expectDecision(bash2(E2E, "cp .scratch/x.feature e2e/", WT), "pass", "wt cp dir");
    expectDecision(bash2(E2E, "echo x > .claude/settings.json", WT), "deny", "wt settings");
    expectDecision(bash2(UNIT, "cp README.md docs/test-plans/", WT), "deny", "wt test-plans README");
    expectDecision(bash2(UNIT, "cp .scratch/A.md docs/test-plans/", WT), "pass", "wt test-plans");
    expectDecision(bash2(IMPL, "rm -rf .", WT), "deny", "wt gyökér törlése");
  });
  test("valódi worktree: a projekt gyökeréből nézve is a munkafa saját .claude/-ja védett", () => {
    expectDecision(bash2(IMPL, "echo x > .claude/worktrees/feat-e2e/.claude/agents/x.md"), "deny", "wt agents");
    expectDecision(bash2(IMPL, "echo x > .claude/worktrees/feat-e2e/client/a.ts"), "pass", "wt client");
  });
  test("valódi worktree: Git-Bash alakú cwd", { skip: !WIN && "csak Windows-on értelmes" }, () => {
    expectDecision(bash2(E2E, "echo x > e2e/a.feature", gitBash(WT)), "pass", "gitbash wt");
    expectDecision(bash2(E2E, "echo x > .claude/hooks/a.mjs", gitBash(WT)), "deny", "gitbash wt hooks");
  });
});

// --- A .git/ írása és a szimlinken/junctionön át írt célpont (2026-11-06) ---------
describe(".git/ védelme", () => {
  for (const mode of [IMPL, E2E, UNIT, RO]) {
    test(`${mode}: echo >> .git/config deny`, () => {
      const r = bash(mode, "echo '[core] fsmonitor = x' >> .git/config");
      expectDecision(r, "deny", ".git/config");
    });
  }
  test("impl-write: .git/hooks/pre-commit deny", () => {
    expectDecision(write("impl-write", join(PROJ, ".git", "hooks", "pre-commit")), "deny", "hook");
  });
  test("impl-bash: a munkafa .git fájlja deny", () => {
    expectDecision(bash(IMPL, "echo x > .claude/worktrees/wt1/.git"), "deny", "wt .git");
  });
  test("impl-bash: rm -rf .git deny", () => {
    expectDecision(bash(IMPL, "rm -rf .git"), "deny", "rm .git");
  });
  test("impl-bash: a .gitignore és a .github/ nem a .git/ része", () => {
    expectDecision(bash(IMPL, "echo x >> .gitignore"), "pass", ".gitignore");
    expectDecision(bash(IMPL, "echo x > .github/x.yml"), "pass", ".github");
  });
  test("readonly: a git olvasó parancsai továbbra is átmennek", () => {
    expectDecision(bash(RO, "git status"), "pass", "git status");
    expectDecision(bash(RO, "git log --oneline -3"), "pass", "git log");
  });
});

describe("szimlinken / junctionön át írt célpont", () => {
  let linkOk = false;
  before(() => {
    mkdirSync(join(PROJ, "spec", "backend"), { recursive: true });
    mkdirSync(join(PROJ, "docs"), { recursive: true });
    try {
      // Windows-on a junction rendszergazda nélkül is létrehozható.
      symlinkSync(join(PROJ, "spec", "backend"), join(PROJ, "docs", "spec-link"), WIN ? "junction" : "dir");
      symlinkSync(join(PROJ, "client"), join(PROJ, "e2e", "client-link"), WIN ? "junction" : "dir");
      linkOk = true;
    } catch {
      linkOk = false;
    }
  });
  test("impl-bash: a link mögötti spec/ fájl írása deny", (t) => {
    if (!linkOk) return t.skip("nem hozható létre link");
    const r = bash(IMPL, "echo x > docs/spec-link/konformancia.md");
    expectDecision(r, "deny", "link → spec");
    assert.match(r.reason, /szimlinken\/junctionön át/);
  });
  test("impl-write: ugyanez Write-tal", (t) => {
    if (!linkOk) return t.skip("nem hozható létre link");
    expectDecision(write("impl-write", join(PROJ, "docs", "spec-link", "x.md")), "deny", "write link → spec");
  });
  test("e2e-bash: az e2e/ alatti link a client/ alá mutat → deny", (t) => {
    if (!linkOk) return t.skip("nem hozható létre link");
    expectDecision(bash(E2E, "echo x > e2e/client-link/a.ts"), "deny", "e2e link → client");
  });
  test("e2e-bash: link nélküli e2e/ írás továbbra is átmegy", () => {
    expectDecision(bash(E2E, "echo x > e2e/features/a.feature"), "pass", "e2e");
  });
  test("impl-bash: a link törlése nem a cél törlése — nincs tiltás", (t) => {
    if (!linkOk) return t.skip("nem hozható létre link");
    expectDecision(bash(IMPL, "rm docs/spec-link"), "pass", "rm link");
  });
});

// =====================================================================================
// 2026-11-07 javítókör (audit3: 18–22., 37. sor)
// =====================================================================================

// --- 18. sor: PowerShell vezérlési blokk és ForEach-Object readonly módban ----------------
// LAZÍTÁS: a tiszta szkriptblokk-szegmens (`if ($?) { … }`, `else { … }`) és a csak
// blokkot kapó `ForEach-Object` nem kérdés többé. A blokk TÖRZSE továbbra is külön
// szegmensként mérődik — az alsó fele azt bizonyítja, hogy a valódi veszélyes alakok
// (író/tiltott törzs, `ForEach-Object <Metódus>`, a `foreach` alias, `$f in <parancs>`)
// ugyanúgy deny/ask maradnak.
bashCases("18. sor — PowerShell if ($?) / ForEach-Object readonly: ami átmegy", [
  [RO, "mvn test; if ($?) { git status }", "pass", PSH],
  [RO, "npm test; if ($?) { Get-Content .scratch/x.log | Select-Object -Last 20 }", "pass", PSH],
  [RO, "if (Test-Path x) { Get-Content x } else { Get-ChildItem }", "pass", PSH],
  [RO, "if ($?) { ls } elseif ($x) { cat f } else { pwd }", "pass", PSH],
  [RO, "try { Get-Content x } catch [System.IO.IOException] { $_ } finally { ls }", "pass", PSH],
  [RO, "do { $i++ } while ($i -lt 3)", "pass", PSH],
  [RO, "Get-ChildItem | ForEach-Object { $_.Name }", "pass", PSH],
  [RO, "Get-ChildItem | ForEach-Object -Process { $_.FullName }", "pass", PSH],
  [RO, "Get-ChildItem | ForEach-Object -Begin { $n = 0 } -Process { $n++ } -End { $n }", "pass", PSH],
  [RO, "Get-ChildItem | % { $_.Length }", "pass", PSH],
  [RO, "Get-ChildItem | foreach { $_.Name }", "pass", PSH],
  [RO, "foreach ($f in Get-ChildItem *.md) { $f.Name }", "pass", PSH],
  [RO, "foreach ($i in 1..3) { $i }", "pass", PSH],
  [RO, "Get-ChildItem | ForEach-Object { Get-Content $_ | Select-String TODO }", "pass", PSH],
  [RO, "$n = 0; $n", "pass", PSH],
  [RO, "$n = 7z x a.zip", "ask", PSH],
]);

bashCases("18. sor — PowerShell blokkok: a veszélyes alakok tiltva maradnak", [
  // a blokk törzse külön szegmens: tiltott / író parancs benne
  [RO, "mvn test; if ($?) { git push }", "deny", PSH],
  [RO, "if ($?) { Set-Content x y }", "deny", PSH],
  [RO, "if ($?) { 'x' > out.txt }", "deny", PSH],
  [RO, "if ($?) { ls } else { Remove-Item x }", "deny", PSH],
  [RO, "if ($?) { npm run dev }", "ask", PSH],
  [RO, "if ($?) { node -e 1 }", "ask", PSH],
  [RO, "if ($?) { ls } > out.txt", "deny", PSH],
  [RO, "{ git push }", "deny", PSH],
  [RO, ". { Remove-Item x }", "deny", PSH],
  [RO, "& { awk '{print}' f }", "ask", PSH],
  [RO, "Get-ChildItem | ForEach-Object { Remove-Item $_ }", "deny", PSH],
  [RO, "Get-ChildItem | ForEach-Object { $_.Delete() }", "ask", PSH],
  [RO, "Get-ChildItem | ForEach-Object { git add $_ }", "deny", PSH],
  // ForEach-Object metódushívó alakjai (-MemberName, pozicionális név, idézett szöveg)
  [RO, "Get-ChildItem | ForEach-Object Delete", "ask", PSH],
  [RO, "Get-ChildItem | ForEach-Object -MemberName Delete", "ask", PSH],
  [RO, "Get-ChildItem | % Delete", "ask", PSH],
  [RO, "Get-ChildItem | ForEach-Object '{ x }'", "ask", PSH],
  [RO, "Get-ChildItem | ForEach-Object { ls } Delete", "ask", PSH],
  // a `foreach` alias argumentummal = ForEach-Object (korábban NÉMÁN átment)
  [RO, "Get-ChildItem | foreach Delete", "ask", PSH],
  [RO, "Get-ChildItem | foreach -MemberName Delete", "ask", PSH],
  // a `foreach (… in <parancs>)` feje parancsként fut (korábban a `$f` miatt átment)
  [RO, "foreach ($f in Remove-Item x) { }", "deny", PSH],
  [RO, "foreach ($f in Invoke-WebRequest http://x -OutFile f) { }", "ask", PSH],
  [RO, "$x in Remove-Item foo", "deny", PSH],
  // blokkhoz tapadó szöveg nem tiszta blokk
  [RO, "{ ls }x", "ask", PSH],
  // a többi mód változatlan
  [IMPL, "mvn test; if ($?) { git push }", "deny", PSH],
  [IMPL, "Get-ChildItem | foreach { git add $_ }", "deny", PSH],
  [E2E, "if ($?) { 'x' > client/a.ts }", "deny", PSH],
  // sh-ban nincs szkriptblokk: a `{ …; }` csoport ugyanúgy mérődik
  [RO, "{ ls; awk 1 f; }", "ask"],
]);

// --- 19. sor: soha ki nem lépő npm-script — név ÉS a package.json tényleges parancsa --------
bashCases("19. sor — npm run: soha ki nem lépő scriptek", [
  [RO, "npm run preview", "ask"],
  [RO, "npm run preview -w client", "ask"],
  [RO, "npm --prefix client run preview", "ask"],
  [RO, "npm run preview", "ask", { cwd: () => join(PROJ, "client") }],
  [RO, "npm run szerver", "ask"],
  [RO, "npm run kliens-web", "ask"],
  [RO, "npm run kliens-web2", "ask"],
  [RO, "npm run web -w client", "ask"],
  [RO, "npm run web --workspace=client", "ask"],
  [RO, "npm run web --workspaces", "ask"],
  [RO, "npm run figyel", "ask"],
  [RO, "npm run figyel2", "ask"],
  [RO, "npm run adatbazis", "ask"],
  [RO, "npm run tesztek", "ask"],
  [RO, "npm run spring", "ask"],
  [RO, "npm run lanc", "ask"],
  [RO, "cd client && npm run web", "ask"],
  [RO, "npm run dev", "ask"],
  [RO, "npm run test:watch", "ask"],
  [RO, "npm run fut -- --watch", "ask"],
  // ami kilép: továbbra is átmegy
  [RO, "npm test", "pass"],
  [RO, "npm run build", "pass"],
  [RO, "npm run lint", "pass"],
  [RO, "npm run fut", "pass"],
  [RO, "npm run adatbazis-d", "pass"],
  [RO, "npm run optimize -w client", "pass"],
  [RO, "npm run build -w client", "pass"],
  [RO, "npm run nincs-ilyen-script", "pass"],
  [RO, "npm run", "pass"],
]);
describe("19. sor — az ask-szöveg megnevezi a script tényleges parancsát", () => {
  test("npm run szerver → a `vite --port 4000` törzs és a szerver ok", () => {
    const r = bash(RO, "npm run szerver");
    assert.equal(r.decision, "ask");
    assert.match(r.reason, /soha ki nem lépő npm-script/);
    assert.match(r.reason, /vite --port 4000/);
  });
  test("npm run kliens-web → a beágyazott `npm run web -w client` hívást követi", () => {
    const r = bash(RO, "npm run kliens-web");
    assert.match(r.reason, /npm run web -w client/);
    assert.match(r.reason, /`vite`/);
  });
  test("npm run preview → a név szerinti ok (a package.json nélkül is fog)", () => {
    assert.match(bash(RO, "npm run preview").reason, /soha ki nem lépő npm-script \(`preview`\)/);
  });
});

// --- 20. sor: munkaterületen kívüli írás minden Bash-módban tiltott (a /dev/null, NUL kivétel) ---
describe("20. sor — munkaterületen kívüli írás minden Bash-módban", () => {
  const temp = String.raw`C:\Users\x\AppData\Local\Temp\a.log`;
  const outside = [
    "echo x > /tmp/a.log",
    "mvn test > /tmp/mvn.log 2>&1",
    "cd /tmp && echo x > a.log",
    "mkdir -p /tmp/x",
    "cp a.txt /tmp/",
    "rm /dev/null",
  ];
  for (const mode of [IMPL, E2E, UNIT, RO]) {
    for (const cmd of outside) {
      test(`${mode} deny: ${cmd}`, () => expectDecision(bash(mode, cmd), "deny", cmd));
    }
    // POSIX-on a `C:\…` relatív útvonal (a projekt alá esik): ott nem „kívüli”.
    test(`${mode} [PowerShell] deny: Out-File ${temp}`, { skip: !WIN && "csak Windows-on kívüli útvonal" }, () => {
      expectDecision(bash(mode, `'x' | Out-File -FilePath ${temp}`, PSH), "deny", temp);
    });
    test(`${mode} deny: a projekten kívüli idegen repó`, () => {
      expectDecision(bash(mode, `echo x > "${posix(join(OTHER, "e2e", "a.txt"))}"`), "deny", "OTHER");
    });
    for (const cmd of ["echo x > /dev/null", "mvn test > /dev/null 2>&1", "ls > NUL", "ls 2> nul", "ls &> /dev/null"]) {
      test(`${mode} pass: ${cmd}`, () => expectDecision(bash(mode, cmd), "pass", cmd));
    }
    test(`${mode} [PowerShell] pass: > $null`, () => expectDecision(bash(mode, "Get-ChildItem > $null", PSH), "pass", "$null"));
  }
  test("impl-bash: a deny-szöveg a .scratch/-et ajánlja és kimondja, hogy kívül van", () => {
    const r = bash(IMPL, "echo x > /tmp/a.log");
    assert.match(r.reason, /munkaterületen KÍVÜL/);
    assert.match(r.reason, /\.scratch\//);
  });
  // A /dev/null minden célpont-fajtánál ártalmatlan, nem csak átirányításnál (korábban az
  // e2e-/unit-test-bash a `D:/dev/null`-t a munkaterületen kívülinek látta és tiltotta).
  for (const mode of [IMPL, E2E, UNIT]) {
    for (const cmd of ["mvn test 2>&1 | tee /dev/null", "cp a.txt /dev/null", "dd if=a of=/dev/null"]) {
      test(`${mode} pass: ${cmd}`, () => expectDecision(bash(mode, cmd), "pass", cmd));
    }
  }
  test("impl-bash: a projekten belüli írás továbbra is átmegy", () => {
    expectDecision(bash(IMPL, "echo x > client/src/a.ts"), "pass", "client");
    expectDecision(bash(IMPL, "mvn test > .scratch/log.txt 2>&1"), "pass", ".scratch");
    expectDecision(bash(IMPL, "echo x > .claude/worktrees/wt1/client/a.ts"), "pass", "wt1");
  });
  test("impl-bash: a /dev/null.txt nem eszközfájl", () => {
    expectDecision(bash(IMPL, "echo x > /dev/null.txt"), "deny", "/dev/null.txt");
  });
  test("docs-write (docs-api-writer): a munkaterületen kívüli Write deny, kívüli indokkal", () => {
    const r = write("docs-write", WIN ? "C:/Users/x/AppData/Local/Temp/README.md" : "/tmp/README.md");
    expectDecision(r, "deny", "docs-write kívül");
    assert.match(r.reason, /munkaterületen KÍVÜL/);
  });
});

// --- 21. sor: docs-writer-write — impl-write + a gyökér README/OpenAPI tiltva ----------------
describe("21. sor — docs-writer-write mód", () => {
  const M = "docs-writer-write";
  const wt = (...p) => join(PROJ, ".claude", "worktrees", ...p);
  const denied = ["README.md", "readme.md", "ReadMe.MD", "openapi.yaml", "openapi.yml", "openapi.json", "OpenAPI.YAML"];
  for (const p of denied) {
    test(`deny: ${p}`, () => {
      const r = write(M, p);
      expectDecision(r, "deny", p);
      assert.match(r.reason, /docs-api-writer/);
      assert.match(r.reason, /dok-leltar/);
    });
    test(`deny: ${p} (abszolút)`, () => expectDecision(write(M, join(PROJ, p)), "deny", p));
    test(`deny: a munkafa gyökerének ${p}-je`, () => expectDecision(write(M, wt("wt1", p)), "deny", `wt1 ${p}`));
  }
  test("Edit és NotebookEdit is ugyanígy", () => {
    expectDecision(run(M, { tool_name: "Edit", tool_input: { file_path: "README.md" } }), "deny", "Edit");
    expectDecision(run(M, { tool_name: "NotebookEdit", tool_input: { notebook_path: "openapi.json" } }), "deny", "NotebookEdit");
  });
  const passing = [
    "server-java/README.md",
    "e2e/README.md",
    "client/src/App.tsx",
    "docs/adr/0009-x.md",
    "CHANGELOG.md",
    "docs/README.md",
    "client/openapi.yaml",
    ".scratch/x.md",
    "README.md.bak",
    "openapi.yaml.orig",
  ];
  for (const p of passing) {
    test(`pass: ${p}`, () => expectDecision(write(M, p), "pass", p));
  }
  test("pass: a munkafa almappa-README-je", () => expectDecision(write(M, wt("wt1", "server-java", "README.md")), "pass", "wt1 sub README"));
  test("pass: idegen (nem projekt-) munkafa README-je nem munkafagyökér — az impl-write szabálya", () => {
    expectDecision(write(M, wt("foreign", "README.md")), "pass", "foreign README");
  });
  test("az impl-write szabályai öröklődnek: spec/, meglévő migráció, függőségleíró, .git/", () => {
    expectDecision(write(M, "spec/backend/x.md"), "deny", "spec");
    expectDecision(write(M, "server-java/src/main/resources/db/migration/V1__init.sql"), "deny", "migráció");
    expectDecision(write(M, "server-java/src/main/resources/db/migration/V99__uj.sql"), "pass", "új migráció");
    expectDecision(write(M, "package.json"), "ask", "package.json");
    expectDecision(write(M, join(PROJ, ".git", "config")), "deny", ".git");
  });
  test("a többi mód változatlan: docs-write írhatja, impl-write írhatja", () => {
    expectDecision(write("docs-write", "README.md"), "pass", "docs-write");
    expectDecision(write("impl-write", "README.md"), "pass", "impl-write");
    expectDecision(write("impl-write", "openapi.yaml"), "pass", "impl-write openapi");
  });
  test("szimlinken/junctionön át sem írható a gyökér README", (t) => {
    mkdirSync(join(PROJ, "docs"), { recursive: true });
    try {
      symlinkSync(PROJ, join(PROJ, "docs", "gyoker-link"), WIN ? "junction" : "dir");
    } catch {
      return t.skip("nem hozható létre link");
    }
    expectDecision(write(M, join(PROJ, "docs", "gyoker-link", "README.md")), "deny", "link → README");
  });
});

// --- 22. sor: a fejléc-komment a szimlink valós kezelését írja le ------------------------------
test("22. sor — a fejléc a szimlink valós kezelését írja le, és a kilenc módot sorolja", () => {
  const src = readFileSync(HOOK, "utf8");
  const header = src.slice(0, src.indexOf("\nimport "));
  assert.doesNotMatch(header, /a link helyén ítéljük meg \(csak/);
  assert.match(header, /a link helyén ÉS a\s*\n\/\/\s*valódi helyén is megítéljük/);
  assert.match(header, /Mind a kilenc módban/);
  assert.match(header, /docs-writer-write/);
});
