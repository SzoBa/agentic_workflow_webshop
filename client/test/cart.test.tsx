// @vitest-environment jsdom
// A CartProvider (client/src/cart.tsx) komponenstesztjei.
//
// Miért épp ez kapja a legrészletesebb lefedettséget a kliensen: a kosár
// TISZTÁN kliensoldali állapot (nincs szerver-session), a localStorage a
// egyetlen tárolója, és a felhasználónkénti kulcs elhibázása kereszt-
// felhasználós adatszivárgás lenne egy közös böngészőben.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "./dom-setup";
import { AuthProvider } from "../src/auth";
import { CartProvider, useCart } from "../src/cart";
import type { Product } from "../src/api";

// Csak a hálózatot hívó me()-t némítjuk; minden más az igazi implementáció.
vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return { ...actual, me: vi.fn() };
});
const api = await import("../src/api");

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Pamut póló",
    description: "Leírás",
    price: 4990,
    imageUrl: "https://example.com/a.png",
    stock: 10,
    category: "Ruházat",
    active: true,
    ...over,
  };
}

const P1 = product();
const P2 = product({ id: "p2", name: "Kulacs", price: 6490 });

/** Minimál felület a context összes műveletéhez. */
function CartHarness() {
  const { items, count, total, add, setQuantity, remove, clear } = useCart();
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="total">{total}</span>
      <span data-testid="items">
        {items.map((i) => `${i.product.id}:${i.quantity}`).join(",")}
      </span>
      <button onClick={() => add(P1)}>add-p1</button>
      <button onClick={() => add(P2)}>add-p2</button>
      <button onClick={() => setQuantity("p1", 5)}>set-p1-5</button>
      <button onClick={() => setQuantity("p1", 0)}>set-p1-0</button>
      <button onClick={() => setQuantity("p1", -3)}>set-p1-negative</button>
      <button onClick={() => remove("p1")}>remove-p1</button>
      <button onClick={clear}>clear</button>
    </div>
  );
}

function renderCart() {
  return render(
    <AuthProvider>
      <CartProvider>
        <CartHarness />
      </CartProvider>
    </AuthProvider>,
  );
}

const click = (label: string) => fireEvent.click(screen.getByText(label));
const items = () => screen.getByTestId("items").textContent;
const count = () => screen.getByTestId("count").textContent;
const total = () => screen.getByTestId("total").textContent;

beforeEach(() => {
  vi.mocked(api.me).mockResolvedValue({
    id: "u1",
    username: "felhasznalo",
    email: "u@example.com",
    address: "Cím",
    role: "customer",
  });
});

describe("CartProvider - kosárműveletek", () => {
  it("üres kosárral indul", () => {
    renderCart();
    expect(items()).toBe("");
    expect(count()).toBe("0");
    expect(total()).toBe("0");
  });

  it("hozzáadáskor felveszi a terméket 1 darabbal", () => {
    renderCart();
    click("add-p1");
    expect(items()).toBe("p1:1");
    expect(count()).toBe("1");
    expect(total()).toBe("4990");
  });

  it("ugyanazt a terméket újra hozzáadva a mennyiséget növeli, nem duplikál", () => {
    renderCart();
    click("add-p1");
    click("add-p1");
    expect(items()).toBe("p1:2");
    expect(count()).toBe("2");
    expect(total()).toBe("9980");
  });

  it("több különböző terméknél a darabszámot és az értéket is összegzi", () => {
    renderCart();
    click("add-p1");
    click("add-p2");
    click("add-p2");
    expect(items()).toBe("p1:1,p2:2");
    expect(count()).toBe("3");
    expect(total()).toBe(String(4990 + 2 * 6490));
  });

  it("a setQuantity felülírja a mennyiséget", () => {
    renderCart();
    click("add-p1");
    click("set-p1-5");
    expect(items()).toBe("p1:5");
    expect(total()).toBe(String(5 * 4990));
  });

  it("a 0 mennyiség eltávolítja a tételt (nem 0 darabos sort hagy)", () => {
    renderCart();
    click("add-p1");
    click("add-p2");
    click("set-p1-0");
    expect(items()).toBe("p2:1");
  });

  it("a negatív mennyiség is eltávolítja a tételt", () => {
    renderCart();
    click("add-p1");
    click("set-p1-negative");
    expect(items()).toBe("");
    expect(total()).toBe("0");
  });

  it("a remove csak a megadott terméket törli", () => {
    renderCart();
    click("add-p1");
    click("add-p2");
    click("remove-p1");
    expect(items()).toBe("p2:1");
  });

  it("a clear kiüríti a kosarat", () => {
    renderCart();
    click("add-p1");
    click("add-p2");
    click("clear");
    expect(items()).toBe("");
    expect(count()).toBe("0");
  });

  it("a nem létező termék mennyiségének állítása nem változtat semmit", () => {
    renderCart();
    click("add-p2");
    click("set-p1-5");
    expect(items()).toBe("p2:1");
  });
});

