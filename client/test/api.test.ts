// A kliens api-réteg unit tesztjei. A globális fetch-et mockoljuk, így nincs
// szükség valós backendre.
//
// Megjegyzés a lefedettség határáról: a 9 oldalkomponens (client/src/pages/)
// tesztelése jsdom + @testing-library/react függőségeket igényelne, amiket a
// projekt szabálya szerint nem veszünk fel kérdezés nélkül. Ezért a kliens
// oldali lefedettség az api.ts rétegre koncentrál — ez tartalmazza a
// szerződéses logikát (query string építés, hibakezelés, token-továbbítás).
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  changePassword,
  createOrder,
  createProduct,
  deleteAdminUser,
  formatPrice,
  getAdminOrders,
  getAdminProducts,
  getOrders,
  getProduct,
  getProducts,
  login,
  logout,
  me,
  register,
  setAuthToken,
  setProductActive,
  setUnauthorizedHandler,
  updateAdminOrderStatus,
  updateProfile,
} from "../src/api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Az authToken modulszintű állapot: nullázás nélkül átszivárogna a
  // következő tesztre, és sorrendfüggő találatokat okozna.
  setAuthToken(null);
  setUnauthorizedHandler(null);
});

/** Sikeres JSON választ adó fetch-mock; visszaadja a mock függvényt. */
function mockFetch(payload: unknown = {}) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => payload } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Hibás választ adó fetch-mock. */
function mockFetchError(status: number, body: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: false, status, json: async () => body } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Az első fetch-hívás init objektuma. */
function initOf(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls[0][1] as RequestInit;
}

/** Az első fetch-hívás fejlécei. */
function headersOf(fetchMock: ReturnType<typeof vi.fn>) {
  return initOf(fetchMock).headers as Record<string, string>;
}

describe("formatPrice", () => {
  it("forint formátumban, tizedes nélkül jeleníti meg az árat", () => {
    // A hu-HU formátum nem törő / keskeny szóközöket használ ezredhatárolóként;
    // ezeket normál szóközre cseréljük az összehasonlításhoz.
    const s = formatPrice(4990).replace(/ | /g, " ");
    expect(s).toContain("4");
    expect(s).toContain("990");
    expect(s).toContain("Ft");
    expect(s).not.toContain(","); // nincs tizedesjegy
  });

  it("a nullát és a nagy összeget is tizedes nélkül formázza", () => {
    expect(formatPrice(0)).toContain("0");
    const big = formatPrice(1234567).replace(/ | /g, " ");
    expect(big).toContain("1");
    expect(big).toContain("567");
    expect(big).not.toContain(",");
  });
});

describe("handle() - közös hibakezelés", () => {
  it("a szerver hibaüzenetét dobja, ha a válasz nem ok", async () => {
    mockFetchError(500, { error: "Elromlott a szerver" });
    await expect(getProducts()).rejects.toThrow("Elromlott a szerver");
  });

  it("általános hibaüzenetet dob, ha a body-ban nincs error mező", async () => {
    mockFetchError(503, {});
    await expect(getProducts()).rejects.toThrow("Kérés sikertelen (503)");
  });

  it("nem JSON hibaválasznál sem dob parse hibát, hanem a státuszt adja", async () => {
    // Pl. egy proxy HTML hibaoldala: a res.json() elhasalna — ezért van .catch.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      } as unknown as Response),
    );
    await expect(getProducts()).rejects.toThrow("Kérés sikertelen (502)");
  });
});

describe("getProducts - query string építés", () => {
  it("paraméterek nélkül a csupasz végpontot hívja", async () => {
    const fetchMock = mockFetch({ items: [], total: 0 });
    await getProducts();
    expect(fetchMock).toHaveBeenCalledWith("/api/products");
  });

  it("a lapozott envelope-ot adja vissza", async () => {
    const page = {
      items: [{ id: "p1", name: "Teszt", price: 100 }],
      total: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
      categories: ["Ruházat"],
    };
    mockFetch(page);
    await expect(getProducts()).resolves.toEqual(page);
  });

  it("minden megadott szűrőt átad", async () => {
    const fetchMock = mockFetch({ items: [] });
    await getProducts({
      page: 2,
      pageSize: 24,
      category: "Ruházat",
      minPrice: 1000,
      maxPrice: 5000,
      search: "póló",
      inStock: true,
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string, "http://x");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "24",
      category: "Ruházat",
      minPrice: "1000",
      maxPrice: "5000",
      search: "póló",
      inStock: "true",
    });
  });

  it("a meg nem adott szűrőket elhagyja, a 0 értékűeket viszont átadja", async () => {
    const fetchMock = mockFetch({ items: [] });
    // A minPrice: 0 értékes szűrő — a `!== undefined` vizsgálat miatt átmegy,
    // szemben a hamis értéket is elnyelő `if (params.x)` mintával.
    await getProducts({ minPrice: 0, page: 1 });
    const url = new URL(fetchMock.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.get("minPrice")).toBe("0");
    expect(url.searchParams.get("category")).toBeNull();
    expect(url.searchParams.get("inStock")).toBeNull();
  });

  it("az inStock=false-t nem küldi el (nem szűkít)", async () => {
    const fetchMock = mockFetch({ items: [] });
    await getProducts({ inStock: false });
    expect(fetchMock).toHaveBeenCalledWith("/api/products");
  });

  it("URL-kódolja a speciális karaktereket a keresésben", async () => {
    const fetchMock = mockFetch({ items: [] });
    await getProducts({ search: "a&b=c" });
    const raw = fetchMock.mock.calls[0][0] as string;
    // Kódolás nélkül az "&" új query paramétert nyitna.
    expect(raw).toContain("search=a%26b%3Dc");
    const url = new URL(raw, "http://x");
    expect(url.searchParams.get("search")).toBe("a&b=c");
  });
});

