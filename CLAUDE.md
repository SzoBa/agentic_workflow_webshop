# CLAUDE.md

Full-stack webshop. **Two unrelated build systems in one repo**: an npm workspace (`client/`) and a
Maven module (`server-java/`). `npm` commands never touch the backend, and `mvn` never touches the
frontend — the only thing binding them is the HTTP contract in `spec/backend/`.

## Architecture

React + Vite SPA (`client/`, CSR — no SSR) talks to a Java/Spring Boot backend (`server-java/`) over
a REST API (`/api/...`), 25 endpoints — the descriptor is `openapi.yaml` at the repo root, and
`dok-leltar.mjs` is what keeps that number honest.

- Dev: two processes — client on `5173` (`npm run dev`), API on `3001` (`cd server-java && mvn spring-boot:run`). Vite proxies `/api` → `localhost:3001`, so the frontend never uses an absolute backend URL.
- Prod: the same Spring server serves the built `client/dist` with an SPA fallback (`STATIC_DIR`).
- Data: PostgreSQL via Docker. The schema comes **only** from Flyway migrations (`server-java/src/main/resources/db/migration`); the app never creates it (`ddl-auto: validate`).
- Cart & checkout: cart is client-side only (localStorage), no server session. At checkout the server recomputes the total from DB prices and never trusts client-sent prices — a security decision, don't "simplify" it away.

Traps:
- Placing an order doesn't decrement `stock` — it creates a *reservation*. What gates checkout is `available` (= `stock` − active `pending` reservations), and `stock` only drops when an admin flips the order to `delivered`. So `stock` alone never tells you what is buyable; read `available`.
- A lapsed reservation keeps holding stock until the expiry scheduler sweeps it (`pending` → `expired`). Under-selling for one sweep interval is accepted on purpose — see `docs/adr/0005-keszletfoglalas-es-lejart-rendeles.md`.
- The localStorage cart stores a full `Product` snapshot (price/stock included) that can go stale vs. the server until the user refreshes.
- `order_items.name`/`unit_price` and `orders.user_id` are **snapshots, not foreign keys** — an order is a standalone document. Don't "normalise them away" (ADR-0001).
- `ClientIpResolver` reads `X-Forwarded-For` from the **right** (`TRUSTED_PROXY_HOPS` counts back from the end), because every hop appends and only the right end is written by our own proxies. Element 0 is whatever the client sent, so reading it makes the login rate limiter bypassable. `server.forward-headers-strategy` is deliberately left unset for the same reason — both `FRAMEWORK` and Spring's `ForwardedHeaderUtils` take element 0 (ADR-0007).
- `users.token_hash` holds `sha256(token)`, never the token itself — the raw value exists only in the issuing response (ADR-0008). Look users up by `findByTokenHash(hashToken(raw))`. A missing `token_expires_at` means *expired*, not immortal, and a DB CHECK keeps the hash and the expiry filled in together.
- Authentication (401) and admin authorization (403) are **two** interceptors — `AuthInterceptor` on every protected pattern, `AdminInterceptor` on `/api/admin/**` only. Don't merge the role check back into `AuthInterceptor`: that reintroduces comparing a request path against a prefix, and the two come from different coordinate systems as soon as a context path exists (K-58).
- `login_attempts` is purged on the **failure** path (`recordFailure`), not on successful login — an attacker never takes the happy path, so retention hung there would never run.

## The spec is the contract

`spec/backend/` is the source of truth for backend behaviour: requirements, endpoint list, the
verbatim Hungarian error catalogue, and `konformancia.md` — 70 language-neutral acceptance cases.
**Change behaviour → change the spec first.**

Two leftovers from the migration that are easy to misread:
- `MA IS` / `ÚJ` markers are historical. Every rule is `MA IS` now; the labels only preserve the document's reading history.
- `FORRÁS` markers are **live**: they describe the old schemaless JSON store's quirks, which still apply when importing a legacy `db.json` (`DbJsonImporter`).

The backend was rewritten from Node/Express + lowdb to Java/Postgres; the Node implementation was
deleted after the switchover ([ADR-0006](docs/adr/0006-atvaltas-a-java-backendre.md)). If you find a
reference to `server/`, lowdb, or "reference implementation", it is stale — fix it. **Three folders
are exempt** (see below): their staleness is the point. So are the `server/…` paths in
`spec/backend/plan.md` and `spec/backend/tasks.md`: they are the migration plan, recording what was
moved where, and since they sit under `spec/` they only change by a human edit — an agent reports
such a spot, never rewrites it.

Not every `spec/*/` folder is a live norm. `spec/backend/`, `spec/admin-orders/`,
`spec/edit-user-data/` (a deliberately degraded exercise spec — its validator errors are the point,
see its `modifs.md`) are; the other three — `admin-role`, `review-and-rating` and
`termek-felhasznaloi-ertekeles` — are **historical**, all written against the Node/lowdb backend. Each one's
`requirements.md` opens with a blockquote status header saying so; read it before anything else in
the folder. They are records of how a feature was reasoned about, not instructions: don't hand them
to `feature-implement`, don't rewrite them (`spec-guard.mjs` blocks writes under `spec/` anyway),
and don't "fix" the `server/…` paths inside them.
`.claude/skills/feature-spec-writer/scripts/spec-ellenoriz.mjs` rejects all three —
they predate its conventions, so that is expected, not a regression. The full list with each
folder's status lives in the `spec-konvenciok` skill, section 5. One of them is worse than stale:
`termek-felhasznaloi-ertekeles` specifies `GET /api/products/:id/ratings/me`, which the Java rewrite
never carried over — there is no `ratings` collection, a rating is a field on a review.

## Commands

Whole stack, from the repo root: `./start.sh` — brings up Postgres, the backend and the client in
one terminal (waits for `pg_isready`, then for `/api/health`, then starts Vite), interleaves both
server logs with `[be]`/`[fe]` prefixes, and stops both on Ctrl+C. `--no-db` / `--no-backend` /
`--no-client` skip a layer. It refuses to start if 3001 or 5173 is already taken. The Postgres
container is deliberately left running on exit. Logs also land in `.run/` (gitignored).

From a Windows terminal (PowerShell / cmd) the same thing is `.\start.cmd [flags]` — a thin
wrapper that locates the Git-for-Windows `bash.exe` and passes the flags through. It deliberately
does **not** use whatever `bash` is on `PATH`: on Windows that resolves to `System32\bash.exe`
(WSL), a different filesystem without the Windows `mvn`/`npm`/`docker`. `start.cmd` is ASCII-only
with CRLF line endings — cmd.exe reads batch files in the OEM codepage, so UTF-8 accents or LF
endings break parsing. Keep the logic in `start.sh`; the wrapper stays dumb. The line endings are
no longer left to chance: `.gitattributes` pins `*.cmd` to CRLF and `*.sh` to LF on checkout, and
the CI lint job fails if either drifts.

