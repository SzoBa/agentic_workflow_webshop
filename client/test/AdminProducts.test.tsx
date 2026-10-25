// @vitest-environment jsdom
// Az AdminProducts oldal (client/src/pages/AdminProducts.tsx) tesztjei.
//
// Ez a projekt legnagyobb komponense (433 sor), és a legtöbb visszafordíthatatlan
// műveletet is ez tartalmazza (végleges törlés). A szerveroldali végpontjait az
// admin-products.test.ts fedi; itt a FELÜLET saját logikája a tárgy:
// az űrlap-szöveg → ProductInput átalakítás, a böngészőben futó képméret-
// ellenőrzés, a megerősítés-kérés és a hibák utáni állapotmegőrzés.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "./dom-setup";
import type { AdminProduct, AdminProductPage, Product } from "../src/api";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return {
    ...actual,
    getAdminProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    setProductActive: vi.fn(),
    deleteProduct: vi.fn(),
  };
});

const api = await import("../src/api");
const { AdminProducts } = await import("../src/pages/AdminProducts");

// --- Kép-stub -------------------------------------------------------------
// A jsdom nem tölt be képeket, a komponens viszont `new Image()`-dzsel méri a
// méretet. Ezért egy vezérelhető Image-et teszünk a globálisba: így a
// "jó kép" / "rossz méret" / "betöltési hiba" ágak mind kipróbálhatók.
let imageResult: { ok: boolean; width: number; height: number } = {
  ok: true,
  width: 400,
  height: 300,
};

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_value: string) {
    setTimeout(() => {
      if (imageResult.ok) {
        this.naturalWidth = imageResult.width;
        this.naturalHeight = imageResult.height;
        this.onload?.();
      } else {
        this.onerror?.();
      }
    }, 0);
  }
}

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Pamut póló",
    description: "Kényelmes póló.",
    price: 4990,
    imageUrl: "https://example.com/a.png",
    stock: 25,
    category: "Ruházat",
    active: true,
    ...over,
  };
}

/**
 * Az admin lista eleme: a fizikai készlet mellett a foglalt és az elérhető
 * mennyiséggel. Alapértelmezésben nincs foglalás.
 */
function adminProduct(over: Partial<AdminProduct> = {}): AdminProduct {
  const base = product(over);
  return {
    ...base,
    reserved: 0,
    available: base.stock,
    ...over,
  };
}

function page(over: Partial<AdminProductPage> = {}): AdminProductPage {
  return {
    items: [
      adminProduct(),
      adminProduct({ id: "p2", name: "Kulacs", active: false, stock: 0 }),
    ],
    total: 2,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    categories: ["Ruházat", "Kiegészítők"],
    ...over,
  };
}

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

/** A getAdminProducts utolsó hívásának query objektuma. */
function lastQuery() {
  const calls = vi.mocked(api.getAdminProducts).mock.calls;
  return calls[calls.length - 1][0] ?? {};
}

const renderPage = () => render(<AdminProducts />);
const button = (name: string | RegExp) => screen.getByRole("button", { name });

/** Megvárja az első betöltést (a "betöltés…" képernyő eltűnését). */
async function renderLoaded() {
  const result = renderPage();
  await screen.findByRole("heading", { name: "Termékek kezelése" });
  return result;
}

/** A megadott nevű termék sora. */
function rowOf(name: string) {
  return screen.getByRole("row", { name: new RegExp(name) });
}

/**
 * A szerkesztő űrlap. A lekérdezéseket ide KELL szűkíteni: a "Kategória"
 * felirat az űrlapon és a szűrő oldalsávban is szerepel, ezért a globális
 * screen.getByLabelText(/Kategória/) kétértelmű lenne.
 */
function formEl(): HTMLElement {
  const el = document.querySelector("form.form-stack");
  if (!el) throw new Error("Nincs nyitott szerkesztő űrlap.");
  return el as HTMLElement;
}

