// @vitest-environment jsdom
// A ProductList oldal (client/src/pages/ProductList.tsx) tesztjei.
//
// A szűrés és a lapozás állapota az URL query paramétereiben él, a tényleges
// munkát a szerver végzi. A kliens felelőssége tehát a HELYES query összeállítása
// és a lapozó gombok határainak betartása — ezt fedik ezek a tesztek.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "./dom-setup";
import type { ProductQuery, CustomerProduct, CustomerProductPage } from "../src/api";

vi.mock("../src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api")>();
  return { ...actual, getProducts: vi.fn() };
});

const addToCart = vi.fn();
vi.mock("../src/cart", () => ({ useCart: () => ({ add: addToCart }) }));

const api = await import("../src/api");
const { ProductList } = await import("../src/pages/ProductList");
const { CatalogProvider } = await import("../src/catalog");
const { CatalogFilter } = await import("../src/CatalogFilter");

function product(over: Partial<CustomerProduct> = {}): CustomerProduct {
  return {
    id: "p1",
    name: "Pamut póló",
    description: "Leírás",
    price: 4990,
    imageUrl: "https://example.com/a.png",
    stock: 10,
    category: "Ruházat",
    active: true,
    // A vásárlói terméklista minden eleme hozza az értékelési aggregátumokat.
    ratingAvg: 0,
    ratingCount: 0,
    // Az elérhető mennyiség: a foglalásokkal csökkentett készlet.
    available: 10,
    ...over,
  };
}

function page(over: Partial<CustomerProductPage> = {}): CustomerProductPage {
  return {
    items: [product(), product({ id: "p2", name: "Kulacs", category: "Kiegészítők" })],
    total: 2,
    page: 1,
    pageSize: 12,
    totalPages: 1,
    categories: ["Ruházat", "Kiegészítők"],
    ...over,
  };
}

// A szűrő az OLDALSÁVBAN él, a rács a tartalomoszlopban, de a kettő ugyanabból
// a CatalogProvider-ből dolgozik — a felhasználó is együtt látja őket, ezért a
// tesztek is együtt gyakorolják. (A provider `useMatch("/")`-csel dönti el,
// dolgozik-e egyáltalán; a MemoryRouter útvonala ezért mindig "/" alapú.)
const renderList = (entry = "/") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <CatalogProvider>
        <CatalogFilter />
        <ProductList />
      </CatalogProvider>
    </MemoryRouter>,
  );

/**
 * A getProducts utolsó hívásának query objektuma. A getProducts paramétere
 * opcionális (`params: ProductQuery = {}`), ezért a mock hívásban `undefined`
 * is lehet — a hívó oldalon ez a hiányzó paraméter és az üres query ugyanaz.
 */
function lastQuery(): ProductQuery {
  const calls = vi.mocked(api.getProducts).mock.calls;
  return calls[calls.length - 1][0] ?? {};
}

beforeEach(() => {
  addToCart.mockClear();
  vi.mocked(api.getProducts).mockReset();
  vi.mocked(api.getProducts).mockResolvedValue(page());
});

describe("ProductList - betöltés és hibakezelés", () => {
  it("betöltés közben jelzést mutat", () => {
    vi.mocked(api.getProducts).mockReturnValue(new Promise(() => {}));
    renderList();
    expect(screen.getByText("Termékek betöltése…")).toBeInTheDocument();
  });

  it("hiba esetén a szerver üzenetét mutatja", async () => {
    vi.mocked(api.getProducts).mockRejectedValue(new Error("Elromlott a szerver"));
    renderList();
    await waitFor(() =>
      expect(screen.getByText(/Elromlott a szerver/)).toBeInTheDocument(),
    );
  });

  it("megjeleníti a termékeket", async () => {
    renderList();
    expect(await screen.findByText("Pamut póló")).toBeInTheDocument();
    expect(screen.getByText("Kulacs")).toBeInTheDocument();
  });

  it("üres találatnál érthető üzenetet ad (nem üres képernyőt)", async () => {
    vi.mocked(api.getProducts).mockResolvedValue(
      page({ items: [], total: 0, totalPages: 1 }),
    );
    renderList();
    expect(await screen.findByText("Nincs a szűrőnek megfelelő termék.")).toBeInTheDocument();
  });

  it("a kártyán megjeleníti az értékelés átlagát és darabszámát", async () => {
    vi.mocked(api.getProducts).mockResolvedValue(
      page({ items: [product({ ratingAvg: 4.3, ratingCount: 12 })], total: 1 }),
    );
    renderList();
    // Magyar tizedesvessző, egy tizedesre — ahogy a szerver kerekít.
    expect(await screen.findByText(/4,3 \(12 értékelés\)/)).toBeInTheDocument();
  });

  it("értékelés nélküli terméknél nem 0 csillagot, hanem 'Nincs értékelés'-t ír", async () => {
    // A szerver 0/0-t ad vissza értékelés hiányában; ez nem a legrosszabb
    // értékelés, hanem a hiányzó értékelés állapota.
    renderList();
    expect(await screen.findAllByText("Nincs értékelés")).toHaveLength(2);
  });

  it("a Kosárba gomb a teljes terméket adja át a kosárnak", async () => {
    renderList();
    const buttons = await screen.findAllByRole("button", { name: "Kosárba" });
    fireEvent.click(buttons[0]);
    expect(addToCart).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });
});