describe("getProduct", () => {
  it("az azonosítót az útvonalba teszi", async () => {
    const fetchMock = mockFetch({ id: "p1" });
    await getProduct("p1");
    expect(fetchMock).toHaveBeenCalledWith("/api/products/p1");
  });
});

describe("token-továbbítás (authHeaders)", () => {
  it("token nélkül NEM küld Authorization fejlécet", async () => {
    const fetchMock = mockFetch({});
    await me();
    expect(headersOf(fetchMock).Authorization).toBeUndefined();
  });

  it("beállított token esetén Bearer fejlécet küld", async () => {
    setAuthToken("abc123");
    const fetchMock = mockFetch({ id: "u1" });
    await me();
    expect(headersOf(fetchMock).Authorization).toBe("Bearer abc123");
  });

  it("a kijelentkezés (null token) után már nem küld fejlécet", async () => {
    setAuthToken("abc123");
    setAuthToken(null);
    const fetchMock = mockFetch({});
    await getOrders();
    expect(headersOf(fetchMock).Authorization).toBeUndefined();
  });

  it("a body nélküli hívások nem küldenek Content-Type-ot", async () => {
    setAuthToken("abc123");
    const fetchMock = mockFetch({ ok: true });
    await logout();
    const headers = headersOf(fetchMock);
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers.Authorization).toBe("Bearer abc123");
  });

  it("a body-val járó hívások JSON Content-Type-ot küldenek", async () => {
    const fetchMock = mockFetch({ user: {}, token: "t" });
    await login("felhasznalo", "jelszo123");
    expect(headersOf(fetchMock)["Content-Type"]).toBe("application/json");
  });
});

describe("createOrder", () => {
  it("elküldi az expectedTotal-t, hogy a szerver ütköztethesse az árat", async () => {
    setAuthToken("t");
    const fetchMock = mockFetch({ id: "o1" });
    const items = [{ productId: "p1", quantity: 2 }];
    const customer = { name: "Vevő", email: "v@example.com", address: "Cím" };

    await createOrder(items, customer, 9980);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/orders");
    const init = initOf(fetchMock);
    expect(init.method).toBe("POST");
    // Az expectedTotal hiánya csendben visszaadná a régi, ellenőrzés nélküli
    // viselkedést — ezért ez explicit szerződés.
    expect(JSON.parse(init.body as string)).toEqual({ items, customer, expectedTotal: 9980 });
  });
});

