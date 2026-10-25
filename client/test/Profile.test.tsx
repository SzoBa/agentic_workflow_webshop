// @vitest-environment jsdom
// Az „Adataim" oldal (client/src/pages/Profile.tsx) tesztjei.
//
// Két olyan szándék van itt, amit egy későbbi módosítás könnyen elronthat:
//  1. A KÉT ŰRLAP FÜGGETLEN. A fiókadat-mentés és a jelszócsere két külön
//     szerverhívás, külön következménnyel — közös állapotban az egyik sikere
//     eltüntetné a másik hibaüzenetét.
//  2. A HIBÁS JELENLEGI JELSZÓ az űrlapon jelenik meg, kiléptetés nélkül. A
//     szerver erre 400-at ad — mezőhibát, nem lejárt munkamenetet —, ezért az api
//     réteg globális 401-kezelője fel sem ébred. (A 401 ezeken a végpontokon
//     tényleg lejáratot jelent, és ki IS léptet.)
//
// A munkamenet-frissítés maga az auth rétegé (client/test/auth.test.tsx
// szomszédságában): ez a teszt azt méri, hogy az oldal a helyes adatokkal hívja
// a contextet, és a válaszokat helyesen jeleníti meg.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "./dom-setup";
import type { User } from "../src/api";

const updateProfile = vi.fn();
const changePassword = vi.fn();
let currentUser: User | null = null;
vi.mock("../src/auth", () => ({
  useAuth: () => ({ user: currentUser, updateProfile, changePassword }),
}));

const { Profile } = await import("../src/pages/Profile");

const USER: User = {
  id: "u1",
  username: "vasarlo1",
  email: "vasarlo@example.com",
  address: "Teszt utca 1",
  role: "customer",
};

function renderProfile() {
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
}

/** Vezérelt mező kitöltése: a `change` esemény az, amit a React figyel. */
function setField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const button = (name: RegExp) => screen.getByRole("button", { name });

/** A fiókadat-űrlap kitöltése és beküldése. */
async function submitProfile(
  over: Partial<Record<"username" | "email" | "address" | "password", string>> = {},
) {
  if (over.username !== undefined) setField(/^Felhasználónév$/, over.username);
  if (over.email !== undefined) setField(/^Email$/, over.email);
  if (over.address !== undefined) setField(/^Szállítási cím$/, over.address);
  setField(/^Jelszó a megerősítéshez$/, over.password ?? "jelszo123");
  await userEvent.click(button(/^Adatok mentése$/));
}

/** A jelszócsere űrlap kitöltése és beküldése. */
async function submitPassword(
  current = "jelszo123",
  next = "ujjelszo123",
  confirm = next,
) {
  setField(/^Jelenlegi jelszó$/, current);
  setField(/^Új jelszó$/, next);
  setField(/^Új jelszó megerősítése$/, confirm);
  await userEvent.click(button(/^Jelszó módosítása$/));
}

beforeEach(() => {
  currentUser = USER;
  updateProfile.mockReset();
  updateProfile.mockResolvedValue(undefined);
  changePassword.mockReset();
  changePassword.mockResolvedValue(undefined);
});

