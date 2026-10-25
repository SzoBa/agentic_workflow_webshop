// „Adataim" képernyő: a belépett felhasználó saját fiókadatai és jelszócseréje.
//
// KÉT külön űrlap, külön beküldési/siker/hiba állapottal. Nem esztétikai döntés:
// a szerveren is két külön végpont van, és a következményük is eltér — a
// fiókadat-mentés a munkamenetet nem érinti, a jelszócsere viszont ÚJ tokent
// hoz. Közös állapotban az egyik űrlap sikere eltüntetné a másik hibaüzenetét,
// és a felhasználó nem tudná, melyik művelet járt eredménnyel.
//
// Mindkét űrlap kéri a JELENLEGI jelszót: egy ellopott munkamenet önmagában így
// nem elég a fiók átvételéhez (a szerver ugyanezt megköveteli).
//
// Az `autoComplete` értékek VISELKEDÉST írnak le, nem stílust. Jelölés híján a
// böngésző és a jelszókezelő a mentett JELENLEGI jelszót tölti be az „új jelszó"
// és a „megerősítés" mezőbe is — a felhasználó így a régi jelszavát küldi be
// újként, és egy számára megmagyarázhatatlan „Az új jelszó nem egyezhet meg a
// jelenlegivel." hibát kap. A `new-password` egyben azt is jelzi a kezelőnek,
// hogy generálhat jelszót, és sikeres csere után frissítenie kell a tárolt
// bejegyzést.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export function Profile() {
  const { user, updateProfile, changePassword } = useAuth();

  // A fiókadat-űrlap a JELENLEGI értékekkel indul. Az induló érték egyszer
  // olvasódik ki: a felhasználó által beírt, még el nem mentett szöveget egy
  // háttérben lefutó felhasználó-frissítés nem írhatja felül.
  const [profile, setProfile] = useState(() => ({
    username: user?.username ?? "",
    email: user?.email ?? "",
    address: user?.address ?? "",
  }));
  const [profilePassword, setProfilePassword] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    newPasswordConfirm: "",
  });
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileSubmitting(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      // A `role` mezőt SZÁNDÉKOSAN nem küldjük: a szerepkörét senki nem
      // állíthatja magának (a szerver a beküldött mezőt figyelmen kívül hagyja).
      await updateProfile({
        username: profile.username.trim(),
        email: profile.email.trim(),
        address: profile.address.trim(),
        currentPassword: profilePassword,
      });
      setProfileSaved(true);
      // A megerősítő jelszó egyszer használatos: nem marad a képernyőn.
      setProfilePassword("");
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordChanged(false);

    // Kliensoldali gyorsellenőrzés a megerősítésre: ez tisztán a böngészőben
    // eldönthető, és megspórol egy felesleges kérést. A szöveg SZÓ SZERINT a
    // hibakatalógusé, mert a szerver ugyanezt adná vissza.
    if (passwords.newPassword !== passwords.newPasswordConfirm) {
      setPasswordError("A két jelszó nem egyezik.");
      return;
    }

    setPasswordSubmitting(true);
    try {
      await changePassword(passwords);
      setPasswordChanged(true);
      // A jelszavak nem maradnak a mezőkben egy sikeres csere után.
      setPasswords({
        currentPassword: "",
        newPassword: "",
        newPasswordConfirm: "",
      });
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setPasswordSubmitting(false);
    }
  }

  // Az útvonalat a RequireAuth őrzi, ide belépett felhasználó nélkül nem lehet
  // eljutni. Ez az ág a típus miatt és a közvetlen használat ellen van itt.
  if (!user) {
    return (
      <div className="empty-state">
        <h1>Bejelentkezés szükséges</h1>
        <p>Az adataid megtekintéséhez kérjük, jelentkezz be.</p>
        <Link to="/login">Tovább a bejelentkezéshez →</Link>
      </div>
    );
  }

  return (
    <>
      <h1>Adataim</h1>

      <section className="panel profile-panel" aria-labelledby="fiokadatok-cim">
        <h2 id="fiokadatok-cim">Fiókadatok</h2>
        {/* Az `aria-labelledby` a szakaszcímre mutat: ettől kap az űrlap
            akadálymentes nevet, és lesz megkülönböztethető a jelszócserétől —
            mindkettőben van „jelszó" mező. */}
        <form
          className="form-stack"
          aria-labelledby="fiokadatok-cim"
          onSubmit={handleProfileSubmit}
        >
          <label>
            Felhasználónév
            <input
              required
              autoComplete="username"
              value={profile.username}
              onChange={(e) =>
                setProfile({ ...profile, username: e.target.value })
              }
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            />
          </label>
          <label>
            Szállítási cím
            <textarea
              required
              autoComplete="street-address"
              value={profile.address}
              onChange={(e) =>
                setProfile({ ...profile, address: e.target.value })
              }
            />
          </label>
          <label>
            Jelszó a megerősítéshez
            <input
              required
              type="password"
              autoComplete="current-password"
              value={profilePassword}
              onChange={(e) => setProfilePassword(e.target.value)}
            />
          </label>

          {profileError && <p className="error">Hiba: {profileError}</p>}
          {profileSaved && (
            <p className="form-success" role="status">
              Az adataidat elmentettük.
            </p>
          )}

          <button type="submit" disabled={profileSubmitting}>
            {profileSubmitting ? "Mentés…" : "Adatok mentése"}
          </button>
        </form>
      </section>

      <section className="panel profile-panel" aria-labelledby="jelszocsere-cim">
        <h2 id="jelszocsere-cim">Jelszócsere</h2>
        <form
          className="form-stack"
          aria-labelledby="jelszocsere-cim"
          onSubmit={handlePasswordSubmit}
        >
          <label>
            Jelenlegi jelszó
            <input
              required
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(e) =>
                setPasswords({ ...passwords, currentPassword: e.target.value })
              }
            />
          </label>
          <label>
            Új jelszó
            <input
              required
              type="password"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(e) =>
                setPasswords({ ...passwords, newPassword: e.target.value })
              }
            />
          </label>
          <label>
            Új jelszó megerősítése
            <input
              required
              type="password"
              autoComplete="new-password"
              value={passwords.newPasswordConfirm}
              onChange={(e) =>
                setPasswords({
                  ...passwords,
                  newPasswordConfirm: e.target.value,
                })
              }
            />
          </label>

          {passwordError && <p className="error">Hiba: {passwordError}</p>}
          {passwordChanged && (
            <p className="form-success" role="status">
              A jelszavadat megváltoztattuk.
            </p>
          )}

          <button type="submit" disabled={passwordSubmitting}>
            {passwordSubmitting ? "Módosítás…" : "Jelszó módosítása"}
          </button>
        </form>
      </section>
    </>
  );
}
