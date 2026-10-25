// A kosár tartalma: mennyiség módosítás, törlés, továbblépés a fizetéshez.
import { Link, useNavigate } from "react-router-dom";
import { formatPrice } from "../api";
import { useCart } from "../cart";

export function Cart() {
  const { items, total, setQuantity, remove } = useCart();
  const navigate = useNavigate();

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
      <h1>Kosár</h1>
      {/* A táblázat a SAJÁT dobozában görög oldalra, ha nem fér ki — így az
          oldal törzse sosem kap vízszintes görgetősávot. */}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Termék</th>
              <th className="num">Ár</th>
              <th>Mennyiség</th>
              <th className="num">Részösszeg</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ product, quantity }) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td className="num">{formatPrice(product.price)}</td>
                <td>
                  <label>
                    <span className="sr-only">{product.name} mennyisége</span>
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(product.id, Number(e.target.value))
                      }
                    />
                  </label>
                </td>
                <td className="num">{formatPrice(product.price * quantity)}</td>
                <td>
                  <button
                    className="link-button is-danger"
                    onClick={() => remove(product.id)}
                  >
                    Törlés
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cart-footer">
        <p className="total">Összesen: {formatPrice(total)}</p>
        <button onClick={() => navigate("/checkout")}>
          Tovább a fizetéshez
        </button>
      </div>
    </>
  );
}
