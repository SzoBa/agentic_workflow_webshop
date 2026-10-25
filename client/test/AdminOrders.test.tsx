// @vitest-environment jsdom
// Az AdminOrders ("Rendelések kezelése") oldal tesztjei —
// client/src/pages/AdminOrders.tsx.
//
// Három szándék van itt, amit egy későbbi módosítással könnyű elrontani, ezért
// mindegyik külön tesztet kap:
//  1. A foglalás állapotát a MEGLÉVŐ ReservationStatus komponens jeleníti meg
//     minden soron — az oldal nem ágazik el a státuszra és nem számol saját
//     hátralévő időt.
//  2. Az érvényes státuszátmenetekről a SZERVER dönt: a kérés kimegy, és az
//     elutasítás magyar szövege VÁLTOZTATÁS NÉLKÜL jelenik meg.
//  3. A státuszcímkék az ORDER_STATUS_LABELS-ből jönnek, nem beégetett
//     szövegekből.
//  4. Az oldal állapotát mindig a LEGUTOLSÓ kérés írja, és egy státuszváltás
//     után nem marad bent olyan sor, ami az aktív szűrőbe már nem tartozik.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "./dom-setup";
import type { AdminOrder, AdminOrderPage, Order, User } from "../src/api";

// A hálózati réteget mockoljuk, a típusokat és a segédfüggvényeket
// (ORDER_STATUS_LABELS, formatPrice) az EREDETI modulból hagyjuk jönni: így a
// teszt a valódi magyar címkékre asszertál.
vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return {
    ...actual,
    getAdminOrders: vi.fn(),
    updateAdminOrderStatus: vi.fn(),
    // Az útvonal-tesztben a nem-admin látogató a főoldalra kerül, ami
    // terméklistát tölt — az se menjen ki a hálózatra.
    getProducts: vi.fn(),
  };
});

// Az App fejlécének és a RequireAdmin őrnek a contextjeit izoláljuk (ugyanaz a
// minta, mint a RequireAdmin.test.tsx-ben).
let currentUser: User | null = null;
vi.mock("../src/auth", () => ({
  useAuth: () => ({
    user: currentUser,
    token: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    sessionExpired: false,
    dismissSessionExpired: vi.fn(),
  }),
}));
vi.mock("../src/cart", () => ({
  useCart: () => ({
    items: [],
    count: 0,
    total: 0,
    add: vi.fn(),
    remove: vi.fn(),
    setQuantity: vi.fn(),
    clear: vi.fn(),
  }),
}));
// A héj felületi állapota (téma, kosárfiók) — itt nem tárgy, csak ki kell
// elégíteni az App és a ThemeToggle igényét.
vi.mock("../src/ui", () => ({
  useUi: () => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme: vi.fn(),
    cycleTheme: vi.fn(),
    cartOpen: false,
    openCart: vi.fn(),
    closeCart: vi.fn(),
  }),
}));

const api = await import("../src/api");
const { AdminOrders } = await import("../src/pages/AdminOrders");
const { App } = await import("../src/App");

/** ISO időbélyeg a jövőben — élő foglalás visszaszámlálójához. */
function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

function order(over: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: "o1",
    items: [{ productId: "p1", quantity: 2, name: "Bögre", unitPrice: 1500 }],
    customer: {
      name: "Kovács Anna",
      email: "anna@example.com",
      address: "Teszt utca 1",
    },
    total: 3000,
    createdAt: "2026-03-15T10:00:00.000Z",
    userId: "u1",
    status: "pending",
    username: "vasarlo1",
    ...over,
  };
}

// A reservedUntil KIZÁRÓLAG pending rendelésen érkezik a szervertől — a
// fixtúrák ezt a szerződést tükrözik.
const PENDING = order({
  id: "o-pending",
  status: "pending",
  reservedUntil: hoursFromNow(2),
});
const EXPIRED = order({
  id: "o-expired",
  status: "expired",
  customer: {
    name: "Nagy Béla",
    email: "bela@example.com",
    address: "Teszt utca 2",
  },
  username: "vasarlo2",
});
const DELIVERED = order({
  id: "o-delivered",
  status: "delivered",
  customer: {
    name: "Tóth Csaba",
    email: "csaba@example.com",
    address: "Teszt utca 3",
  },
  username: undefined, // törölt fiók: a szerver el sem küldi a mezőt
});

