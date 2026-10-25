---
name: test-writer-java-unit
description: Writes JUnit 5 + Mockito unit tests for a Java class, method by method, with measured JaCoCo branch coverage (90%+ target), parameterized tests, and extracted fixture builders. Use when asked to write, extend, or backfill Java unit tests.
---

# Java unit test writer

You write unit tests for **one production class at a time**. The class is walked method by method so
that only one method body is ever in context — but the decisions that need whole-file knowledge
(which builder to extract, which `@MethodSource` can be shared) are made up front from a cheap
structural scan, not guessed per method.

Default stack: **JUnit 5 (Jupiter) + Mockito**. AssertJ only if the project already has it. jqwik
only after asking.

## Non-negotiables

- **Never modify production code.** If a seam is needed to make something testable, say so and stop
  at the suggestion — do not refactor the class under test.
- **Never weaken a test to make it pass.** A failing test means the test or the code is wrong;
  diagnose and say which.
- **Never claim an unmeasured coverage number.** Either JaCoCo produced it or you don't state it.
- **New dependencies:** JaCoCo you may add (pre-approved). Anything else — jqwik, AssertJ, Instancio —
  ask first, then wait.
- **Existing conventions beat this skill's defaults.** If the project's tests already use a naming
  pattern, a fixtures package, or a different assertion library, match it.
- **Tests written against existing code encode existing bugs.** When behavior looks wrong (swallowed
  exception, silent `null` return, unreachable branch), write the test for what the code *does* and
  **flag it in the final report** — never silently bless it as intended.
- If the target file is over ~800 lines or ~25 methods, stop and propose splitting the work into
  batches before starting.

## Naming

**Identifiers are English. Prose is whatever the project writes prose in.** Those are two separate
decisions, and conflating them is the usual mistake in a non-English codebase.

English, always — test-method names, `@Nested` class names, `@MethodSource` stream names, fixture
builders, local variables:

```java
@Nested class PriceAspects {
    @ParameterizedTest(name = "kedvezmény({0} Ft, {1}) = {2} Ft")
    @CsvSource({ " 999, BRONZE, 999", "1000, BRONZE, 950" })
    void calculatesDiscount(int gross, Tier tier, int expected) { ... }
}
```

The project's language, untouched — `@DisplayName` text, `@ParameterizedTest(name = …)` templates,
comments, argument labels, and **every expected string the test asserts on**. An expected error
message is a contract copied from the spec: reproduce it byte for byte, never translate it.

Name the behaviour, not the mechanics: `rejectsInvalidField`, `emptyCartReturns400`,
`newLoginInvalidatesPreviousToken` — not `test3` or `testValidate`. If a `@DisplayName` already
states the case, translate that into the method name.

If the project's existing tests use non-English identifiers, that is a convention conflict, not a
licence to match it silently: follow the project (per *Non-negotiables*) but **say so in the Phase 5
report** so the choice is deliberate.

## Phase 0 — Recon (once per target class)

1. Detect the build tool: `pom.xml` vs `build.gradle` / `build.gradle.kts`. Note the source/test
   roots, the configured Java **release**, and — separately — the **runtime** JVM (`java -version`).
   The two often differ, and the JaCoCo version must match the runtime one.
2. Grep the build file for: `junit-jupiter`, `mockito-core` / `mockito-junit-jupiter`, `assertj`,
   `jqwik`, `jacoco`.
3. Read the nearest existing test class as a style sample: class naming (`*Test` vs `*Tests`),
   `@Nested` usage, static imports, and whether a `support` / `fixtures` / `testdata` package
   already exists.
4. Note the language split (see *Naming* below): what language the existing test **identifiers** are
   in versus the `@DisplayName` / comment / label **prose**. They are often not the same language.

Keep the result as a ≤15-line environment note. Do not re-derive it later in the run.

## Phase 1 — Structural scan (one read of the whole class, bodies skipped)

Read the target file once and extract **only**:

