// @vitest-environment jsdom
// Az AuthProvider (client/src/auth.tsx) komponenstesztjei.
//
// Miért fontos: ez a réteg dönti el, hogy a védett API-hívások milyen tokennel
// mennek ki (setAuthToken), és hogy egy elavult munkamenet kiléptet-e. Egy
// hiba itt vagy néma 401-eket okoz, vagy — rosszabb esetben — a felületen
// bejelentkezettnek látszó, valójában érvénytelen munkamenetet.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "./dom-setup";
import { AuthProvider, useAuth } from "../src/auth";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return {
    ...actual,
    me: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    setAuthToken: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  };
});
const api = await import("../src/api");

/** A provider által regisztrált 401-kezelő — így kívülről kiváltható. */
function registeredUnauthorizedHandler(): () => void {
  const calls = vi.mocked(api.setUnauthorizedHandler).mock.calls;
  // Index-aritmetika `.at(-1)` helyett: a tsconfig `lib` értéke ES2020, az
  // `Array#at` viszont ES2022 — a build (`tsc`) különben elhasal rajta.
  const registered = calls.map(([fn]) => fn).filter(Boolean);
  const handler = registered[registered.length - 1];
  if (!handler) throw new Error("Az AuthProvider nem regisztrált 401-kezelőt.");
  return handler;
}

const USER = {
  id: "u1",
  username: "felhasznalo",
  email: "u@example.com",
  address: "Cím",
  role: "customer" as const,
};

function AuthHarness() {
  const {
    user,
    token,
    sessionExpired,
    login,
    logout,
    register,
    updateProfile,
    changePassword,
  } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.username : "nincs"}</span>
      <span data-testid="role">{user?.role ?? "-"}</span>
      <span data-testid="token">{token ?? "nincs"}</span>
      <span data-testid="address">{user?.address ?? "-"}</span>
      <span data-testid="expired">{sessionExpired ? "igen" : "nem"}</span>
      {/* A hibát elnyeljük: a valódi felületen az űrlap jeleníti meg, itt viszont
          kezeletlen promise-elutasítás lenne belőle, ami elfedhet egy VALÓDI
          kezeletlen hibát a futás végén. A vizsgált viselkedés az állapot. */}
      <button onClick={() => void login("felhasznalo", "jelszo123").catch(() => {})}>
        login
      </button>
      <button onClick={() => void logout().catch(() => {})}>logout</button>
      <button
        onClick={() =>
          void register("uj", "uj@example.com", "Cím", "jelszo123").catch(() => {})
        }
      >
        register
      </button>
      <button
        onClick={() =>
          void updateProfile({
            username: "felhasznalo",
            email: "u@example.com",
            address: "Új utca 2",
            currentPassword: "jelszo123",
          }).catch(() => {})
        }
      >
        profil mentése
      </button>
      <button
        onClick={() =>
          void changePassword({
            currentPassword: "jelszo123",
            newPassword: "ujjelszo123",
            newPasswordConfirm: "ujjelszo123",
          }).catch(() => {})
        }
      >
        jelszócsere
      </button>
    </div>
  );
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <AuthHarness />
    </AuthProvider>,
  );

const click = (label: string) => fireEvent.click(screen.getByText(label));
const user = () => screen.getByTestId("user").textContent;
const token = () => screen.getByTestId("token").textContent;

/** Mentett munkamenet a localStorage-ben (mint egy korábbi bejelentkezés után). */
function seedSession(t = "mentett-token") {
  localStorage.setItem("webshop-auth", JSON.stringify({ user: USER, token: t }));
}

beforeEach(() => {
  vi.mocked(api.me).mockReset();
  vi.mocked(api.login).mockReset();
  vi.mocked(api.logout).mockReset();
  vi.mocked(api.register).mockReset();
  vi.mocked(api.updateProfile).mockReset();
  vi.mocked(api.changePassword).mockReset();
  vi.mocked(api.setAuthToken).mockClear();
  vi.mocked(api.setUnauthorizedHandler).mockClear();
  localStorage.clear();
});

describe("AuthProvider - induló állapot", () => {
  it("mentett munkamenet nélkül kijelentkezve indul", () => {
    renderAuth();
    expect(user()).toBe("nincs");
    expect(token()).toBe("nincs");
  });

  it("token nélkül NEM hívja a me()-t (felesleges kérés)", () => {
    renderAuth();
    expect(api.me).not.toHaveBeenCalled();
  });

  it("sérült localStorage tartalomnál kijelentkezve indul, nem dob hibát", () => {
    localStorage.setItem("webshop-auth", "{ez nem json");
    expect(() => renderAuth()).not.toThrow();
    expect(user()).toBe("nincs");
  });

  it("a mentett munkamenetet visszatölti", () => {
    seedSession();
    vi.mocked(api.me).mockResolvedValue(USER);
    renderAuth();
    expect(user()).toBe("felhasznalo");
    expect(token()).toBe("mentett-token");
  });
});

