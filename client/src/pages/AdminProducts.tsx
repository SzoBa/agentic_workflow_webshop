// Termékkezelő oldal (admin). A /api/admin/products végpontról dolgozik, amely
// a vásárlóival szemben az INAKTÍV termékeket is visszaadja.
//
// Az oldalt az App.tsx a RequireAdmin őrbe csomagolva köti be — de az őr csak
// kényelmi funkció, az érdemi védelem szerveroldali.
//
// A lista állapotát mindig a LEGUTOLSÓ kérés írja: a szűrők gépelés közben is
// kérést indítanak, a válaszok pedig tetszőleges sorrendben érkezhetnek. A
// `requestId` őre nélkül egy korábbi, lassabb válasz felülírná a frissebbet.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  getAdminProducts,
  createProduct,
  updateProduct,
  setProductActive,
  deleteProduct,
  formatPrice,
  type AdminProductQuery,
  type AdminProduct,
  type Product,
  type ProductInput,
} from "../api";

// A követelmény szerinti kötelező képméret.
const REQUIRED_WIDTH = 400;
const REQUIRED_HEIGHT = 300;

// Az űrlap mezői szövegként élnek, mert a number input üres állapota is
// szöveg — így a "hiányzó készlet" eset megkülönböztethető a nullától.
type FormState = {
  name: string;
  description: string;
  price: string;
  stock: string;
  category: string;
  imageUrl: string;
  active: boolean;
};

/**
 * A szabad szöveges szűrők. Szövegként élnek (nem számként): az üres ársáv-mező
 * "nincs szűrés", nem nulla — ugyanaz az ok, mint az űrlap mezőinél.
 */
type TextFilters = { search: string; minPrice: string; maxPrice: string };

const NO_TEXT_FILTERS: TextFilters = { search: "", minPrice: "", maxPrice: "" };

function sameTextFilters(a: TextFilters, b: TextFilters): boolean {
  return (
    a.search === b.search && a.minPrice === b.minPrice && a.maxPrice === b.maxPrice
  );
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  price: "",
  stock: "",
  category: "",
  imageUrl: "",
  active: true,
};

function toForm(p: Product): FormState {
  return {
    name: p.name,
    description: p.description,
    price: String(p.price),
    stock: String(p.stock),
    category: p.category,
    imageUrl: p.imageUrl,
    active: p.active,
  };
}

function toInput(f: FormState): ProductInput {
  return {
    name: f.name,
    description: f.description,
    // Üres mezőből NaN lesz, amit a szerver validációja utasít el magyar
    // üzenettel — így egyetlen helyen (a szerveren) él a szabály.
    price: Number(f.price),
    stock: f.stock.trim() === "" ? Number.NaN : Number(f.stock),
    category: f.category,
    imageUrl: f.imageUrl,
    active: f.active,
  };
}

/**
 * Képméret-ellenőrzés a szerkesztő felületen. A szerver a képet nem tölti le,
 * ezért ez itt történik. Két hibaeset külön üzenettel, mert a teendő is más:
 * a betöltési hiba rossz hivatkozásra utal, a méreteltérés rossz képre.
 */
function checkImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth !== REQUIRED_WIDTH || img.naturalHeight !== REQUIRED_HEIGHT) {
        resolve(
          `A kép mérete ${img.naturalWidth}*${img.naturalHeight}, ` +
            `de ${REQUIRED_WIDTH}*${REQUIRED_HEIGHT} méretűnek kell lennie.`,
        );
      } else {
        resolve(null);
      }
    };
    img.onerror = () =>
      resolve("A kép nem tölthető be a megadott hivatkozásról. Ellenőrizd az URL-t.");
    img.src = url;
  });
}

