// @vitest-environment jsdom
// Az AddToCart komponens (client/src/AddToCart.tsx) tesztjei.
//
// A készletüzenet és a gomb egy komponensben él, mert MINDIG egyezniük kell.
// Ezek a tesztek pont ezt az egyezést rögzítik — a terméklista és a részletes
// nézet korábban külön-külön másolta ugyanezt a markupot, és egyik oldal
// tesztje sem fogta volna meg a másik elcsúszását.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./dom-setup";
import type { CustomerProduct } from "../src/api";

const add = vi.fn();
vi.mock("../src/cart", () => ({ useCart: () => ({ add }) }));

const { AddToCart } = await import("../src/AddToCart");

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
    available: 3,
    ...over,
  };
}

beforeEach(() => {
  add.mockClear();
});

describe("AddToCart — elérhető termék", () => {
  it("showAvailable esetén kiírja a pontos darabszámot", () => {
    render(<AddToCart product={product()} showAvailable />);
    expect(screen.getByText("Elérhető: 3 db")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kosárba" })).toBeEnabled();
  });

  it("showAvailable nélkül NEM ír ki darabszámot (a listás nézet)", () => {
    render(<AddToCart product={product()} />);
    expect(screen.queryByText(/Elérhető/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kosárba" })).toBeEnabled();
  });

  it("kattintásra a TELJES terméket adja át a kosárnak", async () => {
    render(<AddToCart product={product()} />);
    await userEvent.click(screen.getByRole("button", { name: "Kosárba" }));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });
});

describe("AddToCart — elfogyott termék", () => {
  it.each([[true], [false]])(
    "letiltja a gombot és megmagyarázza (showAvailable: %s)",
    (showAvailable) => {
      render(<AddToCart product={product({ available: 0 })} showAvailable={showAvailable} />);
      expect(screen.getByText("Elfogyott")).toBeInTheDocument();
      // A darabszám elfogyott terméknél sosem jelenik meg, showAvailable ide/oda.
      expect(screen.queryByText(/Elérhető/)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Jelenleg nem rendelhető" }),
      ).toBeDisabled();
    },
  );
});

describe("AddToCart — űrlapbiztonság", () => {
  it("type=button, hogy egy jövőbeli űrlapban se küldjön be némán", () => {
    render(<AddToCart product={product()} />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
