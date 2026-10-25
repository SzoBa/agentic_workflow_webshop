// A "Kosárba" hívás és a hozzá tartozó készletüzenet — egy komponensben, mert
// a kettőnek MINDIG egyeznie kell: a letiltott gomb magyarázat nélkül, vagy az
// "Elfogyott" felirat működő gomb mellett, egyaránt hazugság a vevő felé.
//
// Az ELÉRHETŐ mennyiséggel dolgozik, nem a raktárkészlettel: a még nem
// teljesített rendelések foglalásai már le vannak kötve, és a vevőt nem szabad
// olyan darabszámmal biztatni, amit nem kaphat meg.
import type { CustomerProduct } from "./api";
import { useCart } from "./cart";

export function AddToCart({
  product,
  /**
   * Kiírja-e a pontos elérhető darabszámot. A részletes nézeten igen (ott van
   * hely, és a vevő döntés előtt áll), a terméklista kártyáin nem — ott a
   * darabszám csak zajt vinne a rácsba.
   */
  showAvailable = false,
}: {
  product: CustomerProduct;
  showAvailable?: boolean;
}) {
  const { add } = useCart();

  return (
    <>
      {product.available === 0 ? (
        <p className="stock stock-empty">Elfogyott</p>
      ) : showAvailable ? (
        <p className="stock">Elérhető: {product.available} db</p>
      ) : null}
      <button
        type="button"
        onClick={() => add(product)}
        disabled={product.available === 0}
      >
        {product.available > 0 ? "Kosárba" : "Jelenleg nem rendelhető"}
      </button>
    </>
  );
}
