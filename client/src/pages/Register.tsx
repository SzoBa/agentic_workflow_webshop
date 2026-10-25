// Regisztrációs űrlap. Kliensoldali gyorsvalidáció, de a szerver a mérvadó.
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Kliensoldali gyorsvalidáció (a szerver ugyanezt újra ellenőrzi).
    if (username.trim().length < 8) {
      setError("A felhasználónév legalább 8 karakter legyen.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Érvénytelen email cím.");
      return;
    }
    if (password.length < 8) {
      setError("A jelszó legalább 8 karakter legyen.");
      return;
    }
    if (password !== confirmPassword) {
      setError("A két jelszó nem egyezik.");
      return;
    }
    if (!address.trim()) {
      setError("A szállítási cím megadása kötelező.");
      return;
    }

    setSubmitting(true);
    try {
      await register(username.trim(), email.trim(), address.trim(), password);
      navigate("/", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="panel auth-card">
        <h1>Regisztráció</h1>
        <form className="form-stack" onSubmit={handleSubmit}>
        <label>
          Felhasználónév
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Jelszó
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Jelszó megerősítése
          <input
            required
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
        <label>
          Szállítási cím
          <textarea
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        {error && <p className="error">Hiba: {error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Regisztráció…" : "Regisztráció"}
        </button>
        </form>
        <p className="auth-alt">
          Van már fiókod? <Link to="/login">Jelentkezz be!</Link>
        </p>
      </div>
    </div>
  );
}
