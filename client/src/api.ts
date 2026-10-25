// Vékony réteg a backend REST API köré.
// A típusok a Java válasz-DTO-k tükrei; a két oldal külön van definiálva, ezért
// alakváltozáskor EGYÜTT módosul.

// Jogosultsági szint. Az admin a customer fölé rendelt szerepkör.
export type Role = "customer" | "admin";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  stock: number;
  category: string;
  // Az inaktív termék a vásárlói felület számára nem létezik; a vásárlói
  // végpontok nem is adják vissza. Csak az admin listában fordul elő false-szal.
  active: boolean;
};

// A terméklistázó végpont szűrési/lapozási paraméterei (mind opcionális).
export type ProductQuery = {
  page?: number;
  pageSize?: number;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  inStock?: boolean;
};

// A termék az értékelési aggregátumokkal és az elérhető mennyiséggel — ezt
// adják vissza a VÁSÁRLÓI végpontok. Az átlagot a szerver számolja ki
// lekérdezéskor, kizárólag a JÓVÁHAGYOTT (approved) értékelésekből.
// Értékelés nélkül mindkét rating mező 0 ("Nincs értékelés" állapot).
//
// A szerver oldalán ez két lépcsőben áll össze (RatedProduct → CustomerProduct);
// itt SZÁNDÉKOSAN lapos: a köztes típusnak a kliensen nincs egyetlen használója
// sem, és felvenni csak a két oldal eltérésének esélyét növelné.
export type CustomerProduct = Product & {
  ratingAvg: number;
  ratingCount: number;
  /**
   * Az ELÉRHETŐ darabszám: a fizikai készlet mínusz a még nem teljesített
   * rendelések foglalásai. A felületen EZT kell mutatni, nem a `stock`-ot —
   * különben a terméklap olyan készletet ígérne, ami már el van adva.
   */
  available: number;
};

// A lapozott terméklista válasza. A `categories` a teljes (szűretlen)
// készlet kategórialistája – a szűrő oldalsávhoz.
export type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: string[];
};

// A VÁSÁRLÓI terméklista válasza. Az admin listától (`ProductPage`) az
// értékelési aggregátumokban ÉS az `available` mezőben tér el: az admin
// szerkesztő felületnek nincs szüksége az átlagra.
export type CustomerProductPage = Omit<ProductPage, "items"> & {
  items: CustomerProduct[];
};

// Egy értékelés moderációs állapota. Publikusan CSAK az "approved" látszik;
// a "removed" soft delete (az adatbázisban megmarad, de eltűnik a listából).
export type ReviewStatus = "pending" | "approved" | "rejected" | "removed";

// Termékértékelés. Beküldés után nem módosítható, ezért az `updatedAt`
// kizárólag a moderációs státuszváltást jelöli.
export type Review = {
  id: string;
  productId: string;
  /** A beküldő felhasználó azonosítója (a szerver a tokenből származtatja). */
  author: string;
  /** Csillagok száma: 1 és 5 közötti egész szám. */
  rating: number;
  /** Opcionális szöveges vélemény, legfeljebb 500 karakter. */
  body?: string;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
};

// A PUBLIKUSAN olvasható értékelés. A szerver szándékosan NEM adja ki az `author` mezőt: az
// belső felhasználó-azonosító, a véleménylista pedig bejelentkezés nélkül is
// olvasható. Emiatt a listán szerzőnév sem jeleníthető meg.
export type PublicReview = Omit<Review, "author">;

/** A szöveges vélemény maximális hossza (a szerver ugyanezt validálja). */
export const MAX_REVIEW_BODY_LENGTH = 500;

// A `name` és a `unitPrice` a leadás pillanatában készült másolat (snapshot):
// ezért nem változik meg egy korábbi rendelés tartalma, ha a terméket később
// átnevezik, átárazzák vagy törlik. A snapshot bevezetése ELŐTT leadott
// rendeléseken nincsenek jelen — ezért opcionálisak.
export type OrderItem = {
  productId: string;
  quantity: number;
  name?: string;
  unitPrice?: number;
};

export type Customer = {
  name: string;
  email: string;
  address: string;
};

// A rendelés teljesítési státusza. Az "ellenőrzött vásárló" szabály erre épül:
// értékelést csak `delivered` rendelés után lehet írni. Új rendelés `pending`.
// Az `expired` a lejárt foglalású rendelés: a készlete felszabadult, de az
// admin utólag is teljesítheti — NEM végállapot.
export type OrderStatus = "pending" | "expired" | "delivered";

export type Order = {
  id: string;
  items: OrderItem[];
  customer: Customer;
  total: number;
  createdAt: string;
  userId?: string;
  status: OrderStatus;
  /**
   * A foglalás lejárata. A szerver SZÁMOLJA a válasz összeállításakor, és
   * kizárólag `pending` rendelésen küldi el — így a felület a szerver
   * konfigurációjának ismerete nélkül tud visszaszámlálót mutatni.
   */
  reservedUntil?: string;
};

