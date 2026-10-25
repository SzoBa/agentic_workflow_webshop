// Témaváltó gomb: világos → sötét → rendszer → világos.
//
// Egyetlen gomb három állapottal, nem három rádiógomb: a fejlécben egy ikonnyi
// hely van, és a választás bármikor visszafordítható. A gomb ACCESSIBLE NEVE
// mondja meg, mi a jelenlegi állapot és mi lesz a következő — az ikon önmagában
// képernyőolvasóval néma volna.
import { useUi, type ThemeChoice } from "./ui";

const GLYPH: Record<ThemeChoice, string> = {
  light: "☀",
  dark: "☾",
  system: "◐",
};

const LABEL: Record<ThemeChoice, string> = {
  light: "Világos téma",
  dark: "Sötét téma",
  system: "Rendszer szerinti téma",
};

const NEXT: Record<ThemeChoice, ThemeChoice> = {
  light: "dark",
  dark: "system",
  system: "light",
};

export function ThemeToggle() {
  const { theme, cycleTheme } = useUi();

  return (
    <button
      type="button"
      className="btn-icon"
      onClick={cycleTheme}
      title={LABEL[theme]}
      aria-label={`${LABEL[theme]} — váltás erre: ${LABEL[NEXT[theme]].toLowerCase()}`}
    >
      <span aria-hidden="true">{GLYPH[theme]}</span>
    </button>
  );
}
