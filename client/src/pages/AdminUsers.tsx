// "Ügyfelek" oldal (admin). A felirat magyarul Ügyfelek, a modell neve User —
// lásd CONTEXT.md.
//
// Új felhasználó felvételére NINCS mód: fiók kizárólag regisztrációval
// keletkezik, mert a jelszó itt nem adható meg. A jelszó nem is módosítható.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  getAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  type AdminUser,
  type AdminUserInput,
  type Role,
} from "../api";

const dateFormatter = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium" });

type FormState = AdminUserInput;

function toForm(u: AdminUser): FormState {
  return {
    username: u.username,
    email: u.email,
    address: u.address,
    role: u.role,
  };
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Az űrlap állapota. A `form` null, ha éppen nincs szerkesztés folyamatban.
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Csak a legutolsó lekérés írhat állapotot — ugyanaz a sorszámos őr, mint a
  // másik két admin listán.
  //
  // Itt ez MA még védekezés: szűrő nincs, a `load`-ot csak a mentés és a törlés
  // hívja, és amíg fut, az egész oldal helyén a "betöltés…" szöveg áll (lásd
  // lent a `loading` ágat), tehát a felhasználó nem tud második műveletet
  // indítani. Az őr abban a pillanatban válik érdemivé, amikor ez az oldal is
  // átveszi a másik kettő `firstLoadDone` mintáját (a lista újratöltés közben is
  // látszik, kattintható gombokkal) — a versenyhelyzet ott némán nyílna meg.
  // Ezért nem a távoli `loading` ágra bízzuk az invariánst, hanem ide írjuk.
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    const stale = () => id !== requestId.current;
    setLoading(true);
    setError(null);
    getAdminUsers()
      .then((items) => {
        if (stale()) return;
        setUsers(items);
      })
      .catch((e) => {
        if (stale()) return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (stale()) return;
        setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  function startEdit(u: AdminUser) {
    setForm(toForm(u));
    setEditingId(u.id);
    setFormError(null);
  }

  function cancelEdit() {
    setForm(null);
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form || !editingId) return;
    setSaving(true);
    setFormError(null);
    try {
      await updateAdminUser(editingId, form);
      cancelEdit();
      load();
    } catch (err) {
      // A szerverhibát csak MEGJELENÍTJÜK — az űrlapállapotot nem írjuk felül,
      // hogy a beírt adatok ne vesszenek el. (Ugyanaz a minta, mint az
      // AdminProducts oldalon; a kettő szándékosan egyforma.)
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: AdminUser) {
    const confirmed = window.confirm(
      `Biztosan törlöd a(z) „${u.username}” ügyfelet?\n\n` +
        "A törlés nem vonható vissza. A korábbi rendelései megmaradnak, mert a " +
        "rendelés önálló bizonylat.",
    );
    if (!confirmed) return;

    setError(null);
    try {
      await deleteAdminUser(u.id);
      load();
    } catch (err) {
      // A szerver itt utasíthatja el a törlést az utolsó-admin védelem miatt;
      // az üzenetét változtatás nélkül mutatjuk meg.
      setError((err as Error).message);
    }
  }

  if (loading) return <p>Ügyfelek betöltése…</p>;

  return (
    <>
      <h1>Ügyfelek</h1>
      <p>
        Új ügyfél felvételére itt nincs mód: fiók kizárólag regisztrációval
        keletkezik. A jelszó nem módosítható.
      </p>
      {error && <p className="error">Hiba: {error}</p>}

      {form && (
        <div className="panel editor-panel">
          <form className="form-stack" onSubmit={handleSubmit}>
            <h2>Ügyfél szerkesztése</h2>

            <label>
              Felhasználónév
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </label>
            <label>
              Email
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Szállítási cím
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
            <label>
              Szerepkör
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as Role })
                }
              >
                <option value="customer">Vásárló (customer)</option>
                <option value="admin">Adminisztrátor (admin)</option>
              </select>
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
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Felhasználónév</th>
              <th>Email</th>
              <th>Cím</th>
              <th>Szerepkör</th>
              <th>Regisztrált</th>
              <th>Műveletek</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.address}</td>
                <td>
                  <span
                    className={
                      u.role === "admin" ? "status status-pending" : "status"
                    }
                  >
                    {u.role === "admin" ? "Adminisztrátor" : "Vásárló"}
                  </span>
                </td>
                <td>{dateFormatter.format(new Date(u.createdAt))}</td>
                <td>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => startEdit(u)}
                  >
                    Szerkesztés
                  </button>{" "}
                  <button
                    type="button"
                    className="link-button is-danger"
                    onClick={() => handleDelete(u)}
                  >
                    Törlés
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
