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
are exempt** (see below): their staleness is the point.

Not every `spec/*/` folder is a live norm. `spec/backend/` and `spec/admin-orders/` are; the three
that moved out of the course's `week3/` folder on 2026-08-02 are **historical** — `admin-role`, `review-and-rating` and
`termek-felhasznaloi-ertekeles`, all written against the Node/lowdb backend. Each one's
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
- `npm run lint` (ESLint, flat config in `eslint.config.mjs`; `npm run lint:fix` to autofix). It covers `client/` and the Node scripts in `spec/backend/conformance/` — never `server-java/`. Type-aware rules are deliberately off: `npx tsc --noEmit -p client/tsconfig.json` is what catches type errors.
- There is no `npm start`.

Backend, from `server-java/` (needs JDK 25, Maven, Docker):
- `docker compose up -d` — dev Postgres · `docker compose down -v` — full reset
- `mvn spring-boot:run -Dspring-boot.run.profiles=dev` · `mvn test` (Testcontainers starts a real Postgres — Docker must be running)
- `mvn test -Dtest=ClientIpResolverTest -DfailIfNoSpecifiedTests=false` runs one class (comma-separate for several). Handy for the unit tests: no Docker, a few seconds instead of minutes. **But `-Dtest` never runs `@Nested` classes** — surefire 3.5.4 selects the outer class, reports `Tests run: 0` and still exits green, and no pattern form (wildcard, `%regex[…]`, negation) changes that. Nine of the unit test classes are structured that way (`JsonInputTest`, `ProductFilterTest`, `ProductValidatorTest`, `UserValidatorTest`, and all five in `security/`); they only run in an unfiltered `mvn test`. A filtered run that prints `Tests run: 0` is the failure mode to watch for — it looks like a pass.
- Every `mvn test` also writes a JaCoCo report to `target/site/jacoco/`; read per-class numbers from `jacoco.csv`, missed lines from `jacoco.xml`. The surefire `argLine` **must keep the leading `@{argLine}`** — it is what injects the JaCoCo agent, and dropping it makes coverage silently 0. `jacoco.exec` **appends** across runs, so a report taken after a filtered run still carries the previous run's data — use `mvn clean test` for any number you intend to quote.
- `mvn test` also **fails** on a coverage regression: a `jacoco:check` execution (bound to the `test` phase, so the CI command stays `mvn -B test`) enforces 90% BRANCH on the ten classes the `test-writer-java-unit` skill has plans for — all of them measured at 100%. The scope is deliberately a **class list, not a package or the module**: the module as a whole sits at 86% branch, so a global 90% rule would go red on never-unit-tested legacy code instead of on a real regression. Raise coverage and add to the list; don't lower the threshold. Run it alone with `mvn -o jacoco:check@check-unit-tested-classes` (reuses the existing `jacoco.exec`, no re-run of the suite).

`DATABASE_PASSWORD` has **no default** — a missing value is a startup failure, so that a
production deploy can't silently boot on a guessable credential. The `dev` profile supplies the
`docker compose` password and nothing else; `start.sh` turns it on automatically, so only a bare
`mvn spring-boot:run` needs the flag (or a `.env`). Tests are unaffected: Testcontainers injects
the credentials directly.

Acceptance cases against a running backend:
`node spec/backend/conformance/run.mjs --base-url http://localhost:3001 --clean-store`
(54 of the 70 cases; the other 16 are `⚙` — covered by `mvn test`, see `konformancia.md`).

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
folder never enters it, and it is **not** in CI — nothing gates on it today.

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
otherwise disables the guard silently),
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

Tests never sit next to the source: `client/test/`, `server-java/src/test/java/`, `e2e/` and
`test/mocks/`. Two kinds of Java test live side by side in the Maven module, and picking the wrong
one is the usual mistake:

- **Integration** (the bulk of the suite) — extend `hu.webshop.support.IntegrationTest`, which drives **real HTTP** against a real Postgres and builds every precondition through the public API. Prefer that seam over calling controllers directly. Anything crossing HTTP, JPA or a transaction boundary belongs here.
- **Unit** — plain JUnit 5, Mockito only where there is a real collaborator, no Spring context and no Docker: `JsonInputTest`, `ProductValidatorTest`, `ProductFilterTest`, `UserValidatorTest`, `ClientIpResolverTest`, `OrderTransitionsTest`, `GmailOrderNotifierTest`, `LogLevelEnvironmentPostProcessorTest`, `SpaResourceConfigTest`. Use these for branchy pure logic (validation, parsing, state tables) — an integration test would measure the same branches ten times slower.

