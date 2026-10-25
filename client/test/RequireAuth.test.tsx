// @vitest-environment jsdom
// A RequireAuth útvonal-őr (client/src/RequireAuth.tsx) tesztjei.
//
// FONTOS a teszt szándékának megértéséhez: ez az őr CSAK kényelmi funkció.
// Az érdemi védelem szerveroldali (az /api/auth névtér az AuthInterceptor
// mögött van). Ezek a tesztek tehát azt ellenőrzik, hogy a felület nem enged
// üres, használhatatlan képernyőre — NEM azt, hogy a védelem itt dől el.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "./dom-setup";
import type { User } from "../src/api";

// A guard saját logikáját izoláljuk: a useAuth-ot mockoljuk, hogy ne kelljen
// a teljes AuthProvider életciklusát (localStorage + me() validálás) felépíteni.
let currentUser: User | null = null;
vi.mock("../src/auth", () => ({
  useAuth: () => ({ user: currentUser, token: null }),
}));

const { RequireAuth } = await import("../src/RequireAuth");

function user(role: "admin" | "customer"): User {
  return {
    id: "u1",
    username: "felhasznalo",
    email: "u@example.com",
    address: "Cím",
    role,
  };
}

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/login" element={<p>Bejelentkezés</p>} />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <p>Adataim</p>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  it("belépett felhasználónak megjeleníti a védett tartalmat", () => {
    currentUser = user("customer");
    renderGuarded();
    expect(screen.getByText("Adataim")).toBeInTheDocument();
  });

  it("be nem jelentkezett látogatót a bejelentkezésre irányítja", () => {
    currentUser = null;
    renderGuarded();
    expect(screen.queryByText("Adataim")).not.toBeInTheDocument();
    expect(screen.getByText("Bejelentkezés")).toBeInTheDocument();
  });

  it("a szerepkört NEM nézi: az admin is beléphet a saját adataihoz", () => {
    // Ez az őr a RequireAdmin párja, nem a szigorúbb változata: a saját
    // fiókadatait mindenki szerkesztheti, aki be van jelentkezve.
    currentUser = user("admin");
    renderGuarded();
    expect(screen.getByText("Adataim")).toBeInTheDocument();
  });
});
