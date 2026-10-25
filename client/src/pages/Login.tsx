// Bejelentkezési űrlap. A Checkout mintáját követi (submitting/error állapot).
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Ha egy védett oldalról (pl. Pénztár) irányítottak ide, oda térünk vissza.
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="panel auth-card">
        <h1>Bejelentkezés</h1>
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
          Jelszó
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="error">Hiba: {error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Bejelentkezés…" : "Bejelentkezés"}
        </button>
        </form>
        <p className="auth-alt">
          Még nincs fiókod? <Link to="/register">Regisztrálj!</Link>
        </p>
      </div>
    </div>
  );
}