export function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // A legelső betöltés külön van kezelve: a szűrők miatti újratöltéseknél NEM
  // cseréljük le a teljes oldalt egy "betöltés…" szövegre, mert azzal a
  // keresőmező is eltűnne a DOM-ból, és gépelés közben elveszne a fókusz.
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Szűrők. Bármelyik változása visszaugrik az első lapra, különben egy szűkítés
  // után a felhasználó egy már nem létező oldalszámon találná magát.
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<AdminProductQuery["status"]>("all");
  // A szabad szöveges mezők KÉT állapotban élnek: amit gépelnek (`draft`), és
  // ami ténylegesen kérést indít (`text`). A kettőt 300 ms nyugalom köti össze —
  // ugyanaz a minta, mint a ProductList szabad szöveges mezőin. Ez a kérések
  // SZÁMÁT csökkenti; a helyességet nem ez adja, hanem a `requestId`.
  const [draft, setDraft] = useState<TextFilters>(NO_TEXT_FILTERS);
  const [text, setText] = useState<TextFilters>(NO_TEXT_FILTERS);

  // Minden lekérés kap egy sorszámot, és CSAK a legutolsó írhat állapotot. A
  // válaszok sorrendje nem garantált: az "ab"-re indított kérés beérhet az
  // "abc"-re indított UTÁN, és felülírná a helyes találatokat.
  const requestId = useRef(0);

  // A kiválasztós szűrők (kategória, állapot) azonnal hatnak: ott nincs mit
  // kivárni, egy választás egy kérés.
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  // A gépelés csak 300 ms szünet után válik kéréssé. Az egyezés-ág az első
  // rendereléskor (és a beállt érték után) meg is spórolja az időzítőt.
  useEffect(() => {
    if (sameTextFilters(draft, text)) return;
    const timer = setTimeout(() => {
      setText(draft);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, text]);

  // Az űrlap állapota. A `form` null, ha éppen nincs szerkesztés folyamatban.
  // Az `editingId` null egy ÚJ terméknél, egyébként a szerkesztett termék id-je.
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const id = ++requestId.current;
    // Elavult a válasz, ha közben újabb kérés indult — ilyenkor egyetlen
    // állapotot sem írunk, a betöltésjelzőt is a friss kérés fogja levenni.
    const stale = () => id !== requestId.current;
    setLoading(true);
    setError(null);
    getAdminProducts({
      page,
      search: text.search.trim() || undefined,
      category: category || undefined,
      status,
      minPrice: text.minPrice.trim() === "" ? undefined : Number(text.minPrice),
      maxPrice: text.maxPrice.trim() === "" ? undefined : Number(text.maxPrice),
    })
      .then((res) => {
        if (stale()) return;
        setProducts(res.items);
        setCategories(res.categories);
        setTotalPages(res.totalPages);
        setTotal(res.total);
        // A szerver a lapszámot 1..totalPages közé vágja; ezt visszavezetjük az
        // állapotba, különben az utolsó oldal utolsó elemének törlése után a
        // felület egy nem létező oldalszámot mutatna. A feltétel a SZÁNDÉKOT
        // mondja ki ("csak vágáskor írunk"): azonos értékre a React amúgy sem
        // renderelne újra.
        if (res.page !== page) setPage(res.page);
      })
      .catch((e) => {
        if (stale()) return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (stale()) return;
        setLoading(false);
        setFirstLoadDone(true);
      });
  }, [page, text, category, status]);

  // Az érvénytelenítés magában a `load`-ban van, nem effektus-takarításban: a
  // sorszám a kérés INDÍTÁSAKOR lép tovább, tehát minden újrafutás (és a mentés,
  // az aktiválás, a törlés utáni manuális újratöltés is) elvágja az előzőt.
  useEffect(load, [load]);

  function startNew() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
  }

  function startEdit(p: Product) {
    setForm(toForm(p));
    setEditingId(p.id);
    setFormError(null);
  }

  function cancelEdit() {
    setForm(null);
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError(null);
    try {
      // Előbb a képméret (ezt csak a böngésző tudja ellenőrizni), utána a mentés.
      const imageError = await checkImage(form.imageUrl);
      if (imageError) {
        setFormError(imageError);
        return;
      }

      if (editingId) {
        await updateProduct(editingId, toInput(form));
      } else {
        await createProduct(toInput(form));
      }
      cancelEdit();
      load();
    } catch (err) {
      // FONTOS: a szerverhibát csak MEGJELENÍTJÜK — az űrlapállapotot nem
      // írjuk felül és nem dobjuk el, hogy a beírt adatok megmaradjanak.
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Aktív/inaktív váltás a listából, űrlap megnyitása nélkül.
  // Dedikált végpontot hív, nem a teljes terméket menti: így egy régebbi,
  // szabálysértő adatú termék is elrejthető a vásárlók elől anélkül, hogy előbb
  // ki kellene javítani egy olyan mezőt, amihez nem nyúltunk.
  async function toggleActive(p: Product) {
    setError(null);
    try {
      await setProductActive(p.id, !p.active);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // A törlés VÉGLEGES és különbözik az inaktiválástól — ezért kér megerősítést.
  async function handleDelete(p: Product) {
    const confirmed = window.confirm(
      `Biztosan véglegesen törlöd a(z) „${p.name}” terméket?\n\n` +
        "A törlés nem vonható vissza. Ha csak el szeretnéd rejteni a vásárlók " +
        "elől, állítsd inaktívra.",
    );
    if (!confirmed) return;

    setError(null);
    try {
      await deleteProduct(p.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!firstLoadDone) return <p>Termékek betöltése…</p>;

  return (
    <>
      <h1>Termékek kezelése</h1>
      {error && <p className="error">Hiba: {error}</p>}

      {form ? (
        <div className="panel editor-panel">
          <form className="form-stack" onSubmit={handleSubmit}>
            <h2>{editingId ? "Termék szerkesztése" : "Új termék"}</h2>

            <label>
              Név
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Leírás
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label>
              Ár (Ft)
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label>
              Készlet (db)
              <input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </label>
            <label>
              Kategória
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
            <label>
              Kép URL ({REQUIRED_WIDTH}*{REQUIRED_HEIGHT})
              <input
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Aktív (látszik a vásárlói felületen)
            </label>

            {formError && <p className="error">Hiba: {formError}</p>}

            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? "Mentés…" : "Mentés"}
              </button>
              <button type="button" className="link-button" onClick={cancelEdit}>
                Mégse
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button type="button" onClick={startNew}>
          + Új termék
        </button>
      )}

      {/* A szűrők a lista FÖLÖTT, egy sorban — a táblázat így kapja meg a
          teljes szélességet. */}
      <div className="toolbar">
        <h2 className="sr-only">Szűrés</h2>
        <label className="toolbar-grow">
          Keresés (név, leírás)
          <input
            type="search"
            value={draft.search}
            onChange={(e) => setDraft({ ...draft, search: e.target.value })}
          />
        </label>
        <label>
          Kategória
          <select
            value={category}
            onChange={(e) => changeFilter(() => setCategory(e.target.value))}
          >
            <option value="">Összes</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Állapot
          <select
            value={status}
            onChange={(e) =>
              changeFilter(() =>
                setStatus(e.target.value as AdminProductQuery["status"]),
              )
            }
          >
            <option value="all">Összes</option>
            <option value="active">Csak aktív</option>
            <option value="inactive">Csak inaktív</option>
          </select>
        </label>
        <div className="price-range">
          <label>
            Ár min.
            <input
              type="number"
              value={draft.minPrice}
              onChange={(e) => setDraft({ ...draft, minPrice: e.target.value })}
            />
          </label>
          <label>
            Ár max.
            <input
              type="number"
              value={draft.maxPrice}
              onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value })}
            />
          </label>
        </div>
        <p className="toolbar-count">
          {loading ? "Frissítés…" : `${total} termék`}
        </p>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Név</th>
              <th>Kategória</th>
              <th className="num">Ár</th>
              <th className="num">Készlet</th>
              <th className="num">Foglalt</th>
              <th className="num">Elérhető</th>
              <th>Állapot</th>
              <th>Műveletek</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td className="num">{formatPrice(p.price)}</td>
                {/* Három külön szám, mert három külön dolog: mennyi van a
                    raktárban, mennyit kötöttek le a még nem teljesített
                    rendelések, és mennyi adható még el. */}
                <td className="num">{p.stock} db</td>
                <td className="num">{p.reserved} db</td>
                <td className="num">{p.available} db</td>
                <td>
                  <span
                    className={p.active ? "status status-delivered" : "status"}
                  >
                    {p.active ? "Aktív" : "Inaktív"}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => startEdit(p)}
                  >
                    Szerkesztés
                  </button>{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => toggleActive(p)}
                  >
                    {p.active ? "Inaktiválás" : "Aktiválás"}
                  </button>{" "}
                  <button
                    type="button"
                    className="link-button is-danger"
                    onClick={() => handleDelete(p)}
                  >
                    Törlés
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {products.length === 0 && <p className="empty-state is-inline">Nincs megjeleníthető termék.</p>}

      <div className="pagination">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ← Előző
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Következő →
        </button>
      </div>
    </>
  );
}
