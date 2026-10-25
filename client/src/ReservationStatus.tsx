// A készletfoglalás állapota egy rendelésen: visszaszámláló vagy lejárat-magyarázat.
//
// A két megjelenés egy fájlban él (a Stars.tsx mintájára), mert ugyanannak a
// ténynek a két arca, és mindig egyeznie kell: ha jár a visszaszámláló, a
// foglalás él; ha lejárt, magyarázatot kell adni helyette.
//
// A visszaszámláló a szervertől kapott `reservedUntil`-ból dolgozik, nem
// beégetett foglalási időből: így a szerver konfigurációjának megváltozása nem
// teszi hazuggá a felületet.
import type { Order } from "./api";

/**
 * A foglalás hátralévő idejének emberi olvasatú alakja.
 * A lejárt (vagy hiányzó) foglalásra `null`-t ad — a hívó ilyenkor nem mutat
 * visszaszámlálót, mert a rendelés státusza már úgyis beszél helyette.
 */
export function remainingReservation(
  reservedUntil: string | undefined,
  now: Date = new Date(),
): string | null {
  if (!reservedUntil) return null;
  const ms = new Date(reservedUntil).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} nap ${hours % 24} óra`;
  }
  if (hours > 0) return `${hours} óra ${minutes} perc`;
  return `${minutes} perc`;
}

export function ReservationStatus({ order }: { order: Order }) {
  if (order.status === "expired") {
    return (
      <p className="reservation reservation-expired">
        A foglalás lejárt, ezért a készletet mások is megvásárolhatják. A
        rendelést a bolt ettől még teljesítheti.
      </p>
    );
  }
  if (order.status !== "pending") return null;

  // Egyszer számoljuk ki, és egyszer írjuk ki. A hívó korábban kétszer hívta
  // ugyanarra a rendelésre (feltétel + szöveg), két külön `new Date()`-tel —
  // a kettő elvben eltérhetett.
  const remaining = remainingReservation(order.reservedUntil);
  if (!remaining) return null;
  return <p className="reservation">A foglalás még {remaining} érvényes.</p>;
}