describe("AuthProvider - token szinkronizálása az api réteggel", () => {
  it("induláskor beállítja a mentett tokent az api rétegen", async () => {
    seedSession("t-123");
    vi.mocked(api.me).mockResolvedValue(USER);
    renderAuth();
    // Enélkül az induló me() hívás token nélkül menne ki, és 401-et kapna.
    await waitFor(() => expect(api.setAuthToken).toHaveBeenCalledWith("t-123"));
  });

  it("a mentett tokent a szerveren validálja (me hívás)", async () => {
    seedSession();
    vi.mocked(api.me).mockResolvedValue(USER);
    renderAuth();
    await waitFor(() => expect(api.me).toHaveBeenCalledTimes(1));
  });

  it("a szerverről érkező FRISS adatot veszi át (pl. időközbeni szerepkör-változás)", async () => {
    seedSession();
    // A localStorage-ben customer szerepel, a szerver szerint viszont admin.
    vi.mocked(api.me).mockResolvedValue({ ...USER, role: "admin" });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
  });

  it("érvénytelen token esetén kilépteti a felhasználót", async () => {
    seedSession();
    vi.mocked(api.me).mockRejectedValue(new Error("Bejelentkezés szükséges."));
    renderAuth();

    await waitFor(() => expect(user()).toBe("nincs"));
    expect(token()).toBe("nincs");
    // A tárolt munkamenet is kiürül, hogy újratöltés után se éledjen újra.
    expect(JSON.parse(localStorage.getItem("webshop-auth")!)).toEqual({
      user: null,
      token: null,
    });
  });
});

describe("AuthProvider - bejelentkezés és regisztráció", () => {
  it("sikeres bejelentkezéskor beállítja a felhasználót és a tokent", async () => {
    vi.mocked(api.login).mockResolvedValue({ user: USER, token: "uj-token" });
    renderAuth();
    click("login");

    await waitFor(() => expect(user()).toBe("felhasznalo"));
    expect(token()).toBe("uj-token");
    expect(api.setAuthToken).toHaveBeenCalledWith("uj-token");
  });

  it("a sikeres bejelentkezést localStorage-be menti", async () => {
    vi.mocked(api.login).mockResolvedValue({ user: USER, token: "uj-token" });
    renderAuth();
    click("login");

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("webshop-auth")!).token).toBe("uj-token"),
    );
  });

  it("sikertelen bejelentkezésnél kijelentkezve marad", async () => {
    vi.mocked(api.login).mockRejectedValue(new Error("Hibás felhasználónév vagy jelszó."));
    renderAuth();
    click("login");

    await waitFor(() => expect(api.login).toHaveBeenCalled());
    expect(user()).toBe("nincs");
    expect(token()).toBe("nincs");
  });

  it("a regisztráció azonnal be is lépteti a felhasználót", async () => {
    vi.mocked(api.register).mockResolvedValue({ user: USER, token: "reg-token" });
    renderAuth();
    click("register");

    await waitFor(() => expect(user()).toBe("felhasznalo"));
    expect(token()).toBe("reg-token");
  });
});

describe("AuthProvider - kijelentkezés", () => {
  it("értesíti a szervert, és kiüríti a helyi állapotot", async () => {
    seedSession();
    vi.mocked(api.me).mockResolvedValue(USER);
    vi.mocked(api.logout).mockResolvedValue({ ok: true });
    renderAuth();
    click("logout");

    await waitFor(() => expect(user()).toBe("nincs"));
    expect(api.logout).toHaveBeenCalled();
    expect(api.setAuthToken).toHaveBeenCalledWith(null);
  });

  it("hálózati hiba esetén is kilépteti a felhasználót helyben", async () => {
    // Ha a szerver nem érhető el, a felhasználó akkor sem ragadhat bent egy
    // olyan munkamenetben, amiből ki akart lépni.
    seedSession();
    vi.mocked(api.me).mockResolvedValue(USER);
    vi.mocked(api.logout).mockRejectedValue(new Error("Network error"));
    renderAuth();
    click("logout");

    await waitFor(() => expect(user()).toBe("nincs"));
    expect(token()).toBe("nincs");
  });
});

