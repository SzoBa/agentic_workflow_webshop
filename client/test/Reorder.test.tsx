// @vitest-environment jsdom
// Az újrarendelés (client/src/Reorder.tsx) tesztjei.
//
// A tervező (planReorder) tiszta függvény: kosár és router nélkül mérhető.
// A gombot közvetlenül rendereljük, nem a Rendeléseim oldalon keresztül — így
// a teszt nem a lista betöltésétől függ, és a navigációt valódi routingon
// (MemoryRouter + próba-útvonal) figyeljük, nem useNavigate-mockkal.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "./dom-setup";
import type { CustomerProduct, Order } from "../src/api";

const addToCart = vi.fn();
vi.mock("../src/cart", () => ({ useCart: () => ({ add: addToCart }) }));

const { ReorderButton, planReorder } = await import("../src/Reorder");

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
    status: "expired",
    ...over,
  };
}

function catalog(items: CustomerProduct[]) {
  return new Map(items.map((p) => [p.id, p]));
}

const onNote = vi.fn();

function renderButton(o: Order, products: Map<string, CustomerProduct>) {
  return render(
    <MemoryRouter initialEntries={["/orders"]}>
      <ReorderButton order={o} products={products} onNote={onNote} />
      <Routes>
        <Route path="/orders" element={<p>Rendeléseim</p>} />
        <Route path="/cart" element={<p>Kosár</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  addToCart.mockReset();
  onNote.mockReset();
});

describe("planReorder", () => {
  it("a MAI terméket adja vissza, a rendelésen szereplő darabszámmal", () => {
    const mai = product({ price: 7990 });
    const plan = planReorder(order(), catalog([mai]));
    expect(plan.addable).toEqual([{ product: mai, quantity: 2 }]);
    expect(plan.missing).toEqual([]);
  });

  it("az elfogyott tételt a kimaradtak közé teszi", () => {
    const plan = planReorder(order(), catalog([product({ available: 0 })]));
    expect(plan.addable).toEqual([]);
    expect(plan.missing).toEqual(["Pamut póló"]);
  });

  it("a katalógusból eltűnt tételt is kihagyja", () => {
    const plan = planReorder(order(), catalog([]));
    expect(plan.addable).toEqual([]);
    expect(plan.missing).toEqual(["Pamut póló"]);
  });

  it("a kimaradt tétel nevét a snapshotból veszi, majd az élő termékből", () => {
    const nevtelen = order({
      items: [
        { productId: "p1", quantity: 1 },
        { productId: "p9", quantity: 1 },
      ],
    });
    const plan = planReorder(
      nevtelen,
      catalog([product({ id: "p1", name: "Élő név", available: 0 })]),
    );
    // p1: nincs snapshot-név → az élő termékből; p9: sehol → semleges szöveg.
    expect(plan.missing).toEqual(["Élő név", "Egy termék"]);
  });
});

describe("ReorderButton — megjelenés", () => {
  it.each([["pending"], ["delivered"]] as const)(
    "%s rendelésnél nem jelenik meg",
    (status) => {
      renderButton(order({ status }), catalog([product()]));
      expect(
        screen.queryByRole("button", { name: /Újrarendelés/ }),
      ).not.toBeInTheDocument();
    },
  );

  it("lejárt rendelésnél megjelenik", () => {
    renderButton(order(), catalog([product()]));
    expect(screen.getByRole("button", { name: /Újrarendelés/ })).toBeInTheDocument();
  });
});

describe("ReorderButton — kosárba tétel", () => {
  it("a MAI termékadatokkal tesz kosárba, nem a rendelés snapshotjával", async () => {
    // A snapshot a bizonylat hitelességét szolgálja, nem árajánlat: a régi
    // áron senki nem vásárolhat.
    const mai = product({ price: 7990 });
    renderButton(order(), catalog([mai]));

    await userEvent.click(screen.getByRole("button", { name: /Újrarendelés/ }));

    // A rendelés 2 darabra szólt, tehát kétszer kerül kosárba a MAI termék.
    expect(addToCart).toHaveBeenCalledTimes(2);
    expect(addToCart).toHaveBeenCalledWith(mai);
  });

  it("teljes sikernél a kosárba navigál", async () => {
    renderButton(order(), catalog([product()]));
    await userEvent.click(screen.getByRole("button", { name: /Újrarendelés/ }));
    expect(await screen.findByText("Kosár")).toBeInTheDocument();
    expect(onNote).not.toHaveBeenCalled();
  });

  it("ha egyetlen tétel sem elérhető, nem tesz kosárba és megmondja", async () => {
    renderButton(order(), catalog([product({ available: 0 })]));
    await userEvent.click(screen.getByRole("button", { name: /Újrarendelés/ }));

    expect(addToCart).not.toHaveBeenCalled();
    expect(onNote).toHaveBeenCalledWith(
      "A rendelés egyetlen tétele sem elérhető jelenleg.",
    );
    // Navigáció sincs: a vevő ott marad, ahol a magyarázatot elolvassa.
    expect(screen.getByText("Rendeléseim")).toBeInTheDocument();
  });

  it("részleges elérhetőségnél a meglévőt kosárba teszi, a kimaradtat megnevezi", async () => {
    const reszleges = order({
      items: [
        { productId: "p1", quantity: 1, name: "Pamut póló" },
        { productId: "p2", quantity: 1, name: "Kulacs" },
      ],
    });
    renderButton(
      reszleges,
      catalog([product({ id: "p1" }), product({ id: "p2", name: "Kulacs", available: 0 })]),
    );

    await userEvent.click(screen.getByRole("button", { name: /Újrarendelés/ }));

    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(onNote).toHaveBeenCalledWith(
      "A kosárba került, ami elérhető. Kimaradt: Kulacs.",
    );
    expect(screen.getByText("Rendeléseim")).toBeInTheDocument();
  });
});