Frontend, from the repo root:
- `npm install` · `npm run dev` (client only, port 5173) · `npm run build` · `npm test` (Vitest, `npm run test:watch` for watch mode)
- `npm run lint` (ESLint, flat config in `eslint.config.mjs`; `npm run lint:fix` to autofix). It covers `client/`, the Node scripts in `spec/backend/conformance/`, the root and `client/` `*.config.ts` files, the e2e step files (`e2e/**/*.mjs`), the `.claude/` machinery (`.claude/hooks/**/*.mjs`, `.claude/skills/**/scripts/**/*.mjs`) with its regression suite (`test/hooks/`), and the Gmail twin's source (`test/mocks/**/*.mjs`) — never `server-java/`, and never `.claude/worktrees/` (run it from a worktree's own root instead). Type-aware rules are deliberately off: `npx tsc --noEmit -p client/tsconfig.json` is what catches type errors.
- There is no `npm start`.

Backend, from `server-java/` (needs JDK 25, Maven, Docker):
- `docker compose up -d` — dev Postgres · `docker compose down -v` — full reset
- `mvn spring-boot:run -Dspring-boot.run.profiles=dev` · `mvn test` (Testcontainers starts a real Postgres — Docker must be running)
- `mvn test -Dtest=ClientIpResolverTest -DfailIfNoSpecifiedTests=false -Djacoco.skip=true` runs one class (comma-separate for several). Keep the `-Djacoco.skip=true`: without it the `jacoco:check` gate below judges a one-class run, and the verdict depends on whatever an earlier run left in `jacoco.exec` — measured 2026-11-06: red (`OrderTransitions` 0.00) or falsely green, never meaningful. With it, `prepare-agent` sets an empty `argLine` and the fork still starts. Handy for the unit tests: no Docker, a few seconds instead of minutes. **But `-Dtest` never runs `@Nested` classes** — surefire 3.5.4 selects the outer class, reports `Tests run: 0` and still exits green, and no pattern form (wildcard, `%regex[…]`, negation) changes that. Nine of the unit test classes are structured that way (`JsonInputTest`, `ProductFilterTest`, `ProductValidatorTest`, `UserValidatorTest`, and all five in `security/`); they only run in an unfiltered `mvn test`. A filtered run that prints `Tests run: 0` is the failure mode to watch for — it looks like a pass.
- Every `mvn test` also writes a JaCoCo report to `target/site/jacoco/`; read per-class numbers from `jacoco.csv`, missed lines from `jacoco.xml`. The surefire `argLine` **must keep the leading `@{argLine}`** — it is what injects the JaCoCo agent, and dropping it makes coverage silently 0. `jacoco.exec` **appends** across runs, so a report taken after a filtered run still carries the previous run's data — use `mvn clean test` for any number you intend to quote.
- `mvn test` also **fails** on a coverage regression: a `jacoco:check` execution (bound to the `test` phase, so the CI command stays `mvn -B test`) enforces 90% BRANCH on the ten classes whose unit tests were generated with the `test-writer-java-unit` skill — all of them measured at 100%. It is a **full-suite regression gate**, not a unit-test quality score: it judges the whole run's `jacoco.exec`, so branches the integration tests take count too. (Measured unit-only on 2026-11-06 with the skill's optional `-Dsurefire.excludesFile` recipe — no `-Dtest`, so `@Nested` classes still run — all ten still sit at 100%; but the gate would not notice if a unit test lost a branch an integration test happens to take.) The scope is deliberately a **class list, not a package or the module**: the module as a whole sits at 86.2% branch (563/653, clean run 2026-11-06), so a global 90% rule would go red on never-unit-tested legacy code instead of on a real regression. Raise coverage and add to the list; don't lower the threshold. Run it alone with `mvn -o jacoco:check@check-unit-tested-classes` (reuses the existing `jacoco.exec`, no re-run of the suite).

`DATABASE_PASSWORD` has **no default** — a missing value is a startup failure, so that a
production deploy can't silently boot on a guessable credential. The `dev` profile supplies the
`docker compose` password and nothing else; `start.sh` turns it on automatically, so only a bare
`mvn spring-boot:run` needs the flag (or a `.env`). Tests are unaffected: Testcontainers injects
the credentials directly.

Acceptance cases against a running backend:
`node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store`
(54 of the 70 cases; the other 16 are `⚙` — covered by `mvn test`, see `konformancia.md`).
`--clean-store` does **not** clean anything — it asserts a fresh store and switches on the cases
that need one (K-05/48/49/77), so use it only right after `docker compose down -v`. On a used
database (e.g. inside a feature chain) run it with `--skip-rate-limit` instead: K-51 otherwise
locks this IP out of login for 15 minutes, persistently — the e2e suite included.

E2E (browser → SPA → API → Postgres), from `e2e/` — a **third, standalone npm project**, not a
workspace member, so the root `npm ci` never pulls Cucumber or Playwright in:
`npm install && npx playwright install chromium` once, then `npm run e2e` against an
already-running stack. Like the conformance runner it starts nothing itself; `--base-url` picks
the topology (`http://localhost:5173` dev via the Vite proxy, `http://localhost:3001` prod-like).
See `e2e/README.md` — the two traps it documents (server state never resets, the login rate limit
is persistent and per-IP) are the same ones that shape the conformance runner.

Gmail behavioural twin, from `test/mocks/msw/` — a **fourth, standalone npm project**, same reason
as `e2e/`: it is the only thing in the repo that depends on `msw`, and the root `npm ci` must not
pull it in. It replays the Gmail `users.messages.send` behaviour offline; its behavioural spec is
`docs/digital-twin/digital-twin.md`. `npm install && npm test` runs 30 cases; `node http-server.mjs --port 8089` starts a real
listening twin. The root `npm test` (Vitest) is scoped to `client/test/**/*.test.{ts,tsx}`, so this
folder never enters it, and its tests are **not** in CI — nothing gates on its behaviour today; only
its source is linted (`npm run lint` covers `test/mocks/**/*.mjs`).

Four things about it that are easy to misread:
- The behaviour lives in **one** dependency-free module (`twin-core.mjs`); `handlers.mjs` (MSW, for Node consumers) and `http-server.mjs` (`node:http`, for the JVM) are adapters over it. Change behaviour in the core, never in an adapter — that is what keeps the two stacks from drifting apart.
- MSW cannot mock the Java path at all. `GmailOrderNotifier.gmail(...)` builds its own transport and the `Gmail.Builder` root URL is not exposed, so an out-of-process JVM is unreachable from any Node interceptor. That is why `http-server.mjs` exists, and why an `OrderNotifier`-level twin measures *behaviour* while the HTTP one measures *protocol*.
- The rate limit is a **rule, not a probability**: a token bucket (250 quota units/s ÷ 100 per send), so the third send inside one second deterministically fails. The percentages in the spec table are a design assumption, not measured traffic. Before trusting the twin for anything, read the "Ismert korlátok" section of the spec — it lists what it deliberately does not reproduce (delivery, bounces, cross-process quota) and where it is knowingly sharper than the real service.
- `http-server.mjs` binds to **`127.0.0.1` only** (`--host 0.0.0.0` is the conscious opt-out), because its control plane — `/__twin/force`, `/__twin/stick`, `/__twin/reset`, `/__twin/ledger` — has no authentication and deliberately never will. A test double's control surface is still a control surface; the bind address is what limits it. The same file is also the one place with **no framework error boundary underneath**: an `await` that rejects inside a raw `http.createServer` callback is an unhandled rejection, which since Node 15 kills the process and answers nothing — so the callback wraps everything in a `try`/`catch` that replies 500, and every promise wrapped around a request stream settles on **every** path, including the ones we cause ourselves (`req.destroy()` with no argument emits neither `end` nor `error`).