describe("AuthProvider - fiókadatok és jelszócsere (FA-07 b)", () => {
  // Ezek SZÁNDÉKOSAN valódi AuthProvider-t renderelnek, nem mockolt contextet: a
  // mérendő viselkedés maga a provider döntése arról, mikor nyúl a tokenhez. Egy
  // mockolt context pontosan azt hagyná ki, amit igazolni kell.

  /** A `setAuthToken`-nek átadott ÖSSZES érték, hívási sorrendben. */
  const tokensGivenToApi = () =>
    vi.mocked(api.setAuthToken).mock.calls.map(([t]) => t);

  const storedSession = () =>
    JSON.parse(localStorage.getItem("webshop-auth")!) as {
      user: { username: string; address: string } | null;
      token: string | null;
    };

  it("a profilmentés a felhasználót frissíti, a tokenhez NEM nyúl", async () => {
    seedSession("mentett-token");
    vi.mocked(api.me).mockResolvedValue(USER);
    vi.mocked(api.updateProfile).mockResolvedValue({ ...USER, address: "Új utca 2" });
    renderAuth();
    await waitFor(() => expect(user()).toBe("felhasznalo"));

    click("profil mentése");

    await waitFor(() =>
      expect(screen.getByTestId("address").textContent).toBe("Új utca 2"),
    );
    // A munkamenet érintetlen: a válasz nem is hoz tokent (a szerver nem rotál).
    expect(token()).toBe("mentett-token");
    expect(tokensGivenToApi().every((t) => t === "mentett-token")).toBe(true);
    expect(storedSession().token).toBe("mentett-token");
  });

  it("a profilmentés eredménye a localStorage-be is bekerül", async () => {
    seedSession("mentett-token");
    vi.mocked(api.me).mockResolvedValue(USER);
    vi.mocked(api.updateProfile).mockResolvedValue({ ...USER, address: "Új utca 2" });
    renderAuth();
    await waitFor(() => expect(user()).toBe("felhasznalo"));

    click("profil mentése");

    await waitFor(() => expect(storedSession().user!.address).toBe("Új utca 2"));
  });

  it("a jelszócsere az ÚJ tokent adja az api rétegnek és a munkamenetbe", async () => {
    seedSession("regi-token");
    vi.mocked(api.me).mockResolvedValue(USER);
    vi.mocked(api.changePassword).mockResolvedValue({ user: USER, token: "rotalt-token" });
    renderAuth();
    await waitFor(() => expect(token()).toBe("regi-token"));

    click("jelszócsere");

    // A szerver a régi tokent AZONNAL érvényteleníti: ha az új nem kerülne be, a
    // következő kérés 401-et kapna, és a felhasználó a saját jelszócseréjétől
    // repülne ki.
    await waitFor(() => expect(api.setAuthToken).toHaveBeenCalledWith("rotalt-token"));
    expect(token()).toBe("rotalt-token");
    await waitFor(() => expect(storedSession().token).toBe("rotalt-token"));
  });

  it("egyik művelet sem lépteti ki a felhasználót (nincs munkamenet-lejárat)", async () => {
    seedSession("regi-token");
    vi.mocked(api.me).mockResolvedValue(USER);
    vi.mocked(api.updateProfile).mockResolvedValue({ ...USER, address: "Új utca 2" });
    vi.mocked(api.changePassword).mockResolvedValue({ user: USER, token: "rotalt-token" });
    renderAuth();
    await waitFor(() => expect(user()).toBe("felhasznalo"));

    click("profil mentése");
    await waitFor(() =>
      expect(screen.getByTestId("address").textContent).toBe("Új utca 2"),
    );
    click("jelszócsere");
    await waitFor(() => expect(token()).toBe("rotalt-token"));

    expect(user()).toBe("felhasznalo");
    expect(screen.getByTestId("expired").textContent).toBe("nem");
    expect(api.setAuthToken).not.toHaveBeenCalledWith(null);
  });

  it("a hibát nem nyeli el, és nem is dobja el a munkamenetet", async () => {
    // A hibás jelenlegi jelszóra a szerver 400-at ad; azt az űrlap mutatja meg, a
    // munkamenetnek pedig meg kell maradnia.
    seedSession("mentett-token");
    vi.mocked(api.me).mockResolvedValue(USER);
    vi.mocked(api.updateProfile).mockRejectedValue(
      new Error("A jelenlegi jelszó hibás."),
    );
    renderAuth();
    await waitFor(() => expect(user()).toBe("felhasznalo"));

    click("profil mentése");

    await waitFor(() => expect(api.updateProfile).toHaveBeenCalled());
    expect(user()).toBe("felhasznalo");
    expect(token()).toBe("mentett-token");
    expect(screen.getByTestId("expired").textContent).toBe("nem");
  });
});

