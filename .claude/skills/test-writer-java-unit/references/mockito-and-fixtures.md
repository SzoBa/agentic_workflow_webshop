# Mockito rules and fixture extraction

## Test class skeleton

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock  private OrderRepository repository;
    @Mock  private PriceCalculator calculator;
    @InjectMocks private OrderService service;   // konstruktor-injektálás

    @Nested
    class PlaceOrder { ... }

    @Nested
    class CancelOrder { ... }
}
```

`MockitoExtension` defaults to **strict stubs**: an unused `when(...)` fails the test. Keep it. It is
the mechanism that stops stub drift as the production code changes. If a stub is genuinely only needed
by some rows of a parameterized test, use `lenient()` on **that stub alone** — never
`@MockitoSettings(strictness = LENIENT)` on the class.

Prefer constructor injection via `@InjectMocks`. If the class only has field/setter injection or a
no-arg constructor plus static lookups, note it as a testability problem in the report — do not
"fix" the production class.

## What not to mock

- **Value objects, DTOs, records, entities** — construct the real thing. A mocked DTO tests your
  stubbing, not the code.
- **`String`, collections, `Optional`, `LocalDate` and friends** — use real instances. For time, note
  whether the class takes a `Clock`; if it calls `LocalDate.now()` directly, that is a testability
  finding (and `mockStatic` is a last resort that needs mockito-inline and a scoped try-with-resources).
- **Types you don't own** (a third-party client) — mock the thin interface you wrap it in; if there
  isn't one, say so rather than mocking a fluent SDK builder chain.
- **The class under test.** No `spy(service)`. A partial mock of the subject means the test verifies a
  fiction. If a method calls another public method of the same class and you need to isolate it, test
  through the real path instead.

## Stubbing and verifying

- Stub only what the path under test actually reads. Strict stubs will tell you when you overshoot.
- Argument matchers: prefer concrete values; use `any()` only when the value is irrelevant to the
  assertion. Mixing raw values and matchers in one call is a compile-time-legal runtime error — if one
  argument uses a matcher, all must (`eq(...)` for the rest).
- **`verify` for outgoing interactions** (something was saved, published, emailed) — that is the
  method's observable effect. **`assert` for state and return values.** Do not `verify` a getter you
  already assert on; that is testing the mock.
- `verify(repo, never()).save(any())` is a real assertion on error paths — cheap and often the only
  observable difference.
- `ArgumentCaptor` when you need to inspect a constructed argument's fields:

```java
ArgumentCaptor<Order> captor = ArgumentCaptor.forClass(Order.class);
verify(repository).save(captor.capture());
assertEquals(2500, captor.getValue().total());
```

  For a single simple argument, `verify(repository).save(expectedOrder)` with a real `equals` is
  shorter — prefer it when the type has value equality.
- `verifyNoMoreInteractions` only where "nothing else happened" is part of the contract; otherwise it
  turns every future refactor into a test failure.
- `when(...).thenReturn(a, b)` for consecutive calls; `thenAnswer` only when the return genuinely
  depends on the argument.

## Fixture extraction thresholds

Apply during Phase 3, after all methods are written — the counts are only knowable then.

| condition | action |
| --- | --- |
| an object construction appears **> 2 times** in one test class | extract a `private static` helper or builder at the bottom of that class |
| the same helper is needed by **> 2 test classes** | promote to a shared fixtures class |
| ≤ 2 occurrences, or ≤ 2 classes | leave it inline — premature extraction hides the data from the test |

**Helper shape.** A builder with sensible defaults, so each call site overrides only what it is
testing. This is what makes the parameterized rows short:

```java
private static Order.Builder order() {             // minden mező érvényes default
    return Order.builder()
        .id("ORD-1")
        .customer(customer().build())
        .items(List.of(item(1000, 2)))
        .status(Status.NEW);
}
```

Not a `createOrder(String, Customer, List<Item>, Status, int, boolean)` — a 6-argument factory is as
opaque as the constructor it replaces.

**Shared class placement:**
- Maven / Gradle single module: `src/test/java/<same package>/support/<Domain>TestData.java`
- Gradle multi-module, needed across modules: `java-test-fixtures` plugin +
  `src/testFixtures/java/...`, consumers add `testImplementation(testFixtures(project(":core")))`
- an existing `support` / `fixtures` / `testdata` package in the project wins over all of the above

**Shared class rules:**
- one class per domain concept (`OrderTestData`, `CustomerTestData`) — not one `TestData` god-object
- `final` class, private constructor, `static` methods only
- returns builders, not finished immutable objects, so callers can vary a field
- no assertions and no Mockito inside a fixtures class; data construction only
- do not move *argument streams* here (see the sharing rule in `parameterized-patterns.md`) — only
  data builders and constants

## Assertions

Plain JUnit (`assertEquals`, `assertThrows`, `assertTrue`) is the baseline. If AssertJ is already a
dependency, use it — `assertThat(x).isEqualTo(y)`, and especially the collection assertions
(`containsExactly`, `extracting`) which are dramatically shorter than the JUnit equivalents. Do not
add AssertJ without asking.

For doubles: `assertEquals(expected, actual, 1e-9)` / `isCloseTo(expected, within(1e-9))`. Never bare
equality.