/** A teljesítési státuszok magyar feliratai a felülethez. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Feldolgozás alatt",
  expired: "Lejárt",
  delivered: "Kiszállítva",
};

// A szerver csak a publikus felhasználói mezőket adja vissza: jelszóhash, só és
// token SOHA nem szerepel a válaszban.
export type User = {
  id: string;
  username: string;
  email: string;
  address: string;
  // A szerepkör csak a felület kényelmi elrejtéséhez kell; a védelem szerveroldali.
  role: Role;
};

// Az aktuális munkamenet Bearer tokenje. Az auth réteg állítja be induláskor
// (localStorage-ból) és be-/kijelentkezéskor.
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

// Az API-hívásokhoz szükséges fejlécek: JSON + Bearer token, ha van.
function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return headers;
}

// A munkamenet megszűnésére figyelő kezelő (az auth réteg regisztrálja).
// Azért itt van, és nem hívásonként: a token bármelyik kérésnél lejárhat, és a
// felület nem maradhat "bejelentkezve" állapotban, miközben minden művelet 401-re
// fut. Így egyetlen helyen dől el, mi történik a lejárt munkamenettel.
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

type HandleOptions = {
  /**
   * Jelezze-e a 401-et a munkamenet-kezelőnek. A bejelentkezés és a
   * regisztráció KIVÉTEL: ott a 401 hibás jelszót jelent, nem lejárt
   * munkamenetet — abból nem szabad kiléptetést csinálni.
   */
  signalUnauthorized?: boolean;
};

// Közös hibakezelés: ha a válasz nem ok, dobunk egy hasznos hibaüzenetet.
async function handle<T>(res: Response, opts: HandleOptions = {}): Promise<T> {
  if (!res.ok) {
    // Csak akkor léptetünk ki, ha volt is munkamenet: egy amúgy is kijelentkezett
    // látogató 401-e nem "lejárás", csak a védett végpont szokásos válasza.
    if (res.status === 401 && opts.signalUnauthorized !== false && authToken) {
      onUnauthorized?.();
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Kérés sikertelen (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function getProducts(params: ProductQuery = {}): Promise<CustomerProductPage> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
  if (params.category) qs.set("category", params.category);
  if (params.minPrice !== undefined) qs.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) qs.set("maxPrice", String(params.maxPrice));
  if (params.search) qs.set("search", params.search);
  if (params.inStock) qs.set("inStock", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  return fetch(`/api/products${suffix}`).then((r) => handle<CustomerProductPage>(r));
}

export function getProduct(id: string): Promise<CustomerProduct> {
  return fetch(`/api/products/${id}`).then((r) => handle<CustomerProduct>(r));
}

// A termék PUBLIKUS értékelései: csak a jóváhagyottak, createdAt szerint
// csökkenő sorrendben (legújabb elöl), lapozás nélkül.
export function getProductReviews(id: string): Promise<PublicReview[]> {
  return fetch(`/api/products/${id}/reviews`).then((r) =>
    handle<PublicReview[]>(r),
  );
}

// Új értékelés beküldése. Szerzőt NEM küldünk: a szerver a tokenből azonosítja
// a beküldőt. A válasz mindig `pending` státuszú — a vélemény csak moderálás
// után válik publikussá, ezért a beküldés után a lista sem bővül.
//
// A hívás a szerver magyar hibaüzenetével utasítható el: 401 (nincs belépve),
// 403 (nincs kiszállított rendelése a termékre), 409 (már értékelte).
export function createReview(
  productId: string,
  rating: number,
  body?: string,
): Promise<Review> {
  return fetch("/api/reviews", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({
      productId,
      rating,
      ...(body !== undefined ? { body } : {}),
    }),
  }).then((r) => handle<Review>(r));
}

// Az `expectedTotal` a képernyőn jóváhagyott végösszeg. A szerver összeveti a
// sajátjával, és eltérés esetén elutasítja a rendelést — így a vevő soha nem
// fizet mást, mint amit látott.
export function createOrder(
  items: OrderItem[],
  customer: Customer,
  expectedTotal: number,
): Promise<Order> {
  return fetch("/api/orders", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ items, customer, expectedTotal }),
  }).then((r) => handle<Order>(r));
}

// A bejelentkezés/regisztráció válasza: a publikus felhasználó + munkamenet-token.
export type AuthResult = { user: User; token: string };

export function register(
  username: string,
  email: string,
  address: string,
  password: string,
): Promise<AuthResult> {
  return fetch("/api/auth/register", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ username, email, address, password }),
  }).then((r) => handle<AuthResult>(r, { signalUnauthorized: false }));
}