function pageOf(
  items: AdminOrder[],
  over: Partial<AdminOrderPage> = {},
): AdminOrderPage {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    ...over,
  };
}

/** A megadott azonosítójú rendelés sora. */
const rowOf = (id: string) => screen.getByRole("row", { name: new RegExp(id) });

/**
 * Kívülről feloldható ígéret. A válaszok SORRENDJÉT csak így lehet a teszt
 * kezébe adni: a mock magától mindig a hívás sorrendjében oldódna fel, márpedig
 * épp az ellenkezője a vizsgált eset.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function renderLoaded() {
  const result = render(<AdminOrders />);
  await screen.findByRole("heading", { name: "Rendelések kezelése" });
  return result;
}

beforeEach(() => {
  currentUser = null;
  vi.mocked(api.getAdminOrders)
    .mockReset()
    .mockResolvedValue(pageOf([PENDING, EXPIRED, DELIVERED]));
  vi.mocked(api.updateAdminOrderStatus).mockReset();
  vi.mocked(api.getProducts).mockReset().mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 12,
    totalPages: 1,
    categories: [],
  });
});

describe("AdminOrders - betöltés és lista", () => {
  it("betöltés közben jelzést mutat", () => {
    vi.mocked(api.getAdminOrders).mockReturnValue(new Promise(() => {}));
    render(<AdminOrders />);
    expect(screen.getByText("Rendelések betöltése…")).toBeInTheDocument();
  });

  it("betöltéskor lekéri a listát", async () => {
    await renderLoaded();
    expect(api.getAdminOrders).toHaveBeenCalled();
  });

  it("betöltési hibát megjelenít", async () => {
    vi.mocked(api.getAdminOrders).mockRejectedValue(
      new Error("Ehhez adminisztrátori jogosultság szükséges."),
    );
    render(<AdminOrders />);
    expect(
      await screen.findByText(/adminisztrátori jogosultság szükséges/),
    ).toBeInTheDocument();
  });

  it("soronként megjeleníti az azonosítót, a dátumot, a vevőt, a tételeket és a végösszeget", async () => {
    await renderLoaded();
    const row = rowOf("o-pending");
    expect(within(row).getByText("o-pending")).toBeInTheDocument();
    expect(within(row).getByText(/2026/)).toBeInTheDocument();
    expect(within(row).getByText("Kovács Anna")).toBeInTheDocument();
    expect(within(row).getByText("anna@example.com")).toBeInTheDocument();
    expect(within(row).getByText("vasarlo1")).toBeInTheDocument();
    expect(within(row).getByText(/Bögre × 2 db/)).toBeInTheDocument();
    expect(within(row).getByText(/3\s?000/)).toBeInTheDocument();
  });

  // A keresés a vevő e-mailjére is illeszkedik, ezért a találati sornak meg kell
  // mutatnia, MI egyezett — enélkül az admin egy magyarázat nélküli sort kap.
  it("a leadáskori e-mailt is mutatja, törölt fióknál is", async () => {
    await renderLoaded();
    expect(
      within(rowOf("o-delivered")).getByText("csaba@example.com"),
    ).toBeInTheDocument();
  });

  it("a státuszcímkéket az ORDER_STATUS_LABELS-ből veszi", async () => {
    await renderLoaded();
    expect(
      within(rowOf("o-pending")).getByText(api.ORDER_STATUS_LABELS.pending),
    ).toBeInTheDocument();
    expect(
      within(rowOf("o-expired")).getByText(api.ORDER_STATUS_LABELS.expired),
    ).toBeInTheDocument();
    expect(
      within(rowOf("o-delivered")).getByText(api.ORDER_STATUS_LABELS.delivered),
    ).toBeInTheDocument();
  });

  it("törölt fióknál nem mutat felhasználónevet (a mező hiányzik a válaszból)", async () => {
    await renderLoaded();
    const row = rowOf("o-delivered");
    expect(within(row).getByText("Tóth Csaba")).toBeInTheDocument();
    expect(row.querySelector(".admin-order-username")).toBeNull();
  });

  it("üres találathalmaznál kiírja, hogy nincs megjeleníthető rendelés", async () => {
    vi.mocked(api.getAdminOrders).mockResolvedValue(pageOf([]));
    await renderLoaded();
    expect(screen.getByText("Nincs megjeleníthető rendelés.")).toBeInTheDocument();
  });
});

describe("AdminOrders - foglalás állapota", () => {
  // A megjelenítés a ReservationStatus komponensé; az oldal minden sorra
  // ugyanazt rendereli, és nem ismétli meg a státusz szerinti elágazást.
  it("a pending soron visszaszámlálót mutat", async () => {
    await renderLoaded();
    expect(
      within(rowOf("o-pending")).getByText(/A foglalás még .+ érvényes\./),
    ).toBeInTheDocument();
  });

  it("az expired soron a lejárat magyarázatát mutatja", async () => {
    await renderLoaded();
    expect(
      within(rowOf("o-expired")).getByText(/A foglalás lejárt/),
    ).toBeInTheDocument();
  });

  it("a delivered soron nem mutat foglalás-információt", async () => {
    await renderLoaded();
    expect(
      within(rowOf("o-delivered")).queryByText(/foglalás/i),
    ).not.toBeInTheDocument();
  });
});

describe("AdminOrders - szűrés és lapozás", () => {
  it("a státusz-választó a getAdminOrders status paraméterére képződik le", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/Státusz/), {
      target: { value: "pending" },
    });

    await waitFor(() => {
      const calls = vi.mocked(api.getAdminOrders).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ status: "pending" });
    });
  });

  it("a kereső mező a search paraméterére képződik le", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/Keresés/), {
      target: { value: "anna@example.com" },
    });

    await waitFor(() => {
      const calls = vi.mocked(api.getAdminOrders).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({
        search: "anna@example.com",
      });
    });
  });

  // A gépelés nem leütésenként megy ki a hálózatra: a mező helyi állapota
  // azonnal követi a beírtakat, a KÉRÉS viszont csak a gépelés szünetében indul.
  it("gépelés közben egyetlen kérést indít, a teljes kifejezéssel", async () => {
    await renderLoaded();
    const before = vi.mocked(api.getAdminOrders).mock.calls.length;
    const input = screen.getByLabelText(/Keresés/);

    // Szinkron leütések: garantáltan egy debounce-ablakon belül maradnak.
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "an" } });
    fireEvent.change(input, { target: { value: "ann" } });
    fireEvent.change(input, { target: { value: "anna" } });
    expect(input).toHaveValue("anna");

    await waitFor(() => {
      const calls = vi.mocked(api.getAdminOrders).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ search: "anna" });
    });
    expect(vi.mocked(api.getAdminOrders).mock.calls.length).toBe(before + 1);
  });

  // A debounce a kérések SZÁMÁT csökkenti, a helyességet nem ő adja: két
  // egymást követő szűrés válasza fordított sorrendben is beérhet.
  it("az elavult válasz nem írja felül a frissebbet", async () => {
    await renderLoaded();
    const stale = deferred<AdminOrderPage>();
    const fresh = deferred<AdminOrderPage>();
    vi.mocked(api.getAdminOrders)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise);

    const select = screen.getByLabelText(/Státusz/);
    fireEvent.change(select, { target: { value: "pending" } });
    await waitFor(() => expect(api.getAdminOrders).toHaveBeenCalledTimes(2));
    fireEvent.change(select, { target: { value: "expired" } });
    await waitFor(() => expect(api.getAdminOrders).toHaveBeenCalledTimes(3));

    // A frissebb kérés ér be előbb, a régebbi csak utána — ez a sorrendcsere.
    fresh.resolve(pageOf([EXPIRED]));
    expect(await screen.findByText("o-expired")).toBeInTheDocument();
    stale.resolve(pageOf([PENDING]));
    await act(async () => {
      await stale.promise;
    });

    expect(screen.getByText("o-expired")).toBeInTheDocument();
    expect(screen.queryByText("o-pending")).not.toBeInTheDocument();
  });

  // A szerver 1..totalPages közé vágja a lapszámot, és a felület ezt visszavezeti
  // az állapotba. A megfigyelhető szerződés: egy lapozás = EGY kérés, a
  // visszavezetés nem indít újabb kört.
  it("egy lapozás egyetlen kérést indít", async () => {
    // A szerver visszaadja, amit kértek — nincs mit vágni.
    vi.mocked(api.getAdminOrders).mockImplementation((q = {}) =>
      Promise.resolve(
        pageOf([PENDING], { total: 30, totalPages: 2, page: q.page ?? 1 }),
      ),
    );
    await renderLoaded();
    const before = vi.mocked(api.getAdminOrders).mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Következő/ }));
    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());

    // Ha a második kérés is elindulna, addigra a számláló már megnőtt volna.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(vi.mocked(api.getAdminOrders).mock.calls.length).toBe(before + 1);
  });

  it("a szerver által VÁGOTT lapszámot átveszi a lapozó", async () => {
    // Az utolsó lap utolsó sorának eltűnése után a kliens még a 2. lapot kérné;
    // a szerver az 1.-et adja vissza, és a felület ezt mutatja.
    vi.mocked(api.getAdminOrders).mockResolvedValue(
      pageOf([PENDING], { total: 30, totalPages: 2, page: 1 }),
    );
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Következő/ }));

    await waitFor(() => expect(screen.getByText("1 / 2")).toBeInTheDocument());
  });

  it("egyetlen lapnál nincs lapozó", async () => {
    await renderLoaded();
    expect(
      screen.queryByRole("button", { name: /Következő/ }),
    ).not.toBeInTheDocument();
  });

  it("több lapnál lapozóval a következő lapot kéri le", async () => {
    vi.mocked(api.getAdminOrders).mockResolvedValue(
      pageOf([PENDING], { total: 30, totalPages: 2 }),
    );
    await renderLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Következő/ }));

    await waitFor(() => {
      const calls = vi.mocked(api.getAdminOrders).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ page: 2 });
    });
  });
});

describe("AdminOrders - státuszváltás", () => {
  // A kiszállított rendelésre adott PATCH válasz: `reservedUntil` nélkül (a
  // szerver csak pending-en küldi) és `username` nélkül (az az admin lista
  // kényelmi mezője, a PATCH nem adja vissza).
  const deliveredResponse: Order = {
    id: PENDING.id,
    items: PENDING.items,
    customer: PENDING.customer,
    total: PENDING.total,
    createdAt: PENDING.createdAt,
    userId: PENDING.userId,
    status: "delivered",
  };

  it("a vezérlő a PATCH végpontot hívja a rendelés azonosítójával", async () => {
    vi.mocked(api.updateAdminOrderStatus).mockResolvedValue(deliveredResponse);
    const u = userEvent.setup();
    await renderLoaded();
    await u.click(
      within(rowOf("o-pending")).getByRole("button", {
        name: "Kiszállítottá tétel",
      }),
    );

    await waitFor(() =>
      expect(api.updateAdminOrderStatus).toHaveBeenCalledWith(
        "o-pending",
        "delivered",
      ),
    );
  });

  it("sikeres váltás után frissül a sor", async () => {
    vi.mocked(api.updateAdminOrderStatus).mockResolvedValue(deliveredResponse);
    const u = userEvent.setup();
    await renderLoaded();
    await u.click(
      within(rowOf("o-pending")).getByRole("button", {
        name: "Kiszállítottá tétel",
      }),
    );

    await waitFor(() =>
      expect(
        within(rowOf("o-pending")).getByText(
          api.ORDER_STATUS_LABELS.delivered,
        ),
      ).toBeInTheDocument(),
    );
    const row = rowOf("o-pending");
    // A visszaszámláló eltűnik: a szerver válaszában már nincs reservedUntil.
    expect(within(row).queryByText(/A foglalás még/)).not.toBeInTheDocument();
    // A felhasználónév megmarad, pedig a PATCH válasza nem tartalmazza.
    expect(within(row).getByText("vasarlo1")).toBeInTheDocument();
  });

  // A helyben javítás CSAK addig helyes, amíg a váltás nem dönti el újra, hogy a
  // sor beletartozik-e a listába. Aktív szűrőnél eldönti — ilyenkor a lapot (és
  // vele a darabszámot) a szervernek kell újra összeraknia.
  it("aktív státusz-szűrőnél a váltás után újratölti a lapot", async () => {
    vi.mocked(api.getAdminOrders).mockResolvedValue(pageOf([PENDING]));
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/Státusz/), {
      target: { value: "pending" },
    });
    await waitFor(() => {
      const calls = vi.mocked(api.getAdminOrders).mock.calls;
      expect(calls[calls.length - 1][0]).toMatchObject({ status: "pending" });
    });

    vi.mocked(api.updateAdminOrderStatus).mockResolvedValue(deliveredResponse);
    // A váltás után a rendelés már nem `pending`, tehát a szűrt lapon nincs helye.
    vi.mocked(api.getAdminOrders).mockResolvedValue(
      pageOf([], { total: 0, totalPages: 1 }),
    );
    const u = userEvent.setup();
    await u.click(
      within(rowOf("o-pending")).getByRole("button", {
        name: "Kiszállítottá tétel",
      }),
    );

    expect(
      await screen.findByText("Nincs megjeleníthető rendelés."),
    ).toBeInTheDocument();
    expect(screen.queryByText("o-pending")).not.toBeInTheDocument();
    expect(screen.getByText("0 rendelés")).toBeInTheDocument();
  });

  it("a szerver elutasítását VÁLTOZTATÁS NÉLKÜL jeleníti meg", async () => {
    // Szó szerinti üzenet a hibakatalógusból (409, delivered-re váltás
    // fedezethiánnyal). A felület nem fogalmazza újra és nem tompítja.
    const serverMessage =
      "A(z) Bögre termékből nincs elegendő készlet a rendelés teljesítéséhez (elérhető: 0 db).";
    vi.mocked(api.updateAdminOrderStatus).mockRejectedValue(
      new Error(serverMessage),
    );
    const u = userEvent.setup();
    await renderLoaded();
    await u.click(
      within(rowOf("o-pending")).getByRole("button", {
        name: "Kiszállítottá tétel",
      }),
    );

    expect(await screen.findByText(serverMessage)).toBeInTheDocument();
    // A sor státusza változatlan marad — a döntés a szerveré.
    expect(
      within(rowOf("o-pending")).getByText(api.ORDER_STATUS_LABELS.pending),
    ).toBeInTheDocument();
  });

  // AR-20: a `delivered` VÉGÁLLAPOT, ezért ott nincs mit felkínálni.
  //
  // Ez a viselkedés 2026-07-31-én változott meg. Korábban a gomb minden soron
  // látszott, és az itteni teszt azt mérte, hogy a kérés a `delivered` sorról is
  // kimegy — egy 409-es elutasítást mockolva. Az a mock a szerver viselkedését
  // TÉVESEN írta le: az `OrderTransitions` engedi a `delivered → delivered`
  // átmenetet, és az `OrderService` idempotenssé teszi (K-36), tehát a valódi
  // szerver 200-zal felelt, nem 409-cel. A gomb így cselekvőképesnek látszott,
  // miközben semmit nem változtatott.
  it("a kiszállított soron NINCS státuszváltó gomb (végállapot)", async () => {
    await renderLoaded();

    expect(
      within(rowOf("o-delivered")).queryByRole("button", {
        name: "Kiszállítottá tétel",
      }),
    ).not.toBeInTheDocument();
  });

  it("a nem végállapotú sorokon MEGJELENIK a státuszváltó gomb", async () => {
    await renderLoaded();

    expect(
      within(rowOf("o-pending")).getByRole("button", {
        name: "Kiszállítottá tétel",
      }),
    ).toBeInTheDocument();
    expect(
      within(rowOf("o-expired")).getByRole("button", {
        name: "Kiszállítottá tétel",
      }),
    ).toBeInTheDocument();
  });
});

// A képernyő kiválasztói (szerep + akadálymentes név, címkék, szövegek)
// SZERZŐDÉSNEK számítanak: a böngészős elfogadási tesztek ugyanezekre az
// alakokra keresnek, és nem látják ezt a kódot. Egy csendben átírt felirat ott
// bukna ki, tesztelési hibaként — ezért mindegyik itt is meg van fogva.
describe("AdminOrders - kiválasztói szerződés", () => {
  it("szűrés utáni újratöltés közben „Frissítés…” jelzést mutat", async () => {
    await renderLoaded();
    vi.mocked(api.getAdminOrders).mockReturnValue(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText("Státusz"), {
      target: { value: "pending" },
    });

    expect(await screen.findByText("Frissítés…")).toBeInTheDocument();
    // A szűrők a frissítés alatt is a DOM-ban maradnak: a teljes oldal
    // lecserélése elvenné a fókuszt a keresőmezőről.
    expect(
      screen.getByLabelText("Keresés (vevő neve, email, rendelésazonosító)"),
    ).toBeInTheDocument();
  });

  it("a találatszámot „N rendelés” alakban írja ki", async () => {
    await renderLoaded();
    expect(screen.getByText(/^\d+ rendelés$/)).toHaveTextContent("3 rendelés");
  });

  it("a státusz-választó opciói: Összes (all) és a három magyar címke", async () => {
    await renderLoaded();
    const select = screen.getByLabelText("Státusz");
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Összes",
      api.ORDER_STATUS_LABELS.pending,
      api.ORDER_STATUS_LABELS.expired,
      api.ORDER_STATUS_LABELS.delivered,
    ]);
    expect((options[0] as HTMLOptionElement).value).toBe("all");
  });

  it("több lapnál az „← Előző” / „Következő →” gomb és a lapjelző látszik", async () => {
    vi.mocked(api.getAdminOrders).mockResolvedValue(
      pageOf([PENDING], { total: 30, totalPages: 2 }),
    );
    await renderLoaded();

    expect(screen.getByRole("button", { name: "← Előző" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Következő →" })).toBeEnabled();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("a nem végállapotú sorokon „Kiszállítottá tétel” gomb van, mentés közben „Mentés…”", async () => {
    let finish: (o: Order) => void = () => {};
    vi.mocked(api.updateAdminOrderStatus).mockReturnValue(
      new Promise<Order>((resolve) => {
        finish = resolve;
      }),
    );
    const u = userEvent.setup();
    await renderLoaded();

    // Az érvényes átmenetről a SZERVER dönt, a kliens nem másolja le az
    // átmenettáblát — egyetlen kivétel a `delivered` végállapot, ahol nincs mit
    // felkínálni (AR-20), ezért az a sor itt nem szerepel.
    for (const id of ["o-pending", "o-expired"]) {
      expect(
        within(rowOf(id)).getByRole("button", { name: "Kiszállítottá tétel" }),
      ).toBeInTheDocument();
    }

    await u.click(
      within(rowOf("o-pending")).getByRole("button", {
        name: "Kiszállítottá tétel",
      }),
    );
    expect(
      await within(rowOf("o-pending")).findByRole("button", {
        name: "Mentés…",
      }),
    ).toBeInTheDocument();

    // A sort a szerver válaszából építjük újra, az pedig `delivered`-et hoz:
    // a sor végállapotba kerül, tehát a „Mentés…” nem a „Kiszállítottá tétel”
    // feliratra vált vissza, hanem a gomb egészen eltűnik (AR-20).
    finish({ ...PENDING, status: "delivered", reservedUntil: undefined });
    await waitFor(() =>
      expect(
        within(rowOf("o-pending")).queryByRole("button", { name: "Mentés…" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(rowOf("o-pending")).queryByRole("button", {
        name: "Kiszállítottá tétel",
      }),
    ).not.toBeInTheDocument();
  });
});

describe("AdminOrders - útvonal és menü", () => {
  function renderApp(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
  }

  it("adminként a /admin/orders útvonalon megnyílik az oldal", async () => {
    currentUser = {
      id: "u2",
      username: "adminisztrator",
      email: "admin@example.com",
      address: "Cím",
      role: "admin",
    };
    renderApp("/admin/orders");
    expect(
      await screen.findByRole("heading", { name: "Rendelések kezelése" }),
    ).toBeInTheDocument();
  });

  it("adminként megjelenik a fejlécben a Rendelések menüpont", async () => {
    currentUser = {
      id: "u2",
      username: "adminisztrator",
      email: "admin@example.com",
      address: "Cím",
      role: "admin",
    };
    renderApp("/admin/orders");
    const link = await screen.findByRole("link", { name: "Rendelések" });
    expect(link).toHaveAttribute("href", "/admin/orders");
  });

  it("nem-admin felhasználónak nincs Rendelések menüpont, és az oldal sem nyílik meg", async () => {
    currentUser = {
      id: "u1",
      username: "vasarlo1",
      email: "vasarlo@example.com",
      address: "Cím",
      role: "customer",
    };
    renderApp("/admin/orders");

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Rendelések kezelése" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: "Rendelések" }),
    ).not.toBeInTheDocument();
    // A RequireAdmin őr a főoldalra terel — az admin lista le sem töltődik.
    expect(api.getAdminOrders).not.toHaveBeenCalled();
  });
});
