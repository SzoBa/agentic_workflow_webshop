// A felület saját (nem üzleti) állapota: a választott téma és a kosárfiók
// nyitottsága. A cart.tsx / auth.tsx mintáját követi — context + provider +
// `useUi()` hook, ami provideren kívül dob.
//
// Miért nem elég a `prefers-color-scheme` médiakérdés a CSS-ben? Mert a
// látogató FELÜL akarhatja írni a rendszer beállítását. Ezért a téma egyetlen
// forrása a <html data-theme="…"> attribútum: a CSS csak azt nézi, ez a modul
// pedig azt tartja karban. Az első értéket még az index.html fejlécében futó
// apró script írja be — ha itt tennénk, a sötét témát választó látogató egy
// villanásnyi fehér oldalt látna, mielőtt a React elindul.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** A látogató választása. A `system` nem téma, hanem "kövesd a rendszert". */
export type ThemeChoice = "light" | "dark" | "system";
/** Amit ténylegesen megjelenítünk — a `system` ebből az egyikre oldódik fel. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "webshop-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

// A jsdom nem implementálja a matchMedia-t, és régi böngészőkben sincs mindig.
// Ilyenkor a világos téma a biztonságos alapértelmezés.
function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(DARK_QUERY);
}

function systemTheme(): ResolvedTheme {
  return mediaQuery()?.matches ? "dark" : "light";
}

function isChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

function readChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isChoice(raw) ? raw : "system";
  } catch {
    // Privát módban a localStorage olvasása is dobhat.
    return "system";
  }
}

/** A választásból megjelenítendő téma. Exportált, mert az index.html scriptje
 *  ugyanezt a szabályt ismétli — ha itt változik, ott is kell. A két oldal
 *  egyezését az e2e/features/tema.feature méri, nem a jóhiszeműség. */
export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === "system" ? systemTheme() : choice;
}

type UiContextValue = {
  /** A látogató választása (ezt mutatja a kapcsoló). */
  theme: ThemeChoice;
  /** A ténylegesen megjelenített téma. */
  resolvedTheme: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
  /** Körbeforgó váltás: világos → sötét → rendszer → világos. */
  cycleTheme: () => void;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
};

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(readChoice);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readChoice()),
  );
  const [cartOpen, setCartOpen] = useState(false);

  // A választás átvezetése a DOM-ra és a tárolóba. Ez az EGYETLEN hely, ahol a
  // data-theme attribútum íródik (az induló értéket leszámítva).
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // A téma megmaradása kényelmi funkció: ha nem menthető, a felület attól
      // még helyesen működik ebben a munkamenetben.
    }
  }, [theme]);

  // Rendszerkövetés esetén a futás közbeni átállásra is reagálunk (a
  // felhasználó nappali/éjszakai módot vált a gépén, nyitva hagyott lappal).
  useEffect(() => {
    if (theme !== "system") return;
    const mq = mediaQuery();
    if (!mq) return;
    const onChange = () => {
      const resolved = systemTheme();
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) =>
      prev === "light" ? "dark" : prev === "dark" ? "system" : "light",
    );
  }, []);

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const value = useMemo<UiContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      cycleTheme,
      cartOpen,
      openCart,
      closeCart,
    }),
    [theme, resolvedTheme, setTheme, cycleTheme, cartOpen, openCart, closeCart],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) {
    throw new Error("useUi csak UiProvider-en belül használható.");
  }
  return ctx;
}
