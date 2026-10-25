// @vitest-environment jsdom
// Az AdminUsers ("Ügyfelek") oldal tesztjei — client/src/pages/AdminUsers.tsx.
//
// Két olyan szándék van itt, amit könnyű egy későbbi módosítással véletlenül
// elrontani, ezért explicit tesztet kap mindkettő:
//  1. NINCS új felhasználó felvétele és NINCS jelszókezelés — fiók kizárólag
//     regisztrációval keletkezik (lásd a komponens fejlécét és a szerver
//     routes/admin/users.ts megjegyzését).
//  2. Az utolsó admin védelme SZERVEROLDALI: a felület csak megjeleníti a
//     szerver elutasítását, nem másolja le a szabályt (különben a két oldal
//     előbb-utóbb elcsúszna egymástól).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "./dom-setup";
import type { AdminUser } from "../src/api";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return {
    ...actual,
    getAdminUsers: vi.fn(),
    updateAdminUser: vi.fn(),
    deleteAdminUser: vi.fn(),
  };
});

const api = await import("../src/api");
const { AdminUsers } = await import("../src/pages/AdminUsers");

function user(over: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u1",
    username: "vasarlo1",
    email: "vasarlo@example.com",
    address: "Teszt utca 1",
    role: "customer",
    createdAt: "2026-03-15T10:00:00.000Z",
    ...over,
  };
}

const ADMIN = user({
  id: "u2",
  username: "adminisztrator",
  email: "admin@example.com",
  role: "admin",
});

const button = (name: string | RegExp) => screen.getByRole("button", { name });

/** A szerkesztő űrlap (a lekérdezések szűkítéséhez). */
function formEl(): HTMLElement {
  const el = document.querySelector("form.form-stack");
  if (!el) throw new Error("Nincs nyitott szerkesztő űrlap.");
  return el as HTMLElement;
}
const field = (label: RegExp) => within(formEl()).getByLabelText(label);

/** A megadott nevű ügyfél sora. */
const rowOf = (name: string) => screen.getByRole("row", { name: new RegExp(name) });

async function renderLoaded() {
  const result = render(<AdminUsers />);
  await screen.findByRole("heading", { name: "Ügyfelek" });
  return result;
}

/** Megnyitja a megadott ügyfél szerkesztő űrlapját. */
function startEdit(name: string) {
  fireEvent.click(within(rowOf(name)).getByRole("button", { name: "Szerkesztés" }));
}

beforeEach(() => {
  vi.mocked(api.getAdminUsers).mockReset().mockResolvedValue([user(), ADMIN]);
  vi.mocked(api.updateAdminUser).mockReset().mockResolvedValue(user());
  vi.mocked(api.deleteAdminUser).mockReset().mockResolvedValue({ ok: true });
});

describe("AdminUsers - betöltés és lista", () => {
  it("betöltés közben jelzést mutat", () => {
    vi.mocked(api.getAdminUsers).mockReturnValue(new Promise(() => {}));
    render(<AdminUsers />);
    expect(screen.getByText("Ügyfelek betöltése…")).toBeInTheDocument();
  });

  it("betöltési hibát megjelenít", async () => {
    vi.mocked(api.getAdminUsers).mockRejectedValue(
      new Error("Ehhez adminisztrátori jogosultság szükséges."),
    );
    render(<AdminUsers />);
    expect(await screen.findByText(/adminisztrátori jogosultság szükséges/)).toBeInTheDocument();
  });

  it("kilistázza az ügyfeleket az adataikkal", async () => {
    await renderLoaded();
    const row = rowOf("vasarlo1");
    expect(within(row).getByText("vasarlo@example.com")).toBeInTheDocument();
    expect(within(row).getByText("Teszt utca 1")).toBeInTheDocument();
  });

  it("a szerepkört magyarul jeleníti meg", async () => {
    await renderLoaded();
    expect(within(rowOf("vasarlo1")).getByText("Vásárló")).toBeInTheDocument();
    expect(within(rowOf("adminisztrator")).getByText("Adminisztrátor")).toBeInTheDocument();
  });

  it("a regisztráció dátumát formázva mutatja", async () => {
    await renderLoaded();
    expect(within(rowOf("vasarlo1")).getByText(/2026/)).toBeInTheDocument();
  });
});

