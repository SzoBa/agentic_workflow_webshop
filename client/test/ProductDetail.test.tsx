// @vitest-environment jsdom
// A ProductDetail oldal (client/src/pages/ProductDetail.tsx) tesztjei.
//
// Az oldal maga vékony: a lényeg, hogy a szerver által számolt értékelési
// aggregátumokat kiírja, és a véleményszekciót a HELYES termékazonosítóval
// köti be — a véleménylista saját logikáját a ProductReviews.test.tsx fedi.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "./dom-setup";
import type { CustomerProduct } from "../src/api";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return { ...actual, getProduct: vi.fn(), getProductReviews: vi.fn() };
});

vi.mock("../src/cart", () => ({ useCart: () => ({ add: vi.fn() }) }));
vi.mock("../src/auth", () => ({ useAuth: () => ({ user: null }) }));

const api = await import("../src/api");
const { ProductDetail } = await import("../src/pages/ProductDetail");

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
    // Az elérhető mennyiség: a foglalásokkal csökkentett készlet.
    available: 10,
    ...over,
  };
}

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={["/products/p1"]}>
      <Routes>
        <Route path="/products/:id" element={<ProductDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(api.getProduct).mockReset();
  vi.mocked(api.getProduct).mockResolvedValue(product());
  vi.mocked(api.getProductReviews).mockReset();
  vi.mocked(api.getProductReviews).mockResolvedValue([]);
});

describe("ProductDetail - értékelés", () => {
  it("kiírja az értékelés átlagát és darabszámát", async () => {
    vi.mocked(api.getProduct).mockResolvedValue(
      product({ ratingAvg: 4.5, ratingCount: 8 }),
    );
    renderDetail();
    expect(await screen.findByText(/4,5 \(8 értékelés\)/)).toBeInTheDocument();
  });

  it("értékelés nélkül a 'Nincs értékelés' állapotot mutatja", async () => {
    renderDetail();
    expect(await screen.findByText("Nincs értékelés")).toBeInTheDocument();
  });

  it("a véleményszekciót a termék azonosítójával kéri le", async () => {
    renderDetail();
    await waitFor(() =>
      expect(api.getProductReviews).toHaveBeenCalledWith("p1"),
    );
    expect(screen.getByRole("heading", { name: "Vélemények" })).toBeInTheDocument();
  });

  it("hiba esetén a szerver üzenetét mutatja", async () => {
    vi.mocked(api.getProduct).mockRejectedValue(
      new Error("A termék nem található."),
    );
    renderDetail();
    expect(
      await screen.findByText(/A termék nem található./),
    ).toBeInTheDocument();
  });

  it("az ELÉRHETŐ mennyiséget mutatja, nem a raktárkészletet", async () => {
    // A kettő eltér, ha van élő foglalás. A vevőt a szabad darabszám érdekli.
    vi.mocked(api.getProduct).mockResolvedValue(product({ stock: 10, available: 3 }));
    renderDetail();
    expect(await screen.findByText("Elérhető: 3 db")).toBeInTheDocument();
    expect(screen.queryByText("Elérhető: 10 db")).not.toBeInTheDocument();
  });

  it("elfogyott terméknél letiltja a kosárgombot", async () => {
    vi.mocked(api.getProduct).mockResolvedValue(product({ stock: 5, available: 0 }));
    renderDetail();

    expect(await screen.findByText("Elfogyott")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Jelenleg nem rendelhető" }),
    ).toBeDisabled();
  });
});
