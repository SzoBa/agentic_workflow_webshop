// A lejárt munkamenet magyarázata, és terelés a bejelentkezéshez.
//
// Az auth.tsx contextje megkülönbözteti a lejáratot a szándékos
// kijelentkezéstől (`sessionExpired`) — ezt eddig senki nem használta, tehát a
// felület némán felejtette el a bejelentkezést, és a felhasználó csak azt
// látta, hogy egyszer csak kilépett. Ez a komponens váltja be azt az ígéretet.
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

// Ezekről az oldalakról nem terelünk sehová: a /login maga a cél (különben
// hurok), a /register-ről pedig kirángatnánk a felhasználót egy félig
// kitöltött űrlapból.
const NO_REDIRECT = ["/login", "/register"];

export function SessionExpiredNotice() {
  const { sessionExpired, dismissSessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // EGYSZER terelünk, a lejárat pillanatában — nem minden útvonalváltásnál.
  // Enélkül a lejárt munkamenetű látogató a nyilvános katalógust sem tudná
  // böngészni: minden navigáció visszarántaná a bejelentkezéshez.
  const redirected = useRef(false);

  useEffect(() => {
    if (!sessionExpired) {
      redirected.current = false;
      return;
    }
    if (redirected.current || NO_REDIRECT.includes(location.pathname)) return;
    redirected.current = true;
    // A visszaút a Login.tsx már meglévő `state.from` szokását használja
    // (lásd Checkout.tsx, Orders.tsx) — a bejelentkező oldalt nem kell módosítani.
    navigate("/login", {
      replace: true,
      state: { from: location.pathname + location.search },
    });
    // A `location` SZÁNDÉKOSAN nincs a függőségek között: csak a lejáratra
    // reagálunk, a későbbi útvonalváltásokra nem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExpired]);

  if (!sessionExpired) return null;

  return (
    <p className="notice" role="status">
      A munkameneted lejárt, ezért kiléptettünk. Jelentkezz be újra a
      folytatáshoz.{" "}
      <button
        type="button"
        className="link-button"
        onClick={dismissSessionExpired}
      >
        Rendben
      </button>
    </p>
  );
}
