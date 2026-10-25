// A bejelentkezett felhasználó állapotát egy React Context kezeli, és
// localStorage-be menti, így oldal-újratöltés után is megmarad. A cart.tsx
// mintáját követi. A tokent az api.ts kapja meg (setAuthToken), így minden
// API-hívás Bearer fejléccel megy.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "./api";
import {
  setAuthToken,
  setUnauthorizedHandler,
  type PasswordChangeInput,
  type ProfileInput,
  type User,
} from "./api";

type AuthState = { user: User | null; token: string | null };

type AuthContextValue = {
  user: User | null;
  token: string | null;
  /**
   * Igaz, ha a munkamenetet a szerver érvénytelenítette (lejárt token), nem a
   * felhasználó lépett ki. A felület ebből tud magyarázatot adni ahelyett, hogy
   * némán elfelejtené a bejelentkezést.
   */
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
  register: (
    username: string,
    email: string,
    address: string,
    password: string,
  ) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * A saját fiókadatok mentése. A szerver a publikus felhasználót adja vissza,
   * tokent NEM: a fiókadat nem hitelesítő adat, ezért a munkamenet-token
   * változatlan marad, és csak a `user` frissül.
   */
  updateProfile: (input: ProfileInput) => Promise<void>;
  /**
   * Jelszócsere. A szerver ÚJ tokent ad, és a régit azonnal érvényteleníti —
   * ezért a tárolt tokent le KELL cserélni. Enélkül a felhasználó a saját
   * jelszócseréjétől esne ki: a következő kérés 401-et kapna.
   */
  changePassword: (input: PasswordChangeInput) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "webshop-auth";

function loadInitial(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : { user: null, token: null };
  } catch {
    return { user: null, token: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitial);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Központi 401-kezelés: ha BÁRMELYIK API-hívás lejárt munkamenetet jelez, a
  // tárolt munkamenetet eldobjuk. Enélkül a felület továbbra is bejelentkezettnek
  // látszana, miközben minden művelet hibára fut — a felhasználó pedig nem értené,
  // miért. Az api réteg a bejelentkezést és a regisztrációt kiveszi ebből: ott a
  // 401 hibás jelszót jelent, nem lejáratot.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthToken(null);
      setState({ user: null, token: null });
      setSessionExpired(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // A tokent RENDERELÉS KÖZBEN adjuk át az api rétegnek — SZÁNDÉKOSAN nem
  // effektben.
  //
  // Miért: a React a GYERMEKEK effektjeit a szülőé ELŐTT futtatja. Effektben
  // beállítva tehát egy védett oldal (pl. AdminProducts) betöltő effektje
  // hamarabb indulna, mint ez — a kérés `Authorization` fejléc nélkül menne ki,
  // és a szerver 401-et adna egy tökéletesen érvényes munkamenetre. A felület
  // ilyenkor "lejárt a munkameneted" üzenettel léptette ki a felhasználót, ha
  // egy admin oldalt közvetlen linkkel vagy oldalfrissítéssel nyitott meg.
  // Renderelés közben beállítva a token MINDEN gyermek effekt előtt a helyén van.
  //
  // Ez mellékhatás renderelés közben, ami általában kerülendő — itt viszont
  // ártalmatlan: az értéke tisztán a `state`-ből származik, tehát a többszöri
  // (StrictMode, concurrent) lefutás ugyanazt írja be.
  setAuthToken(state.token);

  // A localStorage-írás viszont marad effektben: az valódi mellékhatás, a
  // gyermekek renderelése nem függ tőle.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Induláskor a betöltött tokent a szerveren validáljuk. Érvénytelen token
  // esetén kiléptetünk (pl. a token lejárt vagy máshol bejelentkeztek).
  useEffect(() => {
    if (!state.token) return;
    let cancelled = false;
    api
      .me()
      .then((user) => {
        if (!cancelled) setState((prev) => ({ ...prev, user }));
      })
      .catch(() => {
        if (!cancelled) setState({ user: null, token: null });
      });
    // Csak induláskor futtatjuk (a token-változásokat a be-/kilépés kezeli).
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = async (
    username: string,
    email: string,
    address: string,
    password: string,
  ) => {
    const { user, token } = await api.register(
      username,
      email,
      address,
      password,
    );
    setAuthToken(token);
    setState({ user, token });
  };

  const login = async (username: string, password: string) => {
    const { user, token } = await api.login(username, password);
    setAuthToken(token);
    setState({ user, token });
    setSessionExpired(false);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // A kijelentkezést lokálisan akkor is végrehajtjuk, ha a hálózat hibázik.
    }
    setAuthToken(null);
    setState({ user: null, token: null });
    // A szándékos kijelentkezés nem "lejárat": ne magyarázkodjon a felület.
    setSessionExpired(false);
  };

  // A hívó (Adataim képernyő) a hibát maga jeleníti meg, ezért a szerver
  // üzenetét NEM nyeljük el: hagyjuk kibukni.
  const updateProfile = async (input: ProfileInput) => {
    const user = await api.updateProfile(input);
    // Csak a felhasználó frissül; a tokenhez nem nyúlunk (a válasz nem is hoz
    // újat), így a munkamenet érintetlen marad.
    setState((prev) => ({ ...prev, user }));
  };

  const changePassword = async (input: PasswordChangeInput) => {
    const { user, token } = await api.changePassword(input);
    // Ugyanaz a sorrend, mint a bejelentkezésnél: előbb az api réteg kapja meg
    // az új tokent, csak utána frissül az állapot — így a következő kérés már
    // biztosan az ÚJ tokennel megy ki.
    setAuthToken(token);
    setState({ user, token });
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      token: state.token,
      sessionExpired,
      dismissSessionExpired: () => setSessionExpired(false),
      register,
      login,
      logout,
      updateProfile,
      changePassword,
    }),
    [state, sessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Kényelmi hook az auth állapot eléréséhez bármelyik komponensből.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth csak AuthProvider-en belül használható.");
  }
  return ctx;
}