**Test-method names are English** in both kinds — `rejectsInvalidField`, not
`elutasitjaAHibasMezot`. Same for `@Nested` class names (`class PriceAspects`). Everything else in a
test file stays Hungarian: `@DisplayName` text, comments, argument labels, and — non-negotiably —
the expected error strings, which are copied verbatim from the spec's error catalogue.

The English-naming exception does **not** reach Gherkin: `e2e/features/*.feature` is Hungarian with
a `# language: hu` header. Those files are prose describing a Hungarian UI, and the step-definition
callbacks are anonymous, so there is no name to anglicise.

## Coding conventions

- `client/` is `"type": "module"`, TS with `moduleResolution: Bundler`. Its `tsconfig` targets **ES2020**, so `Array#at`, `Object.hasOwn` etc. fail the build — use index arithmetic instead.
- `server-java/` packages are cut **by feature** (`auth/`, `catalog/`, `order/`, `review/`), not by layer — no `controller/`/`service/`/`dto/` split. `domain/` and `repo/` are the shared exceptions.
- The Java response DTOs and `client/src/api.ts` define the same `Product`/`Order`/`Customer`/`OrderItem` shapes independently (no shared package). Change a shape → update both sides.
- Prices are integer HUF (forints), no decimals.

## Project guidelines

- UI text, code comments and log messages are in Hungarian; keep new user-facing strings and comments Hungarian. The one exception is **test-method and `@Nested` class names, which are English** — see the testing section above.
- Don't add or upgrade dependencies without asking — neither npm nor Maven. Already approved for tests: Vitest, `@testing-library/{react,jest-dom,user-event}`, `jsdom` — the client component tests need all four, so they are not a violation to "clean up". On the Maven side the `jacoco-maven-plugin` is likewise deliberate; its version tracks the **runtime** JDK (25 → 0.8.14+), not `java.version`, because the agent instruments JDK classes the Byte Buddy agent pulls in.
- Credentials come **only** from the environment (spec 7.6). `server-java/.env` is gitignored; `.env.example` is the template.
- The Postgres data lives in a Docker volume, not in the repo. `docker compose down -v` resets to seed data (8 demo products + seed admin `adminisztrator` / `admin123` — developer credentials).
- `docs/` holds the design records next to the code: ADRs (`docs/adr/`), the orchestration run logs and the delegation-cost store (`docs/orchestration/`), the Gmail twin's behavioural spec (`docs/digital-twin/`), the scenario catalogues and the simulated-user report (`docs/scenario-catalog/`, `docs/user-simulation/`), the `edit-user-data` audit with the spec as it was before amendment (`docs/edit-user-data/`) and the CI gate log (`docs/AI-aware-ci/`). The weekly course folders (`week*/`) of the original course repo were deliberately **not** carried over; a mention of `week3/` in a historical spec header is provenance, not a path to follow.

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
  `*Kész, ha:*` line, ticked checkboxes, permissive wording, dead links. Run against
  `spec/admin-orders` it currently reports three real gaps — `AR-17`, `AR-20` and `AR-21` have no
  task pointing at them, the last two because they were added after the chain ran.
- `references/kihivas-katalogus.md` is the interesting file: eight spec-writing failure classes that
  **actually happened here**, each with its evidence. The reviews of `admin-orders` found the
  defects were in the criteria's wording, not in the implementation.

### Java unit test writer

`.claude/skills/test-writer-java-unit/` — JUnit 5 + Mockito test generator with a **90% JaCoCo
branch-coverage gate**. It works on this repo's `server-java/` module as well as on external Java
projects; the unit tests listed above were generated with it. One production class per run, walked
method by method.

It **never edits production code**: if a class needs a seam to become testable, it reports that
instead of refactoring. It also refuses to state a coverage percentage JaCoCo did not produce.
Its test plans go to `.scratch/test-writer/<Class>.md` (gitignored) — read the plan before extending
a generated test class, it carries the case derivation and the flagged oddities.

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