## CI

One workflow, `.github/workflows/ci.yml`, on pushes to `main`/`develop`, on PRs into those two, and
on manual `workflow_dispatch` — the weekly `schedule` trigger was switched off on 2026-08-20, so
nothing runs any more without a push, a PR or a hand-started run. Eight independent jobs: `lint`
(ESLint + `tsc` + shellcheck + the line-ending guard + the
`.claude/` skill/agent validator — the only thing that catches a typo'd `spec-guard.mjs` mode, which
otherwise disables the guard silently — + the `dok-leltar.mjs` endpoint-inventory gate + the hook
regression suite, `node --test "test/hooks/*.test.mjs"`),
`client` (Vitest + build), `server` (`mvn test`, Testcontainers, uploads the JaCoCo report),
`conformance` (packages the jar, starts it against a Postgres service container, runs the 54 HTTP
cases), `e2e` (same bring-up plus a built `client/dist` served by Spring, then Cucumber +
Chromium), `semgrep` (SAST), `secret-scan` (TruffleHog over the **full git history**) and `deps`
(OSV-Scanner over every lockfile — npm, `e2e/` and Maven).

`e2e` deliberately repeats `conformance`'s bring-up rather than sharing it — different failure
modes, different runtimes, and the CI is built out of independent parallel jobs. It runs the
**prod-like** topology (`STATIC_DIR`, no Vite), so what it measures is what ships.

`feature/**` is deliberately **not** a push trigger: a feature branch with an open PR would
otherwise run the whole pipeline twice per commit, and `concurrency` can't dedupe them (push runs
on `refs/heads/…`, the PR on `refs/pull/N/merge`). The PR event is the one worth keeping — it tests
the *merge with the target*, not the branch alone. A branch without a PR gets CI via
`workflow_dispatch`.