describe("CartProvider - localStorage tárolás", () => {
  it("minden változást azonnal kiír a localStorage-be", () => {
    renderCart();
    click("add-p1");

    const raw = localStorage.getItem("webshop-cart:anon");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual([{ product: P1, quantity: 1 }]);
  });

  it("induláskor visszatölti a korábban mentett kosarat", () => {
    localStorage.setItem(
      "webshop-cart:anon",
      JSON.stringify([{ product: P2, quantity: 3 }]),
    );
    renderCart();
    expect(items()).toBe("p2:3");
    expect(total()).toBe(String(3 * 6490));
  });

  it("sérült localStorage tartalomnál üres kosárral indul, nem dob hibát", () => {
    // Enélkül egy elrontott bejegyzés a teljes alkalmazást megbuktatná
    // induláskor, és a felhasználó nem tudná magától helyrehozni.
    localStorage.setItem("webshop-cart:anon", "{ez nem json");
    expect(() => renderCart()).not.toThrow();
    expect(items()).toBe("");
  });

  it("a teljes Product-pillanatképet tárolja (ár is), nem csak az azonosítót", () => {
    // Dokumentált csapda (CLAUDE.md): a mentett ár elavulhat a szerverhez
    // képest. A szerver ezért SOHA nem fogadja el a kliens árát — a rendelés
    // végösszegét mindig a DB-ből számolja. Ez a teszt rögzíti a tárolási
    // formát, hogy a csapda látható és szándékos maradjon.
    renderCart();
    click("add-p1");
    const stored = JSON.parse(localStorage.getItem("webshop-cart:anon")!);
    expect(stored[0].product).toMatchObject({ id: "p1", price: 4990, stock: 10 });
  });
});

describe("CartProvider - felhasználónkénti elkülönítés", () => {
  it("kijelentkezve az 'anon' kulcsot használja", () => {
    renderCart();
    click("add-p1");
    expect(localStorage.getItem("webshop-cart:anon")).not.toBeNull();
  });

  it("bejelentkezve a felhasználó azonosítójával kulcsol", () => {
    localStorage.setItem(
      "webshop-auth",
      JSON.stringify({
        user: {
          id: "u1",
          username: "felhasznalo",
          email: "u@example.com",
          address: "Cím",
          role: "customer",
        },
        token: "token-1",
      }),
    );
    renderCart();
    click("add-p1");

    expect(localStorage.getItem("webshop-cart:u1")).not.toBeNull();
    // A másik felhasználó kosarába NEM ír bele.
    expect(localStorage.getItem("webshop-cart:anon")).toBeNull();
  });

  it("egy másik felhasználó kosarát nem tölti be", () => {
    // Kereszt-felhasználós szivárgás elleni védelem: u2 kosara u1-nél nem jelenhet meg.
    localStorage.setItem(
      "webshop-cart:u2",
      JSON.stringify([{ product: P2, quantity: 9 }]),
    );
    localStorage.setItem(
      "webshop-auth",
      JSON.stringify({
        user: {
          id: "u1",
          username: "felhasznalo",
          email: "u@example.com",
          address: "Cím",
          role: "customer",
        },
        token: "token-1",
      }),
    );
    renderCart();
    expect(items()).toBe("");
  });
});

describe("useCart", () => {
  it("érthető hibát dob, ha CartProvider-en kívül használják", () => {
    // A React a hibát a konzolra is kiírja; itt elnyomjuk a teszt-zaj miatt.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // A React 18 fejlesztői buildje a render-hibát egy szintetikus DOM-eseményen
    // keresztül dobja tovább, és a jsdom a le nem kezelt `error` eseményt a saját
    // virtuális konzolján át, a `console`-t megkerülve írja a stderr-re (a kémkedés
    // ezt nem fogja meg). A `preventDefault` kezeltnek jelöli: a hiba ugyanúgy
    // kidobódik és a `toThrow` ugyanazt méri, csak a veremkiírás marad el.
    const elnyel = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", elnyel);
    expect(() => render(<CartHarness />)).toThrow(
      "useCart csak CartProvider-en belül használható.",
    );
    window.removeEventListener("error", elnyel);
    spy.mockRestore();
  });
});
