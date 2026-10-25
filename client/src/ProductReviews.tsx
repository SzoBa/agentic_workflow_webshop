// A termék értékelései a részletes nézetben: a publikus (jóváhagyott)
// vélemények listája, alatta a beküldő űrlap.
//
// A saját oldalától külön komponens, mert saját adatlekérése és űrlapállapota
// van — a ProductDetail így a termék megjelenítéséről szól, ez pedig a
// véleményekről.
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createReview,
  getProductReviews,
  MAX_REVIEW_BODY_LENGTH,
  type PublicReview,
} from "./api";
import { useAuth } from "./auth";
import { StarBar } from "./Stars";

// Csak dátum, óra nélkül: egy vélemény kora napra pontosan is elég.
const dateFormatter = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium" });

const STAR_VALUES = [1, 2, 3, 4, 5];

export function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();

  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getProductReviews(productId)
      .then((res) => {
        if (!cancelled) setReviews(res);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Üres szöveg helyett semmit nem küldünk: a body opcionális mező.
      await createReview(productId, rating, body.trim() || undefined);
      // A beküldött vélemény `pending`, ezért NEM tesszük hozzá a listához: az
      // csak a jóváhagyottakat mutatja, és a beküldő azt hinné, már publikus.
      // Ugyanezért az átlag sem változik — a terméket sem kell újratölteni.
      setSubmitted(true);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Az űrlap három állapota (nincs belépve / beküldve / írható) külön ágon —
  // az `if`-ek olvashatóbbak, mint egy háromszintű ternary a JSX-ben.
  function renderForm() {
    if (!user) {
      return (
        <p className="stock">
          Értékelést csak belépve lehet írni.{" "}
          <Link to="/login" state={{ from: `/products/${productId}` }}>
            Bejelentkezés →
          </Link>
        </p>
      );
    }

    if (submitted) {
      return (
        <p className="review-thanks">
          Köszönjük az értékelésed! Moderálás után jelenik meg a terméknél.
        </p>
      );
    }

    // Azt, hogy a felhasználó ÉRTÉKELHETI-e a terméket (van-e kiszállított
    // rendelése, értékelte-e már), csak a szerver tudja — erre nincs külön
    // végpont. Ezért az űrlapot mindenkinek megmutatjuk, és a szerver magyar
    // hibaüzenetét (403 / 409) írjuk ki, ha elutasítja a beküldést.
    return (
      <form className="form-stack review-form" onSubmit={handleSubmit}>
        <h3>Értékeld a terméket</h3>

        <fieldset className="star-input">
          <legend>Hány csillagot adsz?</legend>
          {STAR_VALUES.map((value) => (
            <label key={value} className="star-option">
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
              />
              <span aria-hidden="true">{rating >= value ? "★" : "☆"}</span>
              <span className="sr-only">{value} csillag</span>
            </label>
          ))}
        </fieldset>

        <label>
          Vélemény (opcionális)
          <textarea
            value={body}
            maxLength={MAX_REVIEW_BODY_LENGTH}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <span className="stock">
          {body.length} / {MAX_REVIEW_BODY_LENGTH} karakter
        </span>

        {submitError && <p className="error">Hiba: {submitError}</p>}

        {/* Csillag nélkül nincs mit beküldeni: a szerver is 1–5 közötti egész
            számot vár, így a hibát meg sem várjuk. */}
        <button type="submit" disabled={rating === 0 || submitting}>
          {submitting ? "Küldés…" : "Értékelés beküldése"}
        </button>
      </form>
    );
  }

  return (
    <section className="reviews">
      <h2>Vélemények</h2>

      {loading && <p>Vélemények betöltése…</p>}
      {error && <p className="error">Hiba: {error}</p>}

      {!loading && !error && reviews.length === 0 && (
        <p className="stock">Ehhez a termékhez még nincs közzétett vélemény.</p>
      )}

      {reviews.length > 0 && (
        <ul className="review-list">
          {reviews.map((review) => (
            <li key={review.id} className="review">
              <div className="review-head">
                {/* Szerzőnév nincs: a szerver szándékosan nem adja ki (lásd a
                    PublicReview típust az api.ts-ben). */}
                <StarBar value={review.rating} />
                <time dateTime={review.createdAt}>
                  {dateFormatter.format(new Date(review.createdAt))}
                </time>
              </div>
              {review.body && <p>{review.body}</p>}
            </li>
          ))}
        </ul>
      )}

      {renderForm()}
    </section>
  );
}
