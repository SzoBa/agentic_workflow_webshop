// A fő layout: egyesített bal oldalsáv (márka + navigáció + katalógusszűrő +
// fiókadatok), mellette a tartalomoszlop saját felső sávval, és a jobbról
// nyíló kosárfiók.
//
// Miért egy oldalsáv és nem külön navigációs rail + szűrőpanel? Mert a szűrő
// így kap állandó, teljes szélességű helyet — a legördülő mögé rejtett szűrőt
// a vevő nem használja —, a termékrács pedig marad elég széles négy oszlophoz.
//
// Mobilon (<900px) UGYANEZ az oldalsáv csúszik be balról egy menügombra. Nem
// épül külön mobil navigáció: a megkettőzött menü két azonos nevű linket
// jelentene a DOM-ban, amitől a Playwright szerep-alapú keresései
// (getByRole("link", …)) kétértelművé válnának.
import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useMatch,
} from "react-router-dom";
import { useCart } from "./cart";
import { useAuth } from "./auth";
import { useUi } from "./ui";
import { CatalogProvider } from "./catalog";
import { CatalogFilter } from "./CatalogFilter";
import { CartDrawer } from "./CartDrawer";
import { ProductList } from "./pages/ProductList";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Checkout } from "./pages/Checkout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Orders } from "./pages/Orders";
import { Profile } from "./pages/Profile";
import { AdminProducts } from "./pages/AdminProducts";
import { AdminOrders } from "./pages/AdminOrders";
import { AdminUsers } from "./pages/AdminUsers";
import { RequireAdmin } from "./RequireAdmin";
import { RequireAuth } from "./RequireAuth";
import { SessionExpiredNotice } from "./SessionExpiredNotice";
import { ThemeToggle } from "./ThemeToggle";

// A katalógus adatait a héj KÉT ága használja (oldalsávi szűrő és termékrács),
// ezért a provider a héj fölött ül. A szétválasztás azért van külön
// komponensben, mert a `useCatalog()` csak a provideren BELÜL hívható.
export function App() {
  return (
    <CatalogProvider>
      <Shell />
    </CatalogProvider>
  );
}

function Shell() {
  const { count } = useCart();
  const { user, logout } = useAuth();
  const { openCart } = useUi();
  const location = useLocation();
  // A szűrő csak a katalóguson jelenik meg — máshol nincs mit szűrni.
  const onCatalog = useMatch("/") !== null;
  const [menuOpen, setMenuOpen] = useState(false);

  // Útvonalváltáskor a mobil menü becsukódik: a felhasználó rákattintott egy
  // linkre, tehát a menü elvégezte a dolgát.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Escape a menüre is zár — a becsúszó panelek megszokott viselkedése.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className={`app-shell${menuOpen ? " is-menu-open" : ""}`}>
      <a className="skip-link" href="#tartalom">
        Ugrás a tartalomra
      </a>

      {/* Mobilon a nyitott oldalsáv mögé sötétítés kerül; a rákattintás zár.
          Asztali méreten a CSS elrejti. */}
      <button
        type="button"
        className="shell-backdrop"
        aria-label="Menü bezárása"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />

      <aside className="sidebar" id="oldalsav">
        <Link to="/" className="brand">
          <span aria-hidden="true">🛒</span> Mini Webshop
        </Link>

        <nav className="sidebar-nav" aria-label="Fő navigáció">
          {/* Az `end` nélkül a "Bolt" minden útvonalon aktívnak látszana, mert
              a "/" minden elérési út előtagja. */}
          <NavLink to="/" end className="nav-item">
            <span className="nav-icon" aria-hidden="true">
              🛍
            </span>
            Bolt
          </NavLink>
          {/* A kosár az EGYETLEN kosár-belépő a felületen (a fejlécben nincs
              ikon), ezért itt a gyorsnézetet nyitja, nem oldalt vált. A teljes
              kosároldalra a fiókból lehet továbbmenni, és a /cart útvonal
              közvetlenül is elérhető marad. */}
          <button
            type="button"
            className="nav-item"
            onClick={openCart}
            aria-haspopup="dialog"
          >
            <span className="nav-icon" aria-hidden="true">
              🧺
            </span>
            Kosár
            {count > 0 && <span className="badge">{count}</span>}
          </button>
          {user && (
            <NavLink to="/orders" className="nav-item">
              <span className="nav-icon" aria-hidden="true">
                🧾
              </span>
              Rendeléseim
            </NavLink>
          )}

          {/* Az admin menüpontok elrejtése kényelmi funkció: a vevőnek nincs
              mit kezdenie velük. A hozzáférést a szerver dönti el. */}
          {user?.role === "admin" && (
            <>
              <p className="nav-group-title">Adminisztráció</p>
              <NavLink to="/admin/products" className="nav-item">
                <span className="nav-icon" aria-hidden="true">
                  📦
                </span>
                Termékek
              </NavLink>
              <NavLink to="/admin/orders" className="nav-item">
                <span className="nav-icon" aria-hidden="true">
                  📋
                </span>
                Rendelések
              </NavLink>
              <NavLink to="/admin/users" className="nav-item">
                <span className="nav-icon" aria-hidden="true">
                  👤
                </span>
                Ügyfelek
              </NavLink>
            </>
          )}
        </nav>

        {onCatalog && <CatalogFilter />}
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button
            type="button"
            className="btn-icon menu-button"
            aria-label="Menü megnyitása"
            aria-expanded={menuOpen}
            aria-controls="oldalsav"
            onClick={() => setMenuOpen(true)}
          >
            <span aria-hidden="true">☰</span>
          </button>

          {/* A fiók a fejlécben van, ahol a látogató keresi. Kosárikon
              szándékosan NINCS mellette: a kosár az oldalsávban él, és két
              belépő ugyanahhoz a funkcióhoz csak megosztja a figyelmet. */}
          <div className="topbar-actions">
            {user ? (
              <div className="user-info">
                {/* A név maga a belépő az „Adataim" oldalra: ott keresi a
                    felhasználó a saját fiókját. Az oldalsávba nem került külön
                    menüpont — egy funkcióhoz egy belépő. */}
                <Link to="/profile">
                  Belépve: <strong>{user.username}</strong>
                </Link>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => logout()}
                >
                  Kijelentkezés
                </button>
              </div>
            ) : (
              <div className="user-info">
                <Link to="/login">Bejelentkezés</Link>
                <Link to="/register" className="btn-inline">
                  Regisztráció
                </Link>
              </div>
            )}
            <ThemeToggle />
          </div>
        </header>

        <main id="tartalom" className="content">
          {/* Minden útvonalon látszik: a munkamenet bármelyik oldalon lejárhat. */}
          <SessionExpiredNotice />
          <Routes>
            <Route path="/" element={<ProductList />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/orders" element={<Orders />} />
            {/* Saját fiókadatok. Az őr csak kényelmi funkció — az érdemi
                védelem a szerveren van (az /api/auth névtér védett). */}
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            {/* Admin oldalak. Az őr csak kényelmi funkció — az érdemi védelem a
                szerveren van (requireAdmin az /api/admin router tetején). */}
            <Route
              path="/admin/products"
              element={
                <RequireAdmin>
                  <AdminProducts />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/orders"
              element={
                <RequireAdmin>
                  <AdminOrders />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAdmin>
                  <AdminUsers />
                </RequireAdmin>
              }
            />
            <Route path="*" element={<p>Az oldal nem található.</p>} />
          </Routes>
        </main>

        <footer className="footer">
          Mini Webshop · spec-vezérelt ügynöki fejlesztés
        </footer>
      </div>

      <CartDrawer />
    </div>
  );
}