describe("Adataim - előtöltés", () => {
  it("a fiókadat-űrlap a jelenlegi értékekkel érkezik", () => {
    renderProfile();
    expect(screen.getByLabelText(/^Felhasználónév$/)).toHaveValue("vasarlo1");
    expect(screen.getByLabelText(/^Email$/)).toHaveValue("vasarlo@example.com");
    expect(screen.getByLabelText(/^Szállítási cím$/)).toHaveValue("Teszt utca 1");
  });

  it("a jelszómezők üresek és rejtettek (nem jelennek meg olvashatóan)", () => {
    renderProfile();
    for (const label of [
      /^Jelszó a megerősítéshez$/,
      /^Jelenlegi jelszó$/,
      /^Új jelszó$/,
      /^Új jelszó megerősítése$/,
    ]) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveValue("");
      expect(field).toHaveAttribute("type", "password");
    }
  });

  it("a két űrlap külön, akadálymentes néven érhető el", () => {
    // Az e2e és a képernyőolvasó is így különbözteti meg őket; mindkettőben
    // van „jelszó" mező.
    renderProfile();
    const account = screen.getByRole("form", { name: "Fiókadatok" });
    const password = screen.getByRole("form", { name: "Jelszócsere" });
    expect(within(account).getByLabelText(/^Felhasználónév$/)).toBeInTheDocument();
    expect(within(password).getByLabelText(/^Új jelszó$/)).toBeInTheDocument();
  });

  it("belépett felhasználó nélkül a bejelentkezésre mutat (az őr párja)", () => {
    currentUser = null;
    renderProfile();
    expect(screen.queryByRole("form", { name: "Fiókadatok" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /bejelentkezéshez/ })).toBeInTheDocument();
  });
});

describe("Adataim - fiókadatok mentése", () => {
  it("a beírt értékekkel és a megerősítő jelszóval hív", async () => {
    renderProfile();
    await submitProfile({
      username: "vasarlo2",
      email: "uj@example.com",
      address: "Új utca 2",
      password: "jelszo123",
    });

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        username: "vasarlo2",
        email: "uj@example.com",
        address: "Új utca 2",
        currentPassword: "jelszo123",
      }),
    );
  });

  it("a szerepkört NEM küldi el (azt senki nem állíthatja magának)", async () => {
    renderProfile();
    await submitProfile();
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    expect(updateProfile.mock.calls[0][0]).not.toHaveProperty("role");
  });

  it("a mezők köré írt szóközöket levágja", async () => {
    renderProfile();
    await submitProfile({ username: "  vasarlo2  ", password: "jelszo123" });
    await waitFor(() =>
      expect(updateProfile.mock.calls[0][0].username).toBe("vasarlo2"),
    );
  });

  it("siker esetén visszajelez, és a megerősítő jelszót kiüríti", async () => {
    renderProfile();
    await submitProfile();

    await waitFor(() =>
      expect(screen.getByText("Az adataidat elmentettük.")).toBeInTheDocument(),
    );
    // Az egyszer használatos megerősítő jelszó nem maradhat a képernyőn.
    expect(screen.getByLabelText(/^Jelszó a megerősítéshez$/)).toHaveValue("");
  });

  it("a hibás jelenlegi jelszót az űrlapon mutatja (nem lépteti ki)", async () => {
    updateProfile.mockRejectedValue(new Error("A jelenlegi jelszó hibás."));
    renderProfile();
    await submitProfile();

    await waitFor(() =>
      expect(screen.getByText(/A jelenlegi jelszó hibás\./)).toBeInTheDocument(),
    );
    // Az űrlap a helyén marad, tehát a felhasználó javíthat és újrapróbálhat.
    expect(screen.getByRole("form", { name: "Fiókadatok" })).toBeInTheDocument();
    expect(button(/^Adatok mentése$/)).toBeEnabled();
  });

  it("a validációs hibaüzenetet is megjeleníti", async () => {
    updateProfile.mockRejectedValue(new Error("Ez a felhasználónév már foglalt."));
    renderProfile();
    await submitProfile({ username: "adminisztrator" });

    await waitFor(() =>
      expect(screen.getByText(/Ez a felhasználónév már foglalt\./)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Az adataidat elmentettük.")).not.toBeInTheDocument();
  });

  it("beküldés közben letiltja a gombot (dupla mentés ellen)", async () => {
    let resolveSave: () => void = () => {};
    updateProfile.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderProfile();
    await submitProfile();

    await waitFor(() => expect(button(/^Mentés…$/)).toBeDisabled());
    resolveSave();
    await waitFor(() =>
      expect(screen.getByText("Az adataidat elmentettük.")).toBeInTheDocument(),
    );
  });
});