/** Az űrlap egy mezője, a szűrő oldalsáv azonos feliratú mezőitől elkülönítve. */
function field(label: RegExp) {
  return within(formEl()).getByLabelText(label);
}

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
  imageResult = { ok: true, width: 400, height: 300 };
  // A szerver a KÉRT lapszámot adja vissza (1..totalPages közé vágva). Ezt az
  // alapértelmezett mock is utánozza: egy fix `page`-et visszaadó mock
  // visszaírná a komponens állapotát, és végtelen oda-vissza kérést okozna.
  vi.mocked(api.getAdminProducts)
    .mockReset()
    .mockImplementation((q) => Promise.resolve(page({ page: q?.page ?? 1 })));
  vi.mocked(api.createProduct).mockReset().mockResolvedValue(product());
  vi.mocked(api.updateProduct).mockReset().mockResolvedValue(product());
  vi.mocked(api.setProductActive).mockReset().mockResolvedValue(product());
  vi.mocked(api.deleteProduct).mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminProducts - betöltés és lista", () => {
  it("betöltés közben jelzést mutat", () => {
    vi.mocked(api.getAdminProducts).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Termékek betöltése…")).toBeInTheDocument();
  });

  it("betöltési hibát megjelenít", async () => {
    vi.mocked(api.getAdminProducts).mockRejectedValue(new Error("Nincs jogosultság"));
    renderPage();
    expect(await screen.findByText(/Nincs jogosultság/)).toBeInTheDocument();
  });

  it("kilistázza a termékeket az adataikkal", async () => {
    await renderLoaded();
    const row = rowOf("Pamut póló");
    expect(within(row).getByText("Ruházat")).toBeInTheDocument();
    // A sor három készletadatot mutat: fizikai, foglalt, elérhető. Foglalás
    // nélkül a fizikai és az elérhető megegyezik — ezért kettő "25 db" van.
    expect(within(row).getAllByText("25 db")).toHaveLength(2);
    expect(within(row).getByText("0 db")).toBeInTheDocument();
  });

  it("a foglalt és az elérhető mennyiséget külön mutatja", async () => {
    // Enélkül az admin nem értené, miért utasít el a bolt egy rendelést olyan
    // termékre, amelyből a táblázat szerint van készlet.
    vi.mocked(api.getAdminProducts).mockResolvedValue(
      page({ items: [adminProduct({ stock: 10, reserved: 4, available: 6 })] }),
    );
    await renderLoaded();

    const row = rowOf("Pamut póló");
    expect(within(row).getByText("10 db")).toBeInTheDocument();
    expect(within(row).getByText("4 db")).toBeInTheDocument();
    expect(within(row).getByText("6 db")).toBeInTheDocument();
  });

  it("az INAKTÍV termékeket is megmutatja, jelölve", async () => {
    // Ez az admin lista lényege: a vásárlói végponttal szemben mindent lát.
    await renderLoaded();
    expect(within(rowOf("Pamut póló")).getByText("Aktív")).toBeInTheDocument();
    expect(within(rowOf("Kulacs")).getByText("Inaktív")).toBeInTheDocument();
  });

  it("üres listánál érthető üzenetet ad", async () => {
    vi.mocked(api.getAdminProducts).mockResolvedValue(page({ items: [], total: 0 }));
    await renderLoaded();
    expect(screen.getByText("Nincs megjeleníthető termék.")).toBeInTheDocument();
  });

  it("megmutatja a találatok számát", async () => {
    await renderLoaded();
    expect(screen.getByText("2 termék")).toBeInTheDocument();
  });
});

