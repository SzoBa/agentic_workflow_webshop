// Rendeléseim: a belépett felhasználó korábbi rendeléseinek listája.
// A backend (GET /api/orders) csak a saját rendeléseket adja vissza.
// A tételek a leadáskori terméknevet snapshotként tárolják. A terméklistát
// már csak a snapshot bevezetése ELŐTT leadott rendelések miatt kérjük le
// (id → termék map), fallbackként.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getOrders,
  getProducts,
  formatPrice,
  ORDER_STATUS_LABELS,
  type Order,
  type OrderItem,
  type CustomerProduct,
} from "../api";
import { useAuth } from "../auth";
import { ReorderButton } from "../Reorder";
import { ReservationStatus } from "../ReservationStatus";

const dateFormatter = new Intl.DateTimeFormat("hu-HU", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Az összes termék lekérése lapozva (a szerver max. 100/oldal),
// hogy a rendelési tételekhez fel tudjuk oldani a neveket.
async function fetchAllProducts(): Promise<Map<string, CustomerProduct>> {
  const map = new Map<string, CustomerProduct>();
  let page = 1;
  let totalPages = 1;
  do {
    const res = await getProducts({ page, pageSize: 100 });
    for (const p of res.items) map.set(p.id, p);
    totalPages = res.totalPages;
    page += 1;
  } while (page <= totalPages);
  return map;
}

// A tétel megjelenítendő neve. Elsődlegesen a rendelésen TÁROLT snapshotból
// (így egy későbbi átnevezés vagy törlés nem írja át a rendelést), és csak a
// snapshot bevezetése előtti rendeléseknél esünk vissza az élő termékre.
// A nyers azonosítót sosem mutatjuk: a vásárlói terméklista az inaktív
// termékeket sem adja vissza, ezért a fallback nem csak törlés esetén kell.
function itemName(
  item: OrderItem,
  products: Map<string, CustomerProduct>,
): string {
  return item.name ?? products.get(item.productId)?.name ?? "Már nem elérhető termék";
}

export function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Map<string, CustomerProduct>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reorderNote, setReorderNote] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getOrders(), fetchAllProducts()])
      .then(([ordersData, productMap]) => {
        if (cancelled) return;
        // Legújabb rendelés elöl.
        const sorted = [...ordersData].sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt),
        );
        setOrders(sorted);
        setProducts(productMap);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Rendeléseket csak belépett felhasználó láthat.
  if (!user) {
    return (
      <div className="empty-state">
        <h1>Bejelentkezés szükséges</h1>
        <p>A rendeléseid megtekintéséhez kérjük, jelentkezz be.</p>
        <Link to="/login" state={{ from: "/orders" }}>
          Tovább a bejelentkezéshez →
        </Link>
      </div>
    );
  }

  if (loading) {
    return <p>Rendelések betöltése…</p>;
  }

  if (error) {
    return <p className="error">Hiba: {error}</p>;
  }

  if (orders.length === 0) {
    return (
      <div className="empty-state">
        <h1>Még nincs rendelésed</h1>
        <Link to="/">Tovább a vásárláshoz →</Link>
      </div>
    );
  }

  return (
    <>
      <h1>Rendeléseim</h1>
      {reorderNote && <p className="notice">{reorderNote}</p>}
      {orders.map((order) => (
        <article
          key={order.id}
          className={`order-card order-${order.status}`}
        >
          <div className="order-head">
            <span>{dateFormatter.format(new Date(order.createdAt))}</span>
            <span className={`status status-${order.status}`}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
            <code>{order.id}</code>
          </div>
          <ReservationStatus order={order} />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Termék</th>
                  <th className="num">Mennyiség</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.productId}>
                    <td>{itemName(item, products)}</td>
                    <td className="num">{item.quantity} db</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* A tárolt végösszeg az igazság: a tételsorokból SOHA nem számolunk
              újra, mert a snapshot nélküli régi rendeléseknél a kettő eltérhet,
              és egy oldalon két különböző szám a legrosszabb kimenet. */}
          <p className="total">Végösszeg: {formatPrice(order.total)}</p>
          <ReorderButton
            order={order}
            products={products}
            onNote={setReorderNote}
          />
        </article>
      ))}
    </>
  );
}
