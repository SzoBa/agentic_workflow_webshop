# Deriving the case list

The goal is a **finite, justified** set of cases — not "as many as possible". Work through the five
steps below for each method; each step produces rows that map 1:1 onto `@CsvSource` lines.

## Step 1 — Partition each parameter (equivalence partitioning)

For every parameter, split its domain into classes where the code is expected to behave identically.
One representative per class is enough; a second adds cost without coverage.

| parameter type | typical partitions |
| --- | --- |
| `int` / `long` | negative, zero, positive, and any domain-specific band (e.g. `< threshold`, `>= threshold`) |
| `double` / `float` | negative, `-0.0`, `0.0`, positive, `NaN`, `±Infinity` |
| `BigDecimal` | zero, positive, negative, differing `scale` (`1.0` vs `1.00`), very large |
| `String` | `null`, `""`, blank (`"   "`), valid, too long, wrong format, unicode/accented |
| `Collection` / `Map` | `null`, empty, single element, many, containing `null`, duplicates |
| array | `null`, length 0, length 1, many |
| `enum` | every constant (use `@EnumSource` — free exhaustiveness) |
| `Optional` | empty, present |
| `boolean` | both |
| object / DTO | fully populated, minimal valid, with a `null` field the code reads |

## Step 2 — Boundary values (BVA)

Wherever a comparison against a constant or another parameter exists, test **just below, at, and just
above** the boundary. For `if (age >= 18)` the rows are `17, 18, 19` — not `5, 18, 90`.

Also cover type boundaries when the code does arithmetic: `Integer.MIN_VALUE` / `MAX_VALUE`,
`Long.MAX_VALUE`, `0` as a divisor, empty-collection `size() - 1`.

## Step 3 — Enumerate branches and predicates

Read the body and list every decision point:

- `if` / `else if` / `else`, ternaries, `switch` (including `default`, even if unreachable)
- loops: zero iterations, exactly one, many, and early `break` / `continue` / `return`
- short-circuit operators: `&&` and `||` each create a branch **per operand** — JaCoCo counts them
- `Optional.orElse` / `orElseGet` / `orElseThrow`, `?:`, null-coalescing helpers
- implicit branches: unboxing a nullable `Integer`, `Objects.requireNonNull`, `assert`

**MC/DC-lite for compound conditions.** For `if (a && b)` do not settle for `(true,true)` and
`(false,false)` — that is 2 rows and leaves a bug in `b` invisible. Use one row per operand where
that operand alone flips the outcome:

```
a=true,  b=true   -> then    (both hold)
a=true,  b=false  -> else    (b decides)
a=false, b=true   -> else    (a decides, b not evaluated)
```

Same shape for `||`, inverted. For three or more operands, `n + 1` rows suffice — do not go to `2^n`.

## Step 4 — Exception matrix

One row per throw site, plus every checked exception in `throws`:

- explicit `throw new X(...)` — assert the **type and the message/field you actually care about**,
  via `assertThrows(X.class, ...)` and then a message assertion; not just the type when the message
  distinguishes cases
- exceptions from a mocked collaborator (`when(dep.f()).thenThrow(...)`) — is it propagated,
  wrapped, or swallowed?
- `NullPointerException` from an unguarded dereference — if the method has no null check, the test
  documents that fact (and it goes on the "suspicious" list)
- `finally` / try-with-resources cleanup: assert it happens on both the success and failure path

## Step 5 — Output analysis

For each case row, derive the expected value **from the specification of the operation**, not by
running the code and copying the result. Copying the output turns the test into a tautology.

Concretely:
- arithmetic: compute the expected value by hand and put the literal in the table; if the expected
  value needs a formula, put the formula in a `@MethodSource` and comment the derivation
- rounding: state the mode you expect (`HALF_UP` vs `HALF_EVEN` differ at `2.5`) and test both sides
  of a `.5`
- integer division and `%` with negative operands (`-7 / 2 == -3`, `-7 % 2 == -1`) — a classic
  off-by-one source
- `int` overflow: `Integer.MAX_VALUE + 1` wraps negative; if the code sums user input, that is a case
- floating point: never assert with `==`; use a delta / `isCloseTo`
- mutation vs return: if the method mutates an argument or field, assert the mutation, not just the
  return value
- void methods: the observable effect is a collaborator interaction or a state change — assert one of
  those, never just "it didn't throw"

## Pruning

After the five steps, drop rows that are provably redundant:

- two rows that exercise the identical branch set with the same expected-value derivation → keep one
- a partition the method never inspects (an unused parameter) → keep one row, note it as dead input
- combinatorial explosion: do **not** cross-product all partitions. Vary one dimension at a time
  against a fixed valid baseline, then add the specific combinations the branches actually require.

## Property-based candidates (jqwik, opt-in)

A method qualifies if it is pure, deterministic, and has an invariant that holds for *all* inputs:

| invariant | shape |
| --- | --- |
| round-trip | `decode(encode(x)) == x` |
| idempotence | `f(f(x)) == f(x)` |
| commutativity | `f(a,b) == f(b,a)` |
| bounds | `0 <= f(x) <= 100` for all `x` |
| ordering | output is sorted / input order irrelevant |
| oracle | `f(x)` agrees with a slower obviously-correct implementation |

A `@Property` **replaces** a pile of arbitrary example rows, but never replaces the boundary rows —
keep those as explicit examples so a failure names the boundary. jqwik needs a dependency: ask.
