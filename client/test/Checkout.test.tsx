// @vitest-environment jsdom
// A Checkout oldal (client/src/pages/Checkout.tsx) tesztjei.
//
// A legfontosabb itt ellenőrzött szerződés az `expectedTotal`: a képernyőn
// megjelenő "Fizetendő" összeget küldjük el a szervernek, ami a saját,
// DB-árakból számolt összegéhez méri. Ha ez a bekötés elromlik, a védelem
// némán kikapcsol — a hívás továbbra is sikeres lesz, csak épp ellenőrzés
// nélkül. Ezért kap explicit tesztet.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "./dom-setup";
import type { CartItem } from "../src/cart";
import type { Product, User } from "../src/api";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return { ...actual, createOrder: vi.fn() };
});

// A kosár és az auth állapotát közvetlenül állítjuk be: itt a Checkout SAJÁT
// logikája a tárgy (őrök, űrlap, expectedTotal), nem a contextek működése —
// azokat a cart.test.tsx és az auth.test.tsx fedi.
let cartItems: CartItem[] = [];
let currentUser: User | null = null;
const clearCart = vi.fn();

vi.mock("../src/cart", () => ({
  useCart: () => ({
    items: cartItems,
    total: cartItems.reduce((s, i) => s + i.product.price * i.quantity, 0),
    clear: clearCart,
  }),
}));
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: currentUser }) }));

const api = await import("../src/api");
const { Checkout } = await import("../src/pages/Checkout");

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

const USER: User = {
  id: "u1",
  username: "felhasznalo",
  email: "u@example.com",
  address: "Teszt utca 1",
  role: "customer",
};

const renderCheckout = () =>
  render(
    <MemoryRouter>
      <Checkout />
    </MemoryRouter>,
  );

const submit = () => fireEvent.click(screen.getByRole("button", { name: /Rendelés leadása/ }));

beforeEach(() => {
  cartItems = [];
  currentUser = null;
  clearCart.mockClear();
  vi.mocked(api.createOrder).mockReset();
});

describe("Checkout - őrök", () => {
  it("be nem jelentkezett felhasználót bejelentkezésre kér", () => {
    cartItems = [{ product: product(), quantity: 1 }];
    renderCheckout();
    expect(screen.getByText("Bejelentkezés szükséges")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rendelés leadása/ })).not.toBeInTheDocument();
  });

  it("üres kosárnál nem enged rendelni", () => {
    currentUser = USER;
    renderCheckout();
    expect(screen.getByText("A kosarad üres")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rendelés leadása/ })).not.toBeInTheDocument();
  });

  it("a bejelentkezési őr előbbre való, mint az üres kosár őre", () => {
    // Üres kosár + kijelentkezve: a bejelentkezés a következő értelmes lépés.
    currentUser = null;
    cartItems = [];
    renderCheckout();
    expect(screen.getByText("Bejelentkezés szükséges")).toBeInTheDocument();
  });
});

describe("Checkout - űrlap", () => {
  beforeEach(() => {
    currentUser = USER;
    cartItems = [{ product: product(), quantity: 2 }];
  });

  it("a belépett felhasználó adataival tölti elő az űrlapot", () => {
    renderCheckout();
    expect(screen.getByLabelText(/Név/)).toHaveValue("felhasznalo");
    expect(screen.getByLabelText(/Email/)).toHaveValue("u@example.com");
    expect(screen.getByLabelText(/Szállítási cím/)).toHaveValue("Teszt utca 1");
  });

  it("az előtöltött adatok szerkeszthetők maradnak", () => {
    renderCheckout();
    const address = screen.getByLabelText(/Szállítási cím/);
    fireEvent.change(address, { target: { value: "Másik utca 5" } });
    expect(address).toHaveValue("Másik utca 5");
  });

  it("megjeleníti a fizetendő összeget", () => {
    renderCheckout();
    expect(screen.getByText(/Fizetendő:/)).toHaveTextContent("9");
    expect(screen.getByText(/Fizetendő:/)).toHaveTextContent("980");
  });
});

