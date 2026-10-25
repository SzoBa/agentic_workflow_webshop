// Újrarendelés a mai árakon: egy korábbi rendelés tételeinek kosárba tétele.
//
// A tervező (planReorder) és a gomb egy fájlban él: a döntés tiszta és kosár,
// router nélkül tesztelhető, a komponens pedig csak a mellékhatásokat végzi.
import { useNavigate } from "react-router-dom";
import type { CustomerProduct, Order } from "./api";
import { useCart } from "./cart";

export type ReorderPlan = {
  /** A MAI katalógusból elérhető tételek, a rendelésen szereplő darabszámmal. */
  addable: { product: CustomerProduct; quantity: number }[];
  /** Az időközben elfogyott vagy eltűnt tételek nevei — a vevőnek megmutatva. */
  missing: string[];
};

/**
 * Mi kerül kosárba és mi marad ki.
 *
 * A tételeket a MAI árral és a MAI elérhetőséggel mérjük, nem a rendelésen
 * tárolt snapshottal: a snapshot a bizonylat hitelességét szolgálja, nem
 * árajánlat — a régi áron nem vásárolhat senki.
 *
 * A kimaradt tétel nevének forrása fontossági sorrendben: a rendelés
 * snapshotja → az élő termék neve → semleges szöveg. Nyers azonosító sosem
 * kerül a felületre.
 */
export function planReorder(
  order: Order,
  products: Map<string, CustomerProduct>,
): ReorderPlan {
  const plan: ReorderPlan = { addable: [], missing: [] };

  for (const item of order.items) {
    const product = products.get(item.productId);
    if (!product || product.available === 0) {
      plan.missing.push(item.name ?? product?.name ?? "Egy termék");
      continue;
    }
    plan.addable.push({ product, quantity: item.quantity });
  }

  return plan;
}

export function ReorderButton({
  order,
  products,
  onNote,
}: {
  order: Order;
  products: Map<string, CustomerProduct>;
  /** A vevőnek szóló tájékoztatás; a lap tetején jelenik meg, ezért a hívóé. */
  onNote: (note: string) => void;
}) {
  const { add } = useCart();
  const navigate = useNavigate();

  // "Csak a lejárt rendelés rendelhető újra" újrarendelési szabály, nem
  // listamegjelenítési — ezért itt dől el, és nem a rendeléslistában.
  if (order.status !== "expired") return null;

  function reorder() {
    const { addable, missing } = planReorder(order, products);

    if (addable.length === 0) {
      onNote("A rendelés egyetlen tétele sem elérhető jelenleg.");
      return;
    }
    // A kosár API-ja darabonként vesz fel (nincs mennyiség-paramétere).
    for (const { product, quantity } of addable) {
      for (let i = 0; i < quantity; i += 1) add(product);
    }
    if (missing.length > 0) {
      onNote(`A kosárba került, ami elérhető. Kimaradt: ${missing.join(", ")}.`);
      return;
    }
    navigate("/cart");
  }

  return (
    <button type="button" onClick={reorder}>
      Újrarendelés a mai árakon
    </button>
  );
}
