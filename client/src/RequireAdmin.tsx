// Útvonal-őr az admin oldalakhoz.
//
// FONTOS: ez csak kényelmi funkció — megakadályozza, hogy egy vevő véletlenül
// egy használhatatlan oldalra tévedjen. Az érdemi védelem SZERVEROLDALI
// (requireAdmin az /api/admin router tetején): a felület megkerülhető, az API nem.
//
// A meglévő auth contextből olvas, saját hálózati hívás nélkül.

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Nem admin (és a be nem jelentkezett eset is): vissza a főoldalra.
  // A `replace` azért kell, hogy a Vissza gomb ne dobja vissza ide a felhasználót.
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
