// A konformancia-futtató alaprétege: HTTP-kliens, állítások és bootstrap.
//
// SZÁNDÉKOSAN függőség nélküli, sima ESM JavaScript (nem TypeScript): a
// konformancia-katalógus nyelvfüggetlen, és a spec B fázisában ugyanezt a
// futtatót kell a Java/Spring backend ellen fordítani. Ha a futtató a Node
// workspace fordítási láncára épülne, a Java-implementáció ellenőrzése a
// Node-projekt build-jétől függene — pont attól, amitől független kellene legyen.
//
// Minden előfeltétel KIZÁRÓLAG publikus API-hívásokból épül fel: nincs
// adatbázis-hozzáférés és nincs teszt-hátsóajtó (konformancia.md "Használat").

/** A seed admin — a `requirements.md` 8. fejezete szerint minden induló állapotban létezik. */
export const SEED_ADMIN = { username: "adminisztrator", password: "admin123" };

/** Az összes admin végpont (K-70 / K-71 ezt a listát járja végig). */
export const ADMIN_ENDPOINTS = [
  ["GET", "/api/admin/products"],
  ["POST", "/api/admin/products"],
  ["PUT", "/api/admin/products/barmi"],
  ["PATCH", "/api/admin/products/barmi/active"],
  ["DELETE", "/api/admin/products/barmi"],
  ["GET", "/api/admin/users"],
  ["PUT", "/api/admin/users/barmi"],
  ["DELETE", "/api/admin/users/barmi"],
  ["GET", "/api/admin/reviews"],
  ["PATCH", "/api/admin/reviews/barmi"],
  ["PATCH", "/api/admin/orders/barmi/status"],
];

// --- Állítások -------------------------------------------------------------

/** A konformancia-eset bukását jelző hiba (megkülönbözteti a futtató saját hibáitól). */
export class ConformanceError extends Error {}

export function assert(condition, message) {
  if (!condition) throw new ConformanceError(message);
}

export function assertStatus(res, expected, what = "") {
  assert(
    res.status === expected,
    `${what || res.request} → ${expected} helyett ${res.status} ` +
      `(törzs: ${JSON.stringify(res.body)?.slice(0, 200)})`,
  );
}

export function assertEqual(actual, expected, what) {
  assert(
    actual === expected,
    `${what}: várt ${JSON.stringify(expected)}, kapott ${JSON.stringify(actual)}`,
  );
}

/** A hibaválasz alakja a spec szerint mindig `{ error: "..." }`, magyar szöveggel. */
export function assertErrorShape(res) {
  assert(
    res.body && typeof res.body.error === "string" && res.body.error.trim() !== "",
    `A hibaválasz törzse nem { error: "..." } alakú: ${JSON.stringify(res.body)?.slice(0, 200)}`,
  );
}

// --- HTTP-kliens -----------------------------------------------------------

/**
 * Egyszerű HTTP-kliens a vizsgált backendhez.
 *
 * A válasz törzsét best-effort JSON-ként olvassuk: egy nem-JSON válasz nem
 * szakítja meg a futást, hanem `body: null`-lal jut el az esethez — így a
 * "nem is JSON-nal válaszolt" hiba az esetben derül ki, beszédes üzenettel.
 */