export function login(
  username: string,
  password: string,
): Promise<AuthResult> {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ username, password }),
  }).then((r) => handle<AuthResult>(r, { signalUnauthorized: false }));
}

export function logout(): Promise<{ ok: boolean }> {
  return fetch("/api/auth/logout", {
    method: "POST",
    headers: authHeaders(),
  }).then((r) => handle<{ ok: boolean }>(r));
}

export function me(): Promise<User> {
  return fetch("/api/auth/me", {
    headers: authHeaders(),
  }).then((r) => handle<User>(r));
}

// --- Saját fiókadatok ---

// A saját fiók szerkeszthető mezői. A `role` SZÁNDÉKOSAN nincs köztük: a szerepkörét
// senki nem állíthatja magának, a szerver a beküldött mezőt figyelmen kívül hagyja.
// A `currentPassword` a második kapu: egy ellopott munkamenet önmagában így nem elég
// a fiók átvételéhez.
export type ProfileInput = {
  username: string;
  email: string;
  address: string;
  currentPassword: string;
};

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
};

// A mentés a publikus felhasználót adja vissza, tokent NEM: a fiókadat nem
// hitelesítő adat, a munkamenet érintetlen marad.
//
// A `signalUnauthorized` itt SZÁNDÉKOSAN az alapértelmezetten (igaz) marad, a
// bejelentkezéssel ellentétben. A hibás jelenlegi jelszóra a szerver 400-at ad,
// azt az űrlap mutatja meg; a 401 ezen a végponton tehát tényleg lejárt
// munkamenetet jelent, és ki KELL léptetnie. Kikapcsolva egy lejárt munkamenet
// „A jelenlegi jelszó hibás." magyarázatot kapna — pontosan a rosszat.
export function updateProfile(input: ProfileInput): Promise<User> {
  return fetch("/api/auth/me", {
    method: "PUT",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }).then((r) => handle<User>(r));
}

// A jelszócsere ÚJ munkamenet-tokent hoz (a régi azonnal érvénytelen), ezért a
// hívónak le kell cserélnie a tárolt tokent — enélkül a felhasználó a saját
// jelszócseréjétől esne ki. A 401 itt is lejárt munkamenetet jelent (a hibás
// jelenlegi jelszó 400).
export function changePassword(
  input: PasswordChangeInput,
): Promise<AuthResult> {
  return fetch("/api/auth/password", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }).then((r) => handle<AuthResult>(r));
}

// A belépett felhasználó saját rendelései (GET /api/orders, requireAuth mögött).
export function getOrders(): Promise<Order[]> {
  return fetch("/api/orders", {
    headers: authHeaders(),
  }).then((r) => handle<Order[]>(r));
}

// --- Admin végpontok (/api/admin/*) ---
// Mind a requireAuth + requireAdmin őr mögött van. A kliensoldali elrejtés csak
// kényelmi funkció: az érdemi védelem szerveroldali, ezért ezek a hívások
// nem-admin felhasználónál 403-mal térnek vissza.

// Az admin terméklista szűrési/lapozási paraméterei. A ProductQuery-től két
// ponton tér el: van `status`, és nincs `inStock`.
export type AdminProductQuery = Omit<ProductQuery, "inStock"> & {
  status?: "active" | "inactive" | "all";
};

// Az admin által látott termék. A fizikai készlet mellett megmutatja, mennyi
// van lefoglalva és mennyi rendelhető még — enélkül az admin nem tudná
// megmagyarázni, miért utasít el a bolt egy látszólag raktáron lévő terméket.
export type AdminProduct = Product & {
  reserved: number;
  available: number;
};

export type AdminProductPage = Omit<ProductPage, "items"> & {
  items: AdminProduct[];
};

// A teljes katalógus, az INAKTÍV termékekkel együtt (a vásárlói getProducts
// ezzel szemben csak az aktívakat adja vissza).
export function getAdminProducts(
  params: AdminProductQuery = {},
): Promise<AdminProductPage> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
  if (params.category) qs.set("category", params.category);
  if (params.minPrice !== undefined) qs.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) qs.set("maxPrice", String(params.maxPrice));
  if (params.search) qs.set("search", params.search);
  if (params.status && params.status !== "all") qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return fetch(`/api/admin/products${suffix}`, {
    headers: authHeaders(),
  }).then((r) => handle<AdminProductPage>(r));
}

// A termék szerkeszthető mezői. Az `id`-t a szerver adja, az `active`
// elhagyható (új terméknél alapértelmezés szerint aktív).
export type ProductInput = {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  stock: number;
  category: string;
  active?: boolean;
};

export function createProduct(input: ProductInput): Promise<Product> {
  return fetch("/api/admin/products", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }).then((r) => handle<Product>(r));
}