describe("AdminUsers - érzékeny adatok és tiltott műveletek", () => {
  it("SOHA nem jelenít meg jelszóval kapcsolatos mezőt", async () => {
    // A szerver sem küld hash-t/sót/tokent (toAdminView), a felület pedig nem is
    // kínál jelszó-szerkesztést. Ez a teszt mindkét szándékot rögzíti.
    await renderLoaded();
    expect(screen.queryByLabelText(/jelszó/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("nincs 'új ügyfél' művelet (fiók csak regisztrációval keletkezik)", async () => {
    await renderLoaded();
    expect(screen.queryByRole("button", { name: /új ügyfél/i })).not.toBeInTheDocument();
    // A felület ezt ki is mondja, hogy az admin ne keresse.
    expect(screen.getByText(/Új ügyfél felvételére itt nincs mód/)).toBeInTheDocument();
  });

  it("induláskor nincs nyitott szerkesztő űrlap", async () => {
    await renderLoaded();
    expect(document.querySelector("form.form-stack")).toBeNull();
  });
});

describe("AdminUsers - szerkesztés", () => {
  it("a Szerkesztés az ügyfél adataival tölti fel az űrlapot", async () => {
    await renderLoaded();
    startEdit("vasarlo1");

    expect(screen.getByRole("heading", { name: "Ügyfél szerkesztése" })).toBeInTheDocument();
    expect(field(/Felhasználónév/)).toHaveValue("vasarlo1");
    expect(field(/Email/)).toHaveValue("vasarlo@example.com");
    expect(field(/Szállítási cím/)).toHaveValue("Teszt utca 1");
    expect(field(/Szerepkör/)).toHaveValue("customer");
  });

  it("a Mégse bezárja az űrlapot", async () => {
    await renderLoaded();
    startEdit("vasarlo1");
    fireEvent.click(button("Mégse"));
    expect(document.querySelector("form.form-stack")).toBeNull();
  });

  it("a módosított mezőkkel hívja az updateAdminUser-t", async () => {
    await renderLoaded();
    startEdit("vasarlo1");
    fireEvent.change(field(/Felhasználónév/), { target: { value: "ujfelhasznalonev" } });
    fireEvent.change(field(/Szállítási cím/), { target: { value: "Másik utca 9" } });
    fireEvent.click(button("Mentés"));

    await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalled());
    const [id, input] = vi.mocked(api.updateAdminUser).mock.calls[0];
    expect(id).toBe("u1");
    expect(input).toEqual({
      username: "ujfelhasznalonev",
      email: "vasarlo@example.com",
      address: "Másik utca 9",
      role: "customer",
    });
  });

  it("a szerepkör előléptethető adminná", async () => {
    await renderLoaded();
    startEdit("vasarlo1");
    fireEvent.change(field(/Szerepkör/), { target: { value: "admin" } });
    fireEvent.click(button("Mentés"));

    await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalled());
    expect(vi.mocked(api.updateAdminUser).mock.calls[0][1].role).toBe("admin");
  });

  it("sikeres mentés után bezárja az űrlapot és újratölti a listát", async () => {
    await renderLoaded();
    const callsBefore = vi.mocked(api.getAdminUsers).mock.calls.length;
    startEdit("vasarlo1");
    fireEvent.click(button("Mentés"));

    await waitFor(() => expect(document.querySelector("form.form-stack")).toBeNull());
    expect(vi.mocked(api.getAdminUsers).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("mentés közben letiltja a gombot (dupla mentés ellen)", async () => {
    vi.mocked(api.updateAdminUser).mockReturnValue(new Promise(() => {}));
    await renderLoaded();
    startEdit("vasarlo1");
    fireEvent.click(button("Mentés"));

    await waitFor(() => expect(button("Mentés…")).toBeDisabled());
  });
});

describe("AdminUsers - szerverhiba szerkesztéskor", () => {
  it("megjeleníti a szerver validációs üzenetét", async () => {
    vi.mocked(api.updateAdminUser).mockRejectedValue(
      new Error("Ez a felhasználónév már foglalt."),
    );
    await renderLoaded();
    startEdit("vasarlo1");
    fireEvent.change(field(/Felhasználónév/), { target: { value: "adminisztrator" } });
    fireEvent.click(button("Mentés"));

    expect(await screen.findByText(/Ez a felhasználónév már foglalt/)).toBeInTheDocument();
  });

  it("az utolsó admin lefokozását a SZERVER tiltja; a felület csak közvetíti", async () => {
    // A felület szándékosan nem ismétli meg a szabályt: nem tudja, hány admin
    // van, és egy lemásolt szabály elcsúszna a szerveroldalitól.
    vi.mocked(api.updateAdminUser).mockRejectedValue(
      new Error("Ez az utolsó admin jogú felhasználó, ezért a szerepköre nem vehető el."),
    );
    await renderLoaded();
    startEdit("adminisztrator");
    fireEvent.change(field(/Szerepkör/), { target: { value: "customer" } });
    fireEvent.click(button("Mentés"));

    // A kérés kimegy — a döntés a szerveré.
    await waitFor(() => expect(api.updateAdminUser).toHaveBeenCalled());
    expect(await screen.findByText(/utolsó admin jogú felhasználó/)).toBeInTheDocument();
  });

  it("hiba után NEM dobja el a beírt adatokat", async () => {
    vi.mocked(api.updateAdminUser).mockRejectedValue(new Error("Érvénytelen email cím."));
    await renderLoaded();
    startEdit("vasarlo1");
    fireEvent.change(field(/Felhasználónév/), { target: { value: "megorzendonev" } });
    fireEvent.click(button("Mentés"));
    await screen.findByText(/Érvénytelen email cím/);

    expect(field(/Felhasználónév/)).toHaveValue("megorzendonev");
    // Az űrlap nyitva marad, hogy javítani lehessen.
    expect(screen.getByRole("heading", { name: "Ügyfél szerkesztése" })).toBeInTheDocument();
  });
});

describe("AdminUsers - törlés", () => {
  it("megerősítést kér, és jelzi, hogy a rendelések megmaradnak", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderLoaded();
    fireEvent.click(within(rowOf("vasarlo1")).getByRole("button", { name: "Törlés" }));

    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain("vasarlo1");
    expect(message).toContain("nem vonható vissza");
    // A rendelés önálló bizonylat — ezt a megerősítés szövege is kimondja.
    expect(message).toContain("rendelései megmaradnak");
    confirmSpy.mockRestore();
  });

  it("megerősítés után törli az ügyfelet és újratölt", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderLoaded();
    const callsBefore = vi.mocked(api.getAdminUsers).mock.calls.length;
    fireEvent.click(within(rowOf("vasarlo1")).getByRole("button", { name: "Törlés" }));

    await waitFor(() => expect(api.deleteAdminUser).toHaveBeenCalledWith("u1"));
    await waitFor(() =>
      expect(vi.mocked(api.getAdminUsers).mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it("elutasított megerősítésnél NEM töröl", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderLoaded();
    fireEvent.click(within(rowOf("vasarlo1")).getByRole("button", { name: "Törlés" }));

    expect(api.deleteAdminUser).not.toHaveBeenCalled();
  });

  it("az utolsó admin törlésének szerveroldali tiltását megjeleníti", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.deleteAdminUser).mockRejectedValue(
      new Error("Ez az utolsó admin jogú felhasználó, ezért nem törölhető."),
    );
    await renderLoaded();
    fireEvent.click(within(rowOf("adminisztrator")).getByRole("button", { name: "Törlés" }));

    expect(await screen.findByText(/ezért nem törölhető/)).toBeInTheDocument();
    // A sor megmarad a listában.
    expect(rowOf("adminisztrator")).toBeInTheDocument();
  });
});
