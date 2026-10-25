// A katalógus szűrője — az oldalsávban, állandóan látható helyen.
//
// Szándékosan nincs "Szűrők" legördülő mögé rejtve: a rejtett szűrőt a vevő
// nem használja, a katalógus pedig pontosan attól használható, hogy szűkíthető.
//
// Állapotot nem birtokol: mindent a CatalogProvider-től kap, ami ugyanabból az
// egy lekérésből szolgálja ki a termékrácsot is.
import { useCatalog } from "./catalog";

export function CatalogFilter() {
  const {
    data,
    draft,
    updateDraft,
    setFilter,
    clearFilters,
    category,
    inStock,
  } = useCatalog();

  // Aktívnak számít minden olyan szűrő, ami szűkíti a listát. A darabszám a
  // "Szűrők törlése" mellett jelzi, van-e egyáltalán mit törölni.
  const activeCount =
    (category ? 1 : 0) +
    (inStock ? 1 : 0) +
    (draft.search.trim() ? 1 : 0) +
    (draft.minPrice.trim() ? 1 : 0) +
    (draft.maxPrice.trim() ? 1 : 0);

  return (
    <section className="filter-panel" aria-labelledby="szuro-cim">
      <div className="panel-head">
        <h2 id="szuro-cim" className="panel-title">
          Szűrők
          {activeCount > 0 && <span className="badge">{activeCount}</span>}
        </h2>
        {activeCount > 0 && (
          <button type="button" className="link-button" onClick={clearFilters}>
            Szűrők törlése
          </button>
        )}
      </div>

      <label>
        Kategória
        <select
          value={category}
          onChange={(e) => setFilter("category", e.target.value)}
        >
          <option value="">Összes</option>
          {data?.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label>
        Keresés
        <input
          type="search"
          value={draft.search}
          placeholder="Termék neve…"
          onChange={(e) => updateDraft({ search: e.target.value })}
        />
      </label>

      <div className="price-range">
        <label>
          Ár min. (Ft)
          <input
            type="number"
            min={0}
            value={draft.minPrice}
            onChange={(e) => updateDraft({ minPrice: e.target.value })}
          />
        </label>
        <label>
          Ár max. (Ft)
          <input
            type="number"
            min={0}
            value={draft.maxPrice}
            onChange={(e) => updateDraft({ maxPrice: e.target.value })}
          />
        </label>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={inStock}
          onChange={(e) => setFilter("inStock", e.target.checked ? "true" : "")}
        />
        Csak raktáron
      </label>

      {/* A találatszám a szűrő ALATT áll, mert a szűrő eredménye — így a
          módosítás és a visszajelzés egy szemmozdulatnyira van egymástól. */}
      {data && (
        <p className="filter-result" role="status">
          {data.total} termék
        </p>
      )}
    </section>
  );
}
