// Csillagos értékelés megjelenítése (csak olvasás).
//
// Két megjelenés van, ezért két komponens: a `StarBar` EGY értékelés
// csillagait rajzolja ki (a véleménylistában), a `RatingSummary` pedig egy
// termék ÁTLAGÁT a darabszámmal (a terméklista kártyáin és a részletes
// nézetben). Közös fájlban, mert a "Nincs értékelés" állapotnak és a csillagok
// kinézetének mindenhol egyeznie kell.

const MAX_STARS = 5;

/** A kitöltött/üres csillagok szövege, pl. 4 → "★★★★☆". */
function starGlyphs(value: number): string {
  // A kerekítés az átlag miatt kell (4.3 → 4 csillag); az egyedi értékelések
  // rating mezője már eleve egész.
  const filled = Math.min(MAX_STARS, Math.max(0, Math.round(value)));
  return "★".repeat(filled) + "☆".repeat(MAX_STARS - filled);
}

/**
 * Egyetlen értékelés csillagai. A csillagok maguk dekoratívak (aria-hidden),
 * a képernyőolvasó a feliratot kapja meg helyettük.
 */
export function StarBar({ value }: { value: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value} csillag az 5-ből`}>
      <span aria-hidden="true">{starGlyphs(value)}</span>
    </span>
  );
}

/**
 * Egy termék értékelési összesítője: átlag + darabszám.
 *
 * A szerver értékelés nélkül `{ ratingAvg: 0, ratingCount: 0 }`-t ad vissza —
 * ez NEM "0 csillag", hanem a hiányzó értékelés állapota, ezért a darabszám
 * (és nem az átlag) dönti el, mit mutatunk.
 */
export function RatingSummary({
  value,
  count,
}: {
  value: number;
  count: number;
}) {
  if (count === 0) {
    return <p className="rating rating-empty">Nincs értékelés</p>;
  }

  return (
    <p className="rating">
      <StarBar value={value} />
      <span className="rating-text">
        {/* Magyar tizedesvessző (4,3), egy tizedesre — ahogy a szerver kerekít. */}
        {value.toLocaleString("hu-HU", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}{" "}
        ({count} értékelés)
      </span>
    </p>
  );
}
