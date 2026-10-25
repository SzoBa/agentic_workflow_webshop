# Measuring coverage with JaCoCo

The 90% target is only a number if a tool produced it. **If coverage was not measured, do not state a
percentage** — report that it is unmeasured and why.

The gate is **branch coverage** on the class under test. Line coverage is reported alongside but is not
the gate: a class can sit at 90% lines with half its branches untaken, which is exactly the gap this
skill exists to close.

**What the number measures:** an unfiltered run counts every branch *any* test took — in a project
with integration tests, theirs too. So the figure says the class is covered by the suite, not that
the unit tests you wrote cover it. Report it as the **full-suite** figure; the unit-only figure is a
separate, optional measurement (see *Optional: the unit-only figure* below).

## Detect the build

| file present | build tool | test command | report path |
| --- | --- | --- | --- |
| `pom.xml` | Maven | `mvn clean test` | `target/site/jacoco/jacoco.{csv,xml}` |
| `build.gradle` / `.kts` | Gradle | `./gradlew test jacocoTestReport` | `build/reports/jacoco/test/jacoco.{csv,xml}` |
| `pom.xml` + `mvnw` | Maven wrapper | `./mvnw clean test` | as Maven |

**Never pass `-q` to Maven here.** Quiet mode suppresses Surefire's `Tests run: N, Failures: …`
summary — the line the report has to quote, and the only place the `Tests run: 0` trap below is
visible. A quiet green build and a build that ran nothing look identical.