describe("admin végpontok", () => {
  it("a getAdminProducts az admin útvonalat hívja, tokennel", async () => {
    setAuthToken("admin-token");
    const fetchMock = mockFetch({ items: [] });
    await getAdminProducts();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/products");
    expect(headersOf(fetchMock).Authorization).toBe("Bearer admin-token");
  });

  it('a status="all" szűrőt nem küldi el (ez az alapértelmezés)', async () => {
    const fetchMock = mockFetch({ items: [] });
    await getAdminProducts({ status: "all" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/products");
  });

  it("a konkrét status szűrőt elküldi", async () => {
    const fetchMock = mockFetch({ items: [] });
    await getAdminProducts({ status: "inactive" });
    const url = new URL(fetchMock.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.get("status")).toBe("inactive");
  });

  it("a setProductActive PATCH-el, és csak az active mezőt küldi", async () => {
    const fetchMock = mockFetch({ id: "p1", active: false });
    await setProductActive("p1", false);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/products/p1/active");
    const init = initOf(fetchMock);
    expect(init.method).toBe("PATCH");
    // Kizárólag az aktivitás megy át: a PUT teljes cseréje újravalidálná a
    // termék minden mezőjét, és egy régi, szabálysértő adatú terméket nem
    // lehetne elrejteni a vásárlók elől.
    expect(JSON.parse(init.body as string)).toEqual({ active: false });
  });

  it("a createProduct POST-ol a bemenettel", async () => {
    const input = {
      name: "Új",
      description: "Leírás",
      price: 100,
      imageUrl: "https://example.com/a.png",
      stock: 1,
      category: "Otthon",
    };
    const fetchMock = mockFetch({ id: "p9" });
    await createProduct(input);
    expect(initOf(fetchMock).method).toBe("POST");
    expect(JSON.parse(initOf(fetchMock).body as string)).toEqual(input);
  });

  it("a deleteAdminUser DELETE-el, body nélkül", async () => {
    const fetchMock = mockFetch({ ok: true });
    await deleteAdminUser("u1");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/users/u1");
    expect(initOf(fetchMock).method).toBe("DELETE");
    expect(initOf(fetchMock).body).toBeUndefined();
  });

  it("a getAdminOrders paraméterek nélkül a csupasz admin útvonalat hívja, tokennel", async () => {
    setAuthToken("admin-token");
    const fetchMock = mockFetch({ items: [], total: 0 });
    await getAdminOrders();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/orders");
    expect(headersOf(fetchMock).Authorization).toBe("Bearer admin-token");
  });

  it("a getAdminOrders minden megadott szűrőt átad", async () => {
    const fetchMock = mockFetch({ items: [] });
    await getAdminOrders({
      page: 2,
      pageSize: 50,
      status: "pending",
      search: "kovács",
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string, "http://x");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "50",
      status: "pending",
      search: "kovács",
    });
  });

  it('a getAdminOrders status="all" szűrőt nem küldi el (ez az alapértelmezés)', async () => {
    const fetchMock = mockFetch({ items: [] });
    await getAdminOrders({ status: "all" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/orders");
  });

  it("a getAdminOrders az üres keresést elhagyja, a 0 lapszámot viszont átadja", async () => {
    const fetchMock = mockFetch({ items: [] });
    // A pageSize: 0 értékes paraméter (a szerver 1-re vágja), az üres search
    // viszont nem szűkít — ezért nem is küldjük el.
    await getAdminOrders({ pageSize: 0, search: "" });
    const url = new URL(fetchMock.mock.calls[0][0] as string, "http://x");
    expect(url.searchParams.get("pageSize")).toBe("0");
    expect(url.searchParams.get("search")).toBeNull();
  });

  it("a getAdminOrders URL-kódolja a keresés speciális karaktereit", async () => {
    const fetchMock = mockFetch({ items: [] });
    await getAdminOrders({ search: "a&b=c" });
    const raw = fetchMock.mock.calls[0][0] as string;
    expect(raw).toContain("search=a%26b%3Dc");
    expect(new URL(raw, "http://x").searchParams.get("search")).toBe("a&b=c");
  });

  it("az updateAdminOrderStatus PATCH-el, és csak a status mezőt küldi", async () => {
    const fetchMock = mockFetch({ id: "o1", status: "delivered" });
    await updateAdminOrderStatus("o1", "delivered");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/orders/o1/status");
    const init = initOf(fetchMock);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ status: "delivered" });
  });

  it("az updateAdminOrderStatus a szerver 409-es üzenetét változtatás nélkül dobja", async () => {
    // A 409 szövege (fedezethiány, végállapot) éppen azt mondja meg az adminnak,
    // miért nem sikerült — a kliens nem fogalmazza újra.
    mockFetchError(409, { error: "A kiszállított rendelés státusza már nem módosítható." });
    await expect(updateAdminOrderStatus("o1", "pending")).rejects.toThrow(
      "A kiszállított rendelés státusza már nem módosítható.",
    );
  });

  it("a szerver 403-át olvasható hibaként dobja tovább", async () => {
    mockFetchError(403, { error: "Ehhez adminisztrátori jogosultság szükséges." });
    await expect(getAdminProducts()).rejects.toThrow(
      "Ehhez adminisztrátori jogosultság szükséges.",
    );
  });
});

describe("saját fiókadatok", () => {
  const profile = {
    username: "sajatfelhasznalo",
    email: "sajat@example.com",
    address: "Teszt utca 7",
    currentPassword: "jelszo12345",
  };

  it("az updateProfile PUT-tal hívja a /api/auth/me végpontot, tokennel", async () => {
    setAuthToken("t");
    const fetchMock = mockFetch({ id: "u1", username: "sajatfelhasznalo" });

    await updateProfile(profile);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/me");
    const init = initOf(fetchMock);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(profile);
    expect(headersOf(fetchMock).Authorization).toBe("Bearer t");
    expect(headersOf(fetchMock)["Content-Type"]).toBe("application/json");
  });

  it("az updateProfile a publikus felhasználót adja vissza (token nélkül)", async () => {
    const user = {
      id: "u1",
      username: "sajatfelhasznalo",
      email: "sajat@example.com",
      address: "Teszt utca 7",
      role: "customer",
    };
    mockFetch(user);
    await expect(updateProfile(profile)).resolves.toEqual(user);
  });

  it("a changePassword POST-ol a /api/auth/password végpontra", async () => {
    const input = {
      currentPassword: "jelszo12345",
      newPassword: "ujjelszo123",
      newPasswordConfirm: "ujjelszo123",
    };
    const fetchMock = mockFetch({ user: {}, token: "uj-token" });

    await expect(changePassword(input)).resolves.toEqual({
      user: {},
      token: "uj-token",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/password");
    expect(initOf(fetchMock).method).toBe("POST");
    expect(JSON.parse(initOf(fetchMock).body as string)).toEqual(input);
  });

  it("a szerver magyar hibaüzenetét változtatás nélkül dobja", async () => {
    mockFetchError(400, { error: "A két jelszó nem egyezik." });
    await expect(
      changePassword({
        currentPassword: "jelszo12345",
        newPassword: "ujjelszo123",
        newPasswordConfirm: "masik",
      }),
    ).rejects.toThrow("A két jelszó nem egyezik.");
  });

  it("a hibás jelenlegi jelszó 400-a NEM léptet ki", async () => {
    // A szerver a hibás jelszóra 400-at ad (nem 401), mert az mezőhiba, nem lejárt
    // munkamenet. Ha ebből kiléptetés lenne, egy elgépelt jelszó kidobná a
    // felhasználót a saját fiókoldaláról.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken("ervenyes-token");
    mockFetchError(400, { error: "A jelenlegi jelszó hibás." });

    await expect(updateProfile(profile)).rejects.toThrow("A jelenlegi jelszó hibás.");
    mockFetchError(400, { error: "A jelenlegi jelszó hibás." });
    await expect(
      changePassword({
        currentPassword: "rossz",
        newPassword: "ujjelszo123",
        newPasswordConfirm: "ujjelszo123",
      }),
    ).rejects.toThrow("A jelenlegi jelszó hibás.");

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("a 401 viszont KILÉPTET: ezeken a végpontokon lejárt munkamenetet jelent", async () => {
    // A `signalUnauthorized: false` tiltott ezen a két híváson. Kikapcsolva egy
    // ténylegesen lejárt munkamenet némán maradna, és a felhasználó a következő
    // kattintásig azt hinné, be van jelentkezve.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken("lejart-token");
    mockFetchError(401, { error: "Bejelentkezés szükséges." });

    await expect(updateProfile(profile)).rejects.toThrow("Bejelentkezés szükséges.");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    mockFetchError(401, { error: "Bejelentkezés szükséges." });
    await expect(
      changePassword({
        currentPassword: "jelszo12345",
        newPassword: "ujjelszo123",
        newPasswordConfirm: "ujjelszo123",
      }),
    ).rejects.toThrow("Bejelentkezés szükséges.");
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });
});

describe("központi 401-kezelés (lejárt munkamenet)", () => {
  it("bejelentkezett állapotban a 401 értesíti a munkamenet-kezelőt", async () => {
    // Enélkül a felület bejelentkezettnek látszana, miközben minden művelet
    // hibára fut — a felhasználó pedig nem értené, miért.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken("lejart-token");
    mockFetchError(401, { error: "Bejelentkezés szükséges." });

    await expect(me()).rejects.toThrow("Bejelentkezés szükséges.");

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("token NÉLKÜL a 401 nem jelent lejáratot", async () => {
    // Egy ki nem jelentkezett látogató 401-e a védett végpont szokásos válasza.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockFetchError(401, { error: "Bejelentkezés szükséges." });

    await expect(getOrders()).rejects.toThrow();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("a bejelentkezés 401-e NEM léptet ki", async () => {
    // Ott a 401 hibás jelszót jelent, nem lejárt munkamenetet.
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken("meglevo-token");
    mockFetchError(401, { error: "Hibás felhasználónév vagy jelszó." });

    await expect(login("valaki", "rossz")).rejects.toThrow(
      "Hibás felhasználónév vagy jelszó.",
    );

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("a regisztráció hibája sem léptet ki", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken("meglevo-token");
    mockFetchError(401, { error: "Nem sikerült." });

    await expect(register("felhasznalo", "a@b.hu", "Cím", "jelszo12")).rejects.toThrow();

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("más hibakódnál (409) nem szól a kezelőnek", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    setAuthToken("t");
    mockFetchError(409, { error: "A(z) Kulacs termék elfogyott…" });

    await expect(
      createOrder(
        [{ productId: "p1", quantity: 1 }],
        { name: "Vevő", email: "v@example.com", address: "Cím" },
        100,
      ),
    ).rejects.toThrow(/elfogyott/);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
