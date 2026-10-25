// Rendeléskezelő oldal (admin). A GET /api/admin/orders végpontról dolgozik,
// ami a TELJES rendeléshalmazt adja vissza, legújabb elöl — szemben a vásárlói
// GET /api/orders-szal, ami csak a hívó saját rendeléseit.
//
// Az oldalt az App.tsx a RequireAdmin őrbe csomagolva köti be — de az őr csak
// kényelmi funkció, az érdemi védelem szerveroldali.
//
// KÉT SZABÁLY, amit itt könnyű véletlenül elrontani:
//  1. A foglalás állapotát a meglévő ReservationStatus komponens jeleníti meg
//     MINDEN soron. A státusz szerinti elágazás (visszaszámláló / lejárat-
//     magyarázat / semmi) a komponens dolga — ez az oldal nem ismétli meg, és
//     nem számol saját hátralévő időt.
//  2. Az érvényes státuszátmenetekről a SZERVER állapotgépe dönt. Az
//     átmenettáblát a kliens nem másolja le: a kérés kimegy, és a szerver
//     magyar hibaüzenete változtatás nélkül jelenik meg.
//  3. Az oldal állapotát mindig a LEGUTOLSÓ kérés írja. A szűrők gépelés
//     közben is kérést indítanak, a válaszok pedig tetszőleges sorrendben
//     érkezhetnek — a `requestId` őre nélkül egy korábbi, lassabb válasz
//     felülírná a frissebbet.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAdminOrders,
  updateAdminOrderStatus,
  formatPrice,
  ORDER_STATUS_LABELS,
  type AdminOrder,
  type OrderItem,
  type OrderStatus,
} from "../api";
import { ReservationStatus } from "../ReservationStatus";

const dateFormatter = new Intl.DateTimeFormat("hu-HU", {
  dateStyle: "medium",
  timeStyle: "short",
});

// A státusz-szűrő választható értékei. A feliratok az ORDER_STATUS_LABELS-ből
// jönnek: ugyanarra a fogalomra nem születik új magyar szöveg. Az "összes" az
// alapértelmezés — az api.ts azt el sem küldi a szervernek.
const STATUS_OPTIONS: OrderStatus[] = ["pending", "expired", "delivered"];

// A tétel megjelenítendő neve. A `name` a leadáskori snapshot; a snapshot
// bevezetése ELŐTT leadott rendeléseken hiányzik, ezért kell a tartalék szöveg
// (ugyanaz a felirat, mint a Rendeléseim oldalon — nem új fogalom).
function itemName(item: OrderItem): string {
  return item.name ?? "Már nem elérhető termék";
}

/** A státuszváltás elutasítása, ahhoz a sorhoz kötve, ahol történt. */
type StatusError = { orderId: string; message: string };