describe("AdminProducts - szűrés", () => {
  it("induláskor az összes állapotot kéri (status=all)", async () => {
    await renderLoaded();
    expect(lastQuery()).toMatchObject({ page: 1, status: "all" });
  });

  it("a keresés szövegét átadja a szervernek", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/Keresés/), { target: { value: "póló" } });
    await waitFor(() => expect(lastQuery().search).toBe("póló"));
  });

  it("a csak szóközből álló keresést nem küldi el", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/Keresés/), { target: { value: "   " } });
    await waitFor(() => expect(vi.mocked(api.getAdminProducts).mock.calls.length).toBeGreaterThan(1));
    expect(lastQuery().search).toBeUndefined();
  });

  it("az állapotszűrőt átadja", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/Állapot/), { target: { value: "inactive" } });
    await waitFor(() => expect(lastQuery().status).toBe("inactive"));
  });

  it("az ársávot számmá alakítva küldi, üresen viszont elhagyja", async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText(/Ár min\./), { target: { value: "1000" } });
    await waitFor(() => expect(lastQuery().minPrice).toBe(1000));

    fireEvent.change(screen.getByLabelText(/Ár min\./), { target: { value: "" } });
    await waitFor(() => expect(lastQuery().minPrice).toBeUndefined());
  });

  // A szabad szöveges mezők nem leütésenként mennek ki a hálózatra: a mező helyi
  // állapota azonnal követi a beírtakat, a KÉRÉS csak a gépelés szünetében indul.
  it("gépelés közben egyetlen kérést indít, a teljes kifejezéssel", async () => {
    await renderLoaded();
    const before = vi.mocked(api.getAdminProducts).mock.calls.length;
    const input = screen.getByLabelText(/Keresés/);

    // Szinkron leütések: garantáltan egy debounce-ablakon belül maradnak.
    fireEvent.change(input, { target: { value: "p" } });
    fireEvent.change(input, { target: { value: "pó" } });
    fireEvent.change(input, { target: { value: "pól" } });
    fireEvent.change(input, { target: { value: "póló" } });
    expect(input).toHaveValue("póló");

    await waitFor(() => expect(lastQuery().search).toBe("póló"));
    expect(vi.mocked(api.getAdminProducts).mock.calls.length).toBe(before + 1);
  });

  // A debounce a kérések SZÁMÁT csökkenti, a helyességet nem ő adja: két
  // egymást követő szűrés válasza fordított sorrendben is beérhet.
  it("az elavult válasz nem írja felül a frissebbet", async () => {
    await renderLoaded();
    const stale = deferred<AdminProductPage>();
    const fresh = deferred<AdminProductPage>();
    vi.mocked(api.getAdminProducts)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise);

    const select = screen.getByLabelText(/Állapot/);
    fireEvent.change(select, { target: { value: "inactive" } });
    await waitFor(() => expect(api.getAdminProducts).toHaveBeenCalledTimes(2));
    fireEvent.change(select, { target: { value: "active" } });
    await waitFor(() => expect(api.getAdminProducts).toHaveBeenCalledTimes(3));

    // A frissebb kérés ér be előbb, a régebbi utána — ez a sorrendcsere.
    fresh.resolve(page({ items: [adminProduct()], total: 1 }));
    expect(await screen.findByText("1 termék")).toBeInTheDocument();
    stale.resolve(page({ items: [adminProduct({ id: "p9", name: "Kulacs" })], total: 1 }));
    await act(async () => {
      await stale.promise;
    });

    expect(rowOf("Pamut póló")).toBeInTheDocument();
    expect(screen.queryByText("Kulacs")).not.toBeInTheDocument();
  });

  it("szűrőváltáskor visszaugrik az első oldalra", async () => {
    // Enélkül egy szűkítés után a felhasználó egy már nem létező oldalszámon
    // találná magát, és üres listát látna.
    vi.mocked(api.getAdminProducts).mockImplementation((q) =>
      Promise.resolve(page({ page: q?.page ?? 1, totalPages: 5, total: 60 })),
    );
    await renderLoaded();

    // Előbb ellapozunk a 2. oldalra...
    fireEvent.click(button(/Következő/));
    await waitFor(() => expect(lastQuery().page).toBe(2));

    // ...majd szűrünk: a lapszámnak vissza kell állnia 1-re.
    fireEvent.change(screen.getByLabelText(/Keresés/), { target: { value: "x" } });
    await waitFor(() => expect(lastQuery().search).toBe("x"));
    expect(lastQuery().page).toBe(1);
  });
});

