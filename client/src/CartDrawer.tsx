// Kosárfiók: jobbról becsúszó gyorsnézet a kosár tartalmáról.
//
// KIEGÉSZÍTI a /cart oldalt, nem váltja ki. A fiók a böngészés megszakítása
// nélküli ellenőrzésre való ("mi van már bent, mennyi az összeg"); a részletes
// szerkesztés és a megosztható/mélylinkelhető nézet marad az oldalé.
//
// A natív <dialog> + showModal() adja a fókuszcsapdát, az Escape-et és a
// háttér inertté tételét — mindezt külső könyvtár nélkül.
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatPrice } from "./api";
import { useCart } from "./cart";
import { useUi } from "./ui";

export function CartDrawer() {
  const { cartOpen, closeCart } = useUi();
  const { items, total, setQuantity, remove } = useCart();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);

  // A nyitottság a UI-contextben él, a <dialog> viszont imperatív API-t ad —
  // ez az effekt köti össze a kettőt.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (cartOpen) {
      // A showModal() régebbi futtatókörnyezetekben (és a jsdom bizonyos
      // verzióiban) hiányzik; ilyenkor a nem-modális megnyitás a tartalék.
      // A fiók így is használható, csak a fókuszcsapdát veszítjük el.
      if (typeof el.showModal === "function") {
        if (!el.open) el.showModal();
      } else if (!el.open) {
        el.setAttribute("open", "");
      }
    } else if (el.open) {
      el.close();
    }
  }, [cartOpen]);

  // Az Escape-et és a háttérre kattintást a böngésző kezeli, de a contextnek is
  // tudnia kell róla — különben a gomb legközelebb nem nyitná ki.
  function handleClose() {
    closeCart();
  }

  function goTo(path: string) {
    closeCart();
    navigate(path);
  }

  return (
    <dialog
      ref={ref}
      className="cart-drawer"
      aria-labelledby="kosarfiok-cim"
      onClose={handleClose}
    >
      {/* A tartalom csak nyitott állapotban létezik. Csukott <dialog> ugyan
          nem látszik, de a szövege ott maradna a DOM-ban, és a szövegkeresésre
          épülő tesztek két találatot kapnának ugyanarra a feliratra. */}
      {cartOpen && (
        <div className="drawer-inner">
          <header className="drawer-head">
            <h2 id="kosarfiok-cim">Kosár</h2>
            <button
              type="button"
              className="btn-icon"
              aria-label="Kosárfiók bezárása"
              onClick={handleClose}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </header>

          {items.length === 0 ? (
            <div className="drawer-empty">
              <p>A kosár még üres.</p>
              <Link to="/" onClick={handleClose}>
                Tovább a vásárláshoz →
              </Link>
            </div>
          ) : (
            <>
              <ul className="drawer-items">
                {items.map(({ product, quantity }) => (
                  <li key={product.id} className="drawer-item">
                    <img src={product.imageUrl} alt="" loading="lazy" />
                    <div className="drawer-item-body">
                      <p className="drawer-item-name">{product.name}</p>
                      <p className="drawer-item-price">
                        {formatPrice(product.price * quantity)}
                      </p>
                      <div className="drawer-item-actions">
                        <label>
                          <span className="sr-only">
                            {product.name} mennyisége
                          </span>
                          <input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(e) =>
                              setQuantity(product.id, Number(e.target.value))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="link-button is-danger"
                          onClick={() => remove(product.id)}
                        >
                          Törlés
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <footer className="drawer-foot">
                <p className="total">Összesen: {formatPrice(total)}</p>
                <button type="button" onClick={() => goTo("/checkout")}>
                  Tovább a fizetéshez
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => goTo("/cart")}
                >
                  Kosár megnyitása
                </button>
              </footer>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