describe("ProductList - URL paraméterek → query", () => {
  it("paraméter nélkül üres query-vel kér le", async () => {
    renderList("/");
    await waitFor(() => expect(api.getProducts).toHaveBeenCalled());
    expect(lastQuery()).toEqual({});
  });

  it("az URL szűrőit átveszi a szerverhívásba", async () => {
    renderList("/?category=Ruh%C3%A1zat&minPrice=1000&maxPrice=5000&search=p%C3%B3l%C3%B3&inStock=true");
    await waitFor(() => expect(api.getProducts).toHaveBeenCalled());
    expect(lastQuery()).toMatchObject({
      category: "Ruházat",
      minPrice: 1000,
      maxPrice: 5000,
      search: "póló",
      inStock: true,
    });
  });

  it("az 1. oldalt nem küldi el külön paraméterként (ez az alapértelmezés)", async () => {
    renderList("/?page=1");
    await waitFor(() => expect(api.getProducts).toHaveBeenCalled());
    expect(lastQuery().page).toBeUndefined();
  });

  it("az inStock csak a 'true' értéket veszi figyelembe", async () => {
    renderList("/?inStock=false");
    await waitFor(() => expect(api.getProducts).toHaveBeenCalled());
    expect(lastQuery().inStock).toBeUndefined();
  });
});

describe("ProductList - szűrők kezelése", () => {
  it("a kategóriaválasztás azonnal új lekérést indít", async () => {
    renderList();
    await screen.findByText("Pamut póló");

    fireEvent.change(screen.getByLabelText(/Kategória/), {
      target: { value: "Kiegészítők" },
    });
    await waitFor(() => expect(lastQuery().category).toBe("Kiegészítők"));
  });

  it("a 'Csak raktáron' jelölőnégyzet inStock szűrőt küld", async () => {
    renderList();
    await screen.findByText("Pamut póló");

    fireEvent.click(screen.getByLabelText(/Csak raktáron/));
    await waitFor(() => expect(lastQuery().inStock).toBe(true));
  });

  it("szűrőváltáskor visszaugrik az első oldalra", async () => {
    // Enélkül a 3. oldalon szűrve a felhasználó egy üres oldalon kötne ki.
    vi.mocked(api.getProducts).mockResolvedValue(
      page({ page: 3, total: 40, totalPages: 4 }),
    );
    renderList("/?page=3");
    await screen.findByText("Pamut póló");

    fireEvent.change(screen.getByLabelText(/Kategória/), {
      target: { value: "Ruházat" },
    });
    await waitFor(() => expect(lastQuery().category).toBe("Ruházat"));
    expect(lastQuery().page).toBeUndefined();
  });

  it("a keresőmezőt debounce-olja (nem indít kérést minden leütésre)", async () => {
    renderList();
    await screen.findByText("Pamut póló");
    const callsBefore = vi.mocked(api.getProducts).mock.calls.length;

    const input = screen.getByLabelText(/Keresés/);
    fireEvent.change(input, { target: { value: "p" } });
    fireEvent.change(input, { target: { value: "pó" } });
    fireEvent.change(input, { target: { value: "póló" } });

    // Közvetlenül a gépelés után még nem indult új kérés.
    expect(vi.mocked(api.getProducts).mock.calls.length).toBe(callsBefore);

    // A debounce lejárta után egyetlen kérés megy ki, a VÉGSŐ értékkel.
    await waitFor(() => expect(lastQuery().search).toBe("póló"), { timeout: 2000 });
    expect(vi.mocked(api.getProducts).mock.calls.length).toBe(callsBefore + 1);
  });

  it("a 'Szűrők törlése' minden szűrőt elenged", async () => {
    renderList("/?category=Ruh%C3%A1zat&search=p%C3%B3l%C3%B3");
    await screen.findByText("Pamut póló");

    fireEvent.click(screen.getByRole("button", { name: "Szűrők törlése" }));
    await waitFor(() => expect(lastQuery()).toEqual({}));
    expect(screen.getByLabelText(/Keresés/)).toHaveValue("");
  });
});

describe("ProductList - lapozás", () => {
  it("az első oldalon az Előző gomb tiltott", async () => {
    vi.mocked(api.getProducts).mockResolvedValue(page({ page: 1, total: 40, totalPages: 4 }));
    renderList();
    expect(await screen.findByRole("button", { name: "Előző" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Következő" })).toBeEnabled();
  });

  it("az utolsó oldalon a Következő gomb tiltott", async () => {
    vi.mocked(api.getProducts).mockResolvedValue(page({ page: 4, total: 40, totalPages: 4 }));
    renderList("/?page=4");
    expect(await screen.findByRole("button", { name: "Következő" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Előző" })).toBeEnabled();
  });

  it("a Következő gomb a rákövetkező oldalt kéri le", async () => {
    vi.mocked(api.getProducts).mockResolvedValue(page({ page: 2, total: 40, totalPages: 4 }));
    renderList("/?page=2");
    await screen.findByText("Pamut póló");

    fireEvent.click(screen.getByRole("button", { name: "Következő" }));
    await waitFor(() => expect(lastQuery().page).toBe(3));
  });

  it("megmutatja az oldalszámot és a találatok számát", async () => {
    vi.mocked(api.getProducts).mockResolvedValue(page({ page: 2, total: 40, totalPages: 4 }));
    renderList("/?page=2");
    expect(await screen.findByText(/2 \/ 4 oldal \(40 termék\)/)).toBeInTheDocument();
  });

  it("nulla találatnál nem jelenít meg lapozót", async () => {
    vi.mocked(api.getProducts).mockResolvedValue(page({ items: [], total: 0, totalPages: 1 }));
    renderList();
    await screen.findByText("Nincs a szűrőnek megfelelő termék.");
    expect(screen.queryByRole("button", { name: "Következő" })).not.toBeInTheDocument();
  });
});