export function createClient(baseUrl) {
  const root = baseUrl.replace(/\/+$/, "");

  async function request(method, path, { token, body, headers = {} } = {}) {
    // A GET és a HEAD nem vihet törzset (a fetch ilyenkor hibát dob). A hívó
    // így egységesen adhat át törzset egy metóduslistán végigmenve — lásd
    // K-70 / K-71, amelyek ugyanazt a kérést küldik minden admin végpontra.
    const kuldhetoTorzs = body !== undefined && method !== "GET" && method !== "HEAD";
    const started = Date.now();
    const res = await fetch(`${root}${path}`, {
      method,
      headers: {
        ...(kuldhetoTorzs ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: kuldhetoTorzs ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text === "" ? null : JSON.parse(text);
    } catch {
      parsed = null;
    }
    return {
      status: res.status,
      body: parsed,
      raw: text,
      headers: res.headers,
      ms: Date.now() - started,
      request: `${method} ${path}`,
    };
  }

  return {
    request,
    get: (path, opts) => request("GET", path, opts),
    post: (path, body, opts) => request("POST", path, { ...opts, body }),
    put: (path, body, opts) => request("PUT", path, { ...opts, body }),
    patch: (path, body, opts) => request("PATCH", path, { ...opts, body }),
    del: (path, opts) => request("DELETE", path, opts),
  };
}

// --- Bootstrap (B-1 … B-4) -------------------------------------------------

let counter = 0;

/**
 * Ütközésmentes utótag a fixture-ökhöz.
 *
 * Miért kell: a futtató NEM tud adattárolót üríteni (csak HTTP-t használ),
 * ezért minden eset a saját, egyedi nevű termékeivel és felhasználóival
 * dolgozik. Enélkül egy második futás a "már foglalt felhasználónév" hibába
 * futna, és az esetek egymás adatait látnák.
 */
export function nonce() {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createBootstrap(client) {
  let adminTokenCache = null;

  /** B-1 — bejelentkezés a seed adminnal. A token futásonként egyszer kell. */
  async function adminToken() {
    if (adminTokenCache) return adminTokenCache;
    const res = await client.post("/api/auth/login", SEED_ADMIN);
    assert(
      res.status === 200,
      `B-1 (seed admin bejelentkezés) meghiúsult: ${res.status} ` +
        `${JSON.stringify(res.body)?.slice(0, 200)}. ` +
        "Ha 429: a bejelentkezési rate limit még aktív egy korábbi futásból (K-51).",
    );
    adminTokenCache = res.body.token;
    return adminTokenCache;
  }

  /** B-2 — új customer regisztrációja egyedi névvel. */
  async function registerCustomer(over = {}) {
    const id = nonce();
    const payload = {
      username: `konform-${id}`,
      email: `konform-${id}@example.com`,
      address: "Konformancia u. 1.",
      password: "konformancia123",
      ...over,
    };
    const res = await client.post("/api/auth/register", payload);
    assert(
      res.status === 201,
      `B-2 (regisztráció) meghiúsult: ${res.status} ${JSON.stringify(res.body)?.slice(0, 200)}`,
    );
    return { token: res.body.token, user: res.body.user, password: payload.password };
  }

  /** B-3 — ismert készletű, aktív termék felvétele. */
  async function createProduct(over = {}) {
    const token = await adminToken();
    const id = nonce();
    const payload = {
      name: `Konform ${id}`.slice(0, 50),
      description: "Konformancia-teszt termék",
      price: 1000,
      stock: 5,
      category: `Konform-${id}`,
      imageUrl: "https://example.com/konform.png",
      active: true,
      ...over,
    };
    const res = await client.post("/api/admin/products", payload, { token });
    assert(
      res.status === 201,
      `B-3 (termék felvétele) meghiúsult: ${res.status} ${JSON.stringify(res.body)?.slice(0, 200)}`,
    );
    return res.body;
  }

  /** Rendelés leadása a szerver által számolt végösszeggel. */
  async function placeOrder(customer, items) {
    const expectedTotal = items.reduce(
      (sum, { product, quantity }) => sum + product.price * quantity,
      0,
    );
    return client.post(
      "/api/orders",
      {
        items: items.map(({ product, quantity }) => ({
          productId: product.id,
          quantity,
        })),
        customer: {
          name: "Konform Elek",
          email: "konform@example.com",
          address: "Konformancia u. 1.",
        },
        expectedTotal,
      },
      { token: customer.token },
    );
  }

  /** B-4 — rendelés leadása, majd `delivered`-re állítása (ez jogosít értékelésre). */
  async function deliveredOrder(customer, product, quantity = 1) {
    const placed = await placeOrder(customer, [{ product, quantity }]);
    assert(
      placed.status === 201,
      `B-4 (rendelés leadása) meghiúsult: ${placed.status} ` +
        `${JSON.stringify(placed.body)?.slice(0, 200)}`,
    );
    const token = await adminToken();
    const delivered = await client.patch(
      `/api/admin/orders/${placed.body.id}/status`,
      { status: "delivered" },
      { token },
    );
    assert(
      delivered.status === 200,
      `B-4 (teljesítés) meghiúsult: ${delivered.status} ` +
        `${JSON.stringify(delivered.body)?.slice(0, 200)}`,
    );
    return delivered.body;
  }

  return { adminToken, registerCustomer, createProduct, placeOrder, deliveredOrder };
}
