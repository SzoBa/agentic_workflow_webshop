// Fizetési űrlap: vevői adatok bekérése, rendelés leadása, visszaigazolás.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createOrder, formatPrice, type Order } from "../api";
import { useCart } from "../cart";
import { useAuth } from "../auth";

export function Checkout() {
  const { items, total, clear } = useCart();
  const { user } = useAuth();
  // A belépett felhasználó adataival töltjük elő az űrlapot, de szerkeszthető marad.
  const [customer, setCustomer] = useState({
    name: user?.username ?? "",
    email: user?.email ?? "",
    address: user?.address ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Order | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // A `total` az, ami a képernyőn is látszik ("Fizetendő"). A szerver
      // ehhez méri a saját, DB-árakból számolt összegét, és eltérés esetén
      // elutasítja a rendelést.
      const order = await createOrder(
        // A nevet is elküldjük a kosárból: ha egy termék időközben inaktívvá
        // vált vagy törölték, a szerver már nem tudja feloldani, és enélkül
        // csak a nyers azonosítót tudná a hibaüzenetben megmutatni.
        // Az árat NEM küldjük — azt a szerver mindig a DB-ből számolja.
        items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          name: i.product.name,
        })),
        customer,
        total,
      );
      setConfirmed(order);
      clear(); // a sikeres rendelés után ürítjük a kosarat
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Sikeres rendelés utáni visszaigazoló képernyő.
  if (confirmed) {
    return (
      <div className="confirmation">
        <h1>Köszönjük a rendelést! 🎉</h1>
        <p>
          Rendelésazonosító: <code>{confirmed.id}</code>
        </p>
        <p>Fizetendő összeg: {formatPrice(confirmed.total)}</p>
        <Link to="/">Vissza a termékekhez →</Link>
      </div>
    );
  }

  // Rendelést csak belépett felhasználó adhat le (a szerver requireAuth-tal is
  // védi a végpontot; ez a UX-réteg). Innen továbbküldjük a Pénztárra visszatéréshez.
  if (!user) {
    return (
      <div className="empty-state">
        <h1>Bejelentkezés szükséges</h1>
        <p>A rendelés leadásához kérjük, jelentkezz be.</p>
        <Link to="/login" state={{ from: "/checkout" }}>
          Tovább a bejelentkezéshez →
        </Link>
      </div>
    );
  }

  // Üres kosárral nincs mit fizetni.
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <h1>A kosarad üres</h1>
        <Link to="/">Tovább a vásárláshoz →</Link>
      </div>
    );
  }

  return (
    <>
      <h1>Pénztár</h1>
      <div className="panel checkout-panel">
        <form className="form-stack" onSubmit={handleSubmit}>
        <label>
          Név
          <input
            required
            value={customer.name}
            onChange={(e) =>
              setCustomer({ ...customer, name: e.target.value })
            }
          />
        </label>
        <label>
          Email
          <input
            required
            type="email"
            value={customer.email}
            onChange={(e) =>
              setCustomer({ ...customer, email: e.target.value })
            }
          />
        </label>
        <label>
          Szállítási cím
          <textarea
            required
            value={customer.address}
            onChange={(e) =>
              setCustomer({ ...customer, address: e.target.value })
            }
          />
        </label>

        <p className="total">Fizetendő: {formatPrice(total)}</p>
        {error && <p className="error">Hiba: {error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Feldolgozás…" : "Rendelés leadása"}
          </button>
        </form>
      </div>
    </>
  );
}