export function updateProduct(
  id: string,
  input: ProductInput,
): Promise<Product> {
  return fetch(`/api/admin/products/${id}`, {
    method: "PUT",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }).then((r) => handle<Product>(r));
}

// Kizárólag az aktivitás váltása. Azért külön hívás a updateProduct helyett, mert
// a PUT teljes csere, és a termék minden mezőjét újravalidálja — egy régebbi,
// szabálysértő adatú terméket így nem lehetne elrejteni a vásárlók elől.
export function setProductActive(
  id: string,
  active: boolean,
): Promise<Product> {
  return fetch(`/api/admin/products/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify({ active }),
  }).then((r) => handle<Product>(r));
}

// VÉGLEGES törlés — különbözik az inaktiválástól. A hívó erősítse meg a felhasználóval.
export function deleteProduct(id: string): Promise<{ ok: boolean }> {
  return fetch(`/api/admin/products/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then((r) => handle<{ ok: boolean }>(r));
}

// --- Admin rendeléskezelés ---

// Az admin által látott rendelés: a rendelés minden mezője + a leadó fiók
// felhasználóneve. A `username` KÉNYELMI mező: a `customer` blokk a leadáskori
// másolat, ami eltérhet a fiók mai adataitól. Ha a fiókot időközben törölték, a
// mező HIÁNYZIK a válaszból (nem null, nem üres szöveg) — a rendelés önálló
// bizonylat, a fiók hiánya nem hiba.
export type AdminOrder = Order & { username?: string };

// Az admin rendeléslista szűrési/lapozási paraméterei (mind opcionális).
// A `status` szándékosan `string`: az ismeretlen érték a szerveren NEM hiba,
// hanem a teljes halmazra esik vissza.
export type AdminOrderQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
};

// A lapozott rendeléslista válasza. `categories` NINCS benne: az a
// terméklistához tartozik, rendelésnél értelmetlen lenne.
export type AdminOrderPage = {
  items: AdminOrder[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// A TELJES rendeléshalmaz, felhasználótól függetlenül, legújabb elöl (a
// getOrders ezzel szemben csak a hívó saját rendeléseit adja). Alap lapméret 25.
export function getAdminOrders(
  params: AdminOrderQuery = {},
): Promise<AdminOrderPage> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
  // Az "all" az alapértelmezés, ezért nem küldjük el — ugyanaz a szabály, mint a
  // getAdminProducts status paraméterénél.
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  const suffix = qs.toString() ? `?${qs}` : "";
  return fetch(`/api/admin/orders${suffix}`, {
    headers: authHeaders(),
  }).then((r) => handle<AdminOrderPage>(r));
}

// A rendelés teljesítési státuszának állítása. Az ÉRVÉNYES átmenetekről a
// szerver állapotgépe dönt — a kliens nem másolja le az átmenettáblát, és a
// hibaüzenetet (409: fedezethiány vagy végállapot) változtatás nélkül továbbadja.
export function updateAdminOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<Order> {
  return fetch(`/api/admin/orders/${id}/status`, {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify({ status }),
  }).then((r) => handle<Order>(r));
}

// --- Admin felhasználókezelés ---
// Új felhasználó felvételére NINCS hívás: fiók kizárólag regisztrációval
// keletkezik, mert a jelszó az admin felületen nem adható meg.

// Az admin által látott felhasználó. Jelszóadat és token soha nem érkezik.
export type AdminUser = {
  id: string;
  username: string;
  email: string;
  address: string;
  role: Role;
  createdAt: string;
};

// A felhasználó szerkeszthető mezői. A jelszó szándékosan nincs köztük.
export type AdminUserInput = {
  username: string;
  email: string;
  address: string;
  role: Role;
};

export function getAdminUsers(): Promise<AdminUser[]> {
  return fetch("/api/admin/users", {
    headers: authHeaders(),
  }).then((r) => handle<AdminUser[]>(r));
}

export function updateAdminUser(
  id: string,
  input: AdminUserInput,
): Promise<AdminUser> {
  return fetch(`/api/admin/users/${id}`, {
    method: "PUT",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  }).then((r) => handle<AdminUser>(r));
}

// A felhasználó törlése. A korábbi rendeléseit NEM törli: a rendelés önálló
// bizonylat. A szerver elutasítja, ha ezzel megszűnne az utolsó admin.
export function deleteAdminUser(id: string): Promise<{ ok: boolean }> {
  return fetch(`/api/admin/users/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then((r) => handle<{ ok: boolean }>(r));
}

// Segédfüggvény az árak egységes, forint formátumú megjelenítéséhez.
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("hu-HU", {
    style: "currency",
    currency: "HUF",
    maximumFractionDigits: 0,
  }).format(price);
}
