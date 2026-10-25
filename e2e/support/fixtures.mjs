// Előfeltétel-építők — kizárólag publikus API-hívásokból.
//
// KÉT MEGKÖTÉS, amit ez a modul testesít meg. Mindkettő a konformancia-futtató
// tanulsága (spec/backend/conformance/README.md), nem elméleti aggály.
//
// 1. A SZERVER ÁLLAPOTA SOHA NEM ÁLL VISSZA.
//    Nincs adatbázis-hozzáférés és nincs teszt-hátsóajtó — a váz csak HTTP-t
//    használ. Hátsóajtót nyitni a termelési szerveren külön biztonsági döntés,
//    nem egy teszt-váz hatásköre. Ezért minden fixture EGYEDI nevet kap, és a
//    szcenáriók nem támaszkodhatnak abszolút darabszámra vagy üres katalógusra.
//    (A böngésző állapota ettől függetlenül szcenáriónként tiszta: minden
//    szcenárió friss böngésző-kontextust kap — lásd horgok.mjs.)
//
// 2. A BEJELENTKEZÉSI RATE LIMIT PERZISZTENS ÉS IP-RE SZÓL.
//    Tíz sikertelen bejelentkezés 15 percre kizárja ezt a gépet, és a kizárás
//    a szerver újraindítását is túléli. Ezért az admin token FUTÁSONKÉNT
//    EGYSZER kérődik le és process-szinten tárolódik — nem szcenáriónként.

import { elvarStatusz } from "./api.mjs";
import { SEED_ADMIN } from "./kornyezet.mjs";

let szamlalo = 0;

/** Ütközésmentes utótag a fixture-nevekhez (ld. az 1. megkötést fent). */
export function nonce() {
  szamlalo += 1;
  return `${Date.now().toString(36)}${szamlalo.toString(36)}`;
}

/** Futásonként egyszer lekért admin munkamenet (ld. a 2. megkötést fent). */
let adminMunkamenetGyorsitotar = null;

/**
 * A seed admin munkamenete `{ user, token }` alakban.
 *
 * A `token`-nél többet azért ad vissza, mert a `Vilag.bejelentkezveMint()` a
 * kliens `webshop-auth` kulcsának alakját írja a localStorage-be, abban pedig a
 * `user` is benne van (client/src/auth.tsx). Adminként megnyitni egy oldalt így
 * ugyanaz a mozdulat, mint vásárlóként.
 */
export async function adminMunkamenet(client) {
  if (adminMunkamenetGyorsitotar) return adminMunkamenetGyorsitotar;
  const res = await client.post("/api/auth/login", SEED_ADMIN);
  if (res.status === 429) {
    throw new Error(
      "A seed admin bejelentkezése 429-et kapott: a bejelentkezési rate limit még aktív " +
        "egy korábbi futásból. A korlát IP-re szól, 15 perces, és a szerver újraindítását " +
        "is túléli — várd ki, vagy adj a backendnek friss adatbázist " +
        "(cd server-java && docker compose down -v).",
    );
  }
  const body = elvarStatusz(res, 200, "Seed admin bejelentkezés");
  adminMunkamenetGyorsitotar = { user: body.user, token: body.token };
  return adminMunkamenetGyorsitotar;
}

/** Csak a token — az API-hívásokhoz ennyi kell. */
export async function adminToken(client) {
  return (await adminMunkamenet(client)).token;
}

/**
 * Új vásárló regisztrálása egyedi névvel.
 *
 * A visszaadott alak (`{ user, token }`) SZÁNDÉKOSAN azonos a kliens
 * localStorage-ában tárolt munkamenet alakjával (client/src/auth.tsx),
 * így egyenesen beültethető a böngészőbe — lásd `Vilag.bejelentkezveMint`.
 */
export async function regisztraltVasarlo(client, felulir = {}) {
  const id = nonce();
  const adat = {
    username: `e2e-${id}`,
    email: `e2e-${id}@example.com`,
    address: "E2E utca 1.",
    password: "e2eteszt123",
    ...felulir,
  };
  const body = elvarStatusz(
    await client.post("/api/auth/register", adat),
    201,
    "Vásárló regisztrációja",
  );
  return { user: body.user, token: body.token, password: adat.password };
}

/** Aktív, ismert készletű termék felvétele egyedi néven és kategóriában. */
export async function letrehozottTermek(client, felulir = {}) {
  const token = await adminToken(client);
  const id = nonce();
  const adat = {
    name: `E2E termék ${id}`.slice(0, 50),
    description: "Végponttól végpontig futó teszt terméke",
    price: 1000,
    stock: 5,
    category: `E2E-${id}`,
    imageUrl: "https://example.com/e2e.png",
    active: true,
    ...felulir,
  };
  return elvarStatusz(
    await client.post("/api/admin/products", adat, { token }),
    201,
    "Termék felvétele",
  );
}

/**
 * Leadott rendelés a vásárló nevében.
 *
 * A `customer` blokk a leadáskori MÁSOLAT (ADR-0001), nem a fiók élő adata —
 * ezért kell külön kitölteni. A `name`-be szándékosan a felhasználónév kerül:
 * az nonce-os, tehát a rendeléskezelő keresőjével egyértelműen megtalálható.
 *
 * Az `expectedTotal`-t a szerver ÚJRASZÁMOLJA és összeveti (409, ha eltér);
 * itt azért számoljuk a termék árából, mert a fixture ismeri a saját termékét.
 */
export async function leadottRendeles(client, { vasarlo, termek, mennyiseg = 1 }) {
  const adat = {
    items: [{ productId: termek.id, quantity: mennyiseg }],
    customer: {
      name: vasarlo.user.username,
      email: vasarlo.user.email,
      address: vasarlo.user.address,
    },
    expectedTotal: termek.price * mennyiseg,
  };
  return elvarStatusz(
    await client.post("/api/orders", adat, { token: vasarlo.token }),
    201,
    "Rendelés leadása",
  );
}

/**
 * A termék készletének átállítása adminként.
 *
 * A `PUT /api/admin/products/:id` TELJES CSERE, minden mezőt újravalidál, ezért
 * a teljes alakot vissza kell küldeni — a `stock` kivételével változatlanul.
 * (A `PATCH .../active` csak az aktivitásra való, készletre nincs részleges
 * végpont.)
 */
export async function keszletModositas(client, termek, ujKeszlet) {
  const token = await adminToken(client);
  const adat = {
    name: termek.name,
    description: termek.description,
    price: termek.price,
    stock: ujKeszlet,
    category: termek.category,
    imageUrl: termek.imageUrl,
    active: termek.active,
  };
  return elvarStatusz(
    await client.put(`/api/admin/products/${termek.id}`, adat, { token }),
    200,
    "Termék készletének módosítása",
  );
}