export function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // A legelső betöltés külön van kezelve: a szűrők miatti újratöltéseknél NEM
  // cseréljük le a teljes oldalt egy "betöltés…" szövegre, mert azzal a
  // keresőmező is eltűnne a DOM-ból, és gépelés közben elveszne a fókusz.
  // (Ugyanaz a minta, mint az AdminProducts oldalon.)
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Szűrők. Bármelyik változása visszaugrik az első lapra, különben egy
  // szűkítés után a felhasználó egy már nem létező oldalszámon találná magát.
  const [status, setStatus] = useState<string>("all");
  // A keresés KÉT állapot: amit a mezőbe gépelnek (`searchDraft`), és ami
  // ténylegesen kérést indít (`search`). A kettőt 300 ms nyugalom köti össze —
  // ugyanaz a minta, mint a ProductList szabad szöveges mezőin. Ez a
  // kérésszámot csökkenti; a helyességet nem ez adja, hanem a `requestId`.
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  // Státuszváltás: melyik soron fut éppen kérés, és melyiket utasította el a
  // szerver.
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<StatusError | null>(null);

  // Minden lekérés kap egy sorszámot, és CSAK a legutolsó írhat állapotot. A
  // válaszok sorrendje nem garantált: az "ab"-re indított kérés beérhet az
  // "abc"-re indított UTÁN, és felülírná a helyes találatokat.
  const requestId = useRef(0);

  function changeStatusFilter(value: string) {
    setStatus(value);
    setPage(1);
  }

  // A gépelés csak 300 ms szünet után válik kéréssé. A `searchDraft === search`
  // ág az első rendereléskor (és a beállt érték után) meg is spórolja az időzítőt.
  useEffect(() => {
    if (searchDraft === search) return;
    const timer = setTimeout(() => {
      setSearch(searchDraft);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchDraft, search]);

  const load = useCallback(() => {
    const id = ++requestId.current;
    // Elavult a válasz, ha közben újabb kérés indult — ilyenkor egyetlen
    // állapotot sem írunk, a betöltésjelzőt is a friss kérés fogja levenni.
    const stale = () => id !== requestId.current;
    setLoading(true);
    setError(null);
    getAdminOrders({ page, status, search: search.trim() || undefined })
      .then((res) => {
        if (stale()) return;
        setOrders(res.items);
        setTotalPages(res.totalPages);
        setTotal(res.total);
        // A szerver a lapszámot 1..totalPages közé vágja; ezt visszavezetjük az
        // állapotba, hogy a lapozó ne mutasson nem létező oldalszámot. A feltétel
        // a SZÁNDÉKOT mondja ki ("csak vágáskor írunk"), kérést nem spórol:
        // azonos értékre a React amúgy sem renderelne újra, tehát a `page` mint
        // `load`-függőség sem mozdulna.
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
  }, [page, status, search]);

  // Az érvénytelenítés magában a `load`-ban van, nem effektus-takarításban: a
  // sorszám a kérés INDÍTÁSAKOR lép tovább, tehát minden újrafutás (és a
  // changeStatus manuális újratöltése is) elvágja az előzőt. Leszereléskor nincs
  // mit takarítani — a beérkező válasz akkor már úgysem renderel semmit.
  useEffect(load, [load]);

  async function changeStatus(order: AdminOrder, next: OrderStatus) {
    setStatusError(null);
    setSavingId(order.id);
    try {
      const updated = await updateAdminOrderStatus(order.id, next);
      // A helyben javítás CSAK addig helyes, amíg a váltás nem dönti el újra,
      // hogy a sor beletartozik-e a listába. Aktív státusz-szűrőnél eldönti:
      // `pending` szűrés mellett a kiszállítottá tett rendelés bent ragadna egy
      // olyan lapon, amin definíció szerint nem lehetne — és a `total` is tovább
      // számolná. Ilyenkor a lapot a szerver rakja össze újra.
      if (status !== "all" && updated.status !== status) {
        load();
        return;
      }
      // Az érintett sort a SZERVER válaszából építjük újra, nem a régi sor
      // felülírásával: így a `reservedUntil` is a szerver szerint alakul (a
      // kiszállított rendelésről el is tűnik). A `username`-et visszük tovább,
      // mert azt a PATCH válasza nem tartalmazza.
      setOrders((prev) =>
        prev.map((o) =>
          o.id === updated.id
            ? {
                ...updated,
                ...(o.username !== undefined ? { username: o.username } : {}),
              }
            : o,
        ),
      );
    } catch (err) {
      // A szerver hibaüzenetét VÁLTOZTATÁS NÉLKÜL mutatjuk meg: a 409-es
      // szövegek (fedezethiány, végállapot) éppen azt mondják meg az adminnak,
      // miért nem sikerült a váltás.
      setStatusError({ orderId: order.id, message: (err as Error).message });
    } finally {
      setSavingId(null);
    }
  }

  if (!firstLoadDone) return <p>Rendelések betöltése…</p>;

  return (
    <>
      <h1>Rendelések kezelése</h1>
      {error && <p className="error">Hiba: {error}</p>}

      {/* A szűrők a lista FÖLÖTT, egy sorban: az oldalsáv szűrőhelye a
          katalógusé, itt pedig a táblázat kapja a teljes szélességet. */}
      <div className="toolbar">
        <h2 className="sr-only">Szűrés</h2>
        <label className="toolbar-grow">
          Keresés (vevő neve, email, rendelésazonosító)
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </label>
        <label>
          Státusz
          <select
            value={status}
            onChange={(e) => changeStatusFilter(e.target.value)}
          >
            <option value="all">Összes</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {/* A találatszám szövege szó szerint számít: az e2e pontos egyezéssel
            keresi ("11 rendelés" tartalmazná az "1 rendelés"-t). */}
        <p className="toolbar-count">
          {loading ? "Frissítés…" : `${total} rendelés`}
        </p>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Azonosító</th>
              <th>Leadva</th>
              <th>Vevő</th>
              <th>Tételek</th>
              <th className="num">Végösszeg</th>
              <th>Státusz</th>
              <th>Foglalás</th>
              <th>Műveletek</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <code>{o.id}</code>
                </td>
                <td>{dateFormatter.format(new Date(o.createdAt))}</td>
                <td>
                  {/* A `customer` a leadáskori MÁSOLAT, a `username` a fiók mai
                      neve. Törölt fióknál a szerver el sem küldi a mezőt.

                      Az e-mail azért látszik, mert a keresés illeszkedik rá: e-mailre
                      keresve enélkül semmi nem magyarázná, miért jött a sor. */}
                  {o.customer.name}
                  <span className="admin-order-email">{o.customer.email}</span>
                  {o.username && (
                    <span className="admin-order-username">{o.username}</span>
                  )}
                </td>
                <td>
                  <ul>
                    {o.items.map((item) => (
                      <li key={item.productId}>
                        {itemName(item)} × {item.quantity} db
                      </li>
                    ))}
                  </ul>
                </td>
                {/* A tárolt végösszeg az igazság: a tételsorokból SOHA nem
                    számolunk újra (lásd Rendeléseim). */}
                <td className="num">{formatPrice(o.total)}</td>
                <td>
                  <span className={`status status-${o.status}`}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </td>
                <td>
                  {/* Minden soron ugyanaz a komponens: ő dönti el, mit mutat. */}
                  <ReservationStatus order={o} />
                </td>
                <td>
                  {/* Egyetlen művelet, és NEM az átmenettábla másolata: a kliens nem
                      dönti el, melyik átmenet érvényes — az ítélet a szerveré, a
                      hibaüzenete szó szerint jelenik meg. A `delivered` viszont
                      VÉGÁLLAPOT, ezért ott nincs mit felkínálni: a szerver idempotens
                      sikerrel válaszolna, tehát a gomb cselekvőképesnek látszana,
                      miközben semmit nem változtat (AR-20). */}
                  {o.status !== "delivered" && (
                    <button
                      type="button"
                      className="link-button"
                      disabled={savingId === o.id}
                      onClick={() => changeStatus(o, "delivered")}
                    >
                      {savingId === o.id ? "Mentés…" : "Kiszállítottá tétel"}
                    </button>
                  )}
                  {statusError && statusError.orderId === o.id && (
                    <p className="error">{statusError.message}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {orders.length === 0 && (
        <p className="empty-state is-inline">Nincs megjeleníthető rendelés.</p>
      )}

      {/* Lapozó csak akkor, ha van hova lapozni. */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
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
      )}
    </>
  );
}