`scripts/dok-leltar.mjs` reads the same endpoint set from three places — the controllers'
mapping annotations, the root descriptor, and the README — and compares them. It is a **gate,
not an advisor**: any divergence exits 1. It reports *surplus* as well as *missing*, and surplus
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
denied. Those sub-READMEs stay with the generic `docs-writer` agent.

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
- `spec-guard.mjs` answers `defer` on an **unknown mode** (its `switch (MODE)` default), so a
  typo'd mode string in an agent's `hooks:` block silently disables the guard. Nothing else
  catches this — run `node .claude/skills/skill-iro/scripts/ellenoriz.mjs --mind` after touching
  an agent's frontmatter. It also flags dead `references/` links, orphaned bundled files, and
  `skills:` entries pointing at a skill that doesn't exist.

### Delegation cost — measuring and trimming the context handed to subagents

Two halves. `.claude/hooks/kontextus-mero.mjs` is a `PreToolUse` hook wired in
`.claude/settings.json` (matcher `Agent|Task`): it measures **every** delegation and applies
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

That last one has a price: rewriting **bypasses the permission prompt for that delegation**. So
the hook returns `allow` *only* when it actually applied a recipe. `COST_REDUCER=0` disables it
for a run. Like `spec-guard.mjs`, it answers `defer` on an unknown mode string — same silent trap.

The store is `docs/orchestration/_kontextus/`: `receptek.json` and `meresek.jsonl` are
**versioned** (recipes are decisions, like `Decision.md`, and the ledger holds no prompt text —
only hashes and sizes); raw prompts and block previews go to the gitignored
`.scratch/cost-reducer/`. A recipe without a `jovahagyva` date is inert — that is also how you
revoke one. Under the human approval sits a machine backstop: four protected strings
(`A munkagyökered`, `mutató a bizonyítékhoz`, `kötelező érvényű`, `szó szerint`) that must
survive a rewrite, plus a minimum-length ratio. If either trips, the whole rewrite is dropped and
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
`PreToolUse` hook on the same `Agent|Task` matcher), `.claude/skills/futas-merleg/` is the judging
half — but this one **can stop the chain**, and it measures real numbers rather than estimates.

The measurement is possible because the hook payload carries `transcript_path`, and next to the
session transcript sits `<session>/subagents/agent-*.jsonl` — one per delegation, every
`assistant` line holding a true `usage` block. The `.meta.json` beside it carries `toolUseId`,
which joins the transcript back to the delegation the hook saw. So the hook reconciles *previous*
delegations before each new one; nothing depends on `PostToolUse` or `Stop`, neither of which was
verified here.

Three traps, all measured on 2026-08-04, and each one fails by producing a plausible number
rather than an error:
- `toolUseResult.totalTokens` is **not** the delegation's consumption — it is the last turn's context size. Measured: 175 120 against a true per-turn sum of 10 281 395, a ~60× understatement. It is recorded as `zaro_kontextus`; cost never comes from it.
- `toolUseResult.status` says `completed` even for an agent killed mid-run by a session limit. Truncation is detectable **only** from the report text, so a `status` check would silently accept a half-finished validator verdict.
- A validator report with **no** `[teljesül]`/`[nem teljesül]` markers is a measurement gap, never "zero failures" — the same principle that keeps `[kétséges]` from starting a fix round. Such a round is excluded from the convergence curve rather than counted as progress.

Three rules are live by default, and a `deny` from any of them **ends the chain** — it is a
decision point for the developer, not an obstacle to route around (don't re-run the delegation,
split it smaller, or set `FUTAS_KERET=0` yourself). **Budget**: cumulative run cost crosses a
threshold — this catches what a round counter cannot, many small delegations that never reach
round 2. **Convergence stall**: two consecutive validator rounds fail to reduce the
`[nem teljesül]` count. **Oscillation**: a criterion that previously passed fails again — the raw
count hides this (`3 → 1` looks like progress while a working criterion regressed). The
"max 2 fix rounds" limit is deliberately **not** enforced here; it stays prose in
`feature-implement`, and its slot in `keretek.json` is `null`.

Everything fails open: a missing or unreadable transcript means the meter is broken, and a broken
meter never blocks work. Validator delegations are never denied — a stalled run is exactly when
the closing measurement matters most. The store is `docs/orchestration/_kontextus/`:
`futasok.jsonl` (the ledger — numbers only, no prompt text), `keretek.json` (thresholds, calibrated
from the measured `admin-orders` run: 5 delegations, ≈$34.67, 62 minutes) and `arak.json` (the
price table, with a mandatory `ervenyes` date). Money is always a **derived** figure printed with
its source; the cost-unit weights are a stated assumption, not a measurement. If the gate fires,
the threshold does not come down — same rule as the JaCoCo coverage gate.
