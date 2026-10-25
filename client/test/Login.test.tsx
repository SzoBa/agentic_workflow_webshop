// @vitest-environment jsdom
// A Login oldal (client/src/pages/Login.tsx) tesztjei.
//
// A lényegi viselkedés a "honnan jöttél" visszairányítás: ha egy védett
// oldalról (pl. Pénztár) küldte ide a felület, sikeres belépés után ODA kell
// visszatérni — különben a felhasználó elveszíti a vásárlási folyamat fonalát.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "./dom-setup";

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});

const login = vi.fn();
vi.mock("../src/auth", () => ({ useAuth: () => ({ login }) }));

const { Login } = await import("../src/pages/Login");

/** `state` nélkül a főoldalról, `state`-tel egy védett oldalról érkezés. */
function renderLogin(state?: { from: string }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
      <Login />
    </MemoryRouter>,
  );
}

function fillAndSubmit(username = "felhasznalo", password = "jelszo123") {
  fireEvent.change(screen.getByLabelText(/Felhasználónév/), {
    target: { value: username },
  });
  fireEvent.change(screen.getByLabelText(/Jelszó/), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /Bejelentkezés/ }));
}

beforeEach(() => {
  navigate.mockClear();
  login.mockReset();
  login.mockResolvedValue(undefined);
});

describe("Login - űrlap", () => {
  it("a jelszó mező típusa password (nem jelenik meg olvashatóan)", () => {
    renderLogin();
    expect(screen.getByLabelText(/Jelszó/)).toHaveAttribute("type", "password");
  });

  it("a beírt értékekkel hívja a bejelentkezést", async () => {
    renderLogin();
    fillAndSubmit("felhasznalo", "jelszo123");
    await waitFor(() => expect(login).toHaveBeenCalledWith("felhasznalo", "jelszo123"));
  });

  it("mindkét mező kötelező", () => {
    renderLogin();
    expect(screen.getByLabelText(/Felhasználónév/)).toBeRequired();
    expect(screen.getByLabelText(/Jelszó/)).toBeRequired();
  });
});

describe("Login - sikeres belépés utáni irányítás", () => {
  it("alapértelmezetten a főoldalra visz", async () => {
    renderLogin();
    fillAndSubmit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("védett oldalról érkezve oda tér vissza", async () => {
    renderLogin({ from: "/checkout" });
    fillAndSubmit();
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/checkout", { replace: true }),
    );
  });

  it("replace-szel navigál, hogy a Vissza gomb ne dobjon vissza a login oldalra", async () => {
    renderLogin();
    fillAndSubmit();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(navigate.mock.calls[0][1]).toEqual({ replace: true });
  });
});

describe("Login - hibakezelés", () => {
  it("megjeleníti a szerver hibaüzenetét, és nem navigál el", async () => {
    login.mockRejectedValue(new Error("Hibás felhasználónév vagy jelszó."));
    renderLogin();
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/Hibás felhasználónév vagy jelszó/)).toBeInTheDocument(),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a 429-es (rate limit) üzenetet is továbbadja a felhasználónak", async () => {
    // A szerveroldali brute-force védelem felhasználói vége — enélkül a
    // felhasználó csak annyit látna, hogy „nem történik semmi”.
    login.mockRejectedValue(
      new Error("Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később."),
    );
    renderLogin();
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/Túl sok sikertelen próbálkozás/)).toBeInTheDocument(),
    );
  });

  it("hiba után újra próbálható (a gomb nem marad tiltva)", async () => {
    login.mockRejectedValue(new Error("Hibás felhasználónév vagy jelszó."));
    renderLogin();
    fillAndSubmit();

    await waitFor(() => expect(screen.getByText(/Hibás felhasználónév/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Bejelentkezés/ })).toBeEnabled();
  });

  it("az új beküldés törli a korábbi hibaüzenetet", async () => {
    login.mockRejectedValue(new Error("Hibás felhasználónév vagy jelszó."));
    renderLogin();
    fillAndSubmit();
    await waitFor(() => expect(screen.getByText(/Hibás felhasználónév/)).toBeInTheDocument());

    login.mockResolvedValue(undefined);
    fillAndSubmit();
    await waitFor(() => expect(screen.queryByText(/Hibás felhasználónév/)).not.toBeInTheDocument());
  });
});

describe("Login - beküldés közbeni állapot", () => {
  it("letiltja a gombot és jelzi a folyamatot (dupla beküldés ellen)", async () => {
    let resolveLogin: () => void = () => {};
    login.mockReturnValue(new Promise<void>((resolve) => { resolveLogin = resolve; }));
    renderLogin();
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Bejelentkezés…" })).toBeDisabled(),
    );

    resolveLogin();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });
});
