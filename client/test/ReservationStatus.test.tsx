// @vitest-environment jsdom
// A foglalási állapot (client/src/ReservationStatus.tsx) tesztjei.
//
// A visszaszámláló tiszta függvény, injektálható órával — a komponens pedig
// azt dönti el, mikor melyik arcát mutatja a foglalásnak.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "./dom-setup";
import type { Order } from "../src/api";
import { ReservationStatus, remainingReservation } from "../src/ReservationStatus";

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

describe("remainingReservation", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("napokban számol, ha több mint egy nap van hátra", () => {
    expect(remainingReservation("2026-01-03T06:00:00.000Z", now)).toBe("2 nap 6 óra");
  });

  it("órát és percet mutat egy napon belül", () => {
    expect(remainingReservation("2026-01-01T05:30:00.000Z", now)).toBe("5 óra 30 perc");
  });

  it("csak percet mutat egy órán belül", () => {
    expect(remainingReservation("2026-01-01T00:20:00.000Z", now)).toBe("20 perc");
  });

  it("null, ha a foglalás már lejárt", () => {
    expect(remainingReservation("2025-12-31T23:00:00.000Z", now)).toBeNull();
  });

  it("null, ha nincs foglalási lejárat (nem pending rendelés)", () => {
    expect(remainingReservation(undefined, now)).toBeNull();
  });
});

describe("ReservationStatus", () => {
  it("pending rendelésnél visszaszámlálót mutat", () => {
    const reservedUntil = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    render(<ReservationStatus order={order({ reservedUntil })} />);
    expect(screen.getByText(/A foglalás még .* érvényes/)).toBeInTheDocument();
  });

  it("lejárt rendelésnél magyarázatot ad, visszaszámláló helyett", () => {
    render(<ReservationStatus order={order({ status: "expired" })} />);
    expect(screen.getByText(/A foglalás lejárt/)).toBeInTheDocument();
    expect(screen.queryByText(/érvényes/)).not.toBeInTheDocument();
  });

  it("pending rendelésnél lejárat NÉLKÜL nem mutat semmit", () => {
    const { container } = render(<ReservationStatus order={order()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("kiszállított rendelésnél nincs mit visszaszámolni", () => {
    const { container } = render(
      <ReservationStatus order={order({ status: "delivered" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
