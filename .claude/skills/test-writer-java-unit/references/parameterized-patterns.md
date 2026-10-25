# Parameterized test patterns

Fewer lines is a goal, but **diagnosability wins**. A parameterized test that fails must name the case
that failed. If compressing costs you that, don't compress.

## Decision table — pick the first row that fits

| situation | use |
| --- | --- |
| one primitive/`String`/`Class` parameter, values are literals | `@ValueSource` |
| the interesting cases are `null` and/or empty | `@NullSource`, `@EmptySource`, `@NullAndEmptySource` (stack them with a `@ValueSource`) |
| the parameter is an enum | `@EnumSource` — exhaustive for free; filter with `names` + `mode = EXCLUDE/INCLUDE/MATCH` |
| 2–5 columns of primitives/`String`, expected value included | **`@CsvSource`** — this is the default |
| the table is long (>15 rows) or shared with another test file | `@CsvFileSource` |
| arguments are objects/DTOs, or the expected value must be computed | `@MethodSource` |
| the same argument list feeds several test methods in the same `@Nested` block | `@MethodSource` on a `static Stream<Arguments>` |
| a cross-product of two small dimensions is genuinely needed | `@CartesianTest` only if junit-pioneer is already present; otherwise write the product out in `@CsvSource` |

## Mandatory hygiene

**Name every case.** Without it a failure reads `[3]` and tells you nothing:

```java
@ParameterizedTest(name = "{index}: kedvezmény({0} Ft, {1}) = {2} Ft")
@CsvSource({
    "  999, BRONZE,   999",   // határ alatt: nincs kedvezmény
    " 1000, BRONZE,   950",   // pontosan a határon
    " 1001, GOLD,      851",  // határ felett, magasabb szint
})
void calculatesDiscount(int gross, Tier tier, int expected) { ... }
```

Rules:
- **max ~5 columns.** Beyond that, wrap the case in a record and stream it from `@MethodSource`:
  `record Case(Order order, Customer customer, int expectedTotal, String label) {}`
- `nullValues = "NULL"` on `@CsvSource` when a column needs a real `null` (an empty cell gives `""`
  for `String`, which is a different case).
- `useHeadersInDisplayName = true` when the table has a header row — cheap readability.
- Keep the expected value **in the table**, not computed inside the test body. A test body with an
  `if` in it is two tests.
- One assertion *concept* per parameterized method. If half the rows assert a return value and half
  assert a thrown exception, that is two methods.

## Exception paths stay separate

Never smuggle an "expectedException" column into a happy-path table — the assertion shape differs and
the body grows a branch:

```java
@ParameterizedTest(name = "érvénytelen összeg: {0}")
@ValueSource(ints = {-1, 0})
void rejectsInvalidAmount(int amount) {
    assertThrows(IllegalArgumentException.class, () -> service.pay(amount));
}
```

## `@MethodSource` — the sharing rule

This is the rule that keeps the suite maintainable, and it is stricter than "reuse where possible".

**Share an argument stream across methods only when the input domain AND the meaning of every
parameter are identical.** Otherwise share the *builder* (the data construction), not the stream.

Why: an argument stream carries an implicit contract — column order, column semantics, and usually an
expected-value column. Two methods that merely *accept the same types* do not share that contract.
When method A gains a case, B's tests break for reasons that have nothing to do with B, and the shared
source drifts into a lowest-common-denominator blob that covers neither method's branches properly.

**Good — same domain, same meaning** (validity of a `Customer`, reused by two checks that both ask
"is this customer acceptable?"):

```java
static Stream<Arguments> validAndInvalidCustomers() {
    return Stream.of(
        arguments(customer().build(),                      true,  "teljes vevő"),
        arguments(customer().email(null).build(),          false, "nincs email"),
        arguments(customer().email("nem-email").build(),   false, "hibás email formátum"),
        arguments(customer().name("").build(),             false, "üres név")
    );
}
```

**Bad — same types, different meaning.** `applyDiscount(int, Tier)` and `applyTax(int, Tier)` both take
`(int, Tier)`, but the expected column means something different in each, and the relevant boundaries
differ (discount thresholds vs tax brackets). Do **not** merge these. Share the `Tier` fixtures and the
amount constants instead.

**Placement:**
- a stream used by one `@Nested` block → `static` method inside that block (needs JUnit 5.11+ for
  non-static inner classes; otherwise put it in the outer class and reference it by FQ name:
  `@MethodSource("com.example.OrderServiceTest#validAndInvalidCustomers")`)
- a stream used by two blocks in the same file → `static` method at the bottom of the outer class
- a stream needed by a third test class → **stop.** Promote the *builder* to the shared fixtures class;
  re-derive the small stream locally in each test class. Streams travel badly; builders travel well.

## Compactness that does not cost coverage

Do these:
- `@EnumSource` instead of hand-listing enum constants (stays correct when a constant is added)
- `@NullAndEmptySource` + `@ValueSource(strings = {" ", "\t"})` stacked on one method for the whole
  blank-string family
- one `@CsvSource` row per branch instead of one `@Test` per branch
- a builder with defaults so each row overrides only the field under test

Do **not** do these:
- loop inside a test body over a case array (no per-case reporting, first failure hides the rest)
- `assertAll` used to merge unrelated cases into one test method
- one giant table per class instead of per method (the `@Nested`-per-method structure is what keeps
  the coverage story traceable)
- reducing rows by dropping boundary values — that is exactly the coverage you were asked for