describe("a token a GYERMEK effektek előtt áll be", () => {
  // Regresszió. Korábban a provider effektben adta át a tokent az api rétegnek,
  // a React viszont a gyermekek effektjeit a szülőé ELŐTT futtatja: egy védett
  // oldal betöltő effektje így token nélkül indult, a szerver 401-et adott egy
  // érvényes munkamenetre, és a felület "lejárt a munkameneted" üzenettel
  // léptette ki a felhasználót. Oldalfrissítéssel vagy közvetlen linkkel
  // megnyitott admin oldalon ez MINDIG előjött.

  /** Egy védett oldal utánzata: a mountoláskor azonnal hív egy védett végpontot. */
  function ProtectedPage({ onMount }: { onMount: () => void }) {
    useEffect(onMount, [onMount]);
    return <div>védett oldal</div>;
  }

  /** A setAuthToken-nek LEGUTÓBB átadott érték; hívás nélkül `null`. */
  function lastToken(calls: [token: string | null][]): string | null {
    return calls.length === 0 ? null : calls[calls.length - 1][0];
  }

  it("mentett munkamenettel a gyermek effektje már beállított tokent lát", () => {
    seedSession("mentett-token");
    // A provider induláskor validálja a mentett tokent — a mock nélkül a
    // me() effektje szállna el, még mielőtt a mérésünkhöz eljutnánk.
    vi.mocked(api.me).mockResolvedValue(USER);
    const tokenAtChildMount: (string | null)[] = [];

    render(
      <AuthProvider>
        <ProtectedPage
          onMount={() => {
            // Az api réteg mockolva van, ezért azt nézzük, mit KAPOTT a
            // setAuthToken a gyermek effektjének pillanatáig.
            const calls = vi.mocked(api.setAuthToken).mock.calls;
            tokenAtChildMount.push(lastToken(calls));
          }}
        />
      </AuthProvider>,
    );

    expect(tokenAtChildMount).toEqual(["mentett-token"]);
  });

  it("munkamenet nélkül a gyermek effektje null tokent lát (nem marad beragadt érték)", () => {
    const seen: (string | null)[] = [];

    render(
      <AuthProvider>
        <ProtectedPage
          onMount={() => {
            seen.push(lastToken(vi.mocked(api.setAuthToken).mock.calls));
          }}
        />
      </AuthProvider>,
    );

    expect(seen).toEqual([null]);
  });
});

describe("useAuth", () => {
  it("érthető hibát dob, ha AuthProvider-en kívül használják", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<AuthHarness />)).toThrow(
      "useAuth csak AuthProvider-en belül használható.",
    );
    spy.mockRestore();
  });
});

describe("központi 401-kezelés (lejárt munkamenet)", () => {
  it("regisztrál egy 401-kezelőt az api rétegben", () => {
    // Enélkül a lejárt token csak hibaüzenetek sorozatát okozná, miközben a
    // felület továbbra is bejelentkezettnek mutatná a felhasználót.
    renderAuth();
    expect(api.setUnauthorizedHandler).toHaveBeenCalled();
    expect(typeof registeredUnauthorizedHandler()).toBe("function");
  });

  it("a kezelő meghívására eldobja a munkamenetet", async () => {
    seedSession();
    vi.mocked(api.me).mockResolvedValue(USER);
    renderAuth();
    await waitFor(() => expect(user()).toBe("felhasznalo"));

    // Ezt a valóságban egy tetszőleges API-hívás 401-es válasza váltja ki.
    act(() => registeredUnauthorizedHandler()());

    await waitFor(() => expect(user()).toBe("nincs"));
    expect(token()).toBe("nincs");
    expect(api.setAuthToken).toHaveBeenCalledWith(null);
  });

  it("a lejáratot megkülönbözteti a szándékos kijelentkezéstől", async () => {
    seedSession();
    vi.mocked(api.me).mockResolvedValue(USER);
    renderAuth();
    await waitFor(() => expect(user()).toBe("felhasznalo"));

    act(() => registeredUnauthorizedHandler()());
    await waitFor(() => expect(screen.getByTestId("expired").textContent).toBe("igen"));
  });

  it("a lejáratjelzés az újbóli bejelentkezéskor megszűnik", async () => {
    seedSession();
    vi.mocked(api.me).mockResolvedValue(USER);
    vi.mocked(api.login).mockResolvedValue({ user: USER, token: "uj-token" });
    renderAuth();
    await waitFor(() => expect(user()).toBe("felhasznalo"));

    act(() => registeredUnauthorizedHandler()());
    await waitFor(() => expect(screen.getByTestId("expired").textContent).toBe("igen"));

    click("login");
    await waitFor(() => expect(screen.getByTestId("expired").textContent).toBe("nem"));
  });
});
