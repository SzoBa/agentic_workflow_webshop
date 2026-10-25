// @vitest-environment jsdom
// A RequireAdmin útvonal-őr (client/src/RequireAdmin.tsx) tesztjei.
//
// FONTOS a teszt szándékának megértéséhez: ez az őr CSAK kényelmi funkció.
// Az érdemi védelem szerveroldali (requireAdmin az /api/admin router tetején,
// lásd server/test/admin-*.test.ts). Ezek a tesztek tehát azt ellenőrzik, hogy
// a felület nem tévedés-érzékeny — NEM azt, hogy a védelem itt dől el.
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

const { RequireAdmin } = await import("../src/RequireAdmin");

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
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/" element={<p>Főoldal</p>} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <p>Admin felület</p>
            </RequireAdmin>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAdmin", () => {
  it("admin felhasználónak megjeleníti a védett tartalmat", () => {
    currentUser = user("admin");
    renderGuarded();
    expect(screen.getByText("Admin felület")).toBeInTheDocument();
  });

  it("customer felhasználót a főoldalra irányítja", () => {
    currentUser = user("customer");
    renderGuarded();
    expect(screen.queryByText("Admin felület")).not.toBeInTheDocument();
    expect(screen.getByText("Főoldal")).toBeInTheDocument();
  });

  it("be nem jelentkezett látogatót is a főoldalra irányítja", () => {
    // A user?.role optional chaining miatt a null user ugyanazon az ágon esik ki,
    // mint a customer — ezt rögzíti ez a teszt.
    currentUser = null;
    renderGuarded();
    expect(screen.queryByText("Admin felület")).not.toBeInTheDocument();
    expect(screen.getByText("Főoldal")).toBeInTheDocument();
  });

  it("ismeretlen/hibás szerepkör esetén sem enged be (nem admin = kizárva)", () => {
    // Alapértelmezés szerint tiltunk: csak a pontos "admin" érték enged be.
    currentUser = { ...user("customer"), role: "moderator" as unknown as User["role"] };
    renderGuarded();
    expect(screen.queryByText("Admin felület")).not.toBeInTheDocument();
  });
});
