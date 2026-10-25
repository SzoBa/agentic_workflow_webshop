// Útvonal-őr a bejelentkezéshez kötött oldalakhoz (ma: /profile).
//
// FONTOS: ez csak kényelmi funkció — megakadályozza, hogy egy kijelentkezett
// látogató egy üres, használhatatlan képernyőre tévedjen. Az érdemi védelem
// SZERVEROLDALI (az /api/auth névtér az AuthInterceptor mögött van): a felület
// megkerülhető, az API nem.
//
// A meglévő auth contextből olvas, saját hálózati hívás nélkül — a RequireAdmin
// mintájára.

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Nincs bejelentkezett felhasználó: irány a bejelentkezés.
  // A `replace` azért kell, hogy a Vissza gomb ne dobja vissza ide a felhasználót.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