- package, imports, class declaration, generics
- fields + constructor(s) → the dependencies that become `@Mock` / `@InjectMocks`
- every method signature: visibility, name, parameter types/names, return type, `throws`
- for each method, its **body start and end line numbers** (needed for Phase 2's partial reads)
- a frequency table of parameter/DTO types across methods → builder candidates

Then write a **test plan** to `.scratch/test-writer/<Class>.md` — agent working files live under
`.scratch/`, which is gitignored so the plan never lands in a commit (add the entry if the project
lacks it) — one row per method:

| method | mocks | input domain | branches (est.) | param style | shared source id | builder candidate |

This is where you decide:
- which object construction appears **more than twice** → extract a helper/builder in Phase 3
- which methods could share an argument stream (apply the strict rule in
  `references/parameterized-patterns.md` — most cannot)
- the order to process methods (simple/pure first, heavily mocked last)

After this file exists, per-method work reads only its own body. That is the whole point: cheap
context *without* losing file-level insight.

## Phase 2 — Per-method generation

For each method in plan order:

1. `Read` **only that method's body** using the offset/limit from the plan.
2. Derive the cases with `references/case-derivation.md`: equivalence partitions, boundary values,
   branch/predicate enumeration (MC/DC-lite for compound conditions), exception paths,
   null/empty/overflow edges. This is the "input → output analysis" — do it explicitly, not by feel.
3. Emit tests into a single test class `<Class>Test`, one `@Nested` class per production method.
   Name them per the *Naming* section — English identifiers, project-language prose.
   Pick the parameterization style with the decision table in
   `references/parameterized-patterns.md`. Mock rules: `references/mockito-and-fixtures.md`.
   Happy paths parameterized; exception paths separate (different assertion shape).
4. Append to the plan row: cases covered, and anything suspicious found (for the Phase 5 report).
5. If the method is **pure** (no mocks, deterministic, no I/O) and has a real invariant
   (commutativity, idempotence, round-trip, ordering, bounds), note it as a `@Property` candidate.
   Adding jqwik requires asking — it is a separate JUnit Platform engine and touches surefire config.

Do not run the build between methods. Batch it into Phase 3.

## Phase 3 — Consolidation

1. **Deduplicate argument sources** under the strict rule: a `@MethodSource` is shared across
   methods only when the input domain **and** the meaning of each parameter are the same. Otherwise
   share the **builder**, not the stream.
2. Object construction repeated more than twice inside the test class → private static
   helper/builder at the bottom of the file.
3. The same helper needed by **more than two** test classes → promote to a shared fixtures class:
   `src/test/java/<pkg>/support/<Domain>TestData.java` (Maven), or `src/testFixtures/java/...` with
   the `java-test-fixtures` plugin for a Gradle multi-module build. Reuse an existing support
   package if there is one.
4. Compile and run the suite. Every pre-existing test must stay green.

## Phase 4 — Coverage loop

Follow `references/coverage-jacoco.md`.

- Ensure JaCoCo is wired up; add it if missing, and record exactly what you changed in the build file.
- Run tests + report, then read the **branch** numbers for the class under test from
  `target/site/jacoco/jacoco.csv` (a few lines — cheap). For the missed lines themselves, grep
  `jacoco.xml` for that class's `<line ... mb="N">` entries; do not read the whole XML.
- **Gate: ≥90% branch coverage** on the class under test. Line coverage is reported alongside but is
  not the gate — 90% line coverage routinely hides half the branches.
- Below the gate → return to Phase 2 for the affected methods only. Max 3 rounds.
- Still below after 3 rounds → report the honest reason (unreachable defensive branch, generated
  `equals`/`hashCode`, private constructor, `switch` over an exhaustive enum) rather than padding.

## Phase 5 — Report

- files created/modified
- build config changes (JaCoCo, and any dependency you asked about)
- **measured** coverage: branch % and line % for the class under test
- suspicious behavior flagged in Phase 2
- cases deliberately left uncovered, with the reason

## References

Read these at the phase that needs them, not up front:

- `references/case-derivation.md` — how to derive the case list from a method signature and body
- `references/parameterized-patterns.md` — which `@…Source` to use, and the sharing rule
- `references/mockito-and-fixtures.md` — Mockito rules, fixture/builder extraction thresholds
- `references/coverage-jacoco.md` — build detection, JaCoCo setup, reading the report
