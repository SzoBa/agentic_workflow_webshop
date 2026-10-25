# Measuring coverage with JaCoCo

The 90% target is only a number if a tool produced it. **If coverage was not measured, do not state a
percentage** — report that it is unmeasured and why.

The gate is **branch coverage** on the class under test. Line coverage is reported alongside but is not
the gate: a class can sit at 90% lines with half its branches untaken, which is exactly the gap this
skill exists to close.

## Detect the build

| file present | build tool | test command | report path |
| --- | --- | --- | --- |
| `pom.xml` | Maven | `mvn -q test jacoco:report` | `target/site/jacoco/jacoco.{csv,xml}` |
| `build.gradle` / `.kts` | Gradle | `./gradlew test jacocoTestReport` | `build/reports/jacoco/test/jacoco.{csv,xml}` |
| `pom.xml` + `mvnw` | Maven wrapper | `./mvnw -q test jacoco:report` | as Maven |

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

Filtered runs are still fine for *iterating* on a flat (non-nested) test class. They are not fine for
producing the number you state in Phase 5.

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