describe("Checkout - rendelés leadása", () => {
  beforeEach(() => {
    currentUser = USER;
    cartItems = [
      { product: product(), quantity: 2 },
      { product: product({ id: "p2", name: "Kulacs", price: 6490 }), quantity: 1 },
    ];
  });

  it("elküldi az expectedTotal-t a képernyőn látott összeggel", async () => {
    vi.mocked(api.createOrder).mockResolvedValue({
      id: "o1",
      items: [],
      customer: { name: "a", email: "b", address: "c" },
      total: 16460,
      createdAt: new Date().toISOString(),
      status: "pending",
    });
    renderCheckout();
    submit();

    await waitFor(() => expect(api.createOrder).toHaveBeenCalled());
    const [, , expectedTotal] = vi.mocked(api.createOrder).mock.calls[0];
    expect(expectedTotal).toBe(2 * 4990 + 6490);
  });

  it("elküldi a terméknevet, de az ÁRAT nem (azt a szerver számolja)", async () => {
    vi.mocked(api.createOrder).mockResolvedValue({
      id: "o1",
      items: [],
      customer: { name: "a", email: "b", address: "c" },
      total: 16460,
      createdAt: new Date().toISOString(),
      status: "pending",
    });
    renderCheckout();
    submit();

    await waitFor(() => expect(api.createOrder).toHaveBeenCalled());
    const [items] = vi.mocked(api.createOrder).mock.calls[0];
    expect(items).toEqual([
      { productId: "p1", quantity: 2, name: "Pamut póló" },
      { productId: "p2", quantity: 1, name: "Kulacs" },
    ]);
    // Az ár szándékosan hiányzik: a szerver soha nem bízik a kliens árában.
    expect(items[0]).not.toHaveProperty("unitPrice");
  });

  it("siker után visszaigazolást mutat és üríti a kosarat", async () => {
    vi.mocked(api.createOrder).mockResolvedValue({
      id: "rendeles-123",
      items: [],
      customer: { name: "a", email: "b", address: "c" },
      total: 16460,
      createdAt: new Date().toISOString(),
      status: "pending",
    });
    renderCheckout();
    submit();

    await waitFor(() => expect(screen.getByText(/Köszönjük a rendelést/)).toBeInTheDocument());
    expect(screen.getByText("rendeles-123")).toBeInTheDocument();
    expect(clearCart).toHaveBeenCalledTimes(1);
  });

  it("az ÁRVÁLTOZÁS miatti szerverhibát megjeleníti, és NEM üríti a kosarat", async () => {
    // Ez az expectedTotal védelem felhasználói vége: a vevő értesül róla, és a
    // kosara megmarad, hogy újra tudja gondolni a vásárlást.
    vi.mocked(api.createOrder).mockRejectedValue(
      new Error("A kosárban lévő termékek ára időközben megváltozott."),
    );
    renderCheckout();
    submit();

    await waitFor(() =>
      expect(
        screen.getByText(/A kosárban lévő termékek ára időközben megváltozott/),
      ).toBeInTheDocument(),
    );
    expect(clearCart).not.toHaveBeenCalled();
    // Az űrlap továbbra is elérhető, hogy újra lehessen próbálni.
    expect(screen.getByRole("button", { name: /Rendelés leadása/ })).toBeEnabled();
  });

  it("a KÉSZLETHIÁNY miatti szerverhibát megjeleníti, és NEM üríti a kosarat", async () => {
    // A szerver 409-cel utasít el, és megnevezi a terméket meg az elérhető
    // darabszámot — a vevő ebből tudja, mit kell módosítania a kosarában.
    vi.mocked(api.createOrder).mockRejectedValue(
      new Error(
        "A(z) Rozsdamentes kulacs termékből jelenleg 2 db érhető el, " +
          "ezért a rendelés nem adható le.",
      ),
    );
    renderCheckout();
    submit();

    await waitFor(() =>
      expect(screen.getByText(/Rozsdamentes kulacs/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/2 db érhető el/)).toBeInTheDocument();
    expect(clearCart).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Rendelés leadása/ })).toBeEnabled();
  });

  it("az ELFOGYOTT termékről szóló hibát is megjeleníti", async () => {
    vi.mocked(api.createOrder).mockRejectedValue(
      new Error("A(z) Kerámia bögre termék elfogyott, ezért a rendelés nem adható le."),
    );
    renderCheckout();
    submit();

    await waitFor(() => expect(screen.getByText(/elfogyott/)).toBeInTheDocument());
    expect(clearCart).not.toHaveBeenCalled();
  });

  it("beküldés közben letiltja a gombot (dupla rendelés ellen)", async () => {
    let resolveOrder: (o: never) => void = () => {};
    vi.mocked(api.createOrder).mockReturnValue(
      new Promise((resolve) => {
        resolveOrder = resolve as (o: never) => void;
      }),
    );
    renderCheckout();
    submit();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Feldolgozás/ })).toBeDisabled(),
    );

    resolveOrder({
      id: "o1",
      items: [],
      customer: { name: "a", email: "b", address: "c" },
      total: 1,
      createdAt: new Date().toISOString(),
    } as never);
    await waitFor(() => expect(screen.getByText(/Köszönjük a rendelést/)).toBeInTheDocument());
  });
});
