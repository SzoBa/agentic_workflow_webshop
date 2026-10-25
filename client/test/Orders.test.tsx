// @vitest-environment jsdom
// A Rendeléseim oldal tesztjei: a rendeléslista betöltése és megjelenítése.
//
// A foglalási visszaszámláló és az újrarendelés saját moduljába költözött, és
// ott is van tesztelve (ReservationStatus.test.tsx, Reorder.test.tsx). Itt már
// csak az marad, hogy az oldal be is KÖTI őket — a részletes viselkedésüket
// nem ismételjük meg.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "./dom-setup";
import type { Order, CustomerProduct } from "../src/api";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return { ...actual, getOrders: vi.fn(), getProducts: vi.fn() };
});

const addToCart = vi.fn();
vi.mock("../src/cart", () => ({ useCart: () => ({ add: addToCart }) }));

// A felhasználó objektum azonosságának STABILNAK kell lennie: az oldal betöltő
// effektje a `user`-re van kötve, és egy híváson­ként új objektum végtelen
// újratöltési körbe vinné a komponenst.
const TEST_USER = { id: "u1", username: "vevo" };
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: TEST_USER }) }));

const api = await import("../src/api");
const { Orders } = await import("../src/pages/Orders");

function product(over: Partial<CustomerProduct> = {}): CustomerProduct {
  return {
    id: "p1",
    name: "Pamut póló",
    description: "Leírás",
    price: 4990,
    imageUrl: "https://example.com/a.png",
    stock: 10,
    category: "Ruházat",
    active: true,
    ratingAvg: 0,
    ratingCount: 0,
    available: 10,
    ...over,
  };
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    items: [{ productId: "p1", quantity: 2, name: "Pamut póló", unitPrice: 4990 }],
    customer: { name: "V", email: "v@example.com", address: "C" },
    total: 9980,
    createdAt: new Date().toISOString(),
    status: "pending",
    ...over,
  };
}

function page(items: CustomerProduct[]) {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 100,
    totalPages: 1,
    categories: ["Ruházat"],
  };
}

beforeEach(() => {
  addToCart.mockReset();
  vi.mocked(api.getProducts).mockReset().mockResolvedValue(page([product()]));
  vi.mocked(api.getOrders).mockReset().mockResolvedValue([order()]);
});

const renderOrders = () =>
  render(
    <MemoryRouter>
      <Orders />
    </MemoryRouter>,
  );

describe("Orders — státusz és a beépülő komponensek", () => {
  it("kiírja a teljesítési státuszt magyarul", async () => {
    vi.mocked(api.getOrders).mockResolvedValue([order({ status: "delivered" })]);
    renderOrders();
    expect(await screen.findByText("Kiszállítva")).toBeInTheDocument();
  });

  it("bekötve rendereli a foglalási állapotot", async () => {
    // Nem a visszaszámláló formátumát méri (az a ReservationStatus dolga),
    // hanem hogy az oldal egyáltalán megjeleníti.
    const reservedUntil = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    vi.mocked(api.getOrders).mockResolvedValue([order({ reservedUntil })]);
    renderOrders();
    expect(await screen.findByText(/A foglalás még .* érvényes/)).toBeInTheDocument();
  });

  it("az újrarendelés gombot csak lejárt rendelésnél rendereli", async () => {
    renderOrders();
    await screen.findByText("Feldolgozás alatt");
    expect(screen.queryByRole("button", { name: /Újrarendelés/ })).not.toBeInTheDocument();

    vi.mocked(api.getOrders).mockResolvedValue([order({ status: "expired" })]);
    renderOrders();
    expect(
      await screen.findByRole("button", { name: /Újrarendelés/ }),
    ).toBeInTheDocument();
  });
});

describe("Orders — a rendelés tartalma", () => {
  it("a tárolt végösszeget mutatja, nem számol újra a tételekből", async () => {
    // Két különböző szám ugyanazon az oldalon a legrosszabb kimenet.
    vi.mocked(api.getOrders).mockResolvedValue([order({ total: 12345 })]);
    renderOrders();
    expect(await screen.findByText(/12 345/)).toBeInTheDocument();
  });

  it("a leadáskori terméknevet mutatja, nem a jelenlegit", async () => {
    vi.mocked(api.getProducts).mockResolvedValue(
      page([product({ name: "Átnevezett termék" })]),
    );
    renderOrders();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Pamut póló")).toBeInTheDocument();
  });

  it("hiba esetén a szerver üzenetét mutatja", async () => {
    vi.mocked(api.getOrders).mockRejectedValue(new Error("Bejelentkezés szükséges."));
    renderOrders();
    await waitFor(() =>
      expect(screen.getByText(/Bejelentkezés szükséges./)).toBeInTheDocument(),
    );
  });
});
