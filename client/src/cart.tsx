// A kosár állapotát egy React Context kezeli, és localStorage-be menti,
// így oldal-újratöltés után is megmarad. A kosár tisztán kliens-oldali,
// nincs session a szerveren. Checkoutkor a tartalmát POST-oljuk az API-nak.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "./api";
import { useAuth } from "./auth";

export type CartItem = {
  product: Product;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  /** A kosárban lévő darabszámok összege (fejléc badge-hez). */
  count: number;
  /** A kosár teljes értéke forintban. */
  total: number;
  add: (product: Product) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

// A kosár kulcsa felhasználónként külön: a belépett user id-ja alapján, vagy
// "anon" kijelentkezett állapotban. Így minden fióknak saját kosara van,
// és nincs kereszt-felhasználós szivárgás egy böngészőn belül.
function cartKey(userId: string | undefined): string {
  return `webshop-cart:${userId ?? "anon"}`;
}

function load(key: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const storageKey = cartKey(user?.id);

  const [items, setItems] = useState<CartItem[]>(() => load(storageKey));
  const keyRef = useRef(storageKey);

  // Be-/kijelentkezéskor (kulcsváltás) az adott felhasználó kosarát töltjük be.
  useEffect(() => {
    if (keyRef.current !== storageKey) {
      keyRef.current = storageKey;
      setItems(load(storageKey));
    }
  }, [storageKey]);

  // Minden változásnál az aktuális kulcsra mentünk localStorage-be.
  useEffect(() => {
    localStorage.setItem(keyRef.current, JSON.stringify(items));
  }, [items]);

  const add = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const setQuantity = (productId: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.product.id !== productId)
        : prev.map((i) =>
            i.product.id === productId ? { ...i, quantity } : i,
          ),
    );
  };

  const remove = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const clear = () => setItems([]);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    const total = items.reduce(
      (sum, i) => sum + i.product.price * i.quantity,
      0,
    );
    return { items, count, total, add, setQuantity, remove, clear };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// Kényelmi hook a kosár eléréséhez bármelyik komponensből.
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart csak CartProvider-en belül használható.");
  }
  return ctx;
}
