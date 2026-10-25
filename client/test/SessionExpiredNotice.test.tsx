// @vitest-environment jsdom
// A lejárt munkamenet sávjának és terelésének tesztjei.
//
// Az átirányítást VALÓDI routingon figyeljük (MemoryRouter + próba-útvonalak),
// nem useNavigate-mockkal: így a `state.from` visszaút-szerződés is mérhető,
// ami épp azért fontos, mert a Login.tsx-hez emiatt nem kell hozzányúlni.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "./dom-setup";

const dismissSessionExpired = vi.fn();
let sessionExpired = false;

vi.mock("../src/auth", () => ({
  useAuth: () => ({ sessionExpired, dismissSessionExpired }),
}));

const { SessionExpiredNotice } = await import("../src/SessionExpiredNotice");

/** A bejelentkező oldal helyett: kiírja, hova akarna visszatérni a felhasználó. */
function LoginProbe() {
  const { state } = useLocation() as { state: { from?: string } | null };
  return <p>Bejelentkezés · vissza: {state?.from ?? "nincs"}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionExpiredNotice />
      {/* Állandó navigáció (mint az App fejléce), hogy a terelés UTÁNI
          útvonalváltás is mérhető legyen. */}
      <Link to="/">Katalógushoz</Link>
      <Routes>
        <Route path="/" element={<p>Katalógus</p>} />
        <Route path="/orders" element={<p>Rendeléseim</p>} />
        <Route path="/register" element={<p>Regisztráció</p>} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionExpired = false;
  dismissSessionExpired.mockReset();
});

describe("SessionExpiredNotice — lejárat nélkül", () => {
  it("nem mutat semmit és nem terel", () => {
    renderAt("/orders");
    expect(screen.queryByText(/munkameneted lejárt/)).not.toBeInTheDocument();
    expect(screen.getByText("Rendeléseim")).toBeInTheDocument();
  });
});

describe("SessionExpiredNotice — lejáratkor", () => {
  it("megmagyarázza a kiléptetést ÉS a bejelentkezéshez terel", () => {
    sessionExpired = true;
    renderAt("/orders");

    expect(screen.getByText(/A munkameneted lejárt/)).toBeInTheDocument();
    expect(screen.getByText(/Bejelentkezés · vissza:/)).toBeInTheDocument();
  });

  it("átadja a visszautat, hogy a belépés után folytatni lehessen", () => {
    sessionExpired = true;
    renderAt("/orders");
    // Ez a szerződés a Login.tsx-szel (location.state.from → navigate(from)).
    expect(screen.getByText("Bejelentkezés · vissza: /orders")).toBeInTheDocument();
  });

  it("a /login-on nem terel újra (nincs hurok)", () => {
    sessionExpired = true;
    renderAt("/login");
    expect(screen.getByText(/A munkameneted lejárt/)).toBeInTheDocument();
    // A cél maga a /login: nem navigáltunk, tehát nincs `state.from`.
    expect(screen.getByText("Bejelentkezés · vissza: nincs")).toBeInTheDocument();
  });

  it("a /register-ről nem rángatja el a felhasználót", () => {
    sessionExpired = true;
    renderAt("/register");
    expect(screen.getByText(/A munkameneted lejárt/)).toBeInTheDocument();
    expect(screen.getByText("Regisztráció")).toBeInTheDocument();
  });

  it("a terelés EGYSZERI: utána a katalógus szabadon böngészhető", async () => {
    sessionExpired = true;
    renderAt("/orders");
    // Első kör: a terelés megtörtént.
    expect(screen.getByText(/Bejelentkezés · vissza:/)).toBeInTheDocument();

    // A felhasználó innen a nyilvános katalógusra megy — ami nem igényel
    // munkamenetet, tehát nem szabad visszarántani a bejelentkezéshez.
    await userEvent.click(screen.getByText("Katalógushoz"));

    expect(screen.getByText("Katalógus")).toBeInTheDocument();
    expect(screen.queryByText(/Bejelentkezés · vissza:/)).not.toBeInTheDocument();
    // A magyarázat viszont fent marad, amíg a felhasználó el nem tünteti.
    expect(screen.getByText(/A munkameneted lejárt/)).toBeInTheDocument();
  });

  it("a sáv elrejthető", async () => {
    sessionExpired = true;
    renderAt("/login");
    await userEvent.click(screen.getByRole("button", { name: "Rendben" }));
    expect(dismissSessionExpired).toHaveBeenCalledTimes(1);
  });
});