describe("AdminProducts - lapozás", () => {
  it("az első oldalon az Előző tiltott", async () => {
    vi.mocked(api.getAdminProducts).mockResolvedValue(page({ page: 1, totalPages: 3 }));
    await renderLoaded();
    expect(button(/Előző/)).toBeDisabled();
    expect(button(/Következő/)).toBeEnabled();
  });

  it("az utolsó oldalon a Következő tiltott", async () => {
    vi.mocked(api.getAdminProducts).mockResolvedValue(page({ page: 3, totalPages: 3 }));
    await renderLoaded();
    await waitFor(() => expect(button(/Következő/)).toBeDisabled());
  });

  it("a szerver által visszavágott lapszámot átveszi", async () => {
    // A szerver 1..totalPages közé vág. Ha ezt nem vezetnénk vissza, az utolsó
    // oldal utolsó elemének törlése után a felület nem létező oldalt mutatna.
    vi.mocked(api.getAdminProducts).mockResolvedValue(page({ page: 2, totalPages: 2 }));
    await renderLoaded();
    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());
  });
});

describe("AdminProducts - űrlap megnyitása", () => {
  it("az '+ Új termék' üres űrlapot nyit", async () => {
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));

    expect(screen.getByRole("heading", { name: "Új termék" })).toBeInTheDocument();
    expect(field(/^Név/)).toHaveValue("");
    expect(field(/Ár \(Ft\)/)).toHaveValue(null);
    // Az új termék alapból aktív.
    expect(field(/Aktív/)).toBeChecked();
  });

  it("a Szerkesztés a termék adataival tölti fel az űrlapot", async () => {
    await renderLoaded();
    fireEvent.click(within(rowOf("Pamut póló")).getByRole("button", { name: "Szerkesztés" }));

    expect(screen.getByRole("heading", { name: "Termék szerkesztése" })).toBeInTheDocument();
    expect(field(/^Név/)).toHaveValue("Pamut póló");
    expect(field(/Ár \(Ft\)/)).toHaveValue(4990);
    expect(field(/Készlet/)).toHaveValue(25);
  });

  it("a Mégse bezárja az űrlapot", async () => {
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fireEvent.click(button("Mégse"));

    expect(screen.queryByRole("heading", { name: "Új termék" })).not.toBeInTheDocument();
    expect(button("+ Új termék")).toBeInTheDocument();
  });
});

/** Kitölti az űrlapot érvényes adatokkal. */
function fillForm(over: Partial<Record<string, string>> = {}) {
  fireEvent.change(field(/^Név/), { target: { value: over.name ?? "Új termék" } });
  fireEvent.change(field(/Leírás/), { target: { value: over.description ?? "Leírás" } });
  fireEvent.change(field(/Ár \(Ft\)/), { target: { value: over.price ?? "1500" } });
  fireEvent.change(field(/Készlet/), { target: { value: over.stock ?? "7" } });
  fireEvent.change(field(/Kategória/), { target: { value: over.category ?? "Otthon" } });
  fireEvent.change(field(/Kép URL/), {
    target: { value: over.imageUrl ?? "https://example.com/uj.png" },
  });
}