No `jacoco:report` on the command line either, *if* the `pom.xml` binds a `report` execution to the
`test` phase (this repo's `server-java/` does, and so does the snippet below) — the goal would only
run twice. Append it only for a project whose JaCoCo plugin has `prepare-agent` but no bound
`report`; check with a grep for `<goal>report</goal>` before deciding.

Multi-module: run from the module that holds the class under test, or pass `-pl <module>` / use the
module's Gradle task path. Verify the binary and the executable exist (`mvn -v`, `./gradlew -v`) before
promising a measurement — if the wrapper is absent and the tool is not installed, say so.

## Wiring JaCoCo in when it is missing

Adding JaCoCo is pre-approved for this skill, but **always report the exact edit** in the final summary.

**Maven** — inside `<build><plugins>`:

```xml
<plugin>
  <groupId>org.jacoco</groupId>
  <artifactId>jacoco-maven-plugin</artifactId>
  <version>0.8.14</version>
  <executions>
    <execution>
      <id>prepare-agent</id>
      <goals><goal>prepare-agent</goal></goals>
    </execution>
    <execution>
      <id>report</id>
      <phase>test</phase>
      <goals><goal>report</goal></goals>
    </execution>
  </executions>
</plugin>
```

**Pick the JaCoCo version from the JVM that runs the tests (`java -version`), not from
`maven.compiler.release`.** The agent instruments every class the forked JVM loads, including JDK
classes pulled in by other agents — Mockito's ByteBuddy agent loads
`com.sun.tools.attach.VirtualMachine`, which carries the JDK's own class file version. A project
compiled with `release=21` therefore still fails on a JDK 25 runtime with an older JaCoCo:

```
java.io.IOException: Error while instrumenting com/sun/tools/attach/VirtualMachine with JaCoCo 0.8.12
Caused by: java.lang.IllegalArgumentException: Unsupported class file major version 69
```

Fix by bumping JaCoCo (0.8.14 handles class file major 69 / JDK 25); never downgrade the project or
the JDK. If the newest JaCoCo still cannot read the runtime's bytecode, report coverage as unmeasured
rather than working around it.

**Gradle** (Groovy DSL):

```groovy
plugins { id 'jacoco' }

jacocoTestReport {
    dependsOn test
    reports { xml.required = true; csv.required = true }
}
```

CSV and XML are both needed: CSV for the per-class numbers, XML for the missed line numbers.

Do **not** add a `jacocoTestCoverageVerification` / `check` rule that fails the build at 90% unless the
user asks — that changes the project's build contract for everyone.

## Measure with a full, clean run — two traps that fake the number

Both of these produce a *plausible* number that is not the one you think you measured. Neither
announces itself: the build stays green.

- **`-Dtest=<Class>` does not descend into `@Nested` classes.** With Surefire 3.5.4 any `-Dtest`
  filter — plain, wildcard, `%regex[…]`, even a negation — selects the outer class and runs
  **`Tests run: 0`**, exiting successfully. A class whose cases all live in `@Nested` blocks then
  measures as uncovered. Verified against Surefire 3.5.4; no pattern form works, so measure with an
  unfiltered `mvn test`.
- **JaCoCo's `jacoco.exec` appends by default.** A filtered or partial run leaves the previous run's
  data in place, so the CSV reports coverage that the tests you just ran did not produce. Use
  `mvn clean test` when the number is going into a report.

- **A coverage gate may already be bound to `test`.** If the `pom.xml` has a `jacoco:check`
  execution (this repo's `server-java/` does: `check-unit-tested-classes`, 90% branch on a class
  list — a **regression gate over the whole suite**: it counts the branches the integration tests
  take as well, so it does not certify the unit tests' quality), a *filtered* run is judged on whatever `jacoco.exec` happens to hold — the classes your
  filter did not run keep the previous runs' data (append), or none at all after a `clean`. So the
  same command is red or falsely green depending on history, never because of your tests.
  Measured 2026-11-06 in `server-java/`: `mvn test -Dtest=ClientIpResolverTest
  -DfailIfNoSpecifiedTests=false` on a stale `jacoco.exec` → 17 tests green, then
  `BUILD FAILURE` on `Rule violated for class hu.webshop.order.OrderTransitions: branches covered
  ratio is 0.00` (the other nine listed classes passed on leftover data).

  **Iterate with `-Djacoco.skip=true`.** Measured on the same command: exit 0, `Tests run: 17`,
  all three JaCoCo executions print `Skipping JaCoCo execution because property jacoco.skip is
  set`, and `prepare-agent` logs `argLine set to empty` — so the surefire `@{argLine}` placeholder
  resolves to an empty string and the fork starts normally. (That is JaCoCo 0.8.14's
  `prepare-agent` behaviour under `skip`; a pom whose `argLine` uses `@{argLine}` *without* any
  `prepare-agent` execution would need an empty `<argLine></argLine>` property to stay runnable.)
  Skipped means *no* coverage data: state numbers only from an unfiltered `mvn clean test`.

Filtered runs are still fine for *iterating* on a flat (non-nested) test class. They are not fine for
producing the number you state in Phase 5.

## Optional: the unit-only figure

Use this only when someone asks how much of a class **the unit tests alone** cover (e.g. to tell a
class that is genuinely unit-tested from one the integration tests carry). It is an extra
measurement, reported *next to* the full-suite figure, never instead of it — and the build's gate
does **not** change: `check-unit-tested-classes` stays a full-suite regression gate.

The trick is to exclude the integration tests **without `-Dtest`**, so `@Nested` classes still run:
Surefire's `excludesFile` drops classes by pattern while leaving discovery otherwise untouched.

1. **Build the exclude list from the source, transitively.** In `server-java/` the integration tests
   extend `hu.webshop.support.IntegrationTest` either directly or through an abstract
   `*TestSupport` base (`CatalogTestSupport`, `OrderTestSupport`, `ReviewTestSupport`). Grep
   `src/test/java` for `extends IntegrationTest`, then repeat with every abstract base you found
   until the set stops growing — a direct-only grep misses 11 concrete classes here. Write one pattern per line
   (`**/AccountApiTest.java`; `#` lines are comments) into the project's gitignored `.scratch/` folder —
   `.scratch/unit-only/excludes.txt` at the project root, never a path outside the project (a
   guarded writer may not write there, and it is not where the next reader looks).
   Measured 2026-11-06: 30 lines — 27 concrete classes plus the 3 abstract bases.
2. **Run it clean, unfiltered otherwise** (from `server-java/`):
   `mvn clean test "-Dsurefire.excludesFile=<project root>/.scratch/unit-only/excludes.txt"` — the
   **absolute** path of that file (Surefire resolves a relative one against `server-java/`, not the
   project root); no `-Dtest`, no `-q`.
3. **Prove it measured what you think** — the build stays green either way:
   - `Tests run:` in the *Results* summary is > 0, and `target/surefire-reports/` holds only the
     unit classes (list the `TEST-*.xml` names; no excluded class may appear).
   - **The `@Nested` classes ran.** The outer class's `TEST-<Class>.xml` carries
     `<testsuite … tests="0">` — that attribute counts only the outer class's own methods — but
     inside it there are `<testcase classname="…<Class>$<Nested>">` elements. Count *those*; the
     `tests` attribute alone would make a correct run look empty.
   - **No database started**: the log has no Testcontainers/Postgres lines. (An integration test
     that slipped through would need Docker and fail or start a container — either is visible.)
4. Read the class rows from `jacoco.csv` as usual and label them **unit-only**.
5. **Run a plain `mvn clean test` afterwards**, so `target/` reflects the full suite again — a
   unit-only `jacoco.csv` left behind is exactly the plausible-but-wrong number this file warns about.

If `jacoco:check` goes red in this mode, that is a *finding*, not a build problem: the listed class
depends on integration tests for part of its coverage. Note which class, and rerun with
`-Djacoco.haltOnFailure=false` (JaCoCo's documented `check` switch; not exercised here, because the
measured run passed) to get the report.

**Measured 2026-11-06** (`server-java/`, Surefire 3.5.4, JaCoCo 0.8.14, Docker *not* running):
exit 0, 17 s, `Tests run: 5661, Failures: 0, Errors: 0` (5283 of them `CatalogWindowTest`'s
parameterised cases), 17 report files, all unit classes. The nine `@Nested`-structured classes
(`JsonInputTest`, `ProductFilterTest`, `ProductValidatorTest`, `UserValidatorTest`, and the five in
`security/`) reported `tests="0"` on the outer suite and 310 `$`-nested `<testcase>` elements between
them. Zero Testcontainers/Postgres/Docker lines in the log. `jacoco:check` printed
`All coverage checks have been met.` Unit-only BRANCH on the ten gated classes:

| class | unit-only branch | line |
| --- | --- | --- |
| `auth.ClientIpResolver` | 18/18 = 100% | 23/23 |
| `auth.UserValidator` | 38/38 = 100% | 39/39 |
| `catalog.ProductFilter` | 8/8 = 100% | 22/22 |
| `catalog.ProductValidator` | 34/34 = 100% | 45/45 |
| `common.JsonInput` | 42/42 = 100% | 23/23 |
| `order.OrderTransitions` | 4/4 = 100% | 9/9 |
| `security.AdminInterceptor` | 4/4 = 100% | 16/16 |
| `security.AuthInterceptor` | 6/6 = 100% | 16/16 |
| `security.CurrentUserArgumentResolver` | 6/6 = 100% | 7/7 |
| `security.SessionService` | 18/18 = 100% | 32/34 |

So today the gated classes are carried by their unit tests alone. The module as a whole is
246/653 = 37.7% branch unit-only, against 563/653 = 86.2% for the full suite (the clean full-suite
run quoted in the `pom.xml`, same day) — the gap is what the integration tests contribute elsewhere. That tells you nothing about tomorrow: the gate still
measures the full suite, so a unit test could lose a branch that an integration test happens to
take, and the gate would stay green. That is the case this recipe exists to catch, on demand.

## Reading the report cheaply

**Per-class numbers — read `jacoco.csv`.** One row per class, so it is a handful of lines:

```
GROUP,PACKAGE,CLASS,INSTRUCTION_MISSED,INSTRUCTION_COVERED,BRANCH_MISSED,BRANCH_COVERED,LINE_MISSED,LINE_COVERED,...
demo,com.example.order,OrderService,12,318,3,41,2,74,...
```

`branch % = BRANCH_COVERED / (BRANCH_MISSED + BRANCH_COVERED)`. In the row above:
`41 / 44 = 93.2%` → gate met. `BRANCH_MISSED + BRANCH_COVERED == 0` means the class has no branches at
all; then the line number is the only meaningful figure — say that explicitly.

**Which lines are missed — grep `jacoco.xml`, never read it whole.** The XML has one `<line>` element
per source line inside `<sourcefile name="OrderService.java">`:

```
<line nr="47" mi="0" ci="6" mb="1" cb="1"/>
```

- `mb` = missed branches, `cb` = covered branches → `mb="1"` means one branch on line 47 was never taken
- `mi` = missed instructions → `ci="0"` with `mi>0` means the line never executed at all

Grep for lines with a non-zero `mb` or `mi` scoped to the target sourcefile, then map each line number
back to the source to see *which* branch is missing.

## Turning a gap into a test

| symptom | what is missing |
| --- | --- |
| `mb="1" cb="1"` on an `if` | the other side of the condition — usually the `else` / fall-through |
| `mb="2" cb="0"` on an `if` | the whole statement was never reached — check the guard above it |
| `mb` > 2 on one line | a compound condition (`&&` / `||`); apply MC/DC-lite from `case-derivation.md` |
| `mi>0, ci=0` on a `catch` block | no test makes the collaborator throw → `thenThrow` |
| missed branch on a `switch` `default` | add the unhandled/unexpected enum or value case |
| missed branch on a ternary or `orElse` | the null/empty side of the `Optional` |
| missed branch on a `for`/`while` | the zero-iteration case (empty collection) |

Return to Phase 2 for **only** the methods that own those lines. Max 3 rounds.

## Legitimate reasons to stay under 90%

State these plainly instead of writing meaningless tests to inflate the number:

- generated `equals` / `hashCode` / `toString` (Lombok, records) — configure exclusions if the project
  already does, otherwise just report it
- private constructors of utility classes
- defensive branches that are unreachable given the type system (`default:` over an exhaustive enum
  `switch`, a null check after a `@NonNull` parameter)
- `synthetic` bridge methods and lambda plumbing counted against the class
- branches that require a seam the class does not have (static clock, `new` inside the method) — this
  is a testability finding for the report, not a test to force

## When coverage cannot be measured

If the build tool is not installed, the build fails for unrelated reasons, or the project cannot
compile: report that coverage is **unmeasured**, show the actual command output, and describe the
coverage argument from the branch checklist instead. Do not present a checklist-derived estimate as a
percentage.
