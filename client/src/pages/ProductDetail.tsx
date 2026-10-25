// Egy termék részletes nézete.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AddToCart } from "../AddToCart";
import { getProduct, formatPrice, type CustomerProduct } from "../api";
import { ProductReviews } from "../ProductReviews";
import { RatingSummary } from "../Stars";

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  // A vásárlói termékvégpont az értékelési aggregátumokkal együtt válaszol.
  const [product, setProduct] = useState<CustomerProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getProduct(id)
      .then(setProduct)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Termék betöltése…</p>;
  if (error) return <p className="error">Hiba: {error}</p>;
  if (!product) return null;

  return (
    <div className="detail">
      <Link to="/" className="back-link">
        ← Vissza a termékekhez
      </Link>
      <div className="detail-content">
        <img src={product.imageUrl} alt={product.name} />
        <div className="detail-main">
          <span className="category">{product.category}</span>
          <h1>{product.name}</h1>
          <RatingSummary value={product.ratingAvg} count={product.ratingCount} />
          <p className="detail-description">{product.description}</p>

          {/* Ár, készlet és a Kosárba gomb egy dobozban: a vásárlási döntéshez
              szükséges MINDEN adat egy helyen, görgetés nélkül. Hosszú leírás
              mellett a doboz a képernyőn marad (ragadós). */}
          <div className="panel buy-box">
            <p className="price">{formatPrice(product.price)}</p>
            {/* A részletes nézeten a pontos darabszámot is kiírjuk. */}
            <AddToCart product={product} showAvailable />
          </div>
        </div>
      </div>
      {/* Az átlag a termék fejlécében szerepel (a cím alatt), ezért a
          véleményszekció már csak a listát és a beküldő űrlapot tartalmazza. */}
      <ProductReviews productId={product.id} />
    </div>
  );
}