describe("AdminProducts - mentés", () => {
  it("új terméknél createProduct-ot hív, számmá alakított árral és készlettel", async () => {
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fillForm();
    fireEvent.click(button("Mentés"));

    await waitFor(() => expect(api.createProduct).toHaveBeenCalled());
    expect(vi.mocked(api.createProduct).mock.calls[0][0]).toEqual({
      name: "Új termék",
      description: "Leírás",
      price: 1500,
      stock: 7,
      category: "Otthon",
      imageUrl: "https://example.com/uj.png",
      active: true,
    });
  });

  it("az ÜRES készletből NaN lesz, hogy a szerver utasíthassa el (ne 0 legyen)", async () => {
    // A 0 érvényes készlet (elfogyott termék), a hiányzó viszont hiba. Ha az
    // üres mezőből 0 lenne, a hiányzó adat némán érvényes értékké alakulna.
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fillForm({ stock: "" });
    fireEvent.click(button("Mentés"));

    await waitFor(() => expect(api.createProduct).toHaveBeenCalled());
    expect(vi.mocked(api.createProduct).mock.calls[0][0].stock).toBeNaN();
  });

  it("szerkesztésnél updateProduct-ot hív a termék azonosítójával", async () => {
    await renderLoaded();
    fireEvent.click(within(rowOf("Pamut póló")).getByRole("button", { name: "Szerkesztés" }));
    fireEvent.change(field(/^Név/), { target: { value: "Átnevezve" } });
    fireEvent.click(button("Mentés"));

    await waitFor(() => expect(api.updateProduct).toHaveBeenCalled());
    const [id, input] = vi.mocked(api.updateProduct).mock.calls[0];
    expect(id).toBe("p1");
    expect(input.name).toBe("Átnevezve");
    expect(api.createProduct).not.toHaveBeenCalled();
  });

  it("sikeres mentés után bezárja az űrlapot és újratölti a listát", async () => {
    await renderLoaded();
    const callsBefore = vi.mocked(api.getAdminProducts).mock.calls.length;
    fireEvent.click(button("+ Új termék"));
    fillForm();
    fireEvent.click(button("Mentés"));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Új termék" })).not.toBeInTheDocument(),
    );
    expect(vi.mocked(api.getAdminProducts).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("mentés közben letiltja a gombot (dupla létrehozás ellen)", async () => {
    vi.mocked(api.createProduct).mockReturnValue(new Promise(() => {}));
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fillForm();
    fireEvent.click(button("Mentés"));

    await waitFor(() => expect(button("Mentés…")).toBeDisabled());
  });
});

describe("AdminProducts - képméret-ellenőrzés", () => {
  it("hibás méretnél nem ment, és megmondja a tényleges méretet", async () => {
    imageResult = { ok: true, width: 800, height: 600 };
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fillForm();
    fireEvent.click(button("Mentés"));

    expect(await screen.findByText(/A kép mérete 800\*600/)).toBeInTheDocument();
    expect(api.createProduct).not.toHaveBeenCalled();
  });

  it("betöltési hibánál MÁS üzenetet ad (más a teendő)", async () => {
    imageResult = { ok: false, width: 0, height: 0 };
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fillForm();
    fireEvent.click(button("Mentés"));

    expect(await screen.findByText(/A kép nem tölthető be/)).toBeInTheDocument();
    expect(api.createProduct).not.toHaveBeenCalled();
  });

  it("hibás kép után az űrlap megmarad, és javítás után menthető", async () => {
    imageResult = { ok: false, width: 0, height: 0 };
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fillForm();
    fireEvent.click(button("Mentés"));
    await screen.findByText(/A kép nem tölthető be/);

    // A beírt adatok nem vesztek el.
    expect(field(/^Név/)).toHaveValue("Új termék");

    imageResult = { ok: true, width: 400, height: 300 };
    fireEvent.click(button("Mentés"));
    await waitFor(() => expect(api.createProduct).toHaveBeenCalled());
  });

  it("pontosan 400*300 esetén ment", async () => {
    imageResult = { ok: true, width: 400, height: 300 };
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fillForm();
    fireEvent.click(button("Mentés"));
    await waitFor(() => expect(api.createProduct).toHaveBeenCalled());
  });
});

describe("AdminProducts - szerverhiba mentéskor", () => {
  it("megjeleníti a szerver validációs üzenetét", async () => {
    vi.mocked(api.createProduct).mockRejectedValue(
      new Error("A termék neve legfeljebb 50 karakter lehet."),
    );
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fillForm();
    fireEvent.click(button("Mentés"));

    expect(
      await screen.findByText(/A termék neve legfeljebb 50 karakter lehet/),
    ).toBeInTheDocument();
  });

  it("hiba után NEM dobja el a beírt adatokat", async () => {
    // Dokumentált szándék a komponensben: a szerverhibát csak megjelenítjük,
    // az űrlapállapotot nem írjuk felül — különben a felhasználó újrakezdhetné.
    vi.mocked(api.createProduct).mockRejectedValue(new Error("Hibás adat."));
    await renderLoaded();
    fireEvent.click(button("+ Új termék"));
    fillForm({ name: "Megőrzendő név", price: "2500" });
    fireEvent.click(button("Mentés"));
    await screen.findByText(/Hibás adat/);

    expect(field(/^Név/)).toHaveValue("Megőrzendő név");
    expect(field(/Ár \(Ft\)/)).toHaveValue(2500);
    // Az űrlap nyitva marad, hogy javítani lehessen.
    expect(screen.getByRole("heading", { name: "Új termék" })).toBeInTheDocument();
  });
});

describe("AdminProducts - aktiválás váltása", () => {
  it("aktív terméket inaktívra vált a dedikált végponton", async () => {
    // Nem a teljes terméket menti: így egy régebbi, szabálysértő adatú termék is
    // elrejthető anélkül, hogy előbb ki kellene javítani egy nem érintett mezőt.
    await renderLoaded();
    fireEvent.click(within(rowOf("Pamut póló")).getByRole("button", { name: "Inaktiválás" }));

    await waitFor(() => expect(api.setProductActive).toHaveBeenCalledWith("p1", false));
    expect(api.updateProduct).not.toHaveBeenCalled();
  });

  it("inaktív terméket aktívra vált", async () => {
    await renderLoaded();
    fireEvent.click(within(rowOf("Kulacs")).getByRole("button", { name: "Aktiválás" }));
    await waitFor(() => expect(api.setProductActive).toHaveBeenCalledWith("p2", true));
  });

  it("hibát megjelenít, és nem tölti újra a listát", async () => {
    vi.mocked(api.setProductActive).mockRejectedValue(new Error("Nem sikerült."));
    await renderLoaded();
    const callsBefore = vi.mocked(api.getAdminProducts).mock.calls.length;
    fireEvent.click(within(rowOf("Pamut póló")).getByRole("button", { name: "Inaktiválás" }));

    expect(await screen.findByText(/Nem sikerült/)).toBeInTheDocument();
    expect(vi.mocked(api.getAdminProducts).mock.calls.length).toBe(callsBefore);
  });
});

describe("AdminProducts - végleges törlés", () => {
  it("megerősítést kér, és a szövegben figyelmeztet a visszafordíthatatlanságra", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderLoaded();
    fireEvent.click(within(rowOf("Pamut póló")).getByRole("button", { name: "Törlés" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain("Pamut póló");
    expect(message).toContain("nem vonható vissza");
    // Felajánlja a nem romboló alternatívát is.
    expect(message).toContain("inaktívra");
    confirmSpy.mockRestore();
  });

  it("megerősítés után törli a terméket és újratölt", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderLoaded();
    const callsBefore = vi.mocked(api.getAdminProducts).mock.calls.length;
    fireEvent.click(within(rowOf("Pamut póló")).getByRole("button", { name: "Törlés" }));

    await waitFor(() => expect(api.deleteProduct).toHaveBeenCalledWith("p1"));
    await waitFor(() =>
      expect(vi.mocked(api.getAdminProducts).mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it("elutasított megerősítésnél NEM töröl", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderLoaded();
    fireEvent.click(within(rowOf("Pamut póló")).getByRole("button", { name: "Törlés" }));

    expect(api.deleteProduct).not.toHaveBeenCalled();
  });

  it("törlési hibát megjelenít", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.deleteProduct).mockRejectedValue(new Error("A termék nem található."));
    await renderLoaded();
    fireEvent.click(within(rowOf("Pamut póló")).getByRole("button", { name: "Törlés" }));

    expect(await screen.findByText(/A termék nem található/)).toBeInTheDocument();
  });
});