Four things about the security jobs that are easy to misread:
- `deps` (OSV-Scanner) is the **only** job that deliberately spans both build systems: one run covers the root npm workspace, `e2e/`'s separate project and the Maven module. Its gate is deliberately **not** severity-filtered — any finding is red — because the OSV format carries severity as a CVSS *vector*, not a label, and a misread filter would silently never fire (the same trap the Semgrep gate documents). Accepted findings live in `osv-scanner.toml` with a written reason and an `ignoreUntil` date, so an exception expires instead of quietly becoming permanent. The `--config` flag is **not optional**: without it the scanner looks for an `osv-scanner.toml` next to *each* lockfile, and the repo has exactly one, at the root.
- Semgrep scans **once**. The full scan is non-blocking and writes `semgrep.sarif` for Code scanning; a second step re-reads that file and gates on `ERROR` only, so a new WARNING from a registry rule update doesn't block every PR. Don't "fix" that gate into a `jq '.results[] | select(.level=="error")'` one-liner: Semgrep puts **no `level` on results** — severity lives on the rule (`tool.driver.rules[].defaultConfiguration.level`), so that filter matches nothing and the gate silently never fires. Exclusions live in `.semgrepignore` (which **replaces** Semgrep's built-in defaults, so `node_modules` etc. are listed explicitly).
- `trufflesecurity/trufflehog` is pinned to a **commit SHA** (third-party code running against our checkout), but its `version` input stays `latest` on purpose: the action's *code* is pinned, its *detectors* stay fresh — fresh detectors only pay off on a run the code did not trigger, and with the weekly `schedule` off, such a run now has to be started by hand (`workflow_dispatch`). The first-party `actions/*` tags are left floating, the usual accepted compromise.
- Neither security job needs a token. Don't add `SEMGREP_APP_TOKEN` "to make it work" — the registry rulesets are public.

Tests never sit next to the source: `client/test/`, `server-java/src/test/java/`, `e2e/`,
`test/mocks/` and `test/hooks/` (node:test regression suites for the `.claude/hooks/`, run with
`node --test "test/hooks/*.test.mjs"` — the bare folder form fails on Node 24; run by the CI `lint`
job (Node 22, where the Windows-only Git-Bash cases skip themselves), not by the root `npm test`;
the suites build their temp projects under the gitignored `.scratch/tmp/` with unique `mkdtemp`
names, never `%TEMP%`). Two kinds of Java test live side by side in the Maven module, and picking the wrong
one is the usual mistake:

- **Integration** (the bulk of the suite) — extend `hu.webshop.support.IntegrationTest`, which drives **real HTTP** against a real Postgres and builds every precondition through the public API. Prefer that seam over calling controllers directly. Anything crossing HTTP, JPA or a transaction boundary belongs here.
- **Unit** — plain JUnit 5, Mockito only where there is a real collaborator, no Spring context and no Docker — 17 classes (measured 2026-11-06): `JsonInputTest`, `ProductValidatorTest`, `ProductFilterTest`, `UserValidatorTest`, `ClientIpResolverTest`, `OrderTransitionsTest`, `GmailOrderNotifierTest`, `LogLevelEnvironmentPostProcessorTest`, `SpaResourceConfigTest`, `CatalogWindowTest`, `DatabasePasswordCheckTest`, `AdminOrderSearchPatternTest`, and the five in `security/` (`AdminInterceptorTest`, `AuthInterceptorTest`, `CurrentUserArgumentResolverTest`, `InterceptorErrorWriterTest`, `SessionServiceTest`). Use these for branchy pure logic (validation, parsing, state tables) — an integration test would measure the same branches ten times slower.

**Test-method names are English** in both kinds — `rejectsInvalidField`, not
`elutasitjaAHibasMezot`. Same for `@Nested` class names (`class PriceAspects`). Everything else in a
test file stays Hungarian: `@DisplayName` text, comments, argument labels, and — non-negotiably —
the expected error strings, which are copied verbatim from the spec's error catalogue.

The English-naming exception does **not** reach Gherkin: `e2e/features/*.feature` is Hungarian with
a `# language: hu` header. Those files are prose describing a Hungarian UI, and the step-definition
callbacks are anonymous, so there is no name to anglicise.

## Coding conventions

- `client/` is `"type": "module"`, TS with `moduleResolution: Bundler`. Its `tsconfig` targets **ES2020**, so `Array#at`, `Object.hasOwn` etc. fail the build — use index arithmetic instead.
- `server-java/` packages are cut **by feature** (`auth/`, `catalog/`, `order/`, `review/`, `stock/`), not by layer — no `controller/`/`service/`/`dto/` split. The shared or cross-cutting packages are `domain/`, `repo/`, `common/`, `config/`, `security/`, `ops/` and `bootstrap/`.
- The Java response DTOs and `client/src/api.ts` define the same `Product`/`Order`/`Customer`/`OrderItem` shapes independently (no shared package). Change a shape → update both sides.
- Prices are integer HUF (forints), no decimals.

## Project guidelines

- UI text, code comments and log messages are in Hungarian; keep new user-facing strings and comments Hungarian. The one exception is **test-method and `@Nested` class names, which are English** — see the testing section above.
- Don't add or upgrade dependencies without asking — neither npm nor Maven. Already approved for tests: Vitest, `@testing-library/{react,jest-dom,user-event}`, `jsdom` — the client component tests need all four, so they are not a violation to "clean up". On the Maven side the `jacoco-maven-plugin` is likewise deliberate; its version tracks the **runtime** JDK (25 → 0.8.14+), not `java.version`, because the agent instruments JDK classes the Byte Buddy agent pulls in.
- Credentials come **only** from the environment (spec 7.6). `server-java/.env` is gitignored; `.env.example` is the template.
- The Postgres data lives in a Docker volume, not in the repo. `docker compose down -v` resets to seed data (8 demo products + seed admin `adminisztrator` / `admin123` — developer credentials).
- `docs/` holds the design records next to the code: ADRs (`docs/adr/`), the orchestration run logs and the delegation-cost store (`docs/orchestration/`), the Gmail twin's behavioural spec (`docs/digital-twin/`), the scenario catalogues and the simulated-user report (`docs/scenario-catalog/`, `docs/user-simulation/`), the `edit-user-data` audit with the spec as it was before amendment (`docs/edit-user-data/`), the CI gate log (`docs/AI-aware-ci/`), the open-feature backlog (`docs/backlog/` — not a norm, never evidence) and the unit-test plans (`docs/test-plans/`). The demo tasks live in the root `presentation.md`; there is no separate demo script — a measured verification belongs in a run's `Running.md`, not in a hand-kept summary.

### Feature spec writer

`.claude/skills/feature-spec-writer/` — turns a one-sentence feature idea into a `spec/{feature}/`
folder (`requirements.md`, `plan.md`, `tasks.md`) by reconnoitring the codebase, then interrogating
the developer one decision at a time. It is the step **before** `feature-implement`, which starts
from an existing spec folder and used to point at a skill that did not exist.

- **Facts are looked up, decisions are asked.** Anything `Read`/`Grep` can answer is never a
  question; anything that needs a call is never decided for the developer.
- It **refuses to touch an existing spec folder**. Amending a spec after a chain has run
  retroactively falsifies the validator's tally unless the trace is kept — see the "Változásnapló"
  section of `spec/admin-orders/requirements.md`. That is a human edit, not a generated one.
- `scripts/spec-ellenoriz.mjs <feature>` gates the output: acceptance criteria without an id or a
  `*Bizonyíték:*` line, criteria no work item references (and vice versa), work items without a
  `*Kész, ha:*` line, ticked checkboxes, permissive wording, dead links, and file names in the
  plan that collide on a case-insensitive filesystem (`kupon.ts` + `Kupon.tsx` in one
  folder: the extensionless import resolves to the wrong one on Windows/macOS), a missing or
  old-form `plan.md` section 5 (agent names and delegation order instead of "Munkacsomagok és
  függőségeik"), package letters there that don't match the `tasks.md` `*Gazda:*` letters, an
  implementer package using the reserved letter `V`, and Flyway versions two migrations share, that
  are already taken on disk, or that two packages own. Run against `spec/admin-orders` it currently
  reports four real gaps — `AR-17`, `AR-20` and `AR-21` have no task pointing at them (the last two
  because they were added after the chain ran), and its section 5 is the old delegation-describing
  form the skill now warns against copying.
- `references/kihivas-katalogus.md` is the interesting file: eight spec-writing failure classes that
  **actually happened here**, each with its evidence. The reviews of `admin-orders` found the
  defects were in the criteria's wording, not in the implementation.

### Feature chain — worktrees, git, stack, permissions

`feature-implement` / `feature-full` run background subagents, and a background subagent's
permission prompt lands in the main session — or, unanswered, stalls it. Four rules keep a run
from turning into a stream of prompts:

- **Permissions.** The guards never return `allow`; a command they stay silent on falls through to
  the normal flow. `.claude/settings.json` therefore carries a deliberately **narrow**
  `permissions.allow` list: the canonical build/test commands (`mvn test` / `clean test` / `verify`
  / `-o jacoco:check`, `npm ci` / `test` / `run build|lint|e2e`, `npx tsc --noEmit`,
  `npx vitest run`; `npm run lint`, `npm ci`, `java -version` and `mvn -v` also with a ` *` variant,
  for the `2>&1` form), the repo's own `node` scripts by **relative** path, `curl -s
  http://localhost:…`, `git status *`, and the exact `rm -f .scratch/futas-merleg/aktiv-futas.json` that clears the
  run marker. No git mutation is on it — the main session has no guard. So the orchestrator's own git
  steps (branch, spec commit, worktree add/remove, per-branch commit and merge, closing commit,
  deleting a leftover worktree folder) **prompt** in the main session; the chain skills say so, and
  that is the intended cost. `git diff *`, `git log *` and `node --test *` are deliberately **not**
  on the list (decision 2026-11-07): unguarded, they write files (`--output=`,
  `--test-reporter-destination=`) or run code (`--ext-diff`, `--textconv`, any test file). The
  ` *` variants above are wider than the `2>&1` form strictly needs (`npm run lint -- -c <config>`,
  `npm ci --prefix <dir>` run foreign code) — the same class the existing `npm test:*` already
  admits. The orchestrator's subfolder commands use `cd <dir> && <cmd> && cd ..`, because the
  main session's Bash carries a successful `cd` into the next call. A guard's `deny`
  or `ask` still wins over an allow rule. Write commands in the relative form the list matches; an
  absolute `cd "D:/…/AI related/…"` prefix is the usual reason a prompt reappears. A background
  agent in a worktree runs `cd .claude/worktrees/<name> && <allowed command>` from the repo root.
  A subagent's Bash starts in — and resets to — the **main session's current directory**, not the
  repo root (measured 2026-11-06), so the orchestrator checks `pwd` and returns to the root before
  every delegation. Measured the same day, in default permission mode: the prescribed commands
  ran without a prompt both in the main session and in a background subagent, and an off-list
  external `curl` from a background subagent surfaced its prompt in the main session. Two other
  off-list commands (`cd server-java && mvn -v` in a background subagent, a `curl` to example.com
  in the main session) ran without a prompt. The cause is **unverified**: not the project or the
  user allowlist (neither covers them), and not the Bash sandbox (`/sandbox`: unsupported on
  Windows). Don't rely on the allowlist as a boundary for off-list commands — the guards are the
  boundary. The validator measures the running API with the URL directly
  after `curl -s` and the flags after it, because that is what `Bash(curl -s http://localhost:3001/*)`
  matches.
- **Worktrees live inside the repo**, under the gitignored `.claude/worktrees/`
  (`{feature}-impl`, `{feature}-e2e`, `{feature}-unit-<Class>` for a parallel unit-test round).
  Outside the working directory every Read and Edit asks. Branch names are unique per run
  (`wt/{feature}-impl-<YYYYMMDD-HHMM>`), checked against `git worktree list` first. ESLint and
  Semgrep skip the folder.
- **Git hygiene.** On the default branch the chain starts with `git switch -c feature/{feature}`
  (stops and asks if it exists). An uncommitted spec folder gets one spec-only commit, because the
  worktrees branch from `HEAD` and would not see it. The starting `HEAD` and `git status
  --porcelain` go into `Running.md`, and every "only allowed files changed" check diffs against
  that, not against a clean tree; a dirty `README.md`/`openapi.yaml` stops `feature-full` before it
  starts. The run ends in **one** closing commit (fix rounds, unit tests, `pom.xml` includes,
  README/OpenAPI, run logs, and the `CLAUDE.md`/`spec-konvenciok` counts the unit round made stale —
  never the two meter ledgers). Never a push.
- **Decomposition is not in the spec.** `plan.md` section 5 ("Munkacsomagok és függőségeik")
  records only work facts — the packages, which one builds on which, which are independent —
  because every subagent reads the spec as a norm. The shape of the chain (how many delegations,
  serial or parallel, who gets what context) goes to `docs/orchestration/{feature}/Orchestrator.md`,
  which `feature-full` phase 1/b generates from `.claude/skills/feature-full/references/orchestrator-sablon.md`
  and no subagent ever sees; independent packages get a parallel proposal, each in its own
  `{feature}-impl-{X}` worktree. Without an `Orchestrator.md`, `feature-implement` runs its default
  chain and records that in `Running.md`. The old-style section 5 of `spec/admin-orders/plan.md`
  ("four delegations, all sequential") stays as written, but its organisational part is not a norm
  — and `feature-spec-writer` warns against copying it. The letter `V` is reserved for the
  validator's closing acceptance block (`*Gazda:* V`): never an implementer package, never delegated
  to `spec-implementer`; `spec-ellenoriz` check 10 enforces it.
- **The stack stays up until the end**, because the validator and the late e2e writer measure the
  running API. `spec-validator` never starts a stack; with no `/api/health` its runtime verdicts are
  `[kétséges]`. Every merge is followed by a mandatory build, test and lint on the merged tree
  (`feature-implement` 4/6 — the only lint gate); red there is an integration error, as is a
  backend that will not start on a free port — with one exception: a Flyway checksum / "not
  resolved locally" failure on the persistent dev database, when the chain modified no existing
  migration, is a leftover of an earlier run; the chain stops and asks about `docker compose down -v`.
  After every `server-java/` fix in phase 6 `dok-leltar` reruns; red → re-delegate `docs-api-writer`.
  In parallel (D) decomposition only the independent packages get a worktree up front; a package
  that builds on two parallel packages (fan-in) waits for both merges and only then gets its
  worktree, from the merged HEAD; if several packages write migrations, `plan.md` assigns each its own Flyway version. The
  run report is asked for **without** `--atirat` by default (the session transcript lives outside
  the workspace), so the last delegation may be missing from it — the report says so. If the stack was already running before the merge, the backend is serving pre-merge
  code — the chain stops and asks for a restart (likewise after any `server-java/` fix). A
  main-tree `mvn clean test` (validator, unit round) does **not** kill the running backend
  (measured 2026-11-07: 5934 tests green, 126/126 probes of the live API answered 200, cold code
  paths fine afterwards); the sub-second window in which `target/classes` was missing was not
  sampled, so no stop/restart rule.

### Java unit test writer

`.claude/skills/test-writer-java-unit/` — JUnit 5 + Mockito test generator with a **90% JaCoCo
branch-coverage target** per class (the figure comes from an unfiltered run, i.e. the whole suite;
the unit-only recipe is optional). It works on this repo's `server-java/` module as well as on external Java
projects; ten of the unit-test classes listed above (the ones on the `jacoco:check` list) were generated with it. One production class per run, walked
method by method.

It **never edits production code**: if a class needs a seam to become testable, it reports that
instead of refactoring. It also refuses to state a coverage percentage JaCoCo did not produce.
Its test plans go to `docs/test-plans/<Class>.md` (**versioned**; the `unit-test-write` guard mode
allows that folder) — read the plan before extending a generated test class, it carries the case
derivation and the flagged oddities. The plans of the ten gated classes were written to the old,
gitignored `.scratch/test-writer/` and are lost.

### Root README and OpenAPI descriptor — the documentation pair

`.claude/skills/dokumentacio-iro/` + `.claude/agents/docs-api-writer.md` — keeps the
**repo-root** `README.md` and the **repo-root** OpenAPI descriptor in step with the code. The
`feature-full` chain runs it in phase 4, **in parallel with the unit-test round** and in a
single delegation; unlike that round it also runs for a client-only feature, because the README
documents commands, env vars and behaviour, not just endpoints.

There is deliberately **no generator**. `springdoc` would be a new Maven dependency (needs
agreement), and a generated descriptor can only say what the annotations say — the literal
Hungarian error strings, the `stock` vs `available` distinction and the total-approval rule are
in none of them. The price is that a hand-written descriptor rots on its own, so the only thing
holding it true is the gate:

`scripts/dok-leltar.mjs` (run inside a project worktree, it measures that worktree, not the main
tree) reads the same endpoint set from three places — the controllers'
mapping annotations, the root descriptor, and the README — and compares them. It is a **gate,
not an advisor**: any divergence exits 1, and the CI `lint` job runs it on every push and PR. It reports *surplus* as well as *missing*, and surplus
is the worse of the two — a missing endpoint gets searched for, a non-existent one gets called.
Its YAML reader is a narrow zero-dep path extractor, not a parser: anchors, path-level `$ref`
and flow style make it **under-count**, which is why the output prints how many operations it
read. An under-counting gate goes green while lying.

Two rules carry the whole role, and they point in opposite directions on purpose. Normally the
**code is the truth** and the document follows it. The one exception inverts that: where the
divergence is against `spec/`, the **code** is the suspect — and then nothing is edited, it is
reported. Confusing the two means bending the norm to fit the implementation. Same reason the
red gate must never be hand-greened: a documented-but-wrong behaviour removes the measurement
from the chain, and "the docs are current" then rests on nothing.

Scope is enforced by the `docs-write` guard mode, not just by prose: the root `README.md`, the
root `openapi.{yaml,yml,json}` and `.scratch/` are writable, everything else — the described
system's source, the build files, and the per-folder READMEs (`server-java/`, `e2e/`) — is
denied. Those sub-READMEs stay with the generic `docs-writer` agent, whose own `docs-writer-write`
mode is the mirror image: `impl-write` plus a deny on exactly those two root files.

Workflow skills here are reached through their guarded agent, not invoked directly: a skill
activated by name runs in the unguarded main session. Use `docs-api-writer` (not `dokumentacio-iro`)
and `java-unit-test-writer` (not `test-writer-java-unit`); the skills stay portable, so this routing
rule lives here rather than in them.

### Skill and agent authoring

`.claude/skills/skill-iro/` — writes new skills and agents into `.claude/`. It starts with an
overlap check (`scripts/leltar.mjs --keres "…"`) so a capability an existing skill already covers
gets *extended*, not duplicated, and ends with a validator that must be green.

Two facts about `.claude/` that the skill encodes, and that anyone editing an agent should know:

- Skills here come in **two families**. *Convention skills* (`spec-konvenciok`,
  `e2e-vaz-konvenciok`) are fact sources, loaded by an agent's frontmatter `skills:` field;
  *workflow skills* (`test-writer-java-unit`, `feature-spec-writer`, `feature-implement`) are
  procedures the developer invokes. **Project facts belong in the convention skill, never inline in the agent** — a fact
  living in two places has already drifted twice here (a stale World method list that caused a
  duplicated fixture builder; a missing lint command that let "done" mean CI-red).
- `spec-guard.mjs` has nine modes — `impl-write`, `impl-bash`, `e2e-write`, `e2e-bash`,
  `unit-test-write`, `unit-test-bash`, `docs-write`, `docs-writer-write`, `readonly-bash` — and **every writing agent**
  is guarded, the generic `debugger`/`refactorer`/`test-runner`/`docs-writer` included.
  `docs-writer-write` is `impl-write` plus a deny on the worktree-root `README.md` and
  `openapi.{yaml,yml,json}`: those two belong to `docs-api-writer`, because `dok-leltar` measures them. It parses
  the command line with a quote-aware tokenizer (sh, PowerShell and cmd dialects) and judges argv,
  not raw text, so `2>&1`, `grep "a|b"` or a quoted path with a space are not false alarms. The
  Bash modes also extract a command's **write targets** (redirection, `tee`, `sed -i`, `cp`/`mv`,
  `rm`, the PowerShell file cmdlets) and apply the matching write-mode rules to them — `echo x >
  spec/…` is a deny, not a hole. It is still not a sandbox: in-process writes (`node -e`, an npm
  script) stay invisible. The writing modes have an extended git *deny*list, deliberately no
  *allow*list. It judges targets as **literal text**: the supervised bypass probe of 2026-11-07
  (`.scratch/guard-proba/`, 119 inputs) found that shell expansion in a target (`$D/…`, `$(…)`,
  backticks, `~+`, braces, globs like `sp?c/`), `find … -delete` / `-exec rm`, PowerShell
  `[IO.File]::…`, pipeline-fed `Remove-Item` and a variable path, and in the Write modes a
  `\\?\`-prefixed path and a `::$DATA` stream suffix (both measured to reach the real file through
  Node `fs`) all pass unjudged. Open gaps, reported, not yet fixed.
- Writes outside the workspace (`/tmp`, `%TEMP%`) are denied in **every** Bash mode (`impl-bash`
  included) and in the allow-listed Write modes — the developer's global rule keeps native tools
  inside the working folders; the deny text points to `.scratch/`. Device files (`/dev/null`, `NUL`,
  `$null`) are exempt for every target kind except deletion. `impl-write`/`docs-writer-write` still
  allow a Write outside the project, where Claude Code's own permission prompt applies.
  `unit-test-write`/`-bash` also allow `docs/test-plans/<Class>.md` (flat, `.md` only).
- `spec-guard.mjs` answers `defer` on an **unknown mode** (its `switch (MODE)` default), so a
  typo'd mode string in an agent's `hooks:` block silently disables the guard. Nothing else
  catches this — run `node .claude/skills/skill-iro/scripts/ellenoriz.mjs --mind` after touching
  an agent's frontmatter. It also flags dead `references/` links, orphaned bundled files, and
  `skills:` entries pointing at a skill that doesn't exist. With `--mind` it also **runs** every
  hook in every mode (in a unique temp root under the gitignored `.scratch/tmp/`, so the meters write nowhere real) and fails
  if any of them emits `defer` — the 2026-10-25 stall, caught by measurement, not by reading source.
  It reads the hook wiring in `.claude/settings.json` too, so a typo'd meter mode (`"kpau"`) is
  an error there as well, not a silently disabled budget gate; a hook that crashes (exit ≠ 0/2) is
  an error too. Check 8 matches the `permissions.allow` patterns against a fixed list of
  prescribed command forms under the documented rule — a trailing ` *`/`:*` demands a word
  boundary, so `Bash(curl -s http://localhost:*)` never matched `curl -s http://localhost:3001/…`
  (that is how the background validator kept asking). Check 9 compares the skill/agent/hook counts
  stated in `.claude/README.md` and the root README against the actual inventory (HIBA on drift). A
  deliberate size or fact-leak exception is a one-line `<!-- ellenoriz: meret-kivetel max=N — reason -->`
  / `<!-- ellenoriz: teny-kivetel `token` — reason -->` marker; `hordozhato` opts a portable skill
  into the fact-leak check. Prose justifications are not recognised. `scripts/leltar.mjs --keres`
  searches with a small HU↔EN synonym table and lifts an agent and the skill it loads together;
  below the top-3 cut it lists up to two more hits labelled `[további találat]`.
- Every guard mode — the read-only one included — denies writes to `.claude/hooks/`,
  `.claude/agents/`, `.claude/skills/`, `.claude/settings*.json` and the budget gate's
  `docs/orchestration/_kontextus/{keretek,receptek,arak}.json`: the guard, the allowlist and the
  thresholds are the developer's decisions, not an agent's. In a `.claude/worktrees/` worktree the
  worktree's own `.claude/` counts. Only the main session (unguarded) edits them. A delete or an
  unknown-content write aimed at a protected path's parent (`rm -rf docs`, `tar -x -C .`) is a deny
  too. Every Bash mode also denies git configuration that runs a command (`-c core.pager=…`,
  `core.fsmonitor`, `diff.external`, `*.textconv`, `filter.*`, `credential.helper`, …), `difftool -x`,
  and setting `GIT_PAGER`/`GIT_EXTERNAL_DIFF`/`GIT_SSH_COMMAND`/`GIT_EDITOR` — use `git --no-pager`.
  In read-only mode `node` passes only with a repo script or `--test` (`node -e` asks), `npx tsc`
  only with `--noEmit`, `vitest` only with `run`. `npm run <script>` is judged by the script's actual
  body read from `package.json` (workspaces and nested `npm run` followed), so a never-exiting server
  (`vite`/`vite preview`, `vitest` without `run`, `--watch`, `docker compose up` without `-d`) is an
  `ask` whatever the script is called. PowerShell control blocks (`A; if ($?) { B }`, `… |
  ForEach-Object { … }`) pass, and their bodies are judged as separate segments. Writes into `.git/` (a worktree's `.git` file too) are
  denied in every mode — `echo … >> .git/config` would otherwise run code on the next git call. A
  target behind an existing symlink or Windows junction is judged by its real location as well
  (`echo x > docs/link-to-spec/a.md` is a spec write); deleting the link itself is not.

### Delegation cost — measuring and trimming the context handed to subagents

Two halves. `.claude/hooks/kontextus-mero.mjs` is a `PreToolUse` hook wired in
`.claude/settings.json` (matcher `Agent|Task|SendMessage`): it measures **every** delegation and applies
**approved recipes only**. `.claude/skills/cost-reducer/` is the judging half — it reads the
measurements, proposes, asks you, and stores what you approve. The hook never invents a
shortening; without a recipe the prompt passes through untouched.

Three facts about the mechanism, all **measured** on 2026-08-01 (Claude Code 2.1.220) because
the official hook documentation is wrong on each, and each fails silently:

- `PreToolUse` **does** fire for the `Agent` tool, and `tool_input` carries the full `prompt`.
  (The docs claim subagents don't appear as tools there.)
- `SubagentStart` does **not** receive the prompt — only `agent_id`/`agent_type`. It cannot rewrite.
- `updatedInput` only takes effect with `permissionDecision: "allow"`. With `defer` the hook runs,
  emits the rewrite, and the subagent still gets the original — no error, no warning.

A fourth, measured on 2026-10-25 (Claude Code 2.1.310), changed under the hooks: an emitted
`permissionDecision: "defer"` no longer means "fall through to the normal permission flow" — it
*defers* the tool call, and a background subagent stops at its first Bash call with no error
(`hook_deferred_tool` in its transcript). All three hooks (`spec-guard`, `kontextus-mero`,
`futas-mero`) still use `defer` internally as "no verdict", but their `decide()` now exits 0 with
**no output** for it. Never emit `defer` from a hook here.

That third one has a price: rewriting **bypasses the permission prompt for that delegation**. So
the hook returns `allow` *only* when a recipe actually changed the prompt — a recipe whose
operations matched nothing is logged as `mert` and passes through. `COST_REDUCER=0` disables it
for a run, measurement included. On an unknown mode string both meters emit only a `systemMessage`
(no `permissionDecision`), so the typo is visible instead of silent. A recipe counts as approved
only with a real, non-future `YYYY-MM-DD` in `jovahagyva`; a malformed recipe is logged as `hiba`
and never applied.

The store is `docs/orchestration/_kontextus/`: `receptek.json` and `meresek.jsonl` are
**versioned** (recipes are decisions, like `Decision.md`, and the ledger holds no prompt text —
only hashes and sizes); raw prompts and block previews go to the gitignored
`.scratch/cost-reducer/`. A recipe without a `jovahagyva` date is inert — that is also how you
revoke one. Under the human approval sits a machine backstop: four protected strings
(`A munkagyökered`, `mutató a bizonyítékhoz`, `kötelező érvényű`, `szó szerint`) that must
survive a rewrite — counted per occurrence, so dropping one of two copies trips it, and copies
the recipe's own `helyette` text brings in don't count — plus a minimum-length ratio that a recipe
can only tighten (`Math.max`), never loosen. If either trips, the whole rewrite is dropped and
logged as `elutasitva` — fix or revoke the recipe, don't lower the threshold.

What it can measure: characters, repetition, how often a recipe fired. What it cannot: token
counts (the number it reports is a ≈4-chars estimate), cache hit rate, money — none of which
reach the hook's payload. That limit is real but **local to this hook**: those numbers do exist,
one level away, and the `futas-merleg` pair below reads them.
`references/mit-nem-szabad-elvenni.md` is the file worth reading before
approving anything: six categories that must never be cut, each drawn from a real decision in
`docs/orchestration/admin-orders/Decision.md`, and all six look redundant, which is exactly why
they get cut.

### Run cost and convergence — measuring consumption and stopping a loop that isn't converging

The second half of the same story, and a different question: `cost-reducer` asks *what could we
cut from the prompt going in*, `futas-merleg` asks *what did the run actually consume, and is it
getting anywhere*. Same two-part shape — `.claude/hooks/futas-mero.mjs` is the machine half (a
`PreToolUse` hook on the same `Agent|Task|SendMessage` matcher), `.claude/skills/futas-merleg/` is the judging
half — but this one **can stop the chain**, and it measures real numbers rather than estimates.

The measurement is possible because the hook payload carries `transcript_path`, and next to the
session transcript sits `<session>/subagents/agent-*.jsonl` — one per delegation, every
`assistant` line holding a true `usage` block. The join back to the delegation the hook saw is the
main transcript's `tool_result.tool_use_id` (the `.meta.json` supplies `agentType` and `finished`). So the hook reconciles *previous*
delegations before each new one; nothing depends on `PostToolUse` or `Stop`, neither of which was
verified here.

Three traps, all measured on 2026-08-04, and each one fails by producing a plausible number
rather than an error:
- `toolUseResult.totalTokens` is **not** the delegation's consumption — it is the last turn's context size. Measured: 175 120 against a true per-turn sum of 10 281 395, a ~60× understatement. It is recorded as `zaro_kontextus`; cost never comes from it.
- `toolUseResult.status` says `completed` even for an agent killed mid-run by a session limit. Truncation is detectable **only** from the report text, so a `status` check would silently accept a half-finished validator verdict. The `did NOT finish` match is case-sensitive: a plain "did not finish" inside a report is prose, not truncation.
- A validator report with **no** `[teljesül]`/`[nem teljesül]` markers is a measurement gap, never "zero failures" — the same principle that keeps `[kétséges]` from starting a fix round. Such a round is excluded from the convergence curve rather than counted as progress. An all-`[kétséges]` report is the same case: it used to count as a clean `0` round, so `2 → (all doubtful) → 2` read as `0 → 2` and slipped past the convergence rule.

Two more, measured on 2026-10-25 (Claude Code 2.1.310), same failure shape:
- **One API response is several transcript lines.** Every content block of an `assistant` message gets its own line, each carrying the *same* `usage`. Summed per line, cost multiplies by the block count (measured 13 messages in 56 lines; a whole run read 5.07 M units instead of 2.02 M). A round is a `message.id`, never a line; its tokens are the field-wise maximum over that message's lines (an early streamed line can carry a smaller `output_tokens`). Whether the 2026-08-04 `admin-orders` calibration was inflated the same way is **unverified** — its subagent transcripts are gone.
- **A background delegation is invisible in the main transcript.** Its `toolUseResult` is `{ isAsync: true, status: "async_launched", agentId }` — no `agentType`, no report, and no second result when it ends. The old reconciliation skipped it silently, so the budget, convergence and oscillation gates saw **nothing** of a background run. `agentType` and `finished` now come from `subagents/agent-<id>.meta.json`, the report from the subagent's `SubagentHandback` call, and a background delegation resumed with SendMessage is booked as a `folytatas` row (consumption, not a new delegation). Booked rounds are counted **per agent** (`agent_id` on the row), not per `tool_use_id`, so a second result line for the same agent books only its unbooked rounds, as `folytatas` — never the whole transcript again. **Known gap:** a *foreground* agent resumed with SendMessage is booked only if its result line arrives with a new `tool_use_id` and the same `agentId`; that shape was never measured, so the budget may still under-count such a sequence. A still-running background agent (meta present, `finished: false`) is not written to the ledger, but its rounds so far, read from the partial transcript, **count towards every verdict** (`allapot: "fut"` rows: budget only, no convergence); it is booked once, when a later reconciliation sees `finished: true`.

**The run boundary is the chain, not the session** (decision 2026-11-06). The run id resolves as
`FUTAS_AZONOSITO` env (settable only at launch) > a fresh marker `.scratch/futas-merleg/aktiv-futas.json`
(`{"futas": "{feature}-<YYYYMMDD-HHMM>", "kezdet": "<ISO-8601>", "frissitve": "<ISO-8601>"}` — the
timestamp is the one in the worktree branch names, so a re-run is a *new* run; `kezdet` must be
timezone-qualified and not in the future; fresh = ≤ 6 h old, measured from `frissitve` when that is
valid — timezone-qualified, not in the future, not before `kezdet` — else from `kezdet`) > the
session id. The chain writes the marker at its start (`frissitve` = `kezdet`), refreshes only
`frissitve` at the start of every phase (main session: `date -u …`, then `Read` + an `Edit` of that
one value — so a human stop mid-chain doesn't expire it), and deletes it at its end and on every
early stop. `futas` and `kezdet` never change mid-run; rewriting them is routing around the gate,
refreshing `frissitve` is not. The hook only reads the marker, and ignores a broken, expired or
future one (fail-open) — but an **expired** marker is reported in a `systemMessage`, because the
chain's budget would otherwise restart from zero silently. Because the hook reconciles *previous* delegations, it records a `tool_use_id` → run
binding (for SendMessage: recipient → run) in the gitignored `.scratch/futas-merleg/delegalasok.jsonl`
at delegation time, so the chain's last delegation still lands in the chain's run after the marker
is gone. Ask for the report with `futas-merleg.mjs --futas <run name>`; `--atirat` reads the session
transcript, which lives outside the workspace, so it needs the developer's explicit approval. A
SendMessage binding is written *after* reconciliation and carries the session, the agent id and the
recipient's round count, so an unbooked continuation is split at those round boundaries and a later
SendMessage can no longer pull an earlier continuation into its own run. The marker may carry an
optional `session`; a mismatch ignores it. Ledger rows are **deduplicated on read**
(`tool_use_id` + section start) wherever they are summed, because two concurrent hooks can both
append the same row. After a `deny` the hook appends an `allapot: "tiltva"` row (no consumption):
`kontextus-mero` had already measured that delegation, and `merleg.mjs` drops measurements whose
`tool_use_id` was denied. A `hiba` row whose `tool_use_id` later got a measured row is dropped on
read. A transcript with zero parseable lines is a broken meter (no verdict);
measurement gaps surface as a `systemMessage` with no `permissionDecision`, never on stderr; a
missing `meta.json` becomes a `hiba` row only on a reconciliation ≥ 60 s after the first sighting.
`kontextus-mero` rows carry `futas` and `tool_use_id` too (`merleg.mjs --futas`). Deleting or
rewriting the marker to get past a `deny` restarts the budget from zero — that is routing around
the gate, not a fix.

**Only a chain is gated** (decision 2026-11-07): when the run id fell back to the session (no
`FUTAS_AZONOSITO`, no fresh marker), the three rules below are still computed, but a hit is a
`systemMessage` warning, not a `deny` — a long working session's delegations add up, and the
chain-calibrated budget would otherwise stop work nobody meant as chain cost. A chain is unaffected:
it writes the marker at its start, and from then on its own run is judged.

Three rules are live by default, and a `deny` from any of them **ends the chain** — it is a
decision point for the developer, not an obstacle to route around (don't re-run the delegation,
split it smaller, or set `FUTAS_KERET=0` yourself). **Budget**: cumulative run cost crosses a
threshold — this catches what a round counter cannot, many small delegations that never reach
round 2. **Convergence stall**: two consecutive validator rounds fail to reduce the
`[nem teljesül]` count. **Oscillation**: a criterion that passed in *any* earlier round fails again — the raw
count hides this (`3 → 1` looks like progress while a working criterion regressed). Each verdict
line yields exactly one criterion id (the first before the marker, else the first after it, with
Unicode boundaries — `ÁR-01` stays whole). The validator's report template puts the id right after
the marker (`1. [teljesül] AR-01 — …`). When the run's spec is reachable — the feature is the run id
minus its `-YYYYMMDD-HHMM` suffix, and `spec/{feature}/requirements.md` defines ids as `- [ ]
**AR-01** —` list items — only those defined ids are accepted, so an `UTF-8`, a `K-58` or a
cross-referenced id is never mistaken for a criterion in either order. Without such a spec (a
session run, a historical spec with no ids) the old pattern rule applies; the row's
`konvergencia.azonosito_forras` says which (`spec` / `minta`). A clean round followed by failures (0 → N) is caught by the
**oscillation** rule, deliberately not by the convergence rule (decision 2026-11-06, proven in
`test/hooks/merok.test.mjs`); known gap: an id no earlier round ever marked `[teljesül]` trips
neither. The
"max 2 fix rounds" limit is deliberately **not** enforced here; it stays prose in
`feature-implement`, and its slot in `keretek.json` is `null`.

Everything fails open: a missing or unreadable transcript means the meter is broken, and a broken
meter never blocks work. Validator delegations are never denied — a stalled run is exactly when
the closing measurement matters most. The store is `docs/orchestration/_kontextus/`:
`futasok.jsonl` (the ledger — numbers, ids and states, plus the delegation's short `description`
label (`leiras`) and error reasons; never prompt or report text), `keretek.json` (thresholds, calibrated
from the measured `admin-orders` run: 5 delegations, ≈$34.67, 62 minutes) and `arak.json` (the
price table, with a mandatory `ervenyes` date — a missing one is flagged in the report). A model
with no price (after stripping a `-YYYYMMDD` suffix) marks the USD figure `koltseg_usd_reszleges`
and lists it in `araznatlan_modellek`; a partial USD never blocks on its own, the unit budget does. Money is always a **derived** figure printed with
its source; the cost-unit weights are a stated assumption, not a measurement. If the gate fires,
the threshold does not come down — same rule as the JaCoCo coverage gate.
