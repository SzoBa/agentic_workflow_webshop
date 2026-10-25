// A katalógus lekérése és szűrőállapota — egy helyen, két fogyasztóval.
//
// Miért context? Mert a szűrő az OLDALSÁVBAN él, a termékrács pedig a
// tartalomoszlopban: két külön ág a fában, ugyanabból az egy lekérésből. Ha
// mindkettő magának kérdezné le a szervert, két kérés menne ki, és a
// kategórialista meg a találatszám elcsúszhatna egymástól.
//
// A cart.tsx / auth.tsx mintáját követi: context + provider + `useCatalog()`
// hook, ami provideren kívül dob.
//
// Az igazság forrása változatlanul az URL (`useSearchParams`): a szűrt lista
// megosztható és visszalapozható marad. A provider ezt nem váltja ki, csak
// egy helyre gyűjti az írását.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMatch, useSearchParams } from "react-router-dom";
import { getProducts, type CustomerProductPage, type ProductQuery } from "./api";

/** A szabad szöveges mezők helyi állapota — ezt debounce-oljuk az URL-be. */
type Draft = {
  search: string;
  minPrice: string;
  maxPrice: string;
};

type CatalogContextValue = {
  data: CustomerProductPage | null;
  loading: boolean;
  error: string | null;
  draft: Draft;
  /** Szabad szöveges mező módosítása (debounce-olva kerül az URL-be). */
  updateDraft: (patch: Partial<Draft>) => void;
  /** Azonnali szűrő (kategória, raktárkészlet); az oldalt 1-re állítja. */
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  goToPage: (page: number) => void;
  /** Az aktuális kategória-szűrő ("" = összes). */
  category: string;
  /** Be van-e kapcsolva a "csak raktáron". */
  inStock: boolean;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

const DEBOUNCE_MS = 300;

// A searchParams-ból összeállítja a szervernek küldött query objektumot.
function paramsToQuery(sp: URLSearchParams): ProductQuery {
  const query: ProductQuery = {};
  const page = Number(sp.get("page"));
  if (Number.isFinite(page) && page > 1) query.page = page;
  const category = sp.get("category");
  if (category) query.category = category;
  const minPrice = Number(sp.get("minPrice"));
  if (sp.get("minPrice") && Number.isFinite(minPrice)) query.minPrice = minPrice;
  const maxPrice = Number(sp.get("maxPrice"));
  if (sp.get("maxPrice") && Number.isFinite(maxPrice)) query.maxPrice = maxPrice;
  const search = sp.get("search");
  if (search) query.search = search;
  if (sp.get("inStock") === "true") query.inStock = true;
  return query;
}

function draftFromParams(sp: URLSearchParams): Draft {
  return {
    search: sp.get("search") ?? "",
    minPrice: sp.get("minPrice") ?? "",
    maxPrice: sp.get("maxPrice") ?? "",
  };
}

// Beállít vagy töröl egy query paramétert az érték üressége alapján.
function applyParam(params: URLSearchParams, key: string, value: string): void {
  if (value.trim() === "") {
    params.delete(key);
  } else {
    params.set(key, value);
  }
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // A provider az EGÉSZ héjat körbeveszi (az oldalsávot is), de dolgozni csak
  // a katalógus útvonalán szabad neki. Enélkül a debounce-oló effekt más
  // oldalakon (pl. /orders) is beleírna az URL-be, és a lekérés is elindulna.
  const onCatalog = useMatch("/") !== null;

  const [data, setData] = useState<CustomerProductPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFromParams(searchParams));

  // Adatlekérés, valahányszor a szűrő/lapozás (searchParams) változik.
  useEffect(() => {
    if (!onCatalog) return;
    let cancelled = false;
    setLoading(true);
    getProducts(paramsToQuery(searchParams))
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, onCatalog]);

  // A szabad szöveges mezők debounce-olt szinkronizálása az URL-be.
  //
  // Két külön dolog, hogy az URL az ÁLLAPOT FORRÁSA, és hogy az URL egy
  // VISSZALÉPHETŐ navigáció. Ez az effekt csak az elsőt akarja: a gépelés közben
  // 300 ms-onként kiírt szűrőállapot nem a látogató navigációs szándéka. Ezért
  // `replace` — push-sal a Vissza gomb a szűrőállapotokon lépkedne visszafelé
  // ahelyett, hogy elhagyná a katalógust. Ami valódi navigáció (`goToPage`,
  // `setFilter`, `clearFilters`), az marad push.
  useEffect(() => {
    if (!onCatalog) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      applyParam(next, "search", draft.search);
      applyParam(next, "minPrice", draft.minPrice);
      applyParam(next, "maxPrice", draft.maxPrice);
      // Nincs változás → nincs navigáció. Enélkül a beillesztéskor lefutó első
      // kör is írna egyet (a piszkozat ilyenkor az URL-ből jön, tehát azonos).
      if (next.toString() === searchParams.toString()) return;
      // Ha tényleg változott valamelyik szűrő, ugorjunk az első oldalra.
      next.delete("page");
      setSearchParams(next, { replace: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, searchParams, setSearchParams, onCatalog]);

  // A katalógusra visszatérve a mezőket az URL-ből töltjük újra: a provider a
  // navigáció alatt is életben marad, tehát a régi piszkozat különben
  // ottragadna, és a debounce vissza is írná egy már elhagyott szűrőt.
  useEffect(() => {
    if (!onCatalog) return;
    setDraft(draftFromParams(searchParams));
    // Szándékosan CSAK az útvonalváltásra fut, a searchParams minden
    // változására nem — különben felülírná az éppen gépelt szöveget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCatalog]);

  const updateDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const setFilter = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        applyParam(next, key, value);
        next.delete("page");
        return next;
      });
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setDraft({ search: "", minPrice: "", maxPrice: "" });
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const goToPage = useCallback(
    (page: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("page", String(page));
        return next;
      });
    },
    [setSearchParams],
  );

  const category = searchParams.get("category") ?? "";
  const inStock = searchParams.get("inStock") === "true";

  const value = useMemo<CatalogContextValue>(
    () => ({
      data,
      loading,
      error,
      draft,
      updateDraft,
      setFilter,
      clearFilters,
      goToPage,
      category,
      inStock,
    }),
    [
      data,
      loading,
      error,
      draft,
      updateDraft,
      setFilter,
      clearFilters,
      goToPage,
      category,
      inStock,
    ],
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error("useCatalog csak CatalogProvider-en belül használható.");
  }
  return ctx;
}
