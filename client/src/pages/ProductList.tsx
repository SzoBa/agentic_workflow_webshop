// Kezdőoldal: a termékrács és a lapozó.
//
// A szűrő NEM itt van: az oldalsávba került (CatalogFilter), mert ott
// állandóan látszik. A közös adat- és szűrőállapot a CatalogProvider-ben él,
// ez a komponens csak fogyasztja.
import { Link } from "react-router-dom";
import { AddToCart } from "../AddToCart";
import { formatPrice } from "../api";
import { useCatalog } from "../catalog";
import { RatingSummary } from "../Stars";

/** Hány csontvázkártyát rajzolunk az első betöltéskor. */
const SKELETON_COUNT = 8;

export function ProductList() {
  const { data, loading, error, goToPage } = useCatalog();

  // Első betöltés: csontváz a rács helyén, hogy az oldal ne ugorjon egyet,
  // amikor megjönnek az adatok. A szöveges jelzés a képernyőolvasónak szól —
  // a csontváz neki néma.
  if (loading && !data) {
    return (
      <>
        <h1>Termékek</h1>
        <p className="sr-only" role="status">
          Termékek betöltése…
        </p>
        <div className="product-grid" aria-hidden="true">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div key={i} className="card skeleton-card">
              <div className="skeleton skeleton-image" />
              <div className="card-body">
                <div className="skeleton skeleton-line is-short" />
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line is-short" />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (error && !data) return <p className="error">Hiba: {error}</p>;
  if (!data) return null;

  return (
    <>
      <h1>Termékek</h1>

      {/* Frissítés közbeni hiba: a régi lista marad a képernyőn, fölötte az
          üzenettel — a felhasználó nem veszíti el, amit már látott. */}
      {error && <p className="error">Hiba: {error}</p>}

      {data.items.length === 0 ? (
        <p>Nincs a szűrőnek megfelelő termék.</p>
      ) : (
        <div className="product-grid">
          {data.items.map((product) => (
            <article key={product.id} className="card">
              <Link to={`/products/${product.id}`} className="card-image">
                <img src={product.imageUrl} alt={product.name} loading="lazy" />
              </Link>
              <div className="card-body">
                <span className="category">{product.category}</span>
                <h3>
                  <Link to={`/products/${product.id}`}>{product.name}</Link>
                </h3>
                <RatingSummary
                  value={product.ratingAvg}
                  count={product.ratingCount}
                />
                <p className="price">{formatPrice(product.price)}</p>
                {/* Az elfogyott termék LÁTHATÓ marad (a link és a
                    részletoldal is működik), csak nem rendelhető — az
                    aktivitás és a készlet két külön fogalom. */}
                <AddToCart product={product} />
              </div>
            </article>
          ))}
        </div>
      )}

      {data.total > 0 && (
        <div className="pagination">
          <button
            type="button"
            className="btn-secondary"
            disabled={data.page <= 1}
            onClick={() => goToPage(data.page - 1)}
          >
            Előző
          </button>
          <span>
            {data.page} / {data.totalPages} oldal ({data.total} termék)
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={data.page >= data.totalPages}
            onClick={() => goToPage(data.page + 1)}
          >
            Következő
          </button>
        </div>
      )}
    </>
  );
}