describe("Adataim - jelszócsere", () => {
  it("a három mezővel hív, és siker esetén visszajelez", async () => {
    renderProfile();
    await submitPassword("jelszo123", "ujjelszo123");

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: "jelszo123",
        newPassword: "ujjelszo123",
        newPasswordConfirm: "ujjelszo123",
      }),
    );
    expect(
      await screen.findByText("A jelszavadat megváltoztattuk."),
    ).toBeInTheDocument();
  });

  it("siker után egyik jelszómező sem marad kitöltve", async () => {
    renderProfile();
    await submitPassword();

    await waitFor(() =>
      expect(screen.getByText("A jelszavadat megváltoztattuk.")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/^Jelenlegi jelszó$/)).toHaveValue("");
    expect(screen.getByLabelText(/^Új jelszó$/)).toHaveValue("");
    expect(screen.getByLabelText(/^Új jelszó megerősítése$/)).toHaveValue("");
  });

  it("eltérő megerősítésnél el sem indítja a kérést", async () => {
    renderProfile();
    await submitPassword("jelszo123", "ujjelszo123", "masikjelszo");

    expect(await screen.findByText(/A két jelszó nem egyezik\./)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("a hibás jelenlegi jelszót az űrlapon mutatja (nem lépteti ki)", async () => {
    changePassword.mockRejectedValue(new Error("A jelenlegi jelszó hibás."));
    renderProfile();
    await submitPassword();

    expect(await screen.findByText(/A jelenlegi jelszó hibás\./)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Jelszócsere" })).toBeInTheDocument();
  });

  it("megjeleníti, ha az új jelszó megegyezik a jelenlegivel", async () => {
    changePassword.mockRejectedValue(
      new Error("Az új jelszó nem egyezhet meg a jelenlegivel."),
    );
    renderProfile();
    await submitPassword("jelszo123", "jelszo123");

    expect(
      await screen.findByText(/Az új jelszó nem egyezhet meg a jelenlegivel\./),
    ).toBeInTheDocument();
  });

  it("a rövid jelszó üzenetét megjeleníti", async () => {
    changePassword.mockRejectedValue(new Error("A jelszó legalább 8 karakter legyen."));
    renderProfile();
    await submitPassword("jelszo123", "rovid");

    expect(
      await screen.findByText(/A jelszó legalább 8 karakter legyen\./),
    ).toBeInTheDocument();
  });

  it("a találgatási korlát (429) üzenetét is továbbadja", async () => {
    // A szerveroldali brute-force védelem felhasználói vége — enélkül a
    // felhasználó csak annyit látna, hogy „nem történik semmi".
    changePassword.mockRejectedValue(
      new Error("Túl sok sikertelen próbálkozás. Kérjük, próbáld újra később."),
    );
    renderProfile();
    await submitPassword();

    expect(
      await screen.findByText(/Túl sok sikertelen próbálkozás/),
    ).toBeInTheDocument();
  });
});

describe("Adataim - a két űrlap független", () => {
  it("a jelszócsere hibája nem tünteti el a fiókadat-mentés sikerjelzését", async () => {
    changePassword.mockRejectedValue(new Error("A jelenlegi jelszó hibás."));
    renderProfile();

    await submitProfile();
    await waitFor(() =>
      expect(screen.getByText("Az adataidat elmentettük.")).toBeInTheDocument(),
    );

    await submitPassword();
    expect(await screen.findByText(/A jelenlegi jelszó hibás\./)).toBeInTheDocument();
    expect(screen.getByText("Az adataidat elmentettük.")).toBeInTheDocument();
  });

  it("a fiókadat-mentés nem hívja a jelszócserét és fordítva", async () => {
    renderProfile();
    await submitProfile();
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(changePassword).not.toHaveBeenCalled();
  });
});
