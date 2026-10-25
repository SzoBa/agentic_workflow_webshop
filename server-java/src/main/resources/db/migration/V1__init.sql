-- Webshop séma. A megszorítások közül azok kötelezők, amelyek invariánst hordoznak
-- (spec/backend/plan.md B.3, requirements.md 6. fejezet).
--
-- Két visszatérő döntés:
--  * `seq`: a beszúrási sorrend explicit oszlopban. A lowdb tömbjeinek sorrendjét
--    relációs tárolásnál semmi nem garantálja, a listák sorrendje viszont a
--    szerződés része -> minden listázás ORDER BY seq.
--  * A rendelés önálló bizonylat (ADR-0001, ADR-0004): az `order_items.product_id`
--    és az `orders.user_id` SZÁNDÉKOSAN nem idegen kulcs, a tétel `name`/`unit_price`
--    mezője pedig másolat, nem vezetett adat. Termék- vagy felhasználótörlés nem
--    írhatja át egy korábbi rendelés tartalmát.

CREATE TABLE products (
    id          text PRIMARY KEY,
    seq         bigserial NOT NULL,
    name        text NOT NULL,
    description text NOT NULL,
    price       integer NOT NULL CHECK (price > 0),
    image_url   text NOT NULL,
    stock       integer NOT NULL CHECK (stock >= 0),
    category    text NOT NULL,
    active      boolean NOT NULL DEFAULT true
);

CREATE INDEX products_seq_idx ON products (seq);

CREATE TABLE users (
    id               text PRIMARY KEY,
    seq              bigserial NOT NULL,
    username         text NOT NULL,
    email            text NOT NULL,
    address          text NOT NULL,
    password_hash    text NOT NULL,
    token            text,
    token_expires_at timestamptz,
    created_at       timestamptz NOT NULL,
    role             text NOT NULL CHECK (role IN ('customer', 'admin'))
);

-- I-1, I-2: az egyediség kis/nagybetűtől független, és adatbázis-szintű —
-- így két egyidejű regisztrációból (K-47) pontosan az egyik sikerül.
CREATE UNIQUE INDEX users_username_lower_uidx ON users (LOWER(username));
CREATE UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email));
-- I-6: egy felhasználóhoz egy érvényes token; a token globálisan is egyedi.
CREATE UNIQUE INDEX users_token_uidx ON users (token) WHERE token IS NOT NULL;
CREATE INDEX users_seq_idx ON users (seq);

CREATE TABLE orders (
    id               text PRIMARY KEY,
    seq              bigserial NOT NULL,
    user_id          text,
    customer_name    text NOT NULL,
    customer_email   text NOT NULL,
    customer_address text NOT NULL,
    total            integer NOT NULL CHECK (total >= 0),
    created_at       timestamptz NOT NULL,
    status           text NOT NULL CHECK (status IN ('pending', 'expired', 'delivered'))
);

CREATE INDEX orders_user_seq_idx ON orders (user_id, seq);
CREATE INDEX orders_status_idx ON orders (status);

CREATE TABLE order_items (
    id         bigserial PRIMARY KEY,
    order_id   text NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    seq        integer NOT NULL,
    product_id text NOT NULL,
    quantity   integer NOT NULL CHECK (quantity >= 1),
    -- Snapshot mezők: a régi (snapshot előtti) rendeléseken hiányozhatnak.
    name       text,
    unit_price integer
);

CREATE INDEX order_items_order_idx ON order_items (order_id, seq);
CREATE INDEX order_items_product_idx ON order_items (product_id);

CREATE TABLE reviews (
    id         text PRIMARY KEY,
    seq        bigserial NOT NULL,
    product_id text NOT NULL,
    author     text NOT NULL,
    rating     integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body       text,
    status     text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

-- I-4: egy felhasználó egy terméket legfeljebb egyszer értékelhet — a rejected és
-- a removed is számít, különben a moderáció megkerülhető lenne.
CREATE UNIQUE INDEX reviews_product_author_uidx ON reviews (product_id, author);
CREATE INDEX reviews_product_status_idx ON reviews (product_id, status);
CREATE INDEX reviews_seq_idx ON reviews (seq);

-- Bejelentkezési próbálkozás-számlálók. Azért tárolt, hogy a védelem túlélje az
-- újraindítást (K-52), és több példány esetén se lehessen példányonként újrakezdeni.
CREATE TABLE login_attempts (
    attempt_key text PRIMARY KEY,
    attempts    integer NOT NULL CHECK (attempts >= 0),
    first_at    timestamptz NOT NULL
);
